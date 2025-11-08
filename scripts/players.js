"use strict";

import {
  BlockTypes,
  BlockVolume,
  EntityComponentTypes,
  LiquidType,
  Player,
  system,
  TicksPerSecond,
  world,
} from "@minecraft/server";
import { betaPlayerFeatures } from "./beta.js";
import { flag } from "./index.js";
import { Flags } from "./flags.js";
import { getConfig, ConfigKeys } from "./config.js";

const IllegalPositionIDs = new Map([
  ["NetherPortalInEndTeleport", 121],
  ["InvalidCrawlingPosition", 501],
]);

// Store rolling samples for each player for 1 second
const playerSamples = new Map(); // key: player.name (or player.id if available), value: Array<{t,pos,vel}>

/**
 * Add a player sample (position and velocity) to the rolling buffer.
 * @param {Player} player
 * @param {{x: number, y: number, z: number}} pos
 * @param {{x: number, y: number, z: number}} vel
 */
function addPlayerSample(player, pos, vel) {
  const key = player.id;
  const now = Date.now();
  const buf = playerSamples.get(key) || [];
  buf.push({
    t: now,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: vel.x, y: vel.y, z: vel.z },
  });
  // remove samples older than 1000ms
  while (buf.length && now - buf[0].t > 1000) buf.shift();
  playerSamples.set(key, buf);
  return buf;
}

/**
 * Analyze the rolling samples for a player collected over ~1s.
 * Computes straight-line displacement, average speed across the window,
 * and the peak instantaneous acceleration observed between consecutive samples.
 * Returns null if there are too few samples or non-positive duration.
 *
 * @param {Array<{t:number,pos:{x:number,y:number,z:number},vel:{x:number,y:number,z:number}}>} buf
 * @returns {{distance:number,avgSpeed:number,peakAcc:number,sampleCount:number,duration:number}|null}
 */
function analyzeSamples(buf) {
  // buf: time-ordered array of samples. Each sample: { t: ms timestamp, pos: {x,y,z}, vel: {x,y,z} }
  if (!buf || buf.length < 2) return null;

  // first and last define the analysis window
  const first = buf[0];
  const last = buf[buf.length - 1];

  // dt: total time between first and last sample (seconds)
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return null;

  // displacement components over the whole window
  const dx = last.pos.x - first.pos.x;
  const dy = last.pos.y - first.pos.y;
  const dz = last.pos.z - first.pos.z;

  // distance: straight-line magnitude of displacement (meters)
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // avgSpeed: distance divided by time (m/s)
  const avgSpeed = distance / dt;

  // peakAcc: maximum approximate acceleration between any two consecutive samples
  // computed as |Δv| / Δt where Δv = v1 - v0 and Δt is segment duration in seconds.
  let peakAcc = 0;
  for (let i = 1; i < buf.length; i++) {
    const p0 = buf[i - 1];
    const p1 = buf[i];

    // dtSegment: time between these two samples (seconds)
    const dtSegment = (p1.t - p0.t) / 1000;
    if (dtSegment <= 0) continue;

    // change in velocity components between samples
    const dvx = p1.vel.x - p0.vel.x;
    const dvy = p1.vel.y - p0.vel.y;
    const dvz = p1.vel.z - p0.vel.z;

    // acc: scalar acceleration magnitude for this segment (m/s^2)
    const acc = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz) / dtSegment;
    if (acc > peakAcc) peakAcc = acc;
  }

  // return compact analysis result for downstream use (telemetry, anti-cheat, etc.)
  return {
    distance,
    avgSpeed,
    peakAcc,
    sampleCount: buf.length, // number of samples used
    duration: dt, // analysis window in seconds
  };
}

/**
 * @typedef {Object} PlayerStates
 * @property {number} posX
 * @property {number} posY
 * @property {number} posZ
 * @property {string|null} blockBelowType
 * @property {string|null} blockAboveType
 * @property {string|null} blockHeadBelowType
 * @property {string|null} blockHeadAboveType
 * @property {boolean} standingOnSolid
 * @property {boolean} headBlocked
 * @property {boolean} onEighthBoundary
 * @property {boolean} isOnGround
 * @property {boolean} isFalling
 * @property {boolean} isAscending
 * @property {boolean} isSwimming
 * @property {boolean} isInWater
 * @property {boolean} isAirborne
 * @property {boolean} isMoving
 * @property {boolean} isCrawling
 * Compute common boolean states for a player from position/velocity and existing flags.
 * @param {Player} player
 * @param {{x:number,y:number,z:number}} pos
 * @param {{x:number,y:number,z:number}} vel
 * @returns {PlayerStates}
 */
export function computePlayerStates(player, pos, vel) {
  // vertical velocity component (m/s). used to infer ascending/falling and near-zero vertical motion.
  const vy = vel?.y ?? 0;

  // squared speed (cheap) and scalar speed (sqrt) used to decide movement thresholds.
  const speedSq = (vel?.x ?? 0) ** 2 + (vel?.y ?? 0) ** 2 + (vel?.z ?? 0) ** 2;
  const speed = Math.sqrt(speedSq);

  // engine-provided boolean flags, normalized to booleans.
  // isSwimming: true when the engine considers the player swimming.
  // isInWater: true when the player is in water (separate from swimming).
  const isSwimming = !!player.isSwimming;
  const isInWater = !!player.isInWater;

  // Block probes used to detect ground, head obstruction and crawling.
  // Initialized to undefined and filled inside the try block (dimension API may throw in some contexts).
  let blockBelow = undefined; // block roughly beneath the player's feet
  let blockAbove = undefined; // block roughly at/above the player's head
  // additional head-level checks (finer granularity for crawling / squeezed spaces)
  let blockHeadBelow = undefined; // block at lower head area (around pos.y + 1.0)
  let blockHeadAbove = undefined; // block just above head (around pos.y + 2.0)

  try {
    // integer block coordinates derived from sampled position.
    // bx,bz are horizontal block indices; by is a foot-offset to test a block slightly below the feet.
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y - 0.5); // probe slightly below feet to catch slabs/steps
    const bz = Math.floor(pos.z);

    // getBlock queries prefer integer block coords; use the player's sampled position for consistency.
    blockBelow = player?.dimension?.getBlock({ x: bx, y: by, z: bz });

    // approximate head region using relative offsets from pos.y
    blockAbove = player?.dimension?.getBlock({
      x: Math.floor(pos.x),
      y: Math.floor(pos.y + 1.8),
      z: Math.floor(pos.z),
    });

    // head-relative checks:
    // blockHeadBelow: block at the lower head area (useful to detect partial obstructions)
    // blockHeadAbove: block one block above head (useful for determining squeezes / crawling)
    blockHeadBelow = player?.dimension?.getBlock({
      x: bx,
      y: Math.floor(pos.y + 1.0),
      z: bz,
    });
    blockHeadAbove = player?.dimension?.getBlock({
      x: bx,
      y: Math.floor(pos.y + 2.0),
      z: bz,
    });
  } catch (e) {
    // dimension API might throw in some contexts (e.g. during teardown). In that case,
    // leave block* variables undefined and rely on velocity/engine flags as fallbacks.
    blockBelow = undefined;
    blockAbove = undefined;
    blockHeadBelow = undefined;
    blockHeadAbove = undefined;
  }

  // Derived environment booleans:
  // standingOnSolid: true if there's a non-air block under feet
  // headBlocked: true if there's a non-air block at head area
  const standingOnSolid = !!blockBelow && !blockBelow.isAir;
  const headBlocked = !!blockAbove && !blockAbove.isAir;

  // Treat positions that align with any 1/8 vertical boundary as "on ground".
  // epsilon compensates for floating point jitter when comparing pos.y * 8 to an integer.
  const epsilon = 0.01; // tolerance for floating-point noise
  const eighthDiff = Math.abs(pos.y * 8 - Math.round(pos.y * 8));
  const onEighthBoundary = eighthDiff < epsilon; // true when pos.y is effectively on a 1/8 boundary

  // Final heuristic for on-ground:
  // - standing on a non-air block OR
  // - vertically aligned with an 1/8 boundary (helps with slabs/steps) OR
  // - not swimming/in water and vertical velocity near zero
  const isOnGround =
    standingOnSolid ||
    onEighthBoundary ||
    (!isSwimming && !isInWater && Math.abs(vy) < 0.05);

  // Motion state booleans using vy and isOnGround
  // isFalling: significant downward velocity and not considered on-ground or swimming
  const isFalling = vy < -0.1 && !isOnGround && !isSwimming;
  // isAscending: significant upward velocity and not on-ground or swimming
  const isAscending = vy > 0.1 && !isOnGround && !isSwimming;
  // isAirborne: not on ground and not in water/swimming
  const isAirborne = !isOnGround && !isSwimming && !isInWater;
  // isMoving: speed above small threshold to ignore jitter
  const isMoving = speed > 0.1;

  // Crawling heuristic:
  // headBelowSolid: non-air block in lower head area
  // headAboveSolid: non-air block directly above the head
  // isCrawling: true when both are solid (player is squeezed between blocks)
  const headBelowSolid = !!blockHeadBelow && !blockHeadBelow.isAir;
  const headAboveSolid = !!blockHeadAbove && !blockHeadAbove.isAir;
  const isCrawling = headBelowSolid && headAboveSolid;

  // Pack and return the PlayerStates object (explicit types, no implicit 'any').
  return {
    // explicit position components (useful downstream and ensures consistent readings)
    posX: pos.x,
    posY: pos.y,
    posZ: pos.z,

    // environment / block diagnostics (typeId or null)
    blockBelowType: blockBelow?.typeId ?? null,
    blockAboveType: blockAbove?.typeId ?? null,
    blockHeadBelowType: blockHeadBelow?.typeId ?? null,
    blockHeadAboveType: blockHeadAbove?.typeId ?? null,

    // environment booleans
    standingOnSolid,
    headBlocked,
    onEighthBoundary,

    // motion / physics booleans
    isOnGround,
    isFalling,
    isAscending,
    isSwimming,
    isInWater,
    isAirborne,
    isMoving,

    // squeeze/crawling heuristic
    isCrawling,
  };
}

/**
 * @param {Player} player
 */
export function mainPlayerExec(player) {
  if (!(player instanceof Player)) return;
  /**
   * ==================== Server Essentials ====================
   */
  const nametag = player.name;
  player.runCommand(
    `scoreboard players set @s status ${Math.round(
      player.getComponent(EntityComponentTypes.Health).currentValue
    )}`
  );
  if (player.hasTag("op")) player.nameTag = `§0[§aOperator§0]§r ${nametag}`;
  if (player.hasTag("admin")) player.nameTag = `§0[§4Admin§0]§r ${nametag}`;
  if (player.hasTag("owner")) player.nameTag = `§0[§4Owner§0]§r ${nametag}`;
  else player.nameTag = nametag;

  const entitiesCloseToPlayer = player.dimension.getEntities({
    excludeTypes: [
      "minecraft:player",
      "minecraft:wither",
      "minecraft:ender_dragon",
    ],
    minDistance: 0.2,
  });
  for (let i = 0; i < entitiesCloseToPlayer.length; i++) {
    entitiesCloseToPlayer[i].addEffect("weakness", 2, {
      amplifier: 255,
      showParticles: false,
    });
  }

  const inventory = player.getComponent(EntityComponentTypes.Inventory);
  const inventoryContainer = inventory.container;
  const itemInMainHand = inventoryContainer.getItem(player.selectedSlotIndex);
  const pos = player.location;
  const vel = player.getVelocity();
  const { x: px, y: py, z: pz } = pos;
  const { x: vx, y: vy, z: vz } = vel;
  player.setDynamicProperty("itemInMainHand", itemInMainHand?.typeId);

  // add sample and analyze last 1 second
  const samples = addPlayerSample(player, pos, vel);
  const analysis = analyzeSamples(samples);
  if (analysis) {
    // example: store average speed on player dynamic property for other systems / debugging
    player.setDynamicProperty("avgSpeed_last1s", analysis.avgSpeed);
    player.setDynamicProperty("peakAcc_last1s", analysis.peakAcc);
    // optionally: kick or flag if avgSpeed or peakAcc exceeds thresholds
    // if (analysis.avgSpeed > SOME_THRESHOLD) { ... }
  }

  /// compute and expose boolean player states
  const states = computePlayerStates(player, pos, vel);
  for (const [k, v] of Object.entries(states)) {
    // store as dynamic properties so other scripts / scoreboard logic can use them
    player.setDynamicProperty(k, v);
  }

  const blocksAbove = {
    minX: player.dimension.getBlockAbove(
      { x: px - 1, y: py, z: pz },
      { includePassableBlocks: false }
    ),
    maxX: player.dimension.getBlockAbove(
      { x: px + 1, y: py, z: pz },
      { includePassableBlocks: false }
    ),
    minZ: player.dimension.getBlockAbove(
      { x: px, y: py, z: pz - 1 },
      { includePassableBlocks: false }
    ),
    maxZ: player.dimension.getBlockAbove(
      { x: px, y: py, z: pz + 1 },
      { includePassableBlocks: false }
    ),
    midX: player.dimension.getBlockAbove(
      { x: px, y: py, z: pz },
      { includePassableBlocks: false }
    ),
    midZ: player.dimension.getBlockAbove(
      { x: px, y: py, z: pz },
      { includePassableBlocks: false }
    ),
  };

  if (
    blocksAbove.minX?.isAir ||
    (blocksAbove.minX === undefined && blocksAbove.maxX?.isAir) ||
    (blocksAbove.maxX === undefined && blocksAbove.minZ?.isAir) ||
    (blocksAbove.minZ === undefined && blocksAbove.maxZ?.isAir) ||
    (blocksAbove.maxZ === undefined && blocksAbove.midX?.isAir) ||
    (blocksAbove.midX === undefined && blocksAbove.midZ?.isAir) ||
    (blocksAbove.midZ === undefined && player.isSwimming && !player.isInWater)
  ) {
    player.runCommand(
      `kick ${
        player.name
      } Illegal crawling position detected. ID: 0x${IllegalPositionIDs.get(
        IllegalPositionIDs.keys()[1]
      )} Reason: ${IllegalPositionIDs.keys()[1]}`
    );
  }

  if (!player.isOnGround && !player.isFlying && vy > 0 && vy < 0.075) {
    player.applyKnockback({ x: vx, z: vz }, vy);
  }

  if (
    (player.isFalling && player.isOnGround) ||
    player.dimension.getBlockBelow(pos)?.isAir ||
    player.dimension.getBlockBelow(pos)?.isLiquid
  ) {
    player.applyKnockback({ x: vx, z: vz }, -vy);
  }

  if (["\n", "\r", "\t"].some((char) => player.name.includes(char))) {
    flag(player, Flags.ILLEGALNAME, player.name);
    player.runCommand(
      `kick ${player.name} Illegal characters detected in name.`
    );
  }

  if (player.isSwimming && !player.isInWater) {
    flag(player, Flags.ILLEGALPOSITION, player.location);
    player.runCommand(
      `kick ${player.name} Illegal swimming position detected.`
    );
  }

  // Give a Speed effect based on how far the player is from origin.
  // Trigger only when any coordinate magnitude is >= 2^21 and up to 2^32.
  // The amplifier equals the power (the base-2 exponent) clamped to [21,32].
  // Use commands (as if from command blocks) so effect comes from server commands.
  const absX = Math.abs(px);
  const absY = Math.abs(py);
  const absZ = Math.abs(pz);
  const maxCoord = Math.max(absX, absY, absZ);

  const MIN_POW = 21;
  const MAX_POW = 32;
  const MIN_DIST = 2 ** MIN_POW;
  const MAX_DIST = 2 ** MAX_POW;

  if (maxCoord >= MIN_DIST && maxCoord <= MAX_DIST) {
    // floor(log2(distance)) gives the exponent/power for the highest set bit.
    let power = Math.floor(Math.log2(maxCoord));
    // clamp to requested range just in case of edge rounding
    power = Math.round(Math.max(MIN_POW, Math.min(MAX_POW, power)) / 4); // scale down for effect amplifier

    // Duration set short and refreshed each tick by this script (10 seconds).
    // Using command form so it's equivalent to placing a command block that gives the effect.
    try {
      player.runCommand(`effect ${player.name} speed 10 ${power} true`);
    } catch (e) {}
  }

  if (
    (maxCoord >= MIN_DIST &&
      maxCoord <= MAX_DIST &&
      !player.dimension.getBlockBelow(pos)?.isAir) ||
    !player.dimension.getBlockBelow(pos)?.isLiquid ||
    player.dimension.getBlockBelow(pos) !== undefined ||
    ["minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern"].some(
      (T) => player.dimension.getBlockBelow(pos).typeId !== T
    ) ||
    !player.dimension.getBlockBelow(pos).typeId.includes("flower")
  ) {
    if (maxCoord >= MIN_DIST && maxCoord <= MAX_DIST) {
      try {
        const topMostBlock = player.dimension.getTopmostBlock(
          { x: px, z: pz },
          py + 1
        );
        if (topMostBlock) {
          const boat = player.dimension.spawnEntity("minecraft:boat", {
            x: px + vx,
            y: Math.trunc(topMostBlock.y) + 0.545,
            z: pz + vz,
          });
          boat.teleport({
            x: px + vx,
            y: Math.trunc(topMostBlock.y) + 0.545,
            z: pz + vz,
          });
          if (py < topMostBlock.y) player.teleport(topMostBlock.location);
          if (player.hasTag("dev")) system.run(() => boat.remove());
          else boat.remove();
        }
      } catch (e) {
        if (player.hasTag("dev")) player.sendMessage(`${e} ${e.stack}`);
      }
    }
  }

  if (maxCoord >= 16777216) {
    try {
      player.teleport({ x: px - vx, y: py - vy, z: pz - vz });
    } catch (e) {}
  }

  let jobID = 0;

  if (
    (player.dimension.getBlock(pos.y > 320 ? { x: px, y: 320, z: pz } : pos)
      ?.typeId === "minecraft:portal" &&
      player.dimension === world.getDimension("the_end")) ||
    player.dimension.id === "the_end"
  ) {
    player.teleport(world.getDefaultSpawnLocation(), {
      dimension: player.dimension,
    });
    jobID = system.runJob(portalDetector());
  }

  function* portalDetector() {
    const dimension = player.dimension;
    const portalBlockVolume = new BlockVolume(
      { x: px - 1, y: py - 1, z: pz - 1 },
      { x: px + 1, y: py + 3, z: pz + 1 }
    );
    dimension.fillBlocks(portalBlockVolume, "minecraft:air", {
      blockFilter: {
        includeTypes: ["minecraft:portal"],
        excludeTypes: BlockTypes.getAll().filter(T => T.id !== "minecraft:portal").length,
      },
      ignoreChunkBoundErrors: true,
    });
  }

  system.runTimeout(() => system.clearJob(jobID), TicksPerSecond);

  const armour_stand = player.dimension.spawnEntity(
    "minecraft:armor_stand",
    player.location
  );

  armour_stand.applyKnockback({ x: vx, z: vz }, vy);
  armour_stand.setRotation(player.getRotation());
  armour_stand.lookAt(player.getViewDirection());

  const { ax, ay, az } = armour_stand.location;

  const movement_threshold =
    getConfig(ConfigKeys.MOVEMENT_ACCEPTANCE_THRESHOLD) ?? 0.5;

  if (
    px > ax + movement_threshold ||
    px < ax - movement_threshold ||
    py > ay + movement_threshold ||
    py < ay - movement_threshold ||
    pz > az + movement_threshold ||
    pz < az - movement_threshold
  ) {
    player.teleport(armour_stand.location);
    player.applyKnockback({ x: vx, z: vz }, vy);
  }

  armour_stand.remove();

  const topMostBlock = player.dimension.getTopmostBlock(
    { x: px, z: pz },
    py + 1
  );

  const { tmbx, tmby, tmbz } = topMostBlock.center();
  const isPassable =
    player.dimension.getBlockBelow(pos, { includePassableBlocks: true }) ===
    topMostBlock;

  if (
    !topMostBlock.isAir &&
    !topMostBlock.isLiquid &&
    topMostBlock.isLiquidBlocking(LiquidType.Water) &&
    topMostBlock !== undefined &&
    py < Math.ceil(tmby) &&
    !isPassable
  ) {
    player.teleport({ x: tmbx, y: Math.ceil(tmby), z: tmbz });
    player.applyKnockback({ x: vx, z: vz }, vy);
  }
  // Enable beta features and compute beta-related dynamic properties
  betaPlayerFeatures(player);

  // compute speed (magnitude of velocity): v = sqrt(vx^2 + vy^2 + vz^2)
  const v = Math.sqrt(vx * vx + vy * vy + vz * vz);

  system.runTimeout(() => {
    const vel2 = player.getVelocity(); // get current velocity vector {x, y, z}

    // NOTE: this repeats the exact same computation as `v` and will have the same value.
    // likely a bug: `v2` should be the previous speed (from the last tick) to compute acceleration.
    const v2 = Math.sqrt(vel2.x * vel2.x + vel2.y * vel2.y + vel2.z * vel2.z);

    // compute acceleration as change in speed over time:
    // accel = (v2 - v) / (1/20)  where (1/20) looks like a timestep (0.05s).
    // because v2 === v here, accel will always be 0. If v2 were previous speed,
    // this implements a = Δv / Δt with Δt = 1/20s.
    const dt = 1 / TicksPerSecond; // time step in seconds (assuming 20 ticks per second)
    const accel = (v2 - v) / dt;

    const { px2, py2, pz2 } = player.location; // get current position {x, y, z}

    // Euclidean distance between current position `pos` and previous (px,py,pz)
    const dist = Math.sqrt(
      (px2 - px) * (px2 - px) +
        (py2 - py) * (py2 - py) +
        (pz2 - pz) * (pz2 - pz)
    );

    // movement vector from previous position to current, scaled by 20.
    // multiplying by 20 likely converts displacement per tick (1/20s) into velocity per second:
    // mv = (pos - prevPos) / (1/20)  => (pos - prevPos) * 20
    const mv = {
      x: (px2 - px) * TicksPerSecond,
      y: (py2 - py) * TicksPerSecond,
      z: (pz2 - pz) * TicksPerSecond,
    };

    if (accel === 0 && dist > 4) {
      // if no acceleration but moved more than 4 meters in last tick
      flag(player, Flags.SPEED, { accel, dist, mv });
      // apply immediate knockback & schedule reapplications for the next 2 ticks
      player.applyKnockback({ x: mv.x, z: mv.z }, mv.y);
    }

    if (mv.y === 0 && dist === 0 && vel2 === 0) {
      // if no vertical movement and no horizontal movement
      const armour_stand = player.dimension.spawnEntity(
        "minecraft:armor_stand",
        pos
      );
      armour_stand.addEffect("invisibility", 5, { showParticles: false });
      armour_stand.applyKnockback({ x: vx, z: vz }, vy);
      system.runTimeout(() => {
        armour_stand.remove();
      }, 6);
    }
  }, 1);
}

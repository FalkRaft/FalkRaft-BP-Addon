"use strict";

import {
  world,
  system,
  GameMode,
  EntityComponentTypes,
} from "@minecraft/server";
import { SpawnProtection } from "./anticheat/spawnprot.js";
import { reachChecks } from "./anticheat/reach.js";
import { Flags } from "./flags.js";
import { flag } from "./index.js";
import { itemAC } from "./anticheat/item.js";
import { getConfig, spawnProtectionRange } from "./config.js";

const groundY = 1 / 64;

export function anticheat() {
  system.runInterval(() => {
    let players = world.getAllPlayers();
    players.forEach((player) => {
      /**
       * ==================== Anti-Cheat ====================
       */

      itemAC(player); // Item Anti-Cheat

      /**
       * AutoClickerA - Detects fast right-clicking.
       */
      let rcps = player.getDynamicProperty("rcps");
      if (rcps > 20) flag(player, Flags.DOUBLECLICK, rcps);
      if (player.getDynamicProperty("rcpstime") % 20 === 0)
        player.setDynamicProperty("rcps", --rcps);

      // Variables to be used later on.
      const pos = player.location; // Player's server location.
      const vel = player.getVelocity();
      player.setDynamicProperty("nextloc", pos);
      const nextpos = player.getDynamicProperty("nextloc"); // Not accurate as any input could change the actual outcome; this is only a prediction.
      const playerSpeed =
        Math.sqrt(
          Math.pow(vel.x, 2) + Math.pow(vel.y, 2) + Math.pow(vel.z, 2)
        ) * 20;
      const playerHorizontalSpeed =
        Math.sqrt(Math.pow(vel.x, 2) + Math.pow(vel.z, 2)) * 20;
      const playerIsMoving = playerSpeed < 0 || playerSpeed > 0; // This doesn't account for inputs!
      const playerIsSprintSneaking = player.isSprinting && player.isSneaking;

      if (pos.x !== nextpos.x || pos.y !== nextpos.y || pos.z !== nextpos.z)
        player.teleport(pos);
      player
        .getComponent(EntityComponentTypes.LavaMovement)
        ?.setCurrentValue(1);
      if (!player.getComponent(EntityComponentTypes.Movement)?.isValid)
        player.teleport(pos);

      const rot = player.getRotation();
      player.setDynamicProperty("rotX", rot.x);
      player.setDynamicProperty("rotY", rot.y);
      /** @type {import('@minecraft/server').Vector2} */
      let prevrot = {
        x: player.getDynamicProperty("rotX")
          ? player.getDynamicProperty("rotX")
          : 0,
        y: player.getDynamicProperty("rotZ")
          ? player.getDynamicProperty("rotZ")
          : 0,
      };

      const isRotating = prevrot.x !== rot.x || prevrot.y !== rot.y;
      const deltaYaw = rot.y;
      const deltaXZ = rot.x;
      const lastDeltaXZ = prevrot.x;
      const accel = Math.abs(deltaXZ - lastDeltaXZ);
      const squaredAccel = accel * 100;

      /**
       * SpeedA - Detects if a player speeds up more than expected while rotating.
       */
      if (
        isRotating &&
        deltaYaw > 179 &&
        deltaXZ > 1.9 &&
        squaredAccel < 0.0000001 &&
        playerIsMoving &&
        [358, 359, 0].some((angle) => Math.trunc(angle) !== angle) &&
        getConfig(Flags.SPEED)
      ) {
        if (prevrot.x === undefined) prevrot.x = 0;
        if (prevrot.y === undefined) prevrot.y = 0;
        player.setRotation({ x: prevrot.x, y: prevrot.y });
        flag(
          player,
          Flags.SPEED,
          `${deltaYaw} | ${deltaXZ} | ${accel} | ${squaredAccel}`
        );
      }

      /**
       * InvalidSprintA - Detects if a player sprints and sneaks at the same time.
       */
      if (
        playerIsSprintSneaking &&
        playerIsMoving &&
        getConfig(Flags.SPRINTSNEAK)
      ) {
        player.teleport(
          {
            x: pos.x - vel.x,
            y: pos.y - vel.y,
            z: pos.z - vel.z,
          },
          {
            rotation: player.getRotation(),
          }
        );
        flag(player, Flags.SPRINTSNEAK, playerSpeed);
      }

      /**
       * GlideA - Detects if a player swims and glides at the same time.
       */
      if (
        player.isGliding &&
        player.isSwimming &&
        !player.isSprinting &&
        getConfig(Flags.GLIDEA)
      ) {
        player.teleport(
          {
            x: player.location.x - vel.x,
            y: player.location.y - vel.y,
            z: player.location.z - vel.z,
          },
          {
            rotation: player.getRotation(),
          }
        );
        flag(player, Flags.GLIDEA, playerSpeed);
      }

      /**
       * FlyA - Detects if a player glides with a flat Y-velocity (usually not possible/near impossible in vanilla).
       */
      if (
        player.isGliding &&
        vel.y === 0 &&
        !player.isOnGround &&
        getConfig(Flags.FLYA)
      )
        flag(player, Flags.FLYA, vel.y);

      /**
       * SpeedB - Detects if a player sprints faster than normal without the speed effect.
       */
      if (
        player.isSprinting &&
        player.isOnGround &&
        !player.isJumping &&
        playerSpeed > 5.7 &&
        !Boolean(player.getEffect("minecraft:speed")) &&
        [
          "minecraft:ice",
          "minecraft:packed_ice",
          "minecraft:blue_ice",
          "minecraft:frosted_ice",
        ].some(
          (ice) =>
            player.dimension.getBlockBelow(player.location, {
              includeLiquidBlocks: false,
              includePassableBlocks: false,
            }).typeId === ice
        ) &&
        getConfig(Flags.SPEED)
      ) {
        flag(player, Flags.SPEED, playerHorizontalSpeed);
      }

      /**
       * PhaseA - Detects if a player phases through a block.
       */
      const currFeet = player.location;
      const currHead = player.getHeadLocation();

      /** previous tick positions (defaults to current on first tick) */
      const prevFeet = player.getDynamicProperty("prevLoc") ?? currFeet;
      const prevHead = player.getDynamicProperty("prevHeadLoc") ?? currHead;

      const mv = {
        x: currFeet.x - prevFeet.x,
        y: currFeet.y - prevFeet.y,
        z: currFeet.z - prevFeet.z,
      };
      const dist = Math.sqrt(mv.x * mv.x + mv.y * mv.y + mv.z * mv.z);
      if (playerIsMoving && getConfig(Flags.PHASEA)) {
        if (dist > 0.001 && player.getGameMode() !== GameMode.Spectator) {
          const dir = { x: mv.x / dist, y: mv.y / dist, z: mv.z / dist };

          const hitFeet = player.dimension.getBlockFromRay(prevFeet, dir, {
            includeLiquidBlocks: false,
            includePassableBlocks: false,
            maxDistance: dist,
          });
          const hitHead = player.dimension.getBlockFromRay(prevHead, dir, {
            includeLiquidBlocks: false,
            includePassableBlocks: false,
            maxDistance: dist,
          });

          const collided =
            ((hitFeet?.block ?? undefined) &&
              (!hitFeet.block.isAir ?? undefined)) ||
            ((hitHead?.block ?? undefined) &&
              (!hitHead.block.isAir ?? undefined));

          if (collided) {
            const lastSafe =
              player.getDynamicProperty("lastSafeLoc") ?? prevFeet;
            player.teleport(lastSafe, { rotation: player.getRotation() });

            const feetInfo = hitFeet?.block
              ? `${hitFeet.block.typeId} @ ${hitFeet.block.x},${hitFeet.block.y},${hitFeet.block.z}`
              : "none";
            const headInfo = hitHead?.block
              ? `${hitHead.block.typeId} @ ${hitHead.block.x},${hitHead.block.y},${hitHead.block.z}`
              : "none";
            flag(player, Flags.PHASEA, `feet=${feetInfo} | head=${headInfo}`);
            // apply immediate knockback & schedule reapplications for the next 2 ticks
            player.applyKnockback({ x: mv.x * 2, z: mv.z * 2 }, mv.y * 2);
            // also set velocity directly for immediate effect
            player.setDynamicProperty("kbRemaining", 2);
          } else {
            // Update the last safe location only when no collision is detected along the path
            player.setDynamicProperty("lastSafeLoc", currFeet);
          }
        }

        // Persist prev positions for the next tick
        player.setDynamicProperty("prevLoc", currFeet);
        player.setDynamicProperty("prevHeadLoc", currHead);
      }

      /**
       * GlideB - Detects if a player glides and moves.
       */
      if (
        player.isGliding &&
        vel.y === 0 &&
        getConfig(Flags.GLIDEB)
      )
        flag(player, Flags.GLIDEB, dist);

      /**
       * PhaseB - Detects if a player phases through blocks.
       */
      if (playerIsMoving && getConfig(Flags.PHASEB)) {
        const currFeet = player.location;
        const prevFeet = player.getDynamicProperty("prevLoc") ?? currFeet;

        if (dist > 0.001 && player.getGameMode() !== GameMode.Spectator) {
          const dir = { x: mv.x / dist, y: mv.y / dist, z: mv.z / dist };

          const hitBlock1 = player.dimension.getBlockFromRay(currFeet, dir, {
            includeLiquidBlocks: false,
            includePassableBlocks: false,
            maxDistance: 0.01,
          })?.block;
          const hitBlock2 = player.dimension.getBlockFromRay(prevFeet, dir, {
            includeLiquidBlocks: false,
            includePassableBlocks: false,
            maxDistance: 0.01,
          })?.block;

          if (
            (hitBlock1 && !hitBlock1.isAir) ||
            (hitBlock2 && !hitBlock2.isAir)
          ) {
            flag(
              player,
              Flags.PHASEB,
              `feet=${currFeet.x} | head=${currHead.x}\n${prevFeet.x} | feet=${prevFeet.x}`
            );
          }
        }
      }

      /**
       * FlyB - Detects if a player has NoFall.
       */
      const clientGround = player.isOnGround,
        serverGround = pos.y % groundY < 0.0001;
      if (clientGround !== serverGround && getConfig(Flags.FLYA)) {
        flag(
          player,
          Flags.FLYA,
          `${pos.y} | ${clientGround} | ${serverGround} | ${vel.y}`
        );
      }

      if (player.getGameMode() === GameMode.Creative) {
        player.setDynamicProperty("reach", 5);
      } else {
        player.setDynamicProperty("reach", 3);
      }
    });
  }, 0);

  let spawnProtRange = () => Number(-spawnProtectionRange);

  /// Anti-nuker
  SpawnProtection(
    {
      x: -spawnProtRange(),
      y: -64,
      z: -spawnProtRange(),
    },
    {
      x: spawnProtRange(),
      y: 320,
      z: spawnProtRange(),
    }
  );

  reachChecks();
}

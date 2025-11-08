"use strict";

console.log("Loading FalkRaft-BP/scripts/index.js...");

import {
  DimensionTypes,
  InputMode,
  Player,
  Entity,
  system,
  world,
  TicksPerSecond,
} from "@minecraft/server";
import { mainPlayerExec } from "./players.js";
import { anticheat } from "./anticheat";
import { chatCommand } from "./commands/create_command";
import { beforePlayerGameModeChange } from "./before-events/player-gamemode-change.js";
import { beforePlayerInteractWithEntity } from "./before-events/player-interact-with-entity.js";
import { afterItemUse } from "./after-events/item-use.js";
import { afterPlayerSpawn } from "./after-events/player-spawn.js";
import { afterScriptEventReceive } from "./after-events/scriptevent-receive.js";
import { antiNuker } from "./anticheat/anti-nuker";
import { anti32k } from "./anticheat/anti-32k";
import {
  getConfig,
  saveConfig,
} from "./config.js";
import { Flags } from "./flags.js";
export { Flags };

/// Server Titles
export const serverChatTitle = "§l§a[§cFalk§bRaft§a]§r";
export const serverConsoleTitle = "[FalkRaft]";

const bufferSize = 20; // Number of ticks to average over
export let tickTimes = Array(bufferSize).fill(0);
let bufferIndex = 0;
let lastTime = Date.now();
export let tickCount = 0;

export function getTPS(showAllTimes = false) {
  const currentTime = Date.now();
  // Convert the time to seconds.
  // Store the elapsed time in the buffer
  tickTimes[bufferIndex] = (currentTime - lastTime) / 1000;
  bufferIndex = (bufferIndex + 1) % bufferSize; // Move to the next index in the buffer

  lastTime = currentTime;

  // Calculate the average elapsed time
  const averageElapsedTime =
    tickTimes.reduce((sum, time) => sum + time, 0) / bufferSize;

  // Calculate the TPS based on the average elapsed time
  const ticksSample = tickCount; // capture before reset so we can report it
  const tps = ticksSample / averageElapsedTime;

  // Reset tickCount after calculating TPS
  tickCount = 0;

  if (showAllTimes) {
    return {
      tps: tps,
      ticks: ticksSample,
      averageTimeTaken: averageElapsedTime,
      timestamps: {
        lastTime: lastTime,
        currentTime: currentTime,
      },
    };
  } else {
    return tps;
  }
}

// export const FlagIndex = {
//   CRITICALS: 0,
//   DOUBLECLICK: 1,
//   KILLAURA: 2,
//   REACH: 3,
//   SPEED: 4,
//   SPRINTSNEAK: 5,
//   ILLEGALITEM: 6,
//   FLYA: 7,
//   GLIDEA: 8,
//   PHASEA: 9,
//   FLYB: 10,
//   GLIDEB: 11,
//   PHASEB: 12
// };

/**
 * @param {Player} player
 * @param {string} flag
 * @param {string | number} value
 */
export function flag(player, flag, value = 0) {
  world.sendMessage({
    translate: `${serverChatTitle} §e${player.name}§f has flagged §c${flag}§f! Value: §e${value}`,
  });
}

export const dotProductThreshold = 0.38; // Adjust this value as needed; lower values are less strict

/**
 * @param {Player} player
 * @param {Entity} target
 * @param Flag
 * @param {string} flagType
 */
export function findDotProduct(
  player,
  target,
  Flag = true,
  flagType = Flags.KILLAURA
) {
  const playerPos = player.location;
  const entityPos = target.location;

  // Direction vector from player to entity
  const toEntityVec = {
    x: entityPos.x - playerPos.x,
    y: entityPos.y - playerPos.y,
    z: entityPos.z - playerPos.z,
  };

  const distance = Math.sqrt(
    toEntityVec.x ** 2 + toEntityVec.y ** 2 + toEntityVec.z ** 2
  );

  // Player's view direction
  const viewVec = player.getViewDirection();

  // Helper functions to normalize a vector
  function normalize(vec) {
    const mag = Math.sqrt(vec.x ** 2 + vec.y ** 2 + vec.z ** 2);
    return {
      x: vec.x / mag,
      y: vec.y / mag,
      z: vec.z / mag,
    };
  }

  /**
   * @param {import("@minecraft/server").Vector3} v1
   * @param {import("@minecraft/server").Vector3} v2
   * @returns {number}
   */
  function dotProduct(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  }

  const normToEntity = normalize(toEntityVec);
  const normViewVec = normalize(viewVec);
  const dot_product = dotProduct(normToEntity, normViewVec);

  if (
    Flag &&
    dot_product < dotProductThreshold &&
    distance > 1 &&
    player.inputInfo.lastInputModeUsed !== InputMode.Touch &&
    target.typeId !== "minecraft:enderman"
  ) {
    flag(player, flagType, `${dot_product}, Threshold: ${dotProductThreshold}`);
  }

  return dot_product;
}

console.log("Loading beforeEvents...");

/// * beforeEvents
chatCommand();
system.waitTicks(5);
anticheat();
system.waitTicks(5);
beforePlayerGameModeChange();
system.waitTicks(5);
beforePlayerInteractWithEntity();

system.beforeEvents.shutdown.subscribe(() => {
  // Cleanup or save state here
  saveConfig();
});

world.beforeEvents.playerLeave.subscribe((data) => {
  console.log(`${data.player.name} left the game. ID: ${data.player.id}, TypeID: ${data.player.typeId}`);
  saveConfig();
});

console.log("Loading afterEvents...");

import { customkb } from "./kb.js";

world.afterEvents.worldLoad.subscribe(() => {
  try {
    /// * afterEvents
    afterItemUse();
    system.waitTicks(5);
    afterPlayerSpawn();
    system.waitTicks(5);
    afterScriptEventReceive();
    system.waitTicks(5);
    antiNuker();
    system.waitTicks(5);
    anti32k();

    system.beforeEvents.shutdown.subscribe(() => {
      // Cleanup or save state here
      saveConfig();
    });

    const start1 = Date.now();
    if (
      !Boolean(world.scoreboard.getObjective("status")) ||
      !world.scoreboard.getObjective("status").isValid
    ) {
      world.scoreboard.addObjective("status", "§cHP§r");
    }

    customkb();

    const end1 = Date.now();
    const time1 = end1 - start1;

    // Ensure this runs once per tick
    system.runInterval(() => {
      if (system.currentTick % TicksPerSecond <= 3) system.waitTicks(5);
      else if (system.currentTick % TicksPerSecond <= 5) system.waitTicks(2);
      else if (system.currentTick % TicksPerSecond <= 10) system.waitTicks(1);

      const dimensionTypes = DimensionTypes.getAll();
      dimensionTypes.forEach((dimensionType) => {
        world
          .getDimension(dimensionType.typeId)
          .runCommand(`scoreboard objectives setdisplay belowname status`);

        if (getConfig("optimized-entity-count")) {
          const entities = world
            .getDimension(dimensionType.typeId)
            .getEntities();

          const players =
            world.getAllPlayers() ??
            entities.filter((entity) => entity.typeId === "minecraft:player");

          if (entities.length > maxEntities) {
            // Handle case with many entities
            const excessEntities = entities.slice(maxEntities);
            excessEntities.forEach((entity) => entity.kill());
          }

          if (players.length > 30 && entities.length / players.length < 1) {
            // Handle case with many players
            const excessEntities = entities.slice(
              Math.round(entities.length / players.length)
            );
            excessEntities.forEach((entity) => entity.kill());
          }

          if (
            players.length >= 40 &&
            system.currentTick % (TicksPerSecond * 60) === 0
          ) {
            // Handle case with many players
            world.sendMessage({
              translate: `§c${serverChatTitle} Server is full! §e${players.length}§c players are online! Bound maximum of 40 allowed connections reached!`,
            });
          }
        }
      });

      const start2 = Date.now();
      const players = world.getAllPlayers().filter((p) => p.isValid);

      for (let i = 0; i < players.length; i++) {
        try {
          mainPlayerExec(players[i]);
        } catch (err) {
          if (system.currentTick % 100 === 0 && err instanceof Error) {
            console.error(err, err.stack);
            world.sendMessage({
              translate: `§cThere was an error whilst trying to run the main tick function! §e${err} ${err.stack}§c.`,
            });
          }
        }
      }

      const end2 = Date.now();
      const time2 = end2 - start2;

      // Count this tick, then take exactly one TPS sample and reuse it
      tickCount++;
      const stats = getTPS(true);
      const TPS = stats.tps;

      world.setDynamicProperty("tps", TPS);
      world.setDynamicProperty("tickcount", stats.ticks);
      world.setDynamicProperty("averageTimeTaken", stats.averageTimeTaken);

      if (system.currentTick % 1200 === 0)
        console.log(
          `${serverConsoleTitle} TPS: ${TPS.toFixed(
            2
          )}.\nSystem Interval Time: ${Math.trunc(
            time2
          )}ms.\nTick Interval Time: ${Math.trunc(time1)}ms.`
        );
      if (TPS < 5) {
        const dimensionTypes = DimensionTypes.getAll();
        const dimensionArray = dimensionTypes.map((dimensionType) =>
          world.getDimension(dimensionType.typeId)
        );
        for (let i = 0; i < 3; i++)
          dimensionArray.forEach((dimension) =>
            dimension.runCommand(`function cmds/emergency`)
          );
      } else if (TPS < 10) {
        for (let i = 0; i < players.length; i++) {
          const items = world.getAllPlayers()[i].dimension.getEntities({
            type: "minecraft:item",
            maxDistance: 64,
            minDistance: 16,
          });
          for (let i = 0; i < items.length; i++) {
            items[i].kill();
          }
        }
      }
    }, 0);

    console.log(`${serverConsoleTitle} Script loaded successfully!`);
    world.sendMessage({
      translate: `${serverChatTitle} Script loaded successfully!`,
    });
  } catch (e) {
    console.error(`${e} ${e.stack}`);
  }
});

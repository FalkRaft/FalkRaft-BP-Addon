"use strict";

import { GameMode, system, world } from "@minecraft/server";
import { serverChatTitle } from "../index.js";
import { getConfig } from "../config";
import { computePlayerStates } from "../players.js";

/**
 * @param {import('@minecraft/server').Vector3} coords1
 * @param {import('@minecraft/server').Vector3} coords2
 * @param {string[]} tags
 */
export function SpawnProtection(
  coords1 = { x: -32, y: -64, z: -32 },
  coords2 = { x: 32, y: 320, z: 32 },
  tags = ["op"]
) {
  world.beforeEvents.playerBreakBlock.subscribe((data) => {
    // Check if the player has any of the specified tags
    if (
      !data.player.hasTag("dev") &&
      tags.some((tag) => data.player.hasTag(tag))
    ) {
      return;
    }

    /// For stricter vertical movement
    // const states = computePlayerStates(
    //   data.player,
    //   data.player.location,
    //   data.player.getVelocity()
    // );
    // if (!data.player.isOnGround && states.isOnGround || states.onEighthBoundary) {
    //   const { x: vx, y: vy, z: vz } = data.player.getVelocity();
    //   system.run(() => data.player.applyKnockback({ x: vx / 2, z: vz / 2 }, -Math.abs(vy)) / 2);
    //   if (data.player.hasTag("dev")) {
    //     data.player.sendMessage({
    //       translate: `${serverChatTitle} Correction applied.`,
    //     });
    //   }
    // }

    const blockLoc = {
      x: data.block.x,
      y: data.block.y,
      z: data.block.z,
    };

    const minX = Math.min(coords1.x, coords2.x);
    const maxX = Math.max(coords1.x, coords2.x);
    const minY = Math.min(coords1.y, coords2.y);
    const maxY = Math.max(coords1.y, coords2.y);
    const minZ = Math.min(coords1.z, coords2.z);
    const maxZ = Math.max(coords1.z, coords2.z);

    // Check if the player is within the protected area
    data.cancel =
      Math.trunc(blockLoc.x) >= minX &&
      Math.trunc(blockLoc.x) <= maxX &&
      Math.trunc(blockLoc.y) >= minY &&
      Math.trunc(blockLoc.y) <= maxY &&
      Math.trunc(blockLoc.z) >= minZ &&
      Math.trunc(blockLoc.z) <= maxZ &&
      getConfig("spawn-protection");
    if (data.cancel) return;

    /// Check if the player breaks a block through a block
    const block = data.player.dimension.getBlockFromRay(
      data.player.getHeadLocation(),
      data.player.getViewDirection(),
      {
        includeLiquidBlocks: false,
        includePassableBlocks: true,
        excludeTypes: ["minecraft:air"],
      }
    );
    data.cancel =
      block.block.x !== data.block.x ||
      block.block.y !== data.block.y ||
      (block.block.z !== data.block.z &&
        data.player.getGameMode() !== GameMode.Creative);
    system.run(() => {
      if (data.player.hasTag("dev")) {
        data.player.sendMessage({
          translate: `${serverChatTitle} [Debug] Block broken: ${data.block.x} x, ${data.block.y} y, ${data.block.z} z, by ${data.player.name}`,
        });
        data.player.sendMessage({
          translate: `${serverChatTitle} [Debug] Block ray hit: ${block.block.x} x, ${block.block.y} y, ${block.block.z} z, by ${data.player.name}`,
        });
      }
    });
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((data) => {
    // Check if the player has any of the specified tags
    if (
      !data.player.hasTag("dev") &&
      tags.some((tag) => data.player.hasTag(tag))
    ) {
      return;
    }

    /// For stricter vertical movement
    // const states = computePlayerStates(
    //   data.player,
    //   data.player.location,
    //   data.player.getVelocity()
    // );
    // const { x: vx, y: vy, z: vz } = data.player.getVelocity();
    // if (!data.player.isOnGround && states.isOnGround || states.onEighthBoundary) {
    //   system.run(() => data.player.applyKnockback({ x: vx / 2, z: vz / 2 }, -Math.abs(vy)) / 2);
    //   if (data.player.hasTag("dev")) {
    //     data.player.sendMessage({
    //       translate: `${serverChatTitle} Correction applied.`,
    //     });
    //   }
    // }

    const blockLoc = {
      x: data.block.x,
      y: data.block.y,
      z: data.block.z,
    };

    const minX = Math.min(coords1.x, coords2.x);
    const maxX = Math.max(coords1.x, coords2.x);
    const minY = Math.min(coords1.y, coords2.y);
    const maxY = Math.max(coords1.y, coords2.y);
    const minZ = Math.min(coords1.z, coords2.z);
    const maxZ = Math.max(coords1.z, coords2.z);

    // Check if the player is within the protected area
    data.cancel =
      Math.trunc(blockLoc.x) >= minX &&
      Math.trunc(blockLoc.x) <= maxX &&
      Math.trunc(blockLoc.y) >= minY &&
      Math.trunc(blockLoc.y) <= maxY &&
      Math.trunc(blockLoc.z) >= minZ &&
      Math.trunc(blockLoc.z) <= maxZ &&
      data.itemStack !== undefined &&
      getConfig("spawn-protection");
    if (data.cancel) return;

    /// Check if the player breaks a block through a block
    const block = data.player.dimension.getBlockFromRay(
      data.player.getHeadLocation(),
      data.player.getViewDirection(),
      {
        includeLiquidBlocks: false,
        includePassableBlocks: true,
        excludeTypes: ["minecraft:air"],
      }
    );
    data.cancel =
      block.block.x !== data.block.x ||
      block.block.y !== data.block.y ||
      (block.block.z !== data.block.z &&
        data.player.getGameMode() !== GameMode.Creative);
    system.run(() => {
      if (data.player.hasTag("dev")) {
        data.player.sendMessage({
          translate: `${serverChatTitle} [Debug] Block placed: ${data.block.x} x, ${data.block.y} y, ${data.block.z} z, by ${data.player.name}`,
        });
        data.player.sendMessage({
          translate: `${serverChatTitle} [Debug] Block ray hit: ${block.block.x} x, ${block.block.y} y, ${block.block.z} z, by ${data.player.name}`,
        });
      }
    });
  });
}

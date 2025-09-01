"use strict";

import {
  InputMode,
  MemoryTier,
  PlatformType,
  Player,
  system,
  world,
} from "@minecraft/server";
// Unused until custom commands are in release.
// import {chatCommand} from "./commands/create_command.js";

// chatCommand(); // Custom Chat Commands

/**
 * Script by JaylyMC
 *
 * @beta
 *
 * @description
 * Retrieve player's movement direction. This works with players with inputpermission disabled.
 *
 * This complex function is made specifically for players with joystick control mode.
 * Because dragging the joystick can result in a range of float values, unlike D-Pad or any other controls.
 *
 * @param {import('@minecraft/server').Player} player player's movement vector to retrieve
 * @returns movement direction
 *
 * Reference for movement vector, for keyboard movement control:
 * - Walk forward: `(0, 1)`
 * - Walk backward: `(0, -1)`
 * - Strafe left: `(1, 0)`
 * - Strafe right: `(-1, 0)`
 * - Not moving: `(0, 0)`
 */
function getPlayerControlMovement(player) {
  // Added by FalkRaft
  if (!player instanceof Player) return "Error: Player is not a player.";

  let w = "W";
  let a = "A";
  let s = "S";
  let d = "D";

  let movement = player.inputInfo.getMovementVector();
  // Threshold to classify directions
  let threshold = 0.1;
  // Determine the normalized direction
  let normalizedX =
    Math.abs(movement.x) >= threshold ? (movement.x > 0 ? 1 : -1) : 0;
  let normalizedY =
    Math.abs(movement.y) >= threshold ? (movement.y > 0 ? 1 : -1) : 0;
  // Define a direction based on normalized x and y
  if (player.hasTag("debug")) {
    if (normalizedX === 0 && normalizedY === 1)
      return `${w}: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`;
    if (normalizedX === 1 && normalizedY === 0)
      return `${a}: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`;
    if (normalizedX === 0 && normalizedY === -1)
      return `${s}: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`;
    if (normalizedX === -1 && normalizedY === 0)
      return `${d}: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`;
    if (normalizedX === 1 && normalizedY === 1)
      return w
        .concat(a)
        .concat(`: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`);
    if (normalizedX === -1 && normalizedY === 1)
      return w
        .concat(d)
        .concat(`: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`);
    if (normalizedX === 1 && normalizedY === -1)
      return s
        .concat(a)
        .concat(`: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`);
    if (normalizedX === -1 && normalizedY === -1)
      return s
        .concat(d)
        .concat(`: ${Math.sqrt(normalizedX ** 2 + normalizedY ** 2)}`);
    if (normalizedX === 0 && normalizedY === 0) return "None";
  } else {
    if (normalizedX === 0 && normalizedY === 1) return w;
    if (normalizedX === 1 && normalizedY === 0) return a;
    if (normalizedX === 0 && normalizedY === -1) return s;
    if (normalizedX === -1 && normalizedY === 0) return d;
    if (normalizedX === 1 && normalizedY === 1) return w.concat(a);
    if (normalizedX === -1 && normalizedY === 1) return w.concat(d);
    if (normalizedX === 1 && normalizedY === -1) return s.concat(a);
    if (normalizedX === -1 && normalizedY === -1) return s.concat(d);
    if (normalizedX === 0 && normalizedY === 0) return "None";
  }
  // Handle unexpected cases
  return "Unknown";
}

/**
 * @param {Player} player
 */
export function betaPlayerFeatures(player) {
  if (
    player.clientSystemInfo.memoryTier === MemoryTier.SuperHigh &&
    system.currentTick % 1000 === 0
  ) {
    player.sendMessage({
      translate: `§cYour memory usage is super high. Please close any background applications and/or restart the game or device. Device: §e${player.clientSystemInfo.platformType}§c. Memory tier: §e${player.clientSystemInfo.memoryTier}§c.`,
    });
  }
  if (
    system.serverSystemInfo.memoryTier === MemoryTier.SuperHigh &&
    system.currentTick % 1000 === 0
  ) {
    world.sendMessage({
      translate: `§cThis server has a very high memory usage and may restart. Server memory tier: §e${system.serverSystemInfo.memoryTier}§c.`,
    });
    console.log(
      `Very high server memory usage. Memory tier: ${system.serverSystemInfo.memoryTier}.`
    );
  }
  let status = getPlayerControlMovement(player);
  let speed =
    Math.sqrt(
      player.getVelocity().x ** 2 +
        player.getVelocity().y ** 2 +
        player.getVelocity().z ** 2
    ) * 20;
  if (player.isJumping) status = `SPACE + ${getPlayerControlMovement(player)}`;
  else if (player.isSneaking)
    status = `SHIFT + ${getPlayerControlMovement(player)}`;
  else if (player.isSprinting)
    status = `CTRL + ${getPlayerControlMovement(player)}`;
  else if (player.isSprinting && player.isJumping)
    status = `CTRL + SPACE + ${getPlayerControlMovement(player)}`;
  if (player.hasTag("dev"))
    player.nameTag = `§a${player.name}§r\n§fTags:§r\n${player
      .getTags()
      .join(",\n")}\n§fStatuses:§r\nisSprinting: ${
      player.isSprinting
    }\nisJumping: ${player.isJumping}\nisOnGround: ${
      player.isOnGround
    }\nLocation: (${player.location.x.toFixed(3)}, ${player.location.y.toFixed(
      3
    )}, ${player.location.z.toFixed(3)})\nDevice: ${
      player.clientSystemInfo.platformType
    }\nInput Device: ${player.inputInfo.lastInputModeUsed}\nMemory Tier: ${
      player.clientSystemInfo.memoryTier
    }\nMax Render Distance: ${
      player.clientSystemInfo.maxRenderDistance
    }\nGraphics Mode: ${
      player.graphicsMode
    }\nMovement: ${status}\nSpeed: ${speed.toFixed(3)} B/S\nDimension: ${
      player.dimension.id
    }`;

  const velocity = player.getVelocity();
  const position = player.location;
  const predictedpos = {
    x: position.x + velocity.x,
    y: position.y + velocity.y,
    z: position.z + velocity.z,
  };

  if (!player.hasTag("parkour") && player.hasTag("dev")) {
    player.onScreenDisplay.setActionBar(
      `§eDevice: §f${player.clientSystemInfo.platformType}§e Input: §f${
        player.inputInfo.lastInputModeUsed
      }§e Movement: §f${status}\n§eSpeed: §f${speed.toFixed(
        3
      )} B/S\n§ePosition: §f${player.location.x}, ${player.location.y}, ${
        player.location.z
      }\n§ePredicted pos: §f${predictedpos.x}, ${predictedpos.y}, ${
        predictedpos.z
      }`
    );
  } else if (player.hasTag("parkour")) {
    player.onScreenDisplay.setActionBar(`§eSpeed: §f${speed.toFixed(3)} B/S`);
  }
  if (
    player.clientSystemInfo.platformType === PlatformType.Console &&
    player.inputInfo.lastInputModeUsed === InputMode.MotionController
  ) {
    player.runCommand(
      `kick ${player.name} §cInvalid input mode detected. Platform type: §e${player.clientSystemInfo.platformType}§c. Last input mode used: §e${player.inputInfo.lastInputModeUsed}§c.§r`
    );
  } else if (
    player.clientSystemInfo.platformType === PlatformType.Desktop &&
    player.inputInfo.lastInputModeUsed === InputMode.Touch
  ) {
    player.runCommand(
      `kick ${player.name} §cInvalid input mode detected. Platform type: §e${player.clientSystemInfo.platformType}§c. Last input mode used: §e${player.inputInfo.lastInputModeUsed}§c.§r`
    );
  } else if (
    player.clientSystemInfo.platformType === PlatformType.Mobile &&
    player.inputInfo.lastInputModeUsed === InputMode.MotionController
  ) {
    player.runCommand(
      `kick ${player.name} §cInvalid input mode detected. Platform type: §e${player.clientSystemInfo.platformType}§c. Last input mode used: §e${player.inputInfo.lastInputModeUsed}§c.§r`
    );
  }
}

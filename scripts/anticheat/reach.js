"use strict";

import { system } from "@minecraft/server";
import { ConfigKeys, getConfig } from "../config";

/**
 * @param {import("@minecraft/server").PlayerInteractWithBlockBeforeEvent} beforeInteract
 */
export function reachChecksBeforeInteract(beforeInteract) {
  const player = beforeInteract.player;
  const blockInView = player.getBlockFromViewDirection();
  const bloc = blockInView.block.center();
  const ploc = player.getHeadLocation();
  const playerReach = 5;
  const reach_scalar = getConfig(ConfigKeys.REACH_DISTANCE_SCALAR_MULTIPLIER) ?? 1.5;
  const distance = Math.sqrt(
    Math.pow(bloc.x - ploc.x, 2) +
      Math.pow(bloc.y - ploc.y, 2) +
      Math.pow(bloc.z - ploc.z, 2)
  ); // using pythagorean theorem to find distance between two points in 3d space
  if (distance > playerReach * (reach_scalar * reach_scalar)) {
    beforeInteract.cancel = true;
    system.runTimeout(
      () =>
        beforeInteract.block.setPermutation(beforeInteract.block.permutation),
      1
    );
  }
}

/**
 * @param {import("@minecraft/server").PlayerBreakBlockBeforeEvent} beforeBreak
 */
export function reachChecksBeforeBreak(beforeBreak) {
  const player = beforeBreak.player;
  const block = beforeBreak.block;
  const bloc = {
    x: block.x + 0.5,
    y: block.y + 0.5,
    z: block.z + 0.5,
  };
  const ploc = player.getHeadLocation();
  const playerReach = 5;
  const distance = Math.sqrt(
    Math.pow(bloc.x - ploc.x, 2) +
      Math.pow(bloc.y - ploc.y, 2) +
      Math.pow(bloc.z - ploc.z, 2)
  ); // using pythagorean theorem to find distance between two points in 3d space
  if (distance > playerReach * (reach_scalar * reach_scalar)) {
    beforeBreak.cancel = true;
    system.runTimeout(
      () => beforeBreak.block.setPermutation(beforeBreak.block.permutation),
      1
    );
  }
}

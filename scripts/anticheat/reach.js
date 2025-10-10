"use strict";

import { world } from "@minecraft/server";
import { reach_scalar } from "../commands/create_command";

export function reachChecks() {
  world.beforeEvents.playerInteractWithBlock.subscribe((data) => {
    const player = data.player;
    const ploc = player.getHeadLocation();
    const blockInView = player.dimension.getBlockFromRay(ploc, player.getViewDirection(), {includePassableBlocks: true});
    const blockInViewFaceLocation = blockInView.faceLocation;
    const playerReach = 5; //player.getDynamicProperty("reach");
    const distance =
      Math.sqrt(
        Math.pow(ploc.x - blockInViewFaceLocation.x, 2) +
          Math.pow(ploc.y - blockInViewFaceLocation.y, 2) +
          Math.pow(ploc.z - blockInViewFaceLocation.z, 2)
      ) / 2;
    if (distance > playerReach * reach_scalar) {
      data.cancel = true;
    }
  });

  world.beforeEvents.playerBreakBlock.subscribe((data) => {
    const player = data.player;
    const ploc = player.getHeadLocation();
    const blockInView = player.dimension.getBlockFromRay(ploc, player.getViewDirection(), {includePassableBlocks: true});
    const blockInViewFaceLocation = blockInView.faceLocation;
    const playerReach = 5; //player.getDynamicProperty("reach");
    const distance =
      Math.sqrt(
        Math.pow(ploc.x - blockInViewFaceLocation.x, 2) +
          Math.pow(ploc.y - blockInViewFaceLocation.y, 2) +
          Math.pow(ploc.z - blockInViewFaceLocation.z, 2)
      ) / 2;
    if (distance > playerReach * reach_scalar) {
      data.cancel = true;
    }
  });
}

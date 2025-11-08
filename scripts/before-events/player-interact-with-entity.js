import { world } from "@minecraft/server";
import { findDotProduct } from "../index.js";
import { Flags } from "../flags.js";

export function beforePlayerInteractWithEntity() {
  world.beforeEvents.playerInteractWithEntity.subscribe((data) => {
    if (findDotProduct(data.player, data.target, true, Flags.KILLAURA)) {
      data.cancel = false; // Disabled for trading purposes.
    }

    const player = data.player;
    const target = data.target;
    const playerReach = 5; //player.getDynamicProperty("reach");
    const scalar = 1.5;
    const targetInRay = player.getEntitiesFromViewDirection({ignoreBlockCollision: false, includePassableBlocks: true}).find(ent => ent.id === target.id);
    if (!targetInRay)
      data.cancel = true;
    if (targetInRay.distance > playerReach * scalar)
      data.cancel = true;
  });
}

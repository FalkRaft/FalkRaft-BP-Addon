import { world } from "@minecraft/server";
import { findDotProduct } from "../index.js";
import { Flags } from "../flags.js";

export function beforePlayerInteractWithEntity() {
  world.beforeEvents.playerInteractWithEntity.subscribe((data) => {
    if (findDotProduct(data.player, data.target, true, Flags.KILLAURA)) {
      data.cancel = false; // Disabled for trading purposes.
    }
  });
}

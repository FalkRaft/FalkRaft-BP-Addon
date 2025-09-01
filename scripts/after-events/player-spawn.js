import { world } from "@minecraft/server";

export function afterPlayerSpawn() {
  world.afterEvents.playerSpawn.subscribe((data) => {
    if (data.initialSpawn) {
      data.player.clearDynamicProperties();
    }
  });
}

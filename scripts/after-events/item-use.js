import { system, world } from "@minecraft/server";

export function afterItemUse() {
  world.afterEvents.itemUse.subscribe((data) => {
    const player = data.source;
    let rcps = player.getDynamicProperty("rcps");
    if (rcps === undefined) return;
    player.setDynamicProperty("rcps", ++rcps);
    player.setDynamicProperty("rcpstime", system.currentTick);
  });
}

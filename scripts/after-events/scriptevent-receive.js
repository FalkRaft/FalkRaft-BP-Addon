import { Player, system } from "@minecraft/server";
import { serverConsoleTitle } from "../index.js";

export function afterScriptEventReceive() {
  system.afterEvents.scriptEventReceive.subscribe((data) => {
    switch (data.id.toLowerCase() + data.message.toLowerCase()) {
      case "fr:getpos" + "":
        if (data.sourceEntity instanceof Player) {
          const player = data.sourceEntity;
          console.error(
            `${serverConsoleTitle} ${player.name}'s position: (${player.location.x}, ${player.location.y}, ${player.location.z}).`
          );
        }
        break;
      default:
        if (data.sourceEntity?.typeId === "scythe:left")
          data.sourceEntity.runCommand(
            `tellraw @s {"rawtext":[{"translate":"§cThe following id: §e${data.id}§r§c, did not correspond to one of the actions."}]}`
          );
        break;
    }
  });
}

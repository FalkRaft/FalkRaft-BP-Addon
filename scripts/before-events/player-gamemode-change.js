import { world } from "@minecraft/server";
import { flag } from "../index.js";

export function beforePlayerGameModeChange() {
  /// Anti-gamemode
  world.beforeEvents.playerGameModeChange.subscribe((data) => {
    if (!data.player.hasTag("op")) {
      data.cancel = true;
      flag(
        data.player,
        "force gamemode",
        `§ffrom §e${data.fromGameMode}§f to §e${data.toGameMode}§f`
      );
    }
  });
}

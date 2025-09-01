"use strict";

import { world, GameMode, system } from "@minecraft/server";
import { serverChatTitle } from "../index.js";

export function reachChecks() {
  world.beforeEvents.playerInteractWithBlock.subscribe((data) => {
    const block = data.block;
    const player = data.player;
    const bloc = block.location;
    const ploc = player.getHeadLocation();
    const playerReach = player.getDynamicProperty("reach");
    const distance =
      Math.sqrt(
        Math.pow(ploc.x - bloc.x, 2) +
          Math.pow(ploc.y - bloc.y, 2) +
          Math.pow(ploc.z - bloc.z, 2)
      ) / 2;
    if (distance > playerReach && player.getGameMode() === GameMode.Creative) {
      data.cancel = true;
      system.run(() =>
        world.sendMessage({
          translate: `${serverChatTitle} §e${
            player.name
          }§c used reach! Reach: §e${distance.toFixed(8)}§c blocks.`,
        })
      );
    } else if (
      (distance > playerReach && player.getGameMode() === GameMode.Survival) ||
      player.getGameMode() === GameMode.Adventure
    ) {
      data.cancel = true;
      system.run(() =>
        world.sendMessage({
          translate: `${serverChatTitle} §e${
            player.name
          }§c used reach! Reach: §e${distance.toFixed(8)}§c blocks.`,
        })
      );
    }
  });

  world.beforeEvents.playerBreakBlock.subscribe((data) => {
    const block = data.block;
    const player = data.player;
    const bloc = block.location;
    const ploc = player.getHeadLocation();
    const playerReach = player.getDynamicProperty("reach");
    const distance =
      Math.sqrt(
        Math.pow(ploc.x - bloc.x, 2) +
          Math.pow(ploc.y - bloc.y, 2) +
          Math.pow(ploc.z - bloc.z, 2)
      ) / 2;
    if (distance > playerReach && player.getGameMode() === GameMode.Creative) {
      data.cancel = true;
      system.run(() =>
        world.sendMessage({
          translate: `${serverChatTitle} §e${
            player.name
          }§c used reach! Reach: §e${distance.toFixed(8)}§c blocks.`,
        })
      );
    } else if (
      (distance > playerReach && player.getGameMode() === GameMode.Survival) ||
      player.getGameMode() === GameMode.Adventure
    ) {
      data.cancel = true;
      system.run(() =>
        world.sendMessage({
          translate: `${serverChatTitle} §e${
            player.name
          }§c used reach! Reach: §e${distance.toFixed(8)}§c blocks.`,
        })
      );
    }
  });
}

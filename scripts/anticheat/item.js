"use strict";

import {
  EntityComponentTypes,
    ItemComponentTypes,
  Player,
} from "@minecraft/server";
import { flag } from "../index.js";
import { Flags } from "../flags.js";

/**
 * @param {Player} player
 */
export function itemAC(player) {
  if (!player instanceof Player) return;
  if (player.hasComponent(EntityComponentTypes.Inventory)) {
    const inventory = player.getComponent(EntityComponentTypes.Inventory);
    const inventoryContainer = inventory.container;
    const item = inventoryContainer?.getItem(player.selectedSlotIndex);
    if (item === undefined) return;
    if (item?.typeId.includes("tile.")) {
      flag(player, Flags.ILLEGALITEM, `${item?.typeId}`);
      inventoryContainer.setItem(player.selectedSlotIndex, undefined); // Clears the slot.
    }
    if (item?.amount > item.maxAmount) {
      flag(
        player,
        Flags.ILLEGALITEM,
        `${item?.typeId} | ${item?.amount} | ${item?.maxAmount}`
      );
      inventoryContainer.setItem(player.selectedSlotIndex, undefined); // Clears the slot.
    }
    if (item?.hasComponent(ItemComponentTypes.Enchantable)) {
      const enchantments = item?.getComponent(ItemComponentTypes.Enchantable);
      enchantments?.getEnchantments().forEach((enchantment) => {
        if (enchantment.level > enchantment.type.maxLevel) {
          flag(
            player,
            Flags.ILLEGALITEM,
            `${enchantment.type.id} | ${enchantment.level} | ${enchantment.type.maxLevel} | ${item?.typeId}`
          );
          inventoryContainer.setItem(player.selectedSlotIndex, undefined); // Clears the slot.
        }
      });
    }
  }
}

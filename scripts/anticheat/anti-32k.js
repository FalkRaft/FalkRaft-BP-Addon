import * as mc from "@minecraft/server";

export function anti32k() {
  // Script example for ScriptAPI
  // Author: Smell of curry <https://github.com/smell-of-curry>
  //         JaylyMC <https://github.com/JaylyDev>
  //         Remember M9 <https://github.com/Remember-M9>
  // Project: https://github.com/JaylyDev/ScriptAPI
  /**
   * Minecraft Bedrock Anti Hacked Items
   * @license MIT
   * @author Smell of curry & JaylyMC
   * @version 1.1.0
   * --------------------------------------------------------------------------
   * This is an anti hacked item, meaning it checks a player inventory every
   * tick then it tests if they have any banned items, then checks if they have
   * items that have hacked enchantments and clears the item from inventory
   * --------------------------------------------------------------------------
   */
  const { world, system } = mc;
  function onTick() {
    for (const player of world.getPlayers()) {
      const inv = player.getComponent(mc.EntityComponentTypes.Inventory);
      if (!inv) continue;

      const { container, inventorySize } = inv;
      if (container.emptySlotsCount === inventorySize) continue;

      for (let slot = 0; slot < inventorySize; slot++) {
        const item = container.getItem(slot);
        if (!item || !item.hasComponent(mc.ItemComponentTypes.Enchantable))
          continue;

        const enchantable = item.getComponent(
          mc.ItemComponentTypes.Enchantable
        );
        const enchantments = enchantable.getEnchantments();
        if (enchantments.length === 0) continue;

        for (const enchantment of enchantments) {
          try {
            if (!enchantable.canAddEnchantment(enchantment)) {
              enchantable.removeEnchantment(enchantment.type);
            }
          } catch (e) {}
        }
      }
    }
  }
  system.runInterval(onTick);
}

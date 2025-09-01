"use strict";

import {
  Entity,
  EntityComponentTypes,
  EntityDamageCause,
  GameMode,
  Player,
  system,
  TicksPerSecond,
  world,
} from "@minecraft/server";
import {
  findDotProduct,
  flag,
  serverChatTitle,
  serverConsoleTitle,
} from "./index.js";
import { Flags } from "./flags.js";
import { getConfig } from "./config.js";

/**
 * Handles the knockback and special effects when an entity attacks another entity.
 * @param {import("@minecraft/server").Entity} damageSourceDamagingEntity
 * @param {import("@minecraft/server").Entity} hurtEntity - The entity receiving the damage.
 * @param {number} kbX - The X component of the knockback strength.
 * @param {number} kbY - The Y part of the knockback strength.
 * @param {import("@minecraft/server").Vector3} hitloc - The location where the hit occurred.
 * @param {import("@minecraft/server").Vector3} direction - The direction of the attack.
 * @param {number} damage - The amount of damage dealt.
 */
function handleEntityAttackKnockback(
  damageSourceDamagingEntity,
  hurtEntity,
  kbX = 1,
  kbY = 0.3,
  hitloc,
  direction,
  damage = 0
) {
  if (!damageSourceDamagingEntity instanceof Entity) return;
  if (!hurtEntity instanceof Entity) return;
  if (!kbX instanceof Number) return;
  if (!kbY instanceof Number) return;
  if (!damage instanceof Number) return;

  const damagingEntity = damageSourceDamagingEntity;
  if (damagingEntity instanceof Player)
    findDotProduct(damagingEntity, hurtEntity, true, Flags.KILLAURA);
  const magnitude = Math.sqrt(
    direction.x * direction.x + direction.z * direction.z
  );
  const newdir = {
    x: direction.x / magnitude,
    z: direction.z / magnitude,
  };

  // Apply knockback
  hurtEntity.applyKnockback({ x: newdir.x / kbX, z: newdir.z / kbX }, kbY);

  if (damagingEntity instanceof Player) {
    const player = damagingEntity;
    if (player.isFalling) player.addTag("critical_hit");
    const entitiesFromRay = player.dimension.getEntitiesFromRay(
      hitloc,
      direction,
      { type: hurtEntity.typeId }
    );
    entitiesFromRay.forEach((entity) => {
      if (entity.entity.typeId === hurtEntity.typeId) {
        const distance = entity.distance / 2;
        const isCreative = player.getGameMode() === GameMode.Creative;
        if (
          ((distance > 3 && !isCreative) || (distance > 5 && isCreative)) &&
          hurtEntity.typeId !== "minecraft:enderman"
        ) {
          const health = hurtEntity.getComponent(EntityComponentTypes.Health);
          health.setCurrentValue(health.currentValue + damage);
          flag(player, Flags.REACH, distance);
        }
      }
    });
  }
}

export function customkb() {
  /// KnockBack Strength
  const kbX = 0.66;
  const kbY = 0.41;

  /// World Events
  try {
    world.afterEvents.entityDie.subscribe((data) => {
      if (!data.deadEntity) return;
      if (!data.deadEntity instanceof Player) {
        data.deadEntity.remove();
      }
      if (!data.damageSource) return;
      if (
        !data.deadEntity instanceof Player &&
        !data.damageSource.damagingEntity instanceof Player
      ) {
        world.sendMessage(
          `§e${data.deadEntity.typeId}§r died to §e${data.damageSource.damagingEntity.typeId}§r`
        );
      } else if (
        !data.deadEntity instanceof Player &&
        data.damageSource.damagingEntity instanceof Player
      ) {
        world.sendMessage(
          `§e${data.deadEntity.typeId}§r died to §e${data.damageSource.damagingEntity.nameTag}§r`
        );
      }
    });
    entityHurtKB(kbX, kbY);
    entityHitKB(kbX, kbY);
  } catch (error) {
    world.sendMessage({ translate: `${serverChatTitle} ${error.stack}` });
  }
}

/**
 * Subscribes to the entity hit event and applies custom knockback logic based on the type of damaging entity,
 * tags, and projectiles. Also checks for reach violations and sends a warning message if a player exceeds
 * the allowed reach distance.
 *
 * @param {number} kbX - The knockback force to apply on the X axis for specific projectiles (e.g., snowball, egg).
 * @param {number} kbY - The knockback force to apply on the Y axis for specific projectiles (e.g., snowball, egg).
 */
function entityHitKB(kbX, kbY) {
  world.afterEvents.entityHitEntity.subscribe((data) => {
    if (data.hitEntity.typeId === "minecraft:tnt") return;
    if (data.damagingEntity.typeId === "minecraft:tnt") return;

    if (data.damagingEntity instanceof Player)
      findDotProduct(data.damagingEntity, data.hitEntity, true, Flags.KILLAURA);
    const hitloc = data.damagingEntity.getHeadLocation();
    const beinghitloc = data.hitEntity.location;
    const direction = {
      x: beinghitloc.x - hitloc.x,
      y: beinghitloc.y - hitloc.y,
      z: beinghitloc.z - hitloc.z,
    };
    if (data.damagingEntity.hasTag("jkb"))
      data.hitEntity.applyKnockback(
        { x: kbX / 2, z: kbY / 2 },
        data.hitEntity.isFalling ? kbY * 1.5 : kbY * 1.1
      );
    else data.hitEntity.applyKnockback({ x: 0, z: 0 }, 0);
    if (
      ["minecraft:snowball", "minecraft:egg"].some(
        (projectile) => data.damagingEntity.typeId === projectile
      )
    )
      handleEntityAttackKnockback(
        data.damagingEntity,
        data.hitEntity,
        kbX,
        kbY,
        hitloc,
        direction,
        1
      );
    if (data.damagingEntity instanceof Player) {
      const player = data.damagingEntity;
      const entitiesFromRay = data.damagingEntity.dimension.getEntitiesFromRay(
        hitloc,
        {
          x: direction.x,
          y: direction.y,
          z: direction.z,
        },
        {
          type: data.hitEntity.typeId,
        }
      );

      entitiesFromRay.forEach((entity) => {
        if (entity.entity.typeId === data.hitEntity.typeId) {
          const distance = entity.distance / 2;
          if (
            distance > 3 &&
            player.getGameMode() !== GameMode.Creative &&
            data.hitEntity.typeId !== "minecraft:enderman"
          ) {
            flag(player, Flags.REACH, distance);
          } else if (
            distance > 5 &&
            player.getGameMode() === GameMode.Creative &&
            data.hitEntity.typeId !== "minecraft:enderman"
          ) {
            flag(player, Flags.REACH, distance);
          }
        }
      });
    }
  });
}

/**
 * Subscribes to the entity hurt event and applies custom knockback logic based on the damage source.
 *
 * @param {number} kbX - The base horizontal knockback strength to apply.
 * @param {number} kbY - The base vertical knockback strength to apply.
 *
 * Handles different knockback multipliers and feedback for various damage causes:
 * - Ignores TNT as a damaging or hurt entity.
 * - For mêlée attacks, delegates to `handleEntityAttackKnockback`.
 * - For projectiles, applies increased knockback and sends a health message to the attacker.
 * - For sonic boom, block explosion, and entity explosion, applies strong knockback with different multipliers.
 */
function entityHurtKB(kbX, kbY) {
  world.afterEvents.entityHurt.subscribe(
    ({ hurtEntity, damageSource, damage }) => {
      if (damageSource.damagingEntity) {
        if (damageSource.damagingEntity.typeId === "minecraft:tnt") return;
        if (hurtEntity.typeId === "minecraft:tnt") return;

        const hitloc = damageSource.damagingEntity.getHeadLocation();
        const beinghitloc = hurtEntity.location;
        const direction = {
          x: beinghitloc.x - hitloc.x,
          y: beinghitloc.y - hitloc.y,
          z: beinghitloc.z - hitloc.z,
        };
        switch (damageSource.cause) {
          case EntityDamageCause.entityAttack:
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              kbX,
              kbY,
              hitloc,
              direction,
              damage
            );
            if (
              getConfig("attack-cooldown") &&
              damageSource.damagingEntity instanceof Player
            ) {
              const player = damageSource.damagingEntity;
              const effect = player.getEffect("minecraft:weakness");

              const attackSpeed = {
                sword: 1.6,
                trident: 0.9,
                mace: 1.65,
                shovel: 1.0,
                pickaxe: 0.85,
                axe1: 1.25,
                axe2: 1.0,
                axe3: 1.1,
                hoe1: 1,
                hoe2: 0.5,
                hoe3: 0.35,
                hoe4: 0.25,
                other: 0.25,
              };

              const items = {
                sword: ["sword"],
                trident: ["trident"],
                mace: ["mace"],
                shovel: ["shovel"],
                pickaxe: ["pickaxe"],
                axe1: ["wood", "stone", "copper"],
                axe2: ["gold", "diamond", "netherite"],
                axe3: ["iron"],
                hoe1: ["wood", "gold"],
                hoe2: ["stone", "copper"],
                hoe3: ["iron"],
                hoe4: ["diamond", "netherite"],
                other: [""],
              };

              const item = player
                .getComponent(EntityComponentTypes.Inventory)
                .container.getItem(player.selectedSlotIndex);

              if (item) {
                const itemType = item.typeId;
                // Find the correct attackSpeed key for the item typeId
                let attackKey = "other";
                for (const [key, substrings] of Object.entries(items)) {
                  if (
                    substrings.some(
                      (sub) => itemType.includes(sub) && sub !== ""
                    )
                  ) {
                    attackKey = key;
                    break;
                  }
                }
                const attackSpeedMultiplier =
                  attackSpeed[attackKey] || attackSpeed.other;
                // Apply the attack speed multiplier
                const T = TicksPerSecond / attackSpeedMultiplier;
                player.addEffect("minecraft:weakness", T, {
                  amplifier: 255,
                  showParticles: false,
                });
                player.onScreenDisplay.setActionBar(
                  `Attack speed reduced by ${attackSpeedMultiplier} seconds.`
                );
                system.runTimeout(() => {
                  player.removeEffect("minecraft:weakness");
                  player.onScreenDisplay.setActionBar("Attack speed restored.");
                  if (effect)
                    player.addEffect(effect.typeId, effect.duration, {
                      amplifier: effect.amplifier,
                      showParticles: true,
                    });
                }, T);
              } else {
                const T = attackSpeed.other * TicksPerSecond;
                player.addEffect("minecraft:weakness", T, {
                  amplifier: 255,
                  showParticles: false,
                });
                player.onScreenDisplay.setActionBar(
                  `Attack speed reduced by ${attackSpeed.other} seconds.`
                );
                system.runTimeout(() => {
                  player.removeEffect("minecraft:weakness");
                  player.onScreenDisplay.setActionBar("Attack speed restored.");
                  if (effect)
                    player.addEffect(effect.typeId, effect.duration, {
                      amplifier: effect.amplifier,
                      showParticles: true,
                    });
                }, T);
              }
            }
            break;
          case EntityDamageCause.projectile:
            damageSource.damagingEntity.runCommand("playsound random.orb");
            if (damageSource.damagingEntity === hurtEntity) return;
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              kbX * 1.15,
              kbY * 1.25,
              hitloc,
              direction,
              damage
            );
            if (
              !hurtEntity instanceof Player ||
              [null, undefined, ""].some((nTag) => hurtEntity.nameTag === nTag)
            ) {
              damageSource.damagingEntity.runCommand(
                `tellraw @s {"rawtext":[{"translate":"§e${
                  hurtEntity?.typeId
                }§f is at §c${hurtEntity
                  .getComponent(EntityComponentTypes.Health)
                  .currentValue.toFixed(0)} HP§f.§r"}]}`
              );
            } else {
              damageSource.damagingEntity.runCommand(
                `tellraw @s {"rawtext":[{"translate":"§e${
                  hurtEntity.nameTag
                }§f is at §c${hurtEntity
                  .getComponent(EntityComponentTypes.Health)
                  .currentValue.toFixed(0)} HP§f.§r"}]}`
              );
            }
            break;
          case EntityDamageCause.sonicBoom:
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              kbX * 15,
              kbY * 2.5,
              hitloc,
              direction,
              damage
            );
            break;
          case EntityDamageCause.blockExplosion:
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              kbX * 15,
              kbY * 15,
              hitloc,
              direction,
              damage
            );
            break;
          case EntityDamageCause.entityExplosion:
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              kbX * 20,
              kbY * 20,
              hitloc,
              direction,
              damage
            );
            break;
          case EntityDamageCause.fireTick:
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              0,
              kbY * 0.5,
              hitloc,
              direction,
              damage
            );
            break;
          default:
            break;
        }
      }
    }
  );
}

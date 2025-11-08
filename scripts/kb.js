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
import { findDotProduct, flag } from "./index.js";
import { Flags } from "./flags.js";
import { getConfig } from "./config.js";
// import { reach_scalar } from "./commands/create_command.js";

export const attackSpeed = {
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

export const items = {
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
  damage = 0
) {
  if (!damageSourceDamagingEntity instanceof Entity) return;
  if (!hurtEntity instanceof Entity) return;
  if (!damage instanceof Number) return;

  const damagingEntity = damageSourceDamagingEntity;
  if (damagingEntity instanceof Player)
    findDotProduct(damagingEntity, hurtEntity, true, Flags.KILLAURA);
  const hitloc = hurtEntity.getHeadLocation();
  const beinghitloc = hurtEntity.location;
  const direction = {
    x: beinghitloc.x - hitloc.x,
    y: beinghitloc.y - hitloc.y,
    z: beinghitloc.z - hitloc.z,
  };

  const magnitude = Math.sqrt(
    direction.x * direction.x + direction.z * direction.z
  );

  let newdir = { x: 0, z: 0 };

  const player = damagingEntity;

  // Guard: ensure coords are finite and magnitude isn't zero
  if (
    !Number.isFinite(direction.x) ||
    !Number.isFinite(direction.z) ||
    !Number.isFinite(magnitude) ||
    magnitude === 0
  ) {
    // fallback: skip horizontal knockback or use player's facing direction
    // e.g. use player's view direction projected to XZ plane
    const view = player.getViewDirection
      ? player.getViewDirection()
      : { x: 0, y: 0, z: 0 };
    const viewMag = Math.hypot(view.x, view.z) || 1;
    newdir = { x: view.x / viewMag, z: view.z / viewMag };
  } else {
    newdir = {
      x: direction.x / magnitude,
      z: direction.z / magnitude,
    };
  }

  // Knockback Strength Constants
  const kbX = 0.66;
  const kbY = 0.41;

  // Apply knockback
  const vel = player.getVelocity();
  // console.error("Newdir is: ", isNaN(newdir.x) || isNaN(newdir.z));
  // console.error("Kb is: ", isNaN(kbX) || isNaN(kbY));
  // console.error("Vel is: ", isNaN(vel.x) || isNaN(vel.z));
  hurtEntity.applyKnockback(
    {
      x: newdir.x / kbX + vel.x,
      z: newdir.z / kbX + vel.z,
    },
    player.isOnGround ? kbY : kbY + vel.y / 4
  );

  if (!(damagingEntity instanceof Player)) return;
  const entitiesFromRay = player.dimension.getEntitiesFromRay(
    hitloc,
    direction,
    { type: hurtEntity.typeId }
  );
  const hitEntity = entitiesFromRay.find(
    (entity) => entity.id === hurtEntity.id
  );
  if (!hitEntity) return;
  const distance = hitEntity.distance;
  const isCreative = player.getGameMode() === GameMode.Creative;
  if (
    ((distance > 3 * (reach_scalar * reach_scalar) && !isCreative) ||
      (distance > 5 * (reach_scalar * reach_scalar) && isCreative)) &&
    hurtEntity.typeId !== "minecraft:enderman"
  ) {
    const health = hurtEntity.getComponent(EntityComponentTypes.Health);
    health.setCurrentValue(health.currentValue + damage);
    flag(player, Flags.REACH, distance);
  }
}

export function customkb() {
  /// Subscribe to entity hurt and entity hit events
  /// to apply custom knockback logic
  /// and reach checks.
  entityHurtKB();
  entityHitKB();
}

/**
 * Subscribes to the entity hit event and applies custom knockback logic based on the type of damaging entity,
 * tags, and projectiles. Also checks for reach violations and sends a warning message if a player exceeds
 * the allowed reach distance.
 */
function entityHitKB() {
  world.afterEvents.entityHitEntity.subscribe((data) => {
    if (data.hitEntity.typeId === "minecraft:tnt") return;
    if (data.damagingEntity.typeId === "minecraft:tnt") return;

    // handleEntityAttackKnockback(data.damagingEntity, data.hitEntity, 1);
    data.hitEntity.applyKnockback(
      {
        x: 0,
        z: 0,
      },
      0
    );
  });
}

/**
 * Subscribes to the entity hurt event and applies custom knockback logic based on the damage source.
 * Handles different knockback multipliers and feedback for various damage causes:
 * - Ignores TNT as a damaging or hurt entity.
 * - For mêlée attacks, delegates to `handleEntityAttackKnockback`.
 * - For projectiles, applies increased knockback and sends a health message to the attacker.
 * - For sonic boom, block explosion, and entity explosion, applies strong knockback with different multipliers.
 */
function entityHurtKB() {
  world.afterEvents.entityHurt.subscribe(
    ({ hurtEntity, damageSource, damage }) => {
      if (damageSource.damagingEntity) {
        if (damageSource.damagingEntity.typeId === "minecraft:tnt") return;
        if (hurtEntity.typeId === "minecraft:tnt") return;
        switch (damageSource.cause) {
          case EntityDamageCause.entityAttack:
            handleEntityAttackKnockback(
              damageSource.damagingEntity,
              hurtEntity,
              damage
            );
            if (
              getConfig("attack-cooldown") &&
              damageSource.damagingEntity instanceof Player
            ) {
              const player = damageSource.damagingEntity;
              const effect = player.getEffect("minecraft:weakness");
              const effect2 = player.getEffect("minecraft:mining_fatigue");
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
                const T = Math.round(TicksPerSecond / attackSpeedMultiplier);
                player.addEffect("minecraft:weakness", T, {
                  amplifier: 255,
                  showParticles: false,
                });
                player.addEffect("minecraft:slow_mining", T, {
                  amplifier: Math.round(T),
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
                  if (effect2)
                    player.addEffect(effect2.typeId, effect2.duration, {
                      amplifier: effect2.amplifier,
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
          default:
            break;
        }
      }
    }
  );
}

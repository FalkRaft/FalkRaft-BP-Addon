import { Flags } from "./flags.js";
import { world } from "@minecraft/server";
// import { spawnProtectionRange } from "./commands/create_command.js";
// export { spawnProtectionRange };

export const ConfigKeys = {
  ATTACK_COOLDOWN: "attack-cooldown",
  OPTIMIZED_ENTITY_COUNT: "optimized-entity-count",
  DEBUG: "debug",
  SPAWN_PROTECTION: "spawn-protection",
  FLAGS: "flags",
  MAX_ENTITY_COUNT: "max-entity-count",
  SPAWN_PROTECTION_RANGE: "spawn-protection-range",
  REACH_DISTANCE_SCALAR_MULTIPLIER: "reach-distance-scalar-multiplier",
  MOVEMENT_ACCEPTANCE_THRESHOLD: "movement-acceptance-threshold",
};

// 1. Default config values (booleans only here)
export const defaultBooleanConfig = new Map([
  [ConfigKeys.ATTACK_COOLDOWN, false],
  [ConfigKeys.OPTIMIZED_ENTITY_COUNT, false],
  [ConfigKeys.DEBUG, false],
  [ConfigKeys.SPAWN_PROTECTION, true],
  [ConfigKeys.FLAGS, true],
  [Flags.CRITICALS, false],
  [Flags.DOUBLECLICK, false],
  [Flags.FLYA, false],
  [Flags.FLYB, false],
  [Flags.GLIDEA, true],
  [Flags.GLIDEB, true],
  [Flags.ILLEGALITEM, false],
  [Flags.KILLAURA, true],
  [Flags.PHASEA, true],
  [Flags.PHASEB, true],
  [Flags.REACH, true],
  [Flags.SPEED, true],
  [Flags.SPRINTSNEAK, true],
]);

export const defaultNumberConfig = new Map([
  [ConfigKeys.MAX_ENTITY_COUNT, 200],
  [ConfigKeys.SPAWN_PROTECTION_RANGE, 10],
  [ConfigKeys.REACH_DISTANCE_SCALAR_MULTIPLIER, 1.5],
  [ConfigKeys.MOVEMENT_ACCEPTANCE_THRESHOLD, 0.5],
]);

// 2. Working config store
const booleanConfig = new Map(defaultBooleanConfig);
const numberConfig = new Map(defaultNumberConfig);

// 3. Get/set helpers
export function getConfig(key) {
  return booleanConfig.has(key)
    ? booleanConfig.get(key)
    : numberConfig.get(key);
}

export function setConfig(key, value) {
  if (booleanConfig.has(key)) {
    booleanConfig.set(key, Boolean(value));
  } else if (numberConfig.has(key)) {
    numberConfig.set(key, Number(value));
  }
  saveConfig();
}

// 4. Load from a world → merge with defaults
export function resetConfigToDefault() {
  booleanConfig.clear();
  numberConfig.clear();
  defaultBooleanConfig.forEach((value, key) => booleanConfig.set(key, value));
  defaultNumberConfig.forEach((value, key) => numberConfig.set(key, value));
}

// 5. Save to a world (only stringify generic arrays)
export function saveConfig() {
  const saveMap = (map) => {
    map.forEach((value, key) => {
      if (Array.isArray(value)) {
        world.setDynamicProperty(key, JSON.stringify(value));
      } else {
        world.setDynamicProperty(key, value);
      }
    });
  };

  saveMap(booleanConfig);
  saveMap(numberConfig);
}

// 6. Read raw values from a world, parse arrays if needed
export async function getConfigFromWorld() {
  const result = new Map();
  for (const key of world.getDynamicPropertyIds()) {
    const raw = world.getDynamicProperty(key);
    const def = config.get(key);

    if (Array.isArray(def) && typeof raw === "string") {
      try {
        result.set(key, JSON.parse(raw));
      } catch {
        result.set(key, def);
      }
    } else {
      result.set(key, raw);
    }
  }
  return result;
}

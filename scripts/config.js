import { Flags } from "./flags.js";
import { system, world } from "@minecraft/server";
import { spawnProtectionRange } from "./commands/create_command.js";
export { spawnProtectionRange };

// 1. Default config values (booleans only here)
export const defaultConfig = new Map([
  ["attack-cooldown", false],
  ["optimized-entity-count", false],
  ["debug", false],
  ["spawn-protection", true],
  ["flags", true],
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

// 2. Working config store
const config = new Map(defaultConfig);

// 3. Get/set helpers
export function getConfig(key) {
  return config.get(key);
}

export function setConfig(key, value) {
  // Update or insert in the working config store
  config.set(key, value);
}

// 4. Load from a world → merge with defaults
export function resetConfigToDefault() {
  // Reset the working config store to defaults
  config.clear();
  defaultConfig.forEach((value, key) => config.set(key, value));
}

// 5. Save to a world (only stringify generic arrays)
export function saveConfig() {
  config.forEach((value, key) => {
    if (Array.isArray(value)) {
      world.setDynamicProperty(key, JSON.stringify(value));
    } else {
      world.setDynamicProperty(key, value);
    }
  });
}

// 6. Read raw values from a world, parse arrays if needed
export async function getConfigFromWorld() {
  const result = new Map();
  try {
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
  } catch (error) {
    system.run(() => {
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
    });
  }
  return result;
}

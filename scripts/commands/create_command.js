"use strict";

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandSource,
  CustomCommandStatus,
  Entity,
  EntityComponentTypes,
  ItemStack,
  Player,
  system,
  TicksPerSecond,
  world,
} from "@minecraft/server";
import { serverChatTitle, serverConsoleTitle } from "../index.js";
import {
  defaultConfig,
  getConfig,
  resetConfigToDefault,
  saveConfig,
  setConfig,
  getConfigFromWorld,
} from "../config.js";

// Optional in‑memory only var
export let spawnProtectionRange = 32;
export let maxEntities = 30;

/**
 * @param {Entity} player
 * @param maxDistance
 * @param direction
 */
export function getTargetBlockCoords(
  player,
  maxDistance = 5,
  direction = player.getViewDirection()
) {
  const eyeLoc = player.getHeadLocation();
  let viewDir = player.getViewDirection();

  if (direction) viewDir = direction;

  for (let i = 0; i < maxDistance * 10; i++) {
    // 0.1 block increments
    const pos = {
      x: eyeLoc.x + viewDir.x * (i * 0.1),
      y: eyeLoc.y + viewDir.y * (i * 0.1),
      z: eyeLoc.z + viewDir.z * (i * 0.1),
    };
    const block = player.dimension.getBlock(pos);
    if (block && block.typeId !== "minecraft:air") return block;
  }
  return undefined;
}

// Helper to format only known config keys from the working config store
export const formatConfig = () =>
  Array.from(getConfigFromWorld().keys())
    .map((confKey) => `${confKey}: ${String(getConfig(confKey))}`)
    .join(",\n");

/**
 * @beta
 * @description Custom chat commands for the server.
 * ! NOTE: This is a beta feature and may not work as expected, even in stable API versions of the scripting API.
 */
export function chatCommand() {
  system.beforeEvents.startup.subscribe((event) => {
    (async () => {
      if (await getConfigFromWorld() === undefined) {
        resetConfigToDefault();
        saveConfig();
        world.sendMessage({
          translate: `${serverChatTitle} Default config loaded!`,
        });
        console.log(`${serverConsoleTitle} Default config loaded!`);
      }
      console.log(
        `${serverConsoleTitle} Dynamic properties byte count: ${world.getDynamicPropertyTotalByteCount()} bytes.`
      );
    })();

    console.log(`${serverConsoleTitle} Custom commands are registering...`);

    // Register enums (A-Z)
    event.customCommandRegistry.registerEnum("falkraft:component", [
      EntityComponentTypes.Movement,
      EntityComponentTypes.LavaMovement,
      EntityComponentTypes.UnderwaterMovement,
      EntityComponentTypes.Health,
      EntityComponentTypes.Hunger,
      EntityComponentTypes.Saturation,
      EntityComponentTypes.Exhaustion,
    ]);
    event.customCommandRegistry.registerEnum(
      "falkraft:key",
      Array.from(defaultConfig.keys() ?? [])
    );
    event.customCommandRegistry.registerEnum("falkraft:logging", [
      "simple",
      "debug",
      "verbose",
    ]);
    console.log(`${serverConsoleTitle} Registered enums.`);

    // Register commands A-Z
    event.customCommandRegistry.registerCommand(
      attributeCommand,
      attributeCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered attribute command.`);

    // configCommand (setter) - falkraft:config
    event.customCommandRegistry.registerCommand(
      configCommand,
      configCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered config command.`);

    event.customCommandRegistry.registerCommand(
      getBlockCommand,
      getBlockCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered get block type ID command.`);

    // Reuse configCommand object for a 'getconfig' command (modify then register)
    configCommand.name = "falkraft:getconfig";
    configCommand.mandatoryParameters = [];
    configCommand.optionalParameters = [];
    configCommand.description = "Displays the current config.";
    event.customCommandRegistry.registerCommand(configCommand, (data) => {
      if (
        !data.sourceEntity ||
        !(data.sourceEntity instanceof Player) ||
        !data.sourceEntity.hasTag("op")
      )
        return {
          status: CustomCommandStatus.Failure,
          message:
            "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player, and must be a verified operator.",
        };
      return {
        status: CustomCommandStatus.Success,
        message: `Config:\n${formatConfig()}`,
      };
    });
    console.log(`${serverConsoleTitle} Registered getconfig command.`);

    event.customCommandRegistry.registerCommand(
      getPropertiesCommand,
      getPropertiesCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered getproperties command.`);

    event.customCommandRegistry.registerCommand(
      maxEntitiesCommand,
      maxEntitiesCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered maxentities command.`);

    event.customCommandRegistry.registerCommand(
      pingCommand,
      pingCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered ping command.`);

    event.customCommandRegistry.registerCommand(
      resetConfigCommand,
      resetConfigCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered reset config command.`);

    event.customCommandRegistry.registerCommand(
      setSlotCommand,
      setSlotCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered set slot command.`);

    event.customCommandRegistry.registerCommand(
      spawnProtectionRangeCommand,
      spawnProtectionRangeCommandFunction
    );
    console.log(
      `${serverConsoleTitle} Registered spawn protection range command.`
    );

    event.customCommandRegistry.registerCommand(
      statusCommand,
      statusCommandFunction
    );
    console.log(`${serverConsoleTitle} Registered status command.`);

    console.log(`${serverConsoleTitle} Custom chat commands are registered.`);
  });
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const attributeCommand = {
  name: "falkraft:attribute",
  description: "Modifies your own attributes.",
  cheatsRequired: true,
  mandatoryParameters: [
    {
      name: "falkraft:component",
      type: CustomCommandParamType.Enum,
    },
  ],
  optionalParameters: [
    {
      name: "value",
      type: CustomCommandParamType.Float,
    },
  ],
  permissionLevel: CommandPermissionLevel.Admin,
};

/**
 * @description Function to handle the attribute command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @param componentId {string} - The ID of the component to modify.
 * @param value {number} - The value to set the setting to.
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function attributeCommandFunction(data, componentId, value) {
  if (!data.sourceEntity || !(data.sourceEntity instanceof Player))
    return {
      status: CustomCommandStatus.Failure,
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player.",
    };

  const id = componentId; // Expecting either EntityComponentTypes.* or the matching string id
  const trySet = (typeConst) => {
    const comp = data.sourceEntity.getComponent(typeConst);
    if (!comp)
      return {
        ok: false,
        msg: `Component ${String(typeConst)} not found on source entity.`,
      };
    if (typeof comp.setCurrentValue !== "function")
      return {
        ok: false,
        msg: `Component ${String(typeConst)} does not support setCurrentValue.`,
      };
    const newVal = Number.isFinite(Number(value))
      ? Number(value)
      : comp.defaultValue;
    try {
      comp.setCurrentValue(newVal);
    } catch (error) {
      comp.value = newVal;
    }
    return { ok: true };
  };

  let result;
  system.run(() => {
    switch (id) {
      case EntityComponentTypes.Movement:
        result = trySet(EntityComponentTypes.Movement);
        break;
      case EntityComponentTypes.LavaMovement:
        result = trySet(EntityComponentTypes.LavaMovement);
        break;
      case EntityComponentTypes.UnderwaterMovement:
        result = trySet(EntityComponentTypes.UnderwaterMovement);
        break;
      case EntityComponentTypes.Health:
        result = trySet(EntityComponentTypes.Health);
        break;
      case EntityComponentTypes.Hunger:
        result = trySet(EntityComponentTypes.Hunger);
        break;
      case EntityComponentTypes.Saturation:
        result = trySet(EntityComponentTypes.Saturation);
        break;
      case EntityComponentTypes.Exhaustion:
        result = trySet(EntityComponentTypes.Exhaustion);
        break;
      default:
        result = { ok: false, msg: `Unsupported component id: ${id}` };
        break;
    }
  });

  if (!result?.ok) {
    return {
      status: CustomCommandStatus.Failure,
      message: result?.msg ?? "Failed to set attribute.",
    };
  }
  return {
    status: CustomCommandStatus.Success,
    message: "Attribute command executed successfully.",
  };
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const configCommand = {
  name: "falkraft:config",
  description: "Configures various settings for the server.",
  cheatsRequired: false,
  mandatoryParameters: [
    {
      name: "falkraft:key",
      type: CustomCommandParamType.Enum,
    },
  ],
  optionalParameters: [
    {
      name: "value",
      type: CustomCommandParamType.Boolean,
    },
  ],
  permissionLevel: CommandPermissionLevel.Admin,
};

/**
 * @description Function to handle the config command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @param key {string} - The config to modify.
 * @param value {boolean} - The value to set the setting to.
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function configCommandFunction(data, key, value) {
  if (
    !data.sourceEntity ||
    !(data.sourceEntity instanceof Player) ||
    !data.sourceEntity.hasTag("op")
  )
    return {
      status: CustomCommandStatus.Failure,
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player, and must be a verified operator.",
    };

  const k = String(key);
  const validKeys = new Set(Array.from(getConfigFromWorld().keys()));
  if (!validKeys.has(k))
    return {
      status: CustomCommandStatus.Failure,
      message: `Invalid config. Please use one of the following keys: ${Array.from(
        getConfigFromWorld().keys()
      ).join(",\n")}`,
    };

  if (value === undefined) {
    setConfig(k, defaultConfig.get(k));
    saveConfig();
    return {
      status: CustomCommandStatus.Success,
      message: `Reset '${k}' to default: ${String(
        defaultConfig.get(k)
      )}\nConfig:\n${formatConfig()}`,
    };
  }

  setConfig(k, value);
  saveConfig();
  return {
    status: CustomCommandStatus.Success,
    message: `Updated '${k}' to: ${String(
      getConfig(k)
    )}\nConfig:\n${formatConfig()}`,
  };
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const getBlockCommand = {
  name: "falkraft:getblock",
  description: "Gets the block type ID of the block at the specified location.",
  cheatsRequired: false,
  mandatoryParameters: [],
  optionalParameters: [
    {
      name: "range",
      type: CustomCommandParamType.Integer,
    },
  ],
  permissionLevel: CommandPermissionLevel.Any,
};

/**
 * @description Function to handle the get block type ID command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @param range
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function getBlockCommandFunction(data, range = 5) {
  if (!data.sourceEntity || !(data.sourceEntity instanceof Player))
    return {
      status: CustomCommandStatus.Failure,
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player.",
    };

  const effectiveRange = Number.isFinite(Number(range)) ? Number(range) : 5;
  const block = getTargetBlockCoords(data.sourceEntity, effectiveRange);
  if (block === undefined)
    return {
      status: CustomCommandStatus.Failure,
      message: `Could not find a block from the player's view. Please try again with a higher range or a different view. Current range: ${effectiveRange}.`,
    };
  return {
    status: CustomCommandStatus.Success,
    message: `Block typeid: ${block.typeId}. Block location: ${block.x} x, ${block.y} y, ${block.z} z.`,
  };
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const getPropertiesCommand = {
  name: "falkraft:getproperties",
  description: "Gets the properties of an entity.",
  mandatoryParameters: [],
  optionalParameters: [],
  cheatsRequired: false,
  permissionLevel: CommandPermissionLevel.Any,
};

/**
 * @param {import('@minecraft/server').CustomCommandOrigin} data
 * @returns {void}
 */
export function getPropertiesCommandFunction(data) {
  const entity = data.sourceEntity;
  if (!(entity instanceof Entity)) {
    return {
      status: CustomCommandStatus.Failure,
      message: "Invalid entity.",
    };
  }

  if (entity instanceof Entity) {
    const properties = Object.getOwnPropertyNames(entity);

    return {
      status: CustomCommandStatus.Success,
      message: `Entity Properties:\n${properties.join(",\n")}`,
    };
  } else if (entity instanceof Player) {
    const properties = Object.getOwnPropertyNames(entity);

    return {
      status: CustomCommandStatus.Success,
      message: `Player Properties:\n${properties.join(",\n")}`,
    };
  } else if (data.sourceType === CustomCommandSource.Server) {
    return {
      status: CustomCommandStatus.Success,
      message: `Server Properties:\n${Object.keys(world).join(",\n")}`,
    };
  } else {
    return {
      status: CustomCommandStatus.Failure,
      message: "Invalid entity.",
    };
  }
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
const maxEntitiesCommand = {
  name: "falkraft:maxentities",
  description:
    "Sets the maximum number of entities allowed (does not include players).",
  mandatoryParameters: [],
  optionalParameters: [
    {
      name: "amount",
      type: CustomCommandParamType.Integer,
    },
  ],
  cheatsRequired: false,
  permissionLevel: CommandPermissionLevel.Admin,
};

/**
 * @param {import('@minecraft/server').CustomCommandOrigin} data
 * @param {number} [maxEntities=30]
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function maxEntitiesCommandFunction(data, maxentities = 30) {
  const entity = data.sourceEntity;
  if (
    !(entity instanceof Player) ||
    data.sourceType === CustomCommandSource.Server
  ) {
    return {
      status: CustomCommandStatus.Failure,
      message: "Invalid entity or source.",
    };
  }

  const amount = maxentities;
  if (amount !== undefined) {
    maxentities = Math.max(0, Number(amount));
    maxEntities = maxentities;
    return {
      status: CustomCommandStatus.Success,
      message: `Max entities set to ${maxentities}.`,
    };
  } else {
    maxentities = 30;
    maxEntities = maxentities;
    return {
      status: CustomCommandStatus.Success,
      message: `Max entities reset to ${maxentities}.`,
    };
  }
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const pingCommand = {
  name: "falkraft:ping",
  description: "Pings the server.",
  mandatoryParameters: [],
  optionalParameters: [],
  cheatsRequired: false,
  permissionLevel: CommandPermissionLevel.Any,
};

/**
 * Handle a "ping" custom command, reply with "Pong!" and return a status object containing measured latency.
 *
 * This handler supports two invocation contexts:
 * - When invoked by a Player (data.sourceEntity is an instance of Player), it sends a "Pong!" message to that player.
 * - When invoked by the server (data.sourceEntity is falsy and data.sourceType === CustomCommandSource.Server), it logs "Pong!" to the console.
 * For any other source, the handler returns a Failure status and an explanatory message.
 *
 * The implementation measures latency by capturing Date.now() at the start of handling and after sending/logging the reply;
 * the returned message contains the latency in milliseconds.
 *
 * @async
 * @param {import('@minecraft/server').CustomCommandOrigin} data - Invocation context for the command.
 * @param {Player} [data.sourceEntity] - The entity that issued the command. If provided and is a Player, the reply is sent to this player.
 * @param {CustomCommandSource} data.sourceType - The reported source type of the command (e.g. CustomCommandSource.Server).
 * @returns {Promise<{status: CustomCommandStatus, message: string}>} A promise that resolves to an object with:
 *   - status: CustomCommandStatus.Success when the ping was handled for a Player or the Server, or CustomCommandStatus.Failure for invalid sources.
 *   - message: A human-readable message; on success it includes the measured latency in milliseconds, on failure it explains the invalid source.
 *
 * @example
 * // From a player
 * await pingCommandFunction({ sourceEntity: player, sourceType: CustomCommandSource.Player });
 *
 * @example
 * // From server
 * await pingCommandFunction({ sourceType: CustomCommandSource.Server });
 *
 * @remarks
 * Side effects:
 * - Sends "Pong!" to the player when a Player invoked the command.
 * - Logs "Pong!" to the server console when the server invoked the command.
 * This function does not throw for invalid sources; it returns a Failure result instead.
 */
export function pingCommandFunction(data) {
  if (data.sourceEntity instanceof Player) {
    const player = data.sourceEntity;
    const now = Date.now();
    system.run(() => {
      (async () => {
        player.sendMessage({ translate: "Pong!" });
        const latency = Date.now() - now;
        player.sendMessage({ text: `Latency: ${latency} ms` });
        return {
          status: CustomCommandStatus.Success,
          message: `Latency: ${latency} ms`,
        };
      })();
    });
  } else if (
    !data.sourceEntity &&
    data.sourceType === CustomCommandSource.Server
  ) {
    const now = Date.now();
    system.run(() => {
      (async () => {
        console.log("Pong!");
        const latency = Date.now() - now;
        console.log(`Latency: ${latency} ms`);
        return {
          status: CustomCommandStatus.Success,
          message: `Latency: ${latency} ms`,
        };
      })();
    });
  } else {
    return {
      status: CustomCommandStatus.Failure,
      message: "Invalid command source.",
    };
  }
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const resetConfigCommand = {
  name: "falkraft:resetconfig",
  description: "Resets the config to the default values.",
  cheatsRequired: false,
  mandatoryParameters: [],
  optionalParameters: [],
  permissionLevel: CommandPermissionLevel.Admin,
};

/**
 * @description Function to handle the reset config command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function resetConfigCommandFunction(data) {
  if (
    !data.sourceEntity ||
    !(data.sourceEntity instanceof Player) ||
    !data.sourceEntity.hasTag("op")
  )
    return {
      status: CustomCommandStatus.Failure,
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player, and must be a verified operator.",
    };
  resetConfigToDefault();
  saveConfig();
  return {
    status: CustomCommandStatus.Success,
    message: `Config reset to default:\n${formatConfig()}`,
  };
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const setSlotCommand = {
  name: "falkraft:setslot",
  description: "Replaces your current selected slot with the specified item.",
  cheatsRequired: true,
  mandatoryParameters: [
    {
      name: "item",
      type: CustomCommandParamType.String,
    },
  ],
  optionalParameters: [
    {
      name: "amount",
      type: CustomCommandParamType.Integer,
    },
  ],
  permissionLevel: CommandPermissionLevel.Admin,
};

/**
 * @description Function to handle the set slot command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @param item {string} - The block to set the slot to.
 * @param amount {number} - The amount of the block to set the slot to.
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function setSlotCommandFunction(data, item, amount) {
  if (!data.sourceEntity || !data.sourceEntity instanceof Player)
    return {
      status: CustomCommandStatus.Failure,
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player.",
    };
  const itemStack = new ItemStack(
    item ? item : "minecraft:air",
    amount ? amount : 1
  );
  if (data.sourceEntity instanceof Player) {
    const player = data.sourceEntity;
    system.run(() =>
      player
        .getComponent(EntityComponentTypes.Inventory)
        .container.setItem(
          player.selectedSlotIndex,
          itemStack ? itemStack : undefined
        )
    ); // Will clear the slot if undefined.
  }
  return {
    status: CustomCommandStatus.Success,
    message: "Slot set successfully.",
  };
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const spawnProtectionRangeCommand = {
  name: "falkraft:spawnprotectionrange",
  description: "Sets the spawn protection range for the server.",
  cheatsRequired: false,
  mandatoryParameters: [],
  optionalParameters: [
    {
      name: "range",
      type: CustomCommandParamType.Integer,
    },
  ],
  permissionLevel: CommandPermissionLevel.Admin,
};

/**
 * @description Function to handle the spawn protection range command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @param range {number} - The range to set the spawn protection to.
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function spawnProtectionRangeCommandFunction(data, range = 32) {
  if (
    !data.sourceEntity ||
    !data.sourceEntity instanceof Player ||
    !data.sourceEntity.hasTag("op")
  )
    return {
      status: CustomCommandStatus.Failure,
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player, and must be a verified operator.",
    };
  spawnProtectionRange = range;
  return {
    status: CustomCommandStatus.Success,
    message: `Spawn protection range set to ${range} blocks.`,
  };
}

/**
 * @type {import('@minecraft/server').CustomCommand}
 */
export const statusCommand = {
  name: "falkraft:status",
  description: "Gets the TPS (Ticks Per Second) for the current server.",
  cheatsRequired: false,
  mandatoryParameters: [
    {
      name: "falkraft:logging",
      type: CustomCommandParamType.Enum,
    },
  ],
  optionalParameters: [],
  permissionLevel: CommandPermissionLevel.Any,
};

/**
 * @description Function to handle the status command.
 * @param data {import('@minecraft/server').CustomCommandOrigin} - The data object containing the command parameters.
 * @param logging {string} - The logging type. Can be "simple", "debug", or "silly".
 * @returns {import('@minecraft/server').CustomCommandResult}
 */
export function statusCommandFunction(data, logging) {
  const tps = world.getDynamicProperty("tps");
  const ticks = world.getDynamicProperty("tickcount");
  const averageTimeTaken = world.getDynamicProperty("averageTimeTaken");
  console.log(
    `Initiator: ${data.initiator}, SourceEntity: ${data.sourceEntity}, SourceType: ${data.sourceType}`
  );

  if (!data.sourceEntity)
    return {
      message:
        "Invalid source entity. Source entity is required for this command and must be an entity, e.g. player.",
      status: CustomCommandStatus.Failure,
    };

  switch (logging) {
    case "simple":
      if (!world.gameRules.sendCommandFeedback)
        system.run(() => {
          data.sourceEntity.runCommand(
            `tellraw @s {"rawtext":[{"text":"${serverChatTitle}\n§fCurrent TPS: §e${Number(
              tps
            ).toFixed(2)}§f"}]}`
          );
        });
      if (data.sourceType === CustomCommandSource.Server)
        console.error(
          `${serverConsoleTitle}\nCurrent TPS: ${Number(tps).toFixed(2)}`
        );
      return {
        message: `${serverChatTitle}\n§fCurrent TPS: §e${Number(tps).toFixed(
          2
        )}§f`,
        status: CustomCommandStatus.Success,
      };
    case "debug":
      if (!world.gameRules.sendCommandFeedback)
        system.run(() => {
          data.sourceEntity.runCommand(
            `tellraw @s {"rawtext":[{"text":"${serverChatTitle}\n§fCurrent TPS: §e${Number(
              tps
            ).toFixed(
              2
            )}§f\nTicks in Sample: §e${ticks}§f\nAverage Time Taken: §e${averageTimeTaken}"}]}`
          );
        });
      if (data.sourceType === CustomCommandSource.Server)
        console.error(
          `${serverConsoleTitle}\nCurrent TPS: ${Number(tps).toFixed(
            2
          )}\nTicks in Sample: ${ticks}\nAverage Time Taken: ${averageTimeTaken}`
        );
      return {
        message: `${serverChatTitle}\n§fCurrent TPS: §e${Number(tps).toFixed(
          2
        )}§f\nTicks in Sample: §e${ticks}§f\nAverage Time Taken: §e${averageTimeTaken}`,
        status: CustomCommandStatus.Success,
      };
    case "verbose":
      if (!world.gameRules.sendCommandFeedback)
        system.run(() => {
          data.sourceEntity.runCommand(
            `tellraw @s {"rawtext":[{"text":"${serverChatTitle}\n§fCurrent TPS: §e${Number(
              tps
            ).toFixed(
              2
            )}§f\nTicks in Sample: §e${ticks}§f\nAverage Time Taken: §e${averageTimeTaken}§f\nCurrent Tick: §e${
              system.currentTick
            }§f\nCurrent second: §e${system.currentTick / TicksPerSecond}"}]}`
          );
        });
      if (data.sourceType === CustomCommandSource.Server)
        console.error(
          `${serverConsoleTitle}\n§fCurrent TPS: §e${Number(tps).toFixed(
            2
          )}§f\nTicks in Sample: §e${ticks}§f\nAverage Time Taken: §e${averageTimeTaken}§f\nCurrent Tick: §e${
            system.currentTick
          }§f\nCurrent second: §e${system.currentTick / TicksPerSecond}`
        );
      return {
        message: `${serverChatTitle}\n§fCurrent TPS: §e${Number(tps).toFixed(
          2
        )}§f\nTicks in Sample: §e${ticks}§f\nAverage Time Taken: §e${averageTimeTaken}§f\nCurrent Tick: §e${
          system.currentTick
        }§f\nCurrent second: §e${system.currentTick / TicksPerSecond}`,
        status: CustomCommandStatus.Success,
      };
    default:
      return {
        message:
          "Invalid logging type. Please use 'simple', 'debug', or 'silly'.",
        status: CustomCommandStatus.Failure,
      };
  }
}

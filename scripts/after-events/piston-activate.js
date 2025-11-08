import { BlockPistonState, world } from "@minecraft/server";

export function afterPistonActivate() {
  world.afterEvents.pistonActivate.subscribe((event) => {
    const piston = event.piston;
    if (piston.isMoving) {
      switch (piston.state) {
        case BlockPistonState.Expanding:
          {
            world.getPlayers({ tags: ["dev"] }).forEach((player) => {
              player.sendMessage(
                `Piston at ${piston.block.x}, ${piston.block.y}, ${piston.block.z} is expanding. Piston TypeID: ${piston.typeId}`
              );
            });
            // const sourceLength = piston.getAttachedBlocksLocations().length;
            // const sourceStart = piston.getAttachedBlocksLocations()[0];
            // const sourceEnd =
            //   piston.getAttachedBlocksLocations()[sourceLength - 1];
            // const destination = piston.getAttachedBlocksLocations()[1];
            // world
            //   .getDimension(piston.block.dimension.id)
            //   .runCommand(
            //     `clone ${sourceStart.x} ${sourceStart.y} ${sourceStart.z} ${sourceEnd.x} ${sourceEnd.y} ${sourceEnd.z} ${destination.x} ${destination.y} ${destination.z} replace`
            //   );
          }
          break;
        case BlockPistonState.Retracting:
          {
            world.getPlayers({ tags: ["dev"] }).forEach((player) => {
              player.sendMessage(
                `Piston at ${piston.block.x}, ${piston.block.y}, ${piston.block.z} is retracting. Piston TypeID: ${piston.typeId}`
              );
            });
            // const sourceLength = piston.getAttachedBlocksLocations().length;
            // const sourceStart = piston.getAttachedBlocksLocations()[0];
            // const sourceEnd =
            //   piston.getAttachedBlocksLocations()[sourceLength - 1];
            // const destination = {
            //   x:
            //     piston.getAttachedBlocksLocations()[0].x -
            //     piston.getAttachedBlocksLocations()[1].x,
            //   y:
            //     piston.getAttachedBlocksLocations()[0].y -
            //     piston.getAttachedBlocksLocations()[1].y,
            //   z:
            //     piston.getAttachedBlocksLocations()[0].z -
            //     piston.getAttachedBlocksLocations()[1].z,
            // };
            // world
            //   .getDimension(piston.block.dimension.id)
            //   .runCommand(
            //     `clone ${sourceStart.x} ${sourceStart.y} ${sourceStart.z} ${sourceEnd.x} ${sourceEnd.y} ${sourceEnd.z} ${destination.x} ${destination.y} ${destination.z} replace`
            //   );
          }
          break;
      }
    }
  });
}

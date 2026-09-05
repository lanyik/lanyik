export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 512;

export function assertWorldDimensions(width: number, height: number): void {
    for (const [name, value] of [["width", width], ["height", height]] as const) {
        if (!Number.isSafeInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
            throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
        }
    }
}

export function assertToroidalWorldBounds(world: { topology: string; width: number; height: number }): void {
    if (world.topology !== "toroidal") throw new TypeError("world topology must be toroidal");
    assertWorldDimensions(world.width, world.height);
    if (world.width % 2 !== 0) throw new RangeError("toroidal worlds require an even width");
}

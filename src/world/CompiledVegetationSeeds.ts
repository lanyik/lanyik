export const COMPILED_VEGETATION_SEEDS_FORMAT_VERSION = 1;
export const VEGETATION_CANDIDATE_COLUMNS_PER_TILE = 4;
export const VEGETATION_CANDIDATE_ROWS_PER_TILE = 2;
export const VEGETATION_CANDIDATES_PER_TILE = VEGETATION_CANDIDATE_COLUMNS_PER_TILE
    * VEGETATION_CANDIDATE_ROWS_PER_TILE;
export const MAX_COMPILED_VEGETATION_SEEDS = 16 * 16 * VEGETATION_CANDIDATES_PER_TILE;

export interface CompiledVegetationSeeds {
    readonly formatVersion: typeof COMPILED_VEGETATION_SEEDS_FORMAT_VERSION;
    readonly count: number;
    /** Chunk-local world XYZ, with Y already attached to the compiled Ground surface. */
    readonly positions: Float32Array;
    /** Stable candidate identity within the render chunk. */
    readonly instanceIdentity: Uint16Array;
    readonly profileIndex: Uint8Array;
    /** Stable selector for species, yaw, scale and LOD retention. */
    readonly placementSeed: Uint32Array;
}

export interface CompiledVegetationSeedsInput extends Omit<CompiledVegetationSeeds,
    "formatVersion" | "count"> {}

export function assertCompiledVegetationSeeds(
    seeds: Readonly<CompiledVegetationSeeds>
): void {
    if (!seeds || typeof seeds !== "object"
        || seeds.formatVersion !== COMPILED_VEGETATION_SEEDS_FORMAT_VERSION
        || !Number.isInteger(seeds.count)
        || seeds.count < 0 || seeds.count > MAX_COMPILED_VEGETATION_SEEDS) {
        throw new TypeError("compiled vegetation seed format or count is invalid");
    }
    if (!(seeds.positions instanceof Float32Array) || seeds.positions.length !== seeds.count * 3
        || !(seeds.instanceIdentity instanceof Uint16Array)
            || seeds.instanceIdentity.length !== seeds.count
        || !(seeds.profileIndex instanceof Uint8Array) || seeds.profileIndex.length !== seeds.count
        || !(seeds.placementSeed instanceof Uint32Array)
            || seeds.placementSeed.length !== seeds.count) {
        throw new TypeError("compiled vegetation seed arrays do not match their fixed layout");
    }
    let previousIdentity = -1;
    for (let index = 0; index < seeds.count; index += 1) {
        const identity = seeds.instanceIdentity[index];
        if (identity <= previousIdentity || identity >= MAX_COMPILED_VEGETATION_SEEDS) {
            throw new Error("compiled vegetation identities must be unique and strictly ascending");
        }
        previousIdentity = identity;
        const positionOffset = index * 3;
        if (!Number.isFinite(seeds.positions[positionOffset])
            || !Number.isFinite(seeds.positions[positionOffset + 1])
            || !Number.isFinite(seeds.positions[positionOffset + 2])) {
            throw new RangeError("compiled vegetation positions must be finite");
        }
    }
}

export function createCompiledVegetationSeeds(
    input: Readonly<CompiledVegetationSeedsInput>
): CompiledVegetationSeeds {
    if (!input || typeof input !== "object") {
        throw new TypeError("compiled vegetation seed input is required");
    }
    const seeds: CompiledVegetationSeeds = Object.freeze({
        formatVersion: COMPILED_VEGETATION_SEEDS_FORMAT_VERSION,
        count: input.instanceIdentity.length,
        positions: input.positions,
        instanceIdentity: input.instanceIdentity,
        profileIndex: input.profileIndex,
        placementSeed: input.placementSeed
    });
    assertCompiledVegetationSeeds(seeds);
    return seeds;
}

export function compiledVegetationSeedsResidentBytes(
    seeds: Readonly<CompiledVegetationSeeds>
): number {
    assertCompiledVegetationSeeds(seeds);
    return seeds.positions.byteLength + seeds.instanceIdentity.byteLength
        + seeds.profileIndex.byteLength + seeds.placementSeed.byteLength;
}

export function compiledVegetationSeedsTransferables(
    seeds: Readonly<CompiledVegetationSeeds>
): readonly ArrayBuffer[] {
    assertCompiledVegetationSeeds(seeds);
    const buffers: ArrayBufferLike[] = [
        seeds.positions.buffer,
        seeds.instanceIdentity.buffer,
        seeds.profileIndex.buffer,
        seeds.placementSeed.buffer
    ];
    if (buffers.some(buffer => !(buffer instanceof ArrayBuffer))) {
        throw new TypeError("compiled vegetation transfer requires owned ArrayBuffer payloads");
    }
    if (new Set(buffers).size !== buffers.length) {
        throw new Error("compiled vegetation arrays must own distinct transferable buffers");
    }
    return Object.freeze(buffers as ArrayBuffer[]);
}

import {
    MAX_COMPILED_VEGETATION_SEEDS,
    VEGETATION_CANDIDATE_COLUMNS_PER_TILE,
    VEGETATION_CANDIDATE_ROWS_PER_TILE,
    VEGETATION_CANDIDATES_PER_TILE,
    CompiledVegetationSeeds,
    createCompiledVegetationSeeds
} from "./CompiledVegetationSeeds";
import {
    CompiledSurfaceSampler,
    createCompiledSurfaceSample
} from "./CompiledSurfaceSampler";
import { CompiledSurfaceField, SURFACE_WATER_KIND_RIVER } from "./CompiledSurfaceField";
import { hashSafeIntegerCoordinates } from "./DeterministicHash";
import { sampleEffectiveWindowVegetationDensityLocal } from "./EffectiveWindowSampler";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import { surfaceToWorld, worldToSurface } from "./SurfaceLattice";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { chunkOrigin } from "./WorldGrid";
import { seedToUint32 } from "./noise";

const UINT32_RANGE = 0x1_0000_0000;
const JITTER_X_SALT = 0x7f4a_7c15;
const JITTER_Y_SALT = 0x94d0_49bb;
const ACCEPTANCE_SALT = 0x369d_ea0f;
const PLACEMENT_SALT = 0xd1b5_4a35;
const VEGETATION_SLOPE_FADE_START = 0.35;
const VEGETATION_MAXIMUM_SLOPE = 0.75;
const VEGETATION_SHORE_FADE_TILES = 1;
const VEGETATION_SLOPE_SAMPLE_STEP = 0.25;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
    const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
    return amount * amount * (3 - 2 * amount);
}

function candidateHash(
    worldSeed: number,
    tileX: number,
    tileY: number,
    candidate: number,
    salt: number
): number {
    return hashSafeIntegerCoordinates(worldSeed, tileX, tileY, (salt + candidate) >>> 0);
}

function slopeAt(
    sampler: CompiledSurfaceSampler,
    localU: number,
    localV: number,
    hexSize: number
): number {
    const minimum = -0.5;
    const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    const minimumU = Math.max(minimum, localU - VEGETATION_SLOPE_SAMPLE_STEP);
    const maximumU = Math.min(maximum, localU + VEGETATION_SLOPE_SAMPLE_STEP);
    const minimumV = Math.max(minimum, localV - VEGETATION_SLOPE_SAMPLE_STEP);
    const maximumV = Math.min(maximum, localV + VEGETATION_SLOPE_SAMPLE_STEP);
    const heightU = sampler.sampleGroundHeight(maximumU, localV)
        - sampler.sampleGroundHeight(minimumU, localV);
    const heightV = sampler.sampleGroundHeight(localU, maximumV)
        - sampler.sampleGroundHeight(localU, minimumV);
    const worldUMinimum = surfaceToWorld(minimumU, localV, hexSize);
    const worldUMaximum = surfaceToWorld(maximumU, localV, hexSize);
    const worldVMinimum = surfaceToWorld(localU, minimumV, hexSize);
    const worldVMaximum = surfaceToWorld(localU, maximumV, hexSize);
    const deltaUx = worldUMaximum.x - worldUMinimum.x;
    const deltaUz = worldUMaximum.z - worldUMinimum.z;
    const deltaVz = worldVMaximum.z - worldVMinimum.z;
    if (!(deltaUx > 0) || !(deltaVz > 0)) {
        throw new Error("vegetation slope stencil collapsed at the surface core boundary");
    }
    const gradientZ = heightV / deltaVz;
    const gradientX = (heightU - gradientZ * deltaUz) / deltaUx;
    return Math.hypot(gradientX, gradientZ);
}

function ownerIndex(
    window: Readonly<TransferableEffectiveWindow>,
    tileX: number,
    tileY: number
): number {
    const localX = tileX - window.originTileX;
    const localY = tileY - window.originTileY;
    if (localX < 0 || localX >= EFFECTIVE_WINDOW_TILE_SIZE
        || localY < 0 || localY >= EFFECTIVE_WINDOW_TILE_SIZE) {
        throw new Error("vegetation owner tile escaped the effective window");
    }
    return localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
}

export function compileVegetationSeeds(
    window: Readonly<TransferableEffectiveWindow>,
    field: Readonly<CompiledSurfaceField>
): CompiledVegetationSeeds {
    assertTransferableEffectiveWindow(window);
    const sampler = new CompiledSurfaceSampler(field);
    const surfaceSample = createCompiledSurfaceSample();
    const chunkSize = SURFACE_COMPILE_PROFILE.renderChunkSize;
    const origin = chunkOrigin(window.renderKey.chunkX, window.renderKey.chunkY, chunkSize);
    const hexSize = window.dependencyKey.metrics.hexSize;
    const localWorldOrigin = surfaceToWorld(0, 0, hexSize);
    const worldSeed = seedToUint32(window.worldIdentity);
    const positions = new Float32Array(MAX_COMPILED_VEGETATION_SEEDS * 3);
    const instanceIdentity = new Uint16Array(MAX_COMPILED_VEGETATION_SEEDS);
    const profileIndex = new Uint8Array(MAX_COMPILED_VEGETATION_SEEDS);
    const placementSeed = new Uint32Array(MAX_COMPILED_VEGETATION_SEEDS);
    let count = 0;
    for (let localTileX = 0; localTileX < chunkSize; localTileX += 1) {
        const tileX = origin.x + localTileX;
        for (let localTileY = 0; localTileY < chunkSize; localTileY += 1) {
            const tileY = origin.y + localTileY;
            const semanticIndex = ownerIndex(window, tileX, tileY);
            if (window.valid[semanticIndex] === 0) continue;
            const tileIdentity = localTileX * chunkSize + localTileY;
            for (let candidate = 0; candidate < VEGETATION_CANDIDATES_PER_TILE; candidate += 1) {
                const column = candidate % VEGETATION_CANDIDATE_COLUMNS_PER_TILE;
                const row = Math.floor(candidate / VEGETATION_CANDIDATE_COLUMNS_PER_TILE);
                const jitterX = candidateHash(
                    worldSeed, tileX, tileY, candidate, JITTER_X_SALT
                ) / UINT32_RANGE;
                const jitterY = candidateHash(
                    worldSeed, tileX, tileY, candidate, JITTER_Y_SALT
                ) / UINT32_RANGE;
                const localU = localTileX - 0.5
                    + (column + jitterX) / VEGETATION_CANDIDATE_COLUMNS_PER_TILE;
                const localV = localTileY - 0.5
                    + (row + jitterY) / VEGETATION_CANDIDATE_ROWS_PER_TILE;
                // Positions are published as float32 chunk-local world values.
                // All authoritative sampling must therefore use the logical
                // point reconstructed from those exact stored XZ values, not
                // the higher-precision candidate that the renderer cannot see.
                const candidateWorld = surfaceToWorld(localU, localV, hexSize);
                const storedX = Math.fround(candidateWorld.x - localWorldOrigin.x);
                const storedZ = Math.fround(candidateWorld.z - localWorldOrigin.z);
                const storedLogical = worldToSurface(
                    storedX + localWorldOrigin.x,
                    storedZ + localWorldOrigin.z,
                    hexSize
                );
                const maximum = chunkSize - 0.5;
                if (storedLogical.u < -0.5 || storedLogical.u >= maximum
                    || storedLogical.v < -0.5 || storedLogical.v >= maximum) continue;
                const density = sampleEffectiveWindowVegetationDensityLocal(
                    window,
                    origin.x - window.originTileX + storedLogical.u,
                    origin.y - window.originTileY + storedLogical.v
                );
                if (density === undefined || density <= 0) continue;
                sampler.sampleSurface(storedLogical.u, storedLogical.v, surfaceSample);
                if (surfaceSample.waterKind === SURFACE_WATER_KIND_RIVER
                    || surfaceSample.shorelineDistance <= 0) continue;
                const shoreFactor = clamp(
                    surfaceSample.shorelineDistance
                        / (hexSize * VEGETATION_SHORE_FADE_TILES),
                    0,
                    1
                );
                const slope = slopeAt(sampler, storedLogical.u, storedLogical.v, hexSize);
                const slopeFactor = 1 - smoothstep(
                    VEGETATION_SLOPE_FADE_START,
                    VEGETATION_MAXIMUM_SLOPE,
                    slope
                );
                const acceptance = density * shoreFactor * slopeFactor;
                const choice = candidateHash(
                    worldSeed, tileX, tileY, candidate, ACCEPTANCE_SALT
                ) / UINT32_RANGE;
                if (choice >= acceptance) continue;
                // A render chunk spans 16 columns, so its global U origin is
                // even and has exactly the same stagger phase as local U=0.
                const offset = count * 3;
                positions[offset] = storedX;
                positions[offset + 1] = Math.fround(surfaceSample.groundHeight);
                positions[offset + 2] = storedZ;
                instanceIdentity[count] = tileIdentity * VEGETATION_CANDIDATES_PER_TILE + candidate;
                profileIndex[count] = window.vegetationProfile[semanticIndex];
                placementSeed[count] = candidateHash(
                    worldSeed, tileX, tileY, candidate, PLACEMENT_SALT
                );
                count += 1;
            }
        }
    }
    return createCompiledVegetationSeeds({
        positions: positions.slice(0, count * 3),
        instanceIdentity: instanceIdentity.slice(0, count),
        profileIndex: profileIndex.slice(0, count),
        placementSeed: placementSeed.slice(0, count)
    });
}

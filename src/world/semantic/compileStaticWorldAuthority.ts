import { assertBaseSemanticChunk, BaseSemanticChunk } from "./BaseSemanticChunk";
import { assertHydrologyRegion, HydrologyRegion } from "./HydrologyRegion";
import { HYDROLOGY_SEA_LEVEL } from "./MacroDrainageGraph";
import { StaticWorldAuthoritySource } from "./WorldAuthorityRepository";
import { SubstrateClass } from "./WorldSemanticCatalog";
import {
    BASE_SEMANTIC_CHUNK_REVISION,
    HYDROLOGY_REGION_SIZE,
    semanticChunkLocalIndex,
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT
} from "./WorldSemanticFormat";
import { createWorldDescriptorV2, StaticWorldDescriptorV2 } from "./WorldDescriptorV2";

export interface StaticWorldSemanticFields {
    readonly width: number;
    readonly height: number;
    readonly topology: "bounded" | "toroidal";
    readonly sourceContentHash: string;
    /** X-major: index = x * height + y. */
    readonly substrateClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    /** Four bytes per tile; every tuple must sum to 255. */
    readonly biomeWeights: Uint8Array;
    /** Temperature and moisture bytes per tile. */
    readonly climate: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
    /** Must exactly cover every 128x128 region intersecting the world. */
    readonly hydrologyRegions: readonly HydrologyRegion[];
}

export interface CompiledStaticWorldAuthority {
    readonly descriptor: StaticWorldDescriptorV2;
    readonly source: StaticWorldAuthoritySource;
    readonly semanticChunks: readonly BaseSemanticChunk[];
    readonly hydrologyRegions: readonly HydrologyRegion[];
}

function assertStaticFields(input: StaticWorldSemanticFields): void {
    if (!input || typeof input !== "object"
        || Object.getOwnPropertyNames(input).some(name => ![
            "width", "height", "topology", "sourceContentHash", "substrateClass", "macroHeight",
            "biomeWeights", "climate", "vegetationDensity", "vegetationProfile", "hydrologyRegions"
        ].includes(name))
        || !Number.isSafeInteger(input.width) || input.width <= 0
        || !Number.isSafeInteger(input.height) || input.height <= 0
        || input.width > Number.MAX_SAFE_INTEGER / input.height
        || (input.topology !== "bounded" && input.topology !== "toroidal")
        || !/^[0-9a-f]{64}$/.test(input.sourceContentHash)
        || !Array.isArray(input.hydrologyRegions)) {
        throw new TypeError("static semantic authority header is invalid");
    }
    const count = input.width * input.height;
    if (!(input.substrateClass instanceof Uint8Array) || input.substrateClass.length !== count
        || !(input.macroHeight instanceof Uint16Array) || input.macroHeight.length !== count
        || !(input.biomeWeights instanceof Uint8Array) || input.biomeWeights.length !== count * 4
        || !(input.climate instanceof Uint8Array) || input.climate.length !== count * 2
        || !(input.vegetationDensity instanceof Uint8Array) || input.vegetationDensity.length !== count
        || !(input.vegetationProfile instanceof Uint8Array) || input.vegetationProfile.length !== count) {
        throw new TypeError("static semantic authority SoA lengths are invalid");
    }
    for (let index = 0; index < count; index += 1) {
        const biomeOffset = index * 4;
        if (input.biomeWeights[biomeOffset] + input.biomeWeights[biomeOffset + 1]
            + input.biomeWeights[biomeOffset + 2] + input.biomeWeights[biomeOffset + 3] !== 255) {
            throw new TypeError("static semantic biome weights must sum to 255");
        }
        if (input.macroHeight[index] < HYDROLOGY_SEA_LEVEL
            && input.substrateClass[index] !== SubstrateClass.Sediment) {
            throw new TypeError("static ocean height and substrate authority are inconsistent");
        }
    }
}

function compileSemanticChunks(input: StaticWorldSemanticFields): readonly BaseSemanticChunk[] {
    const chunks: BaseSemanticChunk[] = [];
    const chunkColumns = Math.ceil(input.width / WORLD_SEMANTIC_CHUNK_SIZE);
    const chunkRows = Math.ceil(input.height / WORLD_SEMANTIC_CHUNK_SIZE);
    for (let chunkX = 0; chunkX < chunkColumns; chunkX += 1) {
        for (let chunkY = 0; chunkY < chunkRows; chunkY += 1) {
            const substrateClass = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
            const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
            const biomeWeights = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 4);
            const climate = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 2);
            const vegetationDensity = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
            const vegetationProfile = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
            const maxXExclusive = Math.min(
                WORLD_SEMANTIC_CHUNK_SIZE,
                input.width - chunkX * WORLD_SEMANTIC_CHUNK_SIZE
            );
            const maxYExclusive = Math.min(
                WORLD_SEMANTIC_CHUNK_SIZE,
                input.height - chunkY * WORLD_SEMANTIC_CHUNK_SIZE
            );
            for (let localX = 0; localX < maxXExclusive; localX += 1) {
                const worldX = chunkX * WORLD_SEMANTIC_CHUNK_SIZE + localX;
                for (let localY = 0; localY < maxYExclusive; localY += 1) {
                    const sourceIndex = worldX * input.height
                        + chunkY * WORLD_SEMANTIC_CHUNK_SIZE + localY;
                    const targetIndex = semanticChunkLocalIndex(localX, localY);
                    substrateClass[targetIndex] = input.substrateClass[sourceIndex];
                    macroHeight[targetIndex] = input.macroHeight[sourceIndex];
                    biomeWeights.set(input.biomeWeights.subarray(sourceIndex * 4, sourceIndex * 4 + 4), targetIndex * 4);
                    climate.set(input.climate.subarray(sourceIndex * 2, sourceIndex * 2 + 2), targetIndex * 2);
                    vegetationDensity[targetIndex] = input.vegetationDensity[sourceIndex];
                    vegetationProfile[targetIndex] = input.vegetationProfile[sourceIndex];
                }
            }
            const chunk: BaseSemanticChunk = Object.freeze({
                key: Object.freeze({ chunkX, chunkY }),
                revision: BASE_SEMANTIC_CHUNK_REVISION,
                validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive, maxYExclusive }),
                substrateClass,
                macroHeight,
                biomeWeights,
                climate,
                vegetationDensity,
                vegetationProfile
            });
            assertBaseSemanticChunk(chunk);
            chunks.push(chunk);
        }
    }
    return Object.freeze(chunks);
}

function validateHydrologyCoverage(input: StaticWorldSemanticFields): readonly HydrologyRegion[] {
    const required = new Map<string, Readonly<{ regionX: number; regionY: number }>>();
    for (let regionX = 0; regionX < Math.ceil(input.width / HYDROLOGY_REGION_SIZE); regionX += 1) {
        for (let regionY = 0; regionY < Math.ceil(input.height / HYDROLOGY_REGION_SIZE); regionY += 1) {
            required.set(`${regionX},${regionY}`, Object.freeze({ regionX, regionY }));
        }
    }
    const regions = [...input.hydrologyRegions].sort((first, second) =>
        first.key.regionX - second.key.regionX || first.key.regionY - second.key.regionY);
    const seen = new Set<string>();
    for (const region of regions) {
        assertHydrologyRegion(region);
        const serialized = `${region.key.regionX},${region.key.regionY}`;
        if (!required.has(serialized) || seen.has(serialized)) {
            throw new TypeError("static hydrology regions do not exactly cover the world");
        }
        seen.add(serialized);
        const expectedMaxX = Math.min(
            HYDROLOGY_REGION_SIZE,
            input.width - region.key.regionX * HYDROLOGY_REGION_SIZE
        );
        const expectedMaxY = Math.min(
            HYDROLOGY_REGION_SIZE,
            input.height - region.key.regionY * HYDROLOGY_REGION_SIZE
        );
        if (region.validBounds.minX !== 0 || region.validBounds.minY !== 0
            || region.validBounds.maxXExclusive !== expectedMaxX
            || region.validBounds.maxYExclusive !== expectedMaxY) {
            throw new TypeError("static hydrology region bounds do not match the world topology");
        }
    }
    if (seen.size !== required.size) {
        throw new TypeError("static hydrology regions do not exactly cover the world");
    }
    return Object.freeze(regions);
}

export function compileStaticWorldAuthority(
    input: StaticWorldSemanticFields
): CompiledStaticWorldAuthority {
    assertStaticFields(input);
    const descriptor = createWorldDescriptorV2({
        sourceKind: "static",
        sourceContentHash: input.sourceContentHash,
        topology: { kind: input.topology, width: input.width, height: input.height }
    });
    const semanticChunks = compileSemanticChunks(input);
    const hydrologyRegions = validateHydrologyCoverage(input);
    const source = new StaticWorldAuthoritySource({ descriptor, semanticChunks, hydrologyRegions });
    return Object.freeze({ descriptor, source, semanticChunks, hydrologyRegions });
}

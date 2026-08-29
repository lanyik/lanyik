import { describe, expect, test } from "vitest";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    compiledSurfaceFieldResidentBytes,
    surfaceFieldTexelIndex
} from "../../src/world/CompiledSurfaceField";
import { finiteFloat16Bits, float16BitsToFloat32 } from "../../src/world/HalfFloat";
import { SURFACE_FIELD_CPU_BYTES } from "../../src/world/SurfaceCompileProfile";
import { createSurfaceDependencyKey } from "../../src/world/SurfaceDependencyKey";
import {
    EFFECTIVE_WINDOW_TILE_COUNT,
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow
} from "../../src/world/TransferableEffectiveWindow";
import { compileSemanticSurfaceField } from "../../src/world/compileSemanticSurfaceField";

function window(
    renderChunkX: number,
    renderChunkY: number,
    tileIsValid: (tileX: number, tileY: number) => boolean = () => true
): TransferableEffectiveWindow {
    const originTileX = renderChunkX * 16 - 2;
    const originTileY = renderChunkY * 16 - 2;
    const valid = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const substrateClass = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const macroHeight = new Uint16Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const biomeWeights = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT * 4);
    const climate = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const vegetationProfile = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE; localX += 1) {
        for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE; localY += 1) {
            const index = localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
            const tileX = originTileX + localX;
            const tileY = originTileY + localY;
            if (!tileIsValid(tileX, tileY)) continue;
            valid[index] = 1;
            macroHeight[index] = 20_000 + (tileX + 64) * 100 + (tileY + 64) * 10;
            const first = ((tileX + tileY) & 1) === 0 ? 200 : 50;
            biomeWeights[index * 4] = first;
            biomeWeights[index * 4 + 1] = 255 - first;
        }
    }
    const axisKeys = (origin: number, chunkSize: number): number[] => {
        const first = Math.floor(origin / chunkSize);
        const last = Math.floor((origin + EFFECTIVE_WINDOW_TILE_SIZE - 1) / chunkSize);
        return first === last ? [first] : [first, last];
    };
    const semantic = axisKeys(originTileX, 32).flatMap(chunkX =>
        axisKeys(originTileY, 32).map(chunkY => ({
            key: { chunkX, chunkY }, baseRevision: 0, deltaRevision: 0
        })));
    const hydrologyRegions = axisKeys(originTileX, 128).flatMap(regionX =>
        axisKeys(originTileY, 128).map(regionY => Object.freeze({
            key: Object.freeze({ regionX, regionY }),
            topology: "infinite" as const,
            validBounds: Object.freeze({
                minX: 0 as const,
                minY: 0 as const,
                maxXExclusive: 128,
                maxYExclusive: 128
            }),
            baseRevision: 0,
            suppressedBaseFeatureIds: Object.freeze([]),
            boundaryPorts: Object.freeze([]),
            rivers: Object.freeze([]),
            lakes: Object.freeze([]),
            mouths: Object.freeze([]),
            bodies: Object.freeze([])
        })));
    const dependencyKey = createSurfaceDependencyKey({
        worldIdentity: "world:semantic-compiler",
        renderKey: { chunkX: renderChunkX, chunkY: renderChunkY },
        metrics: { hexSize: 2, heightScale: 10 },
        semantic,
        hydrologyRegions: hydrologyRegions.map(region => ({ key: region.key, baseRevision: 0 })),
        hydrologyFeatures: []
    });
    return Object.freeze({
        formatVersion: 1 as const,
        worldIdentity: dependencyKey.worldIdentity,
        effectiveRevision: 0,
        renderKey: dependencyKey.renderKey,
        originTileX,
        originTileY,
        valid,
        substrateClass,
        macroHeight,
        biomeWeights,
        climate,
        vegetationDensity,
        vegetationProfile,
        hydrologyRegions: Object.freeze(hydrologyRegions),
        authoredHydrology: Object.freeze([]),
        dependencyKey
    });
}

describe("compileSemanticSurfaceField", () => {
    test("compiles a valid fixed-size dry field with continuous semantic interpolation", () => {
        const compiled = compileSemanticSurfaceField(window(0, 0));
        expect(compiled.groundHeight).toHaveLength(COMPILED_SURFACE_TEXEL_COUNT);
        expect(compiledSurfaceFieldResidentBytes(compiled)).toBe(SURFACE_FIELD_CPU_BYTES);
        expect(compiled.waterCoverage.every(value => value === 0)).toBe(true);
        const center = surfaceFieldTexelIndex(2, 2);
        expect(float16BitsToFloat32(compiled.groundHeight[center])).toBeGreaterThan(0);
        const materialOffset = center * 4;
        expect(compiled.materialWeights[materialOffset]
            + compiled.materialWeights[materialOffset + 1]
            + compiled.materialWeights[materialOffset + 2]
            + compiled.materialWeights[materialOffset + 3]).toBe(255);
    });

    test("produces bit-identical shared texel columns for adjacent and negative chunks", () => {
        const left = compileSemanticSurfaceField(window(0, 0));
        const right = compileSemanticSurfaceField(window(1, 0));
        const negative = compileSemanticSurfaceField(window(-1, 0));
        for (let texelY = -1; texelY <= 64; texelY += 1) {
            for (const [leftX, rightX] of [[63, -1], [64, 0]] as const) {
                const leftIndex = surfaceFieldTexelIndex(leftX, texelY);
                const rightIndex = surfaceFieldTexelIndex(rightX, texelY);
                expect(left.groundHeight[leftIndex]).toBe(right.groundHeight[rightIndex]);
                expect(left.materialWeights.slice(leftIndex * 4, leftIndex * 4 + 4))
                    .toEqual(right.materialWeights.slice(rightIndex * 4, rightIndex * 4 + 4));
            }
            for (const [negativeX, zeroX] of [[63, -1], [64, 0]] as const) {
                const negativeIndex = surfaceFieldTexelIndex(negativeX, texelY);
                const zeroIndex = surfaceFieldTexelIndex(zeroX, texelY);
                expect(negative.groundHeight[negativeIndex]).toBe(left.groundHeight[zeroIndex]);
            }
        }
    });

    test("renormalizes finite-edge samples without reading canonical zero padding as terrain", () => {
        const compiled = compileSemanticSurfaceField(window(0, 0, (tileX, tileY) => tileX >= 0 && tileY >= 0));
        const edge = surfaceFieldTexelIndex(-1, -1);
        const expected = 27_040 / 0xffff * 10;
        expect(compiled.groundHeight[edge]).toBe(finiteFloat16Bits("expected edge height", expected));
        expect(compiled.materialWeights.slice(edge * 4, edge * 4 + 4)).toEqual(new Uint8Array([200, 55, 0, 0]));
    });
});

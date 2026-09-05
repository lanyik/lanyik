import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { getMapNeighbors } from "../../src/helpers/topology";
import { generateWorld } from "../../src/world/generateWorld";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import {
    createWorldSurfaceResolver
} from "../../src/world/WorldSurfaceResolver";
import {
    assertWorldStyleProfile,
    assertWorldWaterGenerationStyle,
    createWorldStyleProfile,
    DEFAULT_WORLD_WATER_STYLE,
    WORLD_STYLE_PROFILE
} from "../../src/world/WorldStyleProfile";

function checksum(values: ArrayLike<number>): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        hash ^= value & 0xff;
        hash = Math.imul(hash, 0x01000193);
        hash ^= (value >>> 8) & 0xff;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("WorldSurfaceResolver", () => {
    test("preserves the frozen current-generator outputs", () => {
        const infinite = generateWorldChunk({
            seed: "surface-v4-infinite", chunkX: -3, chunkY: 2, chunkSize: 24
        });
        const toroidal = generateWorldChunk({
            seed: "surface-v4-toroidal",
            chunkX: 0,
            chunkY: 0,
            chunkSize: 24,
            world: { topology: "toroidal", width: 48, height: 36 }
        });
        const bounded = generateWorld({ seed: "surface-v4-bounded", width: 32, height: 24 });
        const encoded: number[] = [];
        const land = [Land.sea, Land.coastal, Land.land, Land.sand, Land.tundra, Land.snow, Land.mountain];
        for (let x = 0; x < bounded.w; x += 1) {
            for (let y = 0; y < bounded.h; y += 1) {
                const tile = bounded.data[x][y];
                encoded.push(land.indexOf(tile.type));
                encoded.push((tile.modifiers?.includes("hill") ? 1 : 0)
                    | (tile.modifiers?.includes("wood") ? 2 : 0));
            }
        }
        expect(checksum(infinite.tiles)).toBe("31edd4fd");
        expect(checksum(toroidal.tiles)).toBe("5c34968c");
        expect(checksum(encoded)).toBe("99fb0dc5");
    });

    test("keeps generated permanent snow on elevated hill relief", () => {
        const resolver = createWorldSurfaceResolver({ seed: "new-world" });
        const terrain = WORLD_STYLE_PROFILE.terrain;
        const minimumSnowElevation = terrain.seaLevel
            + (terrain.hillElevation - terrain.seaLevel) * 0.45;
        let snowTiles = 0;
        for (let x = -64; x < 64; x += 1) {
            for (let y = -64; y < 64; y += 1) {
                const sample = resolver.sampleGenerated(x, y);
                if (sample.baseTerrain !== Land.snow) continue;
                const tile = resolver.resolveGeneratedTile(x, y);
                snowTiles += 1;
                expect(sample.landform.elevation).toBeGreaterThan(minimumSnowElevation);
                expect(tile.modifiers).toContain("hill");
            }
        }
        expect(snowTiles).toBeGreaterThan(0);
    });

    test("freezes continuous relief, biome, vegetation and ocean fields", () => {
        const resolver = createWorldSurfaceResolver({ seed: "surface-v4-fields" });
        const encoded: number[] = [];
        const reliefValues = new Set<number>();
        const vegetationValues = new Set<number>();
        const oceanValues = new Set<number>();
        for (let x = -20; x < 20; x += 1) {
            for (let y = -20; y < 20; y += 1) {
                const sample = resolver.sampleGenerated(x, y);
                const weights = sample.biomeWeights;
                if (sample.baseTerrain !== Land.sea && sample.baseTerrain !== Land.coastal) {
                    expect(weights.temperate + weights.dry + weights.cold + weights.alpine)
                        .toBeCloseTo(1, 12);
                }
                const values = [
                    sample.relief,
                    weights.temperate,
                    weights.dry,
                    weights.cold,
                    weights.alpine,
                    sample.vegetationDensity,
                    sample.landform.forestPatch,
                    sample.landform.ocean
                ].map(value => Math.round(value * 65535));
                encoded.push(...values);
                reliefValues.add(values[0]);
                vegetationValues.add(values[5]);
                oceanValues.add(values[7]);
            }
        }
        expect(reliefValues.size).toBeGreaterThan(100);
        expect(vegetationValues.size).toBeGreaterThan(50);
        expect(oceanValues.size).toBeGreaterThan(20);
        expect(checksum(encoded)).toBe("ce340641");
    });

    test("forms coherent generated water and regional forests without lake noise", () => {
        const world = generateWorld({ seed: "gallery-a", width: 96, height: 96 });
        const water: Array<{ x: number; y: number }> = [];
        const woods: Array<{ x: number; y: number }> = [];
        const encoded: number[] = [];
        const land = [Land.sea, Land.coastal, Land.land, Land.sand, Land.tundra, Land.snow, Land.mountain];
        for (let x = 0; x < world.w; x += 1) {
            for (let y = 0; y < world.h; y += 1) {
                const tile = world.data[x][y];
                if (tile.type === Land.sea || tile.type === Land.coastal) water.push({ x, y });
                expect(tile.modifiers?.includes("lake") ?? false).toBe(false);
                if (tile.modifiers?.includes("wood")) woods.push({ x, y });
                encoded.push(land.indexOf(tile.type));
                encoded.push((tile.modifiers?.includes("hill") ? 1 : 0)
                    | (tile.modifiers?.includes("wood") ? 2 : 0));
            }
        }
        expect(water.length).toBeGreaterThan(world.w * world.h * 0.15);
        const adjacentWoods = woods.filter(wood => getMapNeighbors(world, wood.x, wood.y).some(neighbor =>
            world.data[neighbor.x][neighbor.y].modifiers?.includes("wood")
        ));
        expect(woods.length).toBeGreaterThan(100);
        expect(adjacentWoods.length / woods.length).toBeGreaterThan(0.65);
        expect(checksum(encoded)).toBe("62718e8f");
    });

    test("deduplicates canonical samples inside a short-lived toroidal window", () => {
        const resolver = createWorldSurfaceResolver({
            seed: "window",
            domain: { topology: "toroidal", width: 48, height: 36 }
        });
        const window = resolver.createWindow();
        expect(window.sampleGenerated(3, 7)).toBe(window.sampleGenerated(51, 43));
        expect(window.resolveGeneratedTile(-45, -29)).toBe(window.resolveGeneratedTile(3, 7));
        window.clear();
        expect(window.sampleGenerated(3, 7)).toEqual(resolver.sampleGenerated(3, 7));
    });

    test("uses one rule for direct and windowed tile resolution", () => {
        const resolver = createWorldSurfaceResolver({
            seed: "single-rule",
            domain: { topology: "infinite" }
        });
        const window = resolver.createWindow();
        for (let x = -12; x <= 12; x += 3) {
            for (let y = -9; y <= 9; y += 3) {
                expect(window.resolveGeneratedTile(x, y)).toEqual(resolver.resolveGeneratedTile(x, y));
            }
        }
    });

    test("rejects invalid profile numbers and threshold ordering", () => {
        const invalidScale = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidScale.fields.continent.openScale = Number.NaN;
        expect(() => assertWorldStyleProfile(invalidScale)).toThrow(/finite|positive/);

        const invalidThresholds = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidThresholds.terrain.mountainElevation = invalidThresholds.terrain.mountainPeakElevation;
        expect(() => assertWorldStyleProfile(invalidThresholds)).toThrow(/ordered/);

        const missingField = structuredClone(WORLD_STYLE_PROFILE) as any;
        delete missingField.fields.ridge;
        expect(() => assertWorldStyleProfile(missingField)).toThrow(/ridge/);

        const invalidPlacement = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidPlacement.vegetation.placementThreshold = 0.01;
        expect(() => assertWorldStyleProfile(invalidPlacement)).toThrow(/placement threshold/);

        const invalidRiverRange = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidRiverRange.rivers.maximumCourseLength = invalidRiverRange.rivers.minimumCourseLength;
        expect(() => assertWorldStyleProfile(invalidRiverRange)).toThrow(/river course length range/);

        const invalidRiverPage = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidRiverPage.rivers.pageSize = Number.MAX_SAFE_INTEGER + 1;
        expect(() => assertWorldStyleProfile(invalidRiverPage)).toThrow(/positive safe integer/);

        const invalidRiverWidth = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidRiverWidth.rivers.highFlowCourseRadius = invalidRiverWidth.rivers.baseCourseRadius;
        expect(() => assertWorldStyleProfile(invalidRiverWidth)).toThrow(/flow width thresholds/);

        const invalidRiverWarp = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidRiverWarp.rivers.courseWarpAmplitude = invalidRiverWarp.rivers.courseStep / 2;
        expect(() => assertWorldStyleProfile(invalidRiverWarp)).toThrow(/warp amplitude/);

        const invalidExtension = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidExtension.rivers.upstreamExtensionSteps = 1.5;
        expect(() => assertWorldStyleProfile(invalidExtension)).toThrow(/upstream extension/);

        const invalidMouth = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidMouth.rivers.mouthWidthMultiplier = 0.9;
        expect(() => assertWorldStyleProfile(invalidMouth)).toThrow(/mouth width multiplier/);
        invalidMouth.rivers.mouthWideningDistance = NaN;
        expect(() => assertWorldStyleProfile(invalidMouth)).toThrow(/mouthWideningDistance/);
    });

    test("maps the bounded water authoring style into ocean and river generation", () => {
        const waterStyle = {
            ...DEFAULT_WORLD_WATER_STYLE,
            oceanScale: 2,
            oceanLevel: 0.56,
            riverSourceCellSize: 18,
            riverSourcesPerCell: 6,
            riverLength: 65,
            riverWarpScale: 0.04,
            riverWarpAmplitude: 3,
            riverBaseRadius: 0.5,
            riverHighFlowRadius: 3.25,
            riverHighFlowThreshold: 12
        };
        const profile = createWorldStyleProfile(waterStyle);
        expect(profile.fields.ocean.openScale).toBe(0.0035 * 2);
        expect(profile.fields.ocean.toroidalScale).toBe(0.006 * 2);
        expect(profile.fields.ocean.minimumToroidalCells).toBe(4);
        expect(profile.terrain.oceanLevel).toBe(0.56);
        expect(profile.rivers).toMatchObject({
            sourceCellSize: 18,
            sourcesPerCell: 6,
            courseLengthRatio: 0.65,
            courseWarpScale: 0.04,
            courseWarpAmplitude: 3,
            baseCourseRadius: 0.5,
            highFlowCourseRadius: 3.25,
            highFlowThreshold: 12
        });
        expect(createWorldSurfaceResolver({ seed: "styled-water", waterStyle }).waterStyle).toEqual(waterStyle);

        const invalid = { ...DEFAULT_WORLD_WATER_STYLE, riverWarpAmplitude: 4 };
        expect(() => assertWorldWaterGenerationStyle(invalid)).toThrow(/riverWarpAmplitude/);
    });

    test("rejects invalid seed and coordinate identities", () => {
        expect(() => createWorldSurfaceResolver({ seed: Number.NaN })).toThrow(/finite/);
        const resolver = createWorldSurfaceResolver({ seed: "safe-coordinates" });
        expect(() => resolver.sampleGenerated(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(/safe integers/);
    });
});

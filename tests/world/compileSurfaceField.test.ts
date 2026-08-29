import { describe, expect, test } from "vitest";

import {
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_OCEAN,
    SURFACE_WATER_KIND_RIVER,
    surfaceFieldTexelIndex
} from "../../src/world/CompiledSurfaceField";
import { float16BitsToFloat32 } from "../../src/world/HalfFloat";
import {
    HydrologyFeatureUpsertDelta,
    createAuthoredLakeFeature,
    createAuthoredRiverFeature,
    createHydrologyFeatureDelta
} from "../../src/world/HydrologyFeatureDelta";
import { HYDROLOGY_POINT_QUANTIZATION } from "../../src/world/HydrologyRegion";
import { TransferableHydrologyRegionSlice } from "../../src/world/TransferableEffectiveWindow";
import { compileSurfaceField } from "../../src/world/compileSurfaceField";
import {
    SURFACE_COMPILER_TEST_WORLD_IDENTITY,
    createSurfaceCompilerTestWindow
} from "./surfaceCompilerFixture";

function authoredRiver(options: Readonly<{
    featureId: string;
    points: readonly number[];
    widths?: readonly number[];
    levels?: readonly number[];
    outlet?: Readonly<{ kind: "ocean"; bodyId: "ocean" } | { kind: "lake"; bodyId: string }>;
    profileIndex?: number;
    dischargeClass?: number;
}>): HydrologyFeatureUpsertDelta {
    const pointCount = options.points.length / 2;
    const feature = createAuthoredRiverFeature({
        featureId: options.featureId,
        source: { kind: "spring", sourceId: `spring:${options.featureId}` },
        outlet: options.outlet ?? { kind: "ocean", bodyId: "ocean" },
        controlPoints: new Float64Array(
            options.points.map(value => value * HYDROLOGY_POINT_QUANTIZATION)
        ),
        widthProfile: new Uint8Array(options.widths ?? new Array(pointCount).fill(2)),
        levelProfile: new Uint16Array(options.levels ?? new Array(pointCount).fill(40_000)),
        dischargeClass: options.dischargeClass ?? 3,
        profileIndex: options.profileIndex ?? 4
    });
    const delta = createHydrologyFeatureDelta({
        worldIdentity: SURFACE_COMPILER_TEST_WORLD_IDENTITY,
        revision: 1,
        featureId: feature.featureId,
        featureKind: "river",
        operation: "upsert",
        feature
    });
    if (delta.operation !== "upsert") throw new Error("test river delta must be an upsert");
    return delta;
}

function authoredLake(featureId: string): HydrologyFeatureUpsertDelta {
    const feature = createAuthoredLakeFeature({
        featureId,
        polygon: new Float64Array([
            100 * 64, 100 * 64,
            104 * 64, 100 * 64,
            104 * 64, 104 * 64,
            100 * 64, 104 * 64
        ]),
        level: 35_000,
        profileIndex: 6
    });
    const delta = createHydrologyFeatureDelta({
        worldIdentity: SURFACE_COMPILER_TEST_WORLD_IDENTITY,
        revision: 1,
        featureId,
        featureKind: "lake",
        operation: "upsert",
        feature
    });
    if (delta.operation !== "upsert") throw new Error("test lake delta must be an upsert");
    return delta;
}

function baseRiverRegion(
    suppressedBaseFeatureIds: readonly string[] = []
): TransferableHydrologyRegionSlice {
    return Object.freeze({
        key: Object.freeze({ regionX: 0, regionY: 0 }),
        topology: "infinite" as const,
        validBounds: Object.freeze({
            minX: 0 as const,
            minY: 0 as const,
            maxXExclusive: 128,
            maxYExclusive: 128
        }),
        baseRevision: 0,
        suppressedBaseFeatureIds: Object.freeze([...suppressedBaseFeatureIds]),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([{
            riverId: "river:base",
            segmentId: "segment:base:0",
            controlPoints: new Int16Array([0, 5 * 64, 15 * 64, 5 * 64]),
            widthProfile: new Uint8Array([2, 2]),
            levelProfile: new Uint16Array([40_000, 35_000]),
            dischargeClass: 2,
            entry: Object.freeze({ kind: "node" as const, nodeId: "node:base" }),
            exit: Object.freeze({ kind: "body" as const, bodyId: "ocean" })
        }]),
        lakes: Object.freeze([]),
        mouths: Object.freeze([{
            mouthId: "mouth:base:0",
            riverId: "river:base",
            segmentId: "segment:base:0",
            targetBodyId: "ocean",
            point: new Int16Array([15 * 64, 5 * 64]),
            widthClass: 2,
            dischargeClass: 2
        }]),
        bodies: Object.freeze([
            { bodyId: "ocean", kind: "ocean" as const, profileIndex: 0 },
            { bodyId: "river:base", kind: "river" as const, profileIndex: 2 }
        ])
    });
}

describe("compileSurfaceField river and mouth stage", () => {
    test("compiles variable river level and non-zero world-space flow", () => {
        const river = authoredRiver({
            featureId: "river:authored",
            points: [2, 5, 12, 5],
            levels: [40_000, 35_000]
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [river]
        }));
        const upstream = surfaceFieldTexelIndex(14, 22);
        const middle = surfaceFieldTexelIndex(26, 22);
        const downstream = surfaceFieldTexelIndex(42, 22);

        expect(compiled.field.waterCoverage[middle]).toBe(255);
        expect(compiled.field.waterKind[middle]).toBe(SURFACE_WATER_KIND_RIVER);
        expect(compiled.field.waterProfile[middle]).toBe(4);
        expect(compiled.field.flow[middle * 2]).not.toBe(0);
        expect(compiled.field.flow[middle * 2] ** 2
            + compiled.field.flow[middle * 2 + 1] ** 2).toBeGreaterThan(100 ** 2);
        expect(float16BitsToFloat32(compiled.field.waterLevel[upstream]))
            .toBeGreaterThan(float16BitsToFloat32(compiled.field.waterLevel[downstream]));
        expect(compiled.waterBodies.entries.some(body => body.bodyId === "river:authored")).toBe(true);
    });

    test("interpolates width classes continuously downstream", () => {
        const river = authoredRiver({
            featureId: "river:widening",
            points: [2, 5, 12, 5],
            widths: [1, 5]
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [river]
        }));
        const upstreamBank = surfaceFieldTexelIndex(14, 27);
        const downstreamBank = surfaceFieldTexelIndex(46, 27);
        expect(compiled.field.waterCoverage[upstreamBank]).toBe(0);
        expect(compiled.field.waterCoverage[downstreamBank]).toBeGreaterThanOrEqual(128);
    });

    test("clips an extremely long authored span before integer-column expansion", () => {
        const river = authoredRiver({
            featureId: "river:long",
            points: [-100_000_000, 5, 100_000_000, 5]
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [river]
        }));
        const localChannel = surfaceFieldTexelIndex(26, 22);
        expect(compiled.field.waterKind[localChannel]).toBe(SURFACE_WATER_KIND_RIVER);
        expect(compiled.field.waterProfile[localChannel]).toBe(4);
    });

    test("intersects a variable river surface with continuous terrain", () => {
        const river = authoredRiver({
            featureId: "river:terrain-cut",
            points: [2, 5, 12, 5],
            levels: [40_000, 40_000]
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: tileX => Math.max(0, Math.min(0xffff, 20_000 + tileX * 3_000)),
            authoredHydrology: [river]
        }));
        const submerged = surfaceFieldTexelIndex(14, 22);
        const raised = surfaceFieldTexelIndex(42, 22);
        expect(compiled.field.waterCoverage[submerged]).toBe(255);
        expect(compiled.field.waterCoverage[raised]).toBe(0);
    });

    test("uses discharge class and stable identity to resolve equal-coverage confluences", () => {
        const smaller = authoredRiver({
            featureId: "river:a",
            points: [2, 5, 12, 5],
            profileIndex: 3,
            dischargeClass: 1
        });
        const larger = authoredRiver({
            featureId: "river:b",
            points: [2, 5, 12, 5],
            profileIndex: 9,
            dischargeClass: 5
        });
        const equalButLater = authoredRiver({
            featureId: "river:c",
            points: [2, 5, 12, 5],
            profileIndex: 10,
            dischargeClass: 5
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [smaller, larger, equalButLater]
        }));
        const confluence = surfaceFieldTexelIndex(26, 22);
        const body = compiled.waterBodies.entries[compiled.field.waterBodyIndex[confluence] - 1];
        expect(body.bodyId).toBe("river:b");
        expect(compiled.field.waterProfile[confluence]).toBe(9);
    });

    test("compiles base segments and switches a terminal mouth to ocean identity", () => {
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            hydrologyRegions: [baseRiverRegion()]
        }));
        const middle = surfaceFieldTexelIndex(26, 22);
        const mouth = surfaceFieldTexelIndex(61, 22);
        expect(compiled.field.waterKind[middle]).toBe(SURFACE_WATER_KIND_RIVER);
        expect(compiled.field.waterProfile[middle]).toBe(2);
        expect(compiled.field.waterKind[mouth]).toBe(SURFACE_WATER_KIND_OCEAN);
        expect(compiled.field.flow.slice(mouth * 2, mouth * 2 + 2)).toEqual(new Int8Array([0, 0]));
    });

    test("uses an authored lake outlet dependency for mouth identity and profile", () => {
        const lake = authoredLake("lake:remote-outlet");
        const river = authoredRiver({
            featureId: "river:lake-mouth",
            points: [2, 5, 12, 5],
            levels: [40_000, 35_000],
            outlet: { kind: "lake", bodyId: lake.featureId }
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [lake, river]
        }));
        const mouth = surfaceFieldTexelIndex(49, 22);
        const body = compiled.waterBodies.entries[compiled.field.waterBodyIndex[mouth] - 1];
        expect(compiled.field.waterKind[mouth]).toBe(SURFACE_WATER_KIND_LAKE);
        expect(compiled.field.waterProfile[mouth]).toBe(6);
        expect(body.bodyId).toBe("lake:remote-outlet");
        expect(compiled.field.flow.slice(mouth * 2, mouth * 2 + 2)).toEqual(new Int8Array([0, 0]));
    });

    test("suppresses every base segment before compiling a complete authored river replacement", () => {
        const replacement = authoredRiver({
            featureId: "river:base",
            points: [2, 10, 12, 10],
            profileIndex: 8
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            hydrologyRegions: [baseRiverRegion(["river:base"])],
            authoredHydrology: [replacement]
        }));
        const oldChannel = surfaceFieldTexelIndex(26, 22);
        const newChannel = surfaceFieldTexelIndex(26, 42);
        expect(compiled.field.waterCoverage[oldChannel]).toBe(0);
        expect(compiled.field.waterKind[newChannel]).toBe(SURFACE_WATER_KIND_RIVER);
        expect(compiled.field.waterProfile[newChannel]).toBe(8);
    });

    test("projects a seam-crossing river into a toroidal render window", () => {
        const river = authoredRiver({
            featureId: "river:toroidal",
            points: [30, 5, 34, 5]
        });
        const compiled = compileSurfaceField(createSurfaceCompilerTestWindow({
            domain: Object.freeze({ topology: "toroidal" as const, width: 32, height: 32 }),
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            hydrologyRegions: [Object.freeze({
                ...baseRiverRegion(),
                topology: "toroidal" as const,
                validBounds: Object.freeze({
                    minX: 0 as const,
                    minY: 0 as const,
                    maxXExclusive: 32,
                    maxYExclusive: 32
                }),
                rivers: Object.freeze([]),
                mouths: Object.freeze([]),
                bodies: Object.freeze([])
            })],
            authoredHydrology: [river]
        }));
        const wrapped = surfaceFieldTexelIndex(2, 22);
        expect(compiled.field.waterCoverage[wrapped]).toBeGreaterThanOrEqual(128);
        expect(compiled.field.waterKind[wrapped]).toBe(SURFACE_WATER_KIND_RIVER);
    });

    test("keeps shared river field texels bit-identical across render chunks", () => {
        const river = authoredRiver({
            featureId: "river:cross-chunk",
            points: [12, 5, 20, 5]
        });
        const left = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [river]
        })).field;
        const right = compileSurfaceField(createSurfaceCompilerTestWindow({
            renderChunkX: 1,
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [river]
        })).field;
        const scalarFields = [
            "groundHeight",
            "waterLevel",
            "waterDepth",
            "shorelineDistance",
            "waterCoverage",
            "waterKind",
            "waterProfile"
        ] as const;
        for (let texelY = -1; texelY <= 64; texelY += 1) {
            for (const [leftX, rightX] of [[63, -1], [64, 0]] as const) {
                const leftIndex = surfaceFieldTexelIndex(leftX, texelY);
                const rightIndex = surfaceFieldTexelIndex(rightX, texelY);
                for (const field of scalarFields) {
                    expect(left[field][leftIndex]).toBe(right[field][rightIndex]);
                }
                expect(left.flow.slice(leftIndex * 2, leftIndex * 2 + 2))
                    .toEqual(right.flow.slice(rightIndex * 2, rightIndex * 2 + 2));
            }
        }
    });
});

import { describe, expect, test } from "vitest";

import {
    createInfiniteWaterCurveField,
    INFINITE_WATER_CURVE_REFERENCE_PROFILE,
    scaleInfiniteWaterCurveProfile,
    waterCurveSeedToUint32,
    WaterCurvePath
} from "../../src/world/InfiniteWaterCurveField";
import { seedToUint32 } from "../../src/world/noise";

const pathKey = (path: WaterCurvePath): string =>
    `${path.familyIndex}:${path.ownerCellX}:${path.ownerCellY}:${path.ownerSlot}:${path.pathIndex}`;

const pathSignature = (path: WaterCurvePath): string => [
    pathKey(path),
    path.points.length,
    path.points[0].x.toFixed(6),
    path.points[0].y.toFixed(6),
    path.points[path.points.length - 1].x.toFixed(6),
    path.points[path.points.length - 1].y.toFixed(6)
].join("|");

function query(seed: string, extent: number): Map<string, string> {
    const field = createInfiniteWaterCurveField(seed);
    const paths = new Map<string, string>();
    field.forEachPathIntersecting(
        { minX: -extent, maxX: extent, minY: -extent, maxY: extent },
        path => paths.set(pathKey(path), pathSignature(path))
    );
    return paths;
}

describe("InfiniteWaterCurveField", () => {
    test("uses the same seed identity as world terrain generation", () => {
        expect(waterCurveSeedToUint32("shared-world-seed")).toBe(seedToUint32("shared-world-seed"));
    });

    test("is deterministic, seed-sensitive and spatially queryable", () => {
        const first = query("curve-field-a", 260);
        const second = query("curve-field-a", 260);
        const other = query("curve-field-b", 260);
        expect(first.size).toBeGreaterThan(12);
        expect(second).toEqual(first);
        expect(other).not.toEqual(first);
    });

    test("returns the same owned feature geometry through overlapping queries", () => {
        const inner = query("curve-window-overlap", 90);
        const outer = query("curve-window-overlap", 220);
        expect(inner.size).toBeGreaterThan(0);
        for (const [key, signature] of inner) expect(outer.get(key)).toBe(signature);
    });

    test("scales every spatial parameter without changing density or topology counts", () => {
        const scale = 28;
        const scaled = scaleInfiniteWaterCurveProfile(INFINITE_WATER_CURVE_REFERENCE_PROFILE, scale);
        expect(scaled.density).toBe(INFINITE_WATER_CURVE_REFERENCE_PROFILE.density);
        expect(scaled.curvature).toBe(INFINITE_WATER_CURVE_REFERENCE_PROFILE.curvature);
        expect(scaled.polylineChance).toBe(INFINITE_WATER_CURVE_REFERENCE_PROFILE.polylineChance);
        expect(scaled.sampleSpacing).toBeCloseTo(
            INFINITE_WATER_CURVE_REFERENCE_PROFILE.sampleSpacing * scale
        );
        expect(scaled.families[2].maximumLength).toBeCloseTo(17_000);
        expect(createInfiniteWaterCurveField("scale-check", scaled).maximumWidth).toBeCloseTo(54);
        expect(scaled.families[2].slots).toBe(INFINITE_WATER_CURVE_REFERENCE_PROFILE.families[2].slots);
        expect(scaled.families[2].maximumBranches)
            .toBe(INFINITE_WATER_CURVE_REFERENCE_PROFILE.families[2].maximumBranches);
    });

    test("mixes long curves and polylines across disordered macro directions", () => {
        const field = createInfiniteWaterCurveField("macro-water-network");
        const mains: WaterCurvePath[] = [];
        field.forEachPathIntersecting(
            { minX: -500, maxX: 500, minY: -500, maxY: 500 },
            path => { if (!path.branch) mains.push(path); }
        );
        expect(mains.some(path => path.kind === "curve")).toBe(true);
        expect(mains.some(path => path.kind === "polyline")).toBe(true);
        const directions = new Set(mains.map(path => {
            const first = path.points[0];
            const last = path.points[path.points.length - 1];
            const angle = (Math.atan2(last.y - first.y, last.x - first.x) + Math.PI) % Math.PI;
            return Math.floor(angle / Math.PI * 12);
        }));
        const longestChord = Math.max(...mains.map(path => {
            const first = path.points[0];
            const last = path.points[path.points.length - 1];
            return Math.hypot(last.x - first.x, last.y - first.y);
        }));
        expect(directions.size).toBeGreaterThanOrEqual(8);
        expect(longestChord).toBeGreaterThan(250);
    });
});

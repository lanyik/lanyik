import { describe, expect, test } from "vitest";

import { getHexCenter } from "../../src/helpers/helpers";
import {
    surfaceColumnStagger,
    surfaceRenderChunkLocation,
    surfaceStagger,
    surfaceTexelCenterAxis,
    surfaceToWorld,
    worldToSurface
} from "../../src/world/SurfaceLattice";

describe("SurfaceLattice", () => {
    test("matches the existing logical hex centers at positive and negative coordinates", () => {
        const hexSize = 40;
        for (const x of [-33, -2, -1, 0, 1, 2, 47]) {
            for (const y of [-19, -1, 0, 1, 28]) {
                const expected = getHexCenter(x, y, hexSize);
                expect(surfaceToWorld(x, y, hexSize)).toEqual({ x: expected.x, z: expected.y });
            }
        }
    });

    test("uses mathematical parity and a continuous piecewise-linear stagger", () => {
        expect([
            surfaceColumnStagger(-3),
            surfaceColumnStagger(-2),
            surfaceColumnStagger(-1),
            surfaceColumnStagger(0),
            surfaceColumnStagger(1),
            surfaceColumnStagger(2)
        ]).toEqual([0, 0.5, 0, 0.5, 0, 0.5]);
        expect(surfaceStagger(-1.25)).toBeCloseTo(0.125, 15);
        expect(surfaceStagger(-0.5)).toBeCloseTo(0.25, 15);
        expect(surfaceStagger(0.25)).toBeCloseTo(0.375, 15);
        expect(surfaceStagger(0.999999)).toBeCloseTo(0.0000005, 12);
        expect(surfaceStagger(1)).toBe(0);
    });

    test("round-trips fractional surface coordinates", () => {
        const hexSize = 37.5;
        const vectors = [
            { u: -1024.875, v: 512.125 },
            { u: -1.25, v: -3.75 },
            { u: -0.001, v: 0.499 },
            { u: 0, v: 0 },
            { u: 1.75, v: -0.25 },
            { u: 8192.125, v: -4096.625 }
        ];
        for (const vector of vectors) {
            const world = surfaceToWorld(vector.u, vector.v, hexSize);
            const restored = worldToSurface(world.x, world.z, hexSize);
            expect(restored.u).toBeCloseTo(vector.u, 12);
            expect(restored.v).toBeCloseTo(vector.v, 12);
        }
    });

    test("freezes texel phases across positive and negative chunk boundaries", () => {
        expect(surfaceTexelCenterAxis(0, 0)).toBe(-0.375);
        expect(surfaceTexelCenterAxis(0, 63)).toBe(15.375);
        expect(surfaceTexelCenterAxis(0, 64)).toBe(15.625);
        expect(surfaceTexelCenterAxis(1, -1)).toBe(15.375);
        expect(surfaceTexelCenterAxis(1, 0)).toBe(15.625);

        expect(surfaceTexelCenterAxis(-1, 63)).toBe(-0.625);
        expect(surfaceTexelCenterAxis(-1, 64)).toBe(-0.375);
        expect(surfaceTexelCenterAxis(0, -1)).toBe(-0.625);
        expect(surfaceTexelCenterAxis(0, 0)).toBe(-0.375);
    });

    test("assigns continuous public edges to one half-open render core", () => {
        expect(surfaceRenderChunkLocation(-0.5, -0.5)).toMatchObject({
            chunkX: 0, chunkY: 0, localU: -0.5, localV: -0.5
        });
        expect(surfaceRenderChunkLocation(15.5, 4.25)).toMatchObject({
            chunkX: 1, chunkY: 0, localU: -0.5, localV: 4.25
        });
        expect(surfaceRenderChunkLocation(-0.5001, -16.5)).toMatchObject({
            chunkX: -1, chunkY: -1, localV: -0.5
        });
        expect(surfaceRenderChunkLocation(-16.5, 15.5)).toMatchObject({
            chunkX: -1, chunkY: 1, localU: -0.5, localV: -0.5
        });
    });

    test("rejects coordinates that cannot preserve the lattice contract", () => {
        expect(() => surfaceColumnStagger(0.5)).toThrow(/safe integer/);
        expect(() => surfaceToWorld(0, 0, 0)).toThrow(/hex size/);
        expect(() => worldToSurface(Number.POSITIVE_INFINITY, 0, 1)).toThrow(/finite/);
        expect(() => surfaceTexelCenterAxis(0, -2)).toThrow(/physical layer/);
        expect(() => surfaceTexelCenterAxis(0, 65)).toThrow(/physical layer/);
        expect(() => surfaceTexelCenterAxis(Number.MAX_SAFE_INTEGER, 0)).toThrow(/origin/);
        expect(() => surfaceRenderChunkLocation(Number.MAX_SAFE_INTEGER, 0)).toThrow(/origin|range/);
    });
});

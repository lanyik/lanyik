import { describe, expect, test } from "vitest";

import {
    SURFACE_GROUND_LODS,
    SurfaceGroundGeometrySet,
    assertSurfaceGroundGeometryData,
    createSurfaceGroundGeometryData
} from "../../src/rendering/SurfaceGroundGeometry";
import { SURFACE_COMPILE_PROFILE, SURFACE_CORE_TEXELS } from "../../src/world/SurfaceCompileProfile";
import { surfaceToWorld } from "../../src/world/SurfaceLattice";

function boundaryCoordinates(positions: Float32Array): string[] {
    const minimum = -0.5;
    const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    const coordinates: string[] = [];
    for (let index = 0; index < positions.length / 3; index += 1) {
        const u = positions[index * 3];
        const v = positions[index * 3 + 2];
        if (u === minimum || u === maximum || v === minimum || v === maximum) {
            coordinates.push(`${u}:${v}`);
        }
    }
    return coordinates.sort();
}

describe("surface ground shared LOD geometry", () => {
    test("builds three manifold LODs with strictly cheaper interiors", () => {
        const data = SURFACE_GROUND_LODS.map(createSurfaceGroundGeometryData);
        for (const geometry of data) assertSurfaceGroundGeometryData(geometry);
        expect(data.map(geometry => geometry.interiorStrideTexels)).toEqual([1, 2, 4]);
        expect(data.map(geometry => geometry.positions.length / 3)).toEqual([4225, 1217, 481]);
        expect(data.map(geometry => geometry.indices.length / 3)).toEqual([8192, 2176, 704]);
    });

    test("keeps every canonical near-grid boundary vertex in every LOD", () => {
        const boundaries = SURFACE_GROUND_LODS
            .map(lod => boundaryCoordinates(createSurfaceGroundGeometryData(lod).positions));
        expect(boundaries[0]).toHaveLength(SURFACE_CORE_TEXELS * 4);
        expect(boundaries[1]).toEqual(boundaries[0]);
        expect(boundaries[2]).toEqual(boundaries[0]);
    });

    test("maps adjacent chunk boundaries to identical world points and phased field samples", () => {
        const data = createSurfaceGroundGeometryData("far");
        const size = SURFACE_COMPILE_PROFILE.renderChunkSize;
        const rightU = size - 0.5;
        for (let step = 0; step <= SURFACE_CORE_TEXELS; step += 1) {
            const v = -0.5 + step / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
            const first = surfaceToWorld(rightU, v, 3);
            const second = surfaceToWorld(size + (-0.5), v, 3);
            expect(second).toEqual(first);
        }
        const positions = data.positions;
        const coordinates = data.surfaceFieldCoordinates;
        const rightIndices: number[] = [];
        const leftIndices: number[] = [];
        for (let index = 0; index < positions.length / 3; index += 1) {
            if (positions[index * 3] === rightU) rightIndices.push(index);
            if (positions[index * 3] === -0.5) leftIndices.push(index);
        }
        expect(rightIndices).toHaveLength(SURFACE_CORE_TEXELS + 1);
        expect(leftIndices).toHaveLength(SURFACE_CORE_TEXELS + 1);
        expect(new Set(rightIndices.map(index => coordinates[index * 2]))).toEqual(new Set([64.5]));
        expect(new Set(leftIndices.map(index => coordinates[index * 2]))).toEqual(new Set([0.5]));
    });

    test("rejects winding corruption and owns one shared Three.js geometry per LOD", () => {
        const data = createSurfaceGroundGeometryData("mid");
        const corruptedIndices = data.indices.slice();
        [corruptedIndices[1], corruptedIndices[2]] = [corruptedIndices[2], corruptedIndices[1]];
        expect(() => assertSurfaceGroundGeometryData({ ...data, indices: corruptedIndices }))
            .toThrow(/positive world Y/);

        const set = new SurfaceGroundGeometrySet();
        const near = set.get("near");
        expect(set.get("near")).toBe(near);
        expect(near.getAttribute("surfaceFieldCoordinate").count)
            .toBe(near.getAttribute("position").count);
        set.dispose();
        expect(() => set.get("near")).toThrow(/disposed/);
    });
});

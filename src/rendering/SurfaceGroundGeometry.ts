import { BufferAttribute, BufferGeometry } from "three";

import { SURFACE_COMPILE_PROFILE, SURFACE_CORE_TEXELS } from "../world/SurfaceCompileProfile";

export type SurfaceGroundLod = "near" | "mid" | "far";

export const SURFACE_GROUND_LODS: readonly SurfaceGroundLod[] = Object.freeze([
    "near",
    "mid",
    "far"
]);

export interface SurfaceGroundGeometryData {
    readonly lod: SurfaceGroundLod;
    readonly interiorStrideTexels: number;
    readonly positions: Float32Array;
    readonly surfaceFieldCoordinates: Float32Array;
    readonly indices: Uint16Array;
}

const LOD_STRIDE_TEXELS: Readonly<Record<SurfaceGroundLod, number>> = Object.freeze({
    near: 1,
    mid: 2,
    far: 4
});

interface MutableGroundGeometry {
    readonly positions: number[];
    readonly surfaceFieldCoordinates: number[];
    readonly indices: number[];
    readonly vertices: Map<string, number>;
}

function assertLod(lod: SurfaceGroundLod): void {
    if (lod !== "near" && lod !== "mid" && lod !== "far") {
        throw new TypeError("surface ground LOD is invalid");
    }
}

function vertexKey(gridX: number, gridY: number): string {
    return `${gridX}:${gridY}`;
}

function addVertex(output: MutableGroundGeometry, gridX: number, gridY: number): number {
    const key = vertexKey(gridX, gridY);
    const existing = output.vertices.get(key);
    if (existing !== undefined) return existing;
    const index = output.positions.length / 3;
    const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const localU = -0.5 + gridX / samplesPerTile;
    const localV = -0.5 + gridY / samplesPerTile;
    output.positions.push(localU, 0, localV);
    output.surfaceFieldCoordinates.push(
        gridX - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels,
        gridY - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels
    );
    output.vertices.set(key, index);
    return index;
}

function addUpwardTriangle(
    output: MutableGroundGeometry,
    first: readonly [number, number],
    second: readonly [number, number],
    third: readonly [number, number]
): void {
    const area = (second[0] - first[0]) * (third[1] - first[1])
        - (second[1] - first[1]) * (third[0] - first[0]);
    if (area === 0) throw new Error("surface ground topology produced a degenerate triangle");
    const firstIndex = addVertex(output, first[0], first[1]);
    const secondIndex = addVertex(output, second[0], second[1]);
    const thirdIndex = addVertex(output, third[0], third[1]);
    if (area < 0) output.indices.push(firstIndex, secondIndex, thirdIndex);
    else output.indices.push(firstIndex, thirdIndex, secondIndex);
}

function addRegularGrid(
    output: MutableGroundGeometry,
    minimum: number,
    maximum: number,
    stride: number
): void {
    for (let gridX = minimum; gridX < maximum; gridX += stride) {
        for (let gridY = minimum; gridY < maximum; gridY += stride) {
            const bottomLeft = [gridX, gridY] as const;
            const bottomRight = [gridX + stride, gridY] as const;
            const topLeft = [gridX, gridY + stride] as const;
            const topRight = [gridX + stride, gridY + stride] as const;
            addUpwardTriangle(output, bottomLeft, topRight, bottomRight);
            addUpwardTriangle(output, bottomLeft, topLeft, topRight);
        }
    }
}

function addTransitionStrip(
    output: MutableGroundGeometry,
    outer: readonly (readonly [number, number])[],
    inner: readonly (readonly [number, number])[]
): void {
    let outerIndex = 0;
    let innerIndex = 0;
    const outerLast = outer.length - 1;
    const innerLast = inner.length - 1;
    while (outerIndex < outerLast || innerIndex < innerLast) {
        const nextOuter = outerIndex < outerLast ? (outerIndex + 1) / outerLast : Number.POSITIVE_INFINITY;
        const nextInner = innerIndex < innerLast ? (innerIndex + 1) / innerLast : Number.POSITIVE_INFINITY;
        if (nextOuter <= nextInner) {
            addUpwardTriangle(
                output,
                outer[outerIndex],
                inner[innerIndex],
                outer[outerIndex + 1]
            );
            outerIndex += 1;
        } else {
            addUpwardTriangle(
                output,
                outer[outerIndex],
                inner[innerIndex],
                inner[innerIndex + 1]
            );
            innerIndex += 1;
        }
    }
}

function inclusiveRange(start: number, end: number, step: number): number[] {
    const values: number[] = [];
    for (let value = start; value <= end; value += step) values.push(value);
    return values;
}

function buildTransitionGround(output: MutableGroundGeometry, stride: number): void {
    const end = SURFACE_CORE_TEXELS;
    const innerStart = stride;
    const innerEnd = end - stride;
    const fine = inclusiveRange(0, end, 1);
    const coarse = inclusiveRange(innerStart, innerEnd, stride);
    addRegularGrid(output, innerStart, innerEnd, stride);
    addTransitionStrip(
        output,
        fine.map(value => [value, 0] as const),
        coarse.map(value => [value, innerStart] as const)
    );
    addTransitionStrip(
        output,
        fine.map(value => [value, end] as const),
        coarse.map(value => [value, innerEnd] as const)
    );
    addTransitionStrip(
        output,
        fine.map(value => [0, value] as const),
        coarse.map(value => [innerStart, value] as const)
    );
    addTransitionStrip(
        output,
        fine.map(value => [end, value] as const),
        coarse.map(value => [innerEnd, value] as const)
    );
}

function edgeKey(first: number, second: number): string {
    return first < second ? `${first}:${second}` : `${second}:${first}`;
}

export function assertSurfaceGroundGeometryData(data: Readonly<SurfaceGroundGeometryData>): void {
    if (!data || typeof data !== "object") throw new TypeError("surface ground geometry data is required");
    assertLod(data.lod);
    const expectedStride = LOD_STRIDE_TEXELS[data.lod];
    const vertexCount = data.positions.length / 3;
    if (data.interiorStrideTexels !== expectedStride
        || !(data.positions instanceof Float32Array) || data.positions.length % 3 !== 0
        || !(data.surfaceFieldCoordinates instanceof Float32Array)
        || data.surfaceFieldCoordinates.length !== vertexCount * 2
        || !(data.indices instanceof Uint16Array) || data.indices.length === 0
        || data.indices.length % 3 !== 0 || vertexCount > 0xffff) {
        throw new TypeError("surface ground geometry arrays or LOD stride are invalid");
    }
    const coordinateIndex = new Map<string, number>();
    const size = SURFACE_COMPILE_PROFILE.renderChunkSize;
    let totalArea = 0;
    for (let index = 0; index < vertexCount; index += 1) {
        const u = data.positions[index * 3];
        const y = data.positions[index * 3 + 1];
        const v = data.positions[index * 3 + 2];
        if (!Number.isFinite(u) || y !== 0 || !Number.isFinite(v)
            || u < -0.5 || u > size - 0.5 || v < -0.5 || v > size - 0.5) {
            throw new RangeError("surface ground vertex is outside its canonical logical bounds");
        }
        const key = `${u}:${v}`;
        if (coordinateIndex.has(key)) throw new Error("surface ground geometry contains duplicate vertices");
        coordinateIndex.set(key, index);
        const fieldX = data.surfaceFieldCoordinates[index * 2];
        const fieldY = data.surfaceFieldCoordinates[index * 2 + 1];
        const expectedFieldX = (u + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
            - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels;
        const expectedFieldY = (v + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
            - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels;
        if (fieldX !== expectedFieldX || fieldY !== expectedFieldY) {
            throw new Error("surface ground field coordinate drifted from its texel-center phase");
        }
    }
    const edgeUses = new Map<string, number>();
    for (let offset = 0; offset < data.indices.length; offset += 3) {
        const first = data.indices[offset];
        const second = data.indices[offset + 1];
        const third = data.indices[offset + 2];
        if (first >= vertexCount || second >= vertexCount || third >= vertexCount
            || first === second || second === third || first === third) {
            throw new RangeError("surface ground triangle index is invalid");
        }
        const firstU = data.positions[first * 3];
        const firstV = data.positions[first * 3 + 2];
        const secondU = data.positions[second * 3];
        const secondV = data.positions[second * 3 + 2];
        const thirdU = data.positions[third * 3];
        const thirdV = data.positions[third * 3 + 2];
        const area = (secondU - firstU) * (thirdV - firstV)
            - (secondV - firstV) * (thirdU - firstU);
        if (!(area < 0)) throw new Error("surface ground triangles must face positive world Y");
        totalArea += -area * 0.5;
        for (const [edgeFirst, edgeSecond] of [
            [first, second],
            [second, third],
            [third, first]
        ] as const) {
            const key = edgeKey(edgeFirst, edgeSecond);
            edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
        }
    }
    if (Math.abs(totalArea - size * size) > 1e-9) {
        throw new Error("surface ground triangles do not cover the canonical chunk exactly");
    }
    const boundaryStep = 1 / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const maximumBoundary = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    const boundaryEdges = new Set<string>();
    for (let index = 0; index < SURFACE_CORE_TEXELS; index += 1) {
        const start = -0.5 + index * boundaryStep;
        const end = start + boundaryStep;
        for (const [firstKey, secondKey] of [
            [`${start}:${-0.5}`, `${end}:${-0.5}`],
            [`${start}:${maximumBoundary}`, `${end}:${maximumBoundary}`],
            [`${-0.5}:${start}`, `${-0.5}:${end}`],
            [`${maximumBoundary}:${start}`, `${maximumBoundary}:${end}`]
        ]) {
            const first = coordinateIndex.get(firstKey);
            const second = coordinateIndex.get(secondKey);
            if (first === undefined || second === undefined) {
                throw new Error("surface ground LOD omitted a canonical boundary vertex");
            }
            boundaryEdges.add(edgeKey(first, second));
        }
    }
    for (const [edge, uses] of edgeUses) {
        if (uses !== (boundaryEdges.has(edge) ? 1 : 2)) {
            throw new Error("surface ground topology is non-manifold or contains a T-junction");
        }
    }
    if (boundaryEdges.size !== SURFACE_CORE_TEXELS * 4
        || [...boundaryEdges].some(edge => edgeUses.get(edge) !== 1)) {
        throw new Error("surface ground topology does not own every canonical boundary segment exactly once");
    }
}

export function createSurfaceGroundGeometryData(lod: SurfaceGroundLod): SurfaceGroundGeometryData {
    assertLod(lod);
    const output: MutableGroundGeometry = {
        positions: [],
        surfaceFieldCoordinates: [],
        indices: [],
        vertices: new Map()
    };
    const stride = LOD_STRIDE_TEXELS[lod];
    if (stride === 1) addRegularGrid(output, 0, SURFACE_CORE_TEXELS, 1);
    else buildTransitionGround(output, stride);
    const data: SurfaceGroundGeometryData = Object.freeze({
        lod,
        interiorStrideTexels: stride,
        positions: new Float32Array(output.positions),
        surfaceFieldCoordinates: new Float32Array(output.surfaceFieldCoordinates),
        indices: new Uint16Array(output.indices)
    });
    assertSurfaceGroundGeometryData(data);
    return data;
}

export function createSurfaceGroundGeometry(lod: SurfaceGroundLod): BufferGeometry {
    const data = createSurfaceGroundGeometryData(lod);
    const geometry = new BufferGeometry();
    geometry.name = `surface-ground-${lod}`;
    geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
    geometry.setAttribute("surfaceFieldCoordinate", new BufferAttribute(data.surfaceFieldCoordinates, 2));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.surfaceGroundLod = lod;
    geometry.userData.interiorStrideTexels = data.interiorStrideTexels;
    return geometry;
}

export class SurfaceGroundGeometrySet {
    private readonly geometries = new Map<SurfaceGroundLod, BufferGeometry>();
    private disposed = false;

    constructor() {
        for (const lod of SURFACE_GROUND_LODS) this.geometries.set(lod, createSurfaceGroundGeometry(lod));
    }

    public get(lod: SurfaceGroundLod): BufferGeometry {
        if (this.disposed) throw new Error("surface ground geometry set has been disposed");
        assertLod(lod);
        const geometry = this.geometries.get(lod);
        if (!geometry) throw new Error("surface ground geometry set lost a frozen LOD");
        return geometry;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
    }
}

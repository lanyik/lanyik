import {
    Box3,
    BufferAttribute,
    BufferGeometry,
    Sphere,
    Vector3
} from "three";

import type { WorldChunkLod } from "./WorldChunkLod";
import {
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_SAMPLES_PER_TILE_INTERVAL
} from "../world/semantic/SurfaceCompileProfile";
import { surfaceToWorld } from "../world/semantic/SurfaceLattice";

export const SURFACE_GROUND_LOD_GRID_STEPS = Object.freeze([1, 2, 4] as const);
export const SURFACE_GROUND_BOUNDARY_INTERVALS =
    SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
export function createCanonicalSurfaceCoordinates(
    source: ArrayLike<number>
): Float32Array {
    if (source.length < 2 || source.length % 2 !== 0) {
        throw new TypeError("surface coordinates must contain uv pairs");
    }
    const result = new Float32Array(source.length);
    for (let index = 0; index < source.length; index += 2) {
        const u = Number(source[index]);
        const v = Number(source[index + 1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
            throw new RangeError("surface coordinates must be finite");
        }
        result[index] = u;
        result[index + 1] = v;
    }
    return result;
}

export interface SurfaceGroundGeometryInfo {
    readonly lod: WorldChunkLod;
    readonly interiorGridStep: 1 | 2 | 4;
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly byteLength: number;
}

export interface SurfaceGroundGeometryPoolStats {
    readonly state: "ready" | "disposed";
    readonly geometryCount: number;
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly byteLength: number;
}

interface GridPoint {
    readonly x: number;
    readonly y: number;
}

interface GeometryBuilder {
    readonly positions: number[];
    readonly surfaceCoordinates: number[];
    readonly indices: number[];
    readonly vertexByPoint: Map<string, number>;
}

function pointKey(point: GridPoint): string {
    return `${point.x},${point.y}`;
}

function assertLod(lod: WorldChunkLod): void {
    if (lod !== 0 && lod !== 1 && lod !== 2) {
        throw new RangeError("surface ground LOD must be 0, 1 or 2");
    }
}

function vertex(builder: GeometryBuilder, point: GridPoint, hexSize: number): number {
    const key = pointKey(point);
    const existing = builder.vertexByPoint.get(key);
    if (existing !== undefined) return existing;
    const u = -0.5 + point.x / SURFACE_SAMPLES_PER_TILE_INTERVAL;
    const v = -0.5 + point.y / SURFACE_SAMPLES_PER_TILE_INTERVAL;
    const world = surfaceToWorld(u, v, hexSize);
    const index = builder.positions.length / 3;
    builder.positions.push(world.x, 0, world.z);
    builder.surfaceCoordinates.push(u, v);
    builder.vertexByPoint.set(key, index);
    return index;
}

function addTriangle(
    builder: GeometryBuilder,
    first: GridPoint,
    second: GridPoint,
    third: GridPoint,
    hexSize: number
): void {
    let firstIndex = vertex(builder, first, hexSize);
    let secondIndex = vertex(builder, second, hexSize);
    let thirdIndex = vertex(builder, third, hexSize);
    const ax = builder.positions[firstIndex * 3];
    const az = builder.positions[firstIndex * 3 + 2];
    const bx = builder.positions[secondIndex * 3];
    const bz = builder.positions[secondIndex * 3 + 2];
    const cx = builder.positions[thirdIndex * 3];
    const cz = builder.positions[thirdIndex * 3 + 2];
    const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (Math.abs(normalY) <= Number.EPSILON) {
        throw new TypeError(`surface ground topology produced a degenerate triangle: ${pointKey(first)} / ${pointKey(second)} / ${pointKey(third)}`);
    }
    if (normalY < 0) {
        [secondIndex, thirdIndex] = [thirdIndex, secondIndex];
    }
    builder.indices.push(firstIndex, secondIndex, thirdIndex);
}

function worldPoint(point: GridPoint, hexSize: number): Readonly<{ x: number; y: number }> {
    const coordinate = surfaceToWorld(
        -0.5 + point.x / SURFACE_SAMPLES_PER_TILE_INTERVAL,
        -0.5 + point.y / SURFACE_SAMPLES_PER_TILE_INTERVAL,
        hexSize
    );
    return { x: coordinate.x, y: coordinate.z };
}

function determinant(
    first: Readonly<{ x: number; y: number }>,
    second: Readonly<{ x: number; y: number }>,
    third: Readonly<{ x: number; y: number }>
): number {
    return (second.x - first.x) * (third.y - first.y)
        - (second.y - first.y) * (third.x - first.x);
}

function pointInOrOnTriangle(
    point: Readonly<{ x: number; y: number }>,
    first: Readonly<{ x: number; y: number }>,
    second: Readonly<{ x: number; y: number }>,
    third: Readonly<{ x: number; y: number }>,
    orientation: number
): boolean {
    const epsilon = 1e-12;
    return orientation * determinant(first, second, point) >= -epsilon
        && orientation * determinant(second, third, point) >= -epsilon
        && orientation * determinant(third, first, point) >= -epsilon;
}

function addQuad(
    builder: GeometryBuilder,
    minX: number,
    minY: number,
    size: number,
    hexSize: number
): void {
    const topLeft = { x: minX, y: minY };
    const topRight = { x: minX + size, y: minY };
    const bottomLeft = { x: minX, y: minY + size };
    const bottomRight = { x: minX + size, y: minY + size };
    // The same southwest-to-northeast diagonal is used for every aligned cell.
    addTriangle(builder, topLeft, bottomLeft, bottomRight, hexSize);
    addTriangle(builder, topLeft, bottomRight, topRight, hexSize);
}

function addUniformGrid(builder: GeometryBuilder, step: number, hexSize: number): void {
    for (let x = 0; x < SURFACE_GROUND_BOUNDARY_INTERVALS; x += step) {
        for (let y = 0; y < SURFACE_GROUND_BOUNDARY_INTERVALS; y += step) {
            addQuad(builder, x, y, step, hexSize);
        }
    }
}

function sidePoints(
    start: GridPoint,
    end: GridPoint,
    step: number
): readonly GridPoint[] {
    const distance = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    if (distance % step !== 0) {
        throw new TypeError("surface transition side is not aligned to its LOD step");
    }
    const count = distance / step;
    const deltaX = count === 0 ? 0 : (end.x - start.x) / count;
    const deltaY = count === 0 ? 0 : (end.y - start.y) / count;
    return Object.freeze(Array.from({ length: count + 1 }, (_, index) => Object.freeze({
        x: start.x + deltaX * index,
        y: start.y + deltaY * index
    })));
}

function stitchSide(
    builder: GeometryBuilder,
    outer: readonly GridPoint[],
    inner: readonly GridPoint[],
    hexSize: number
): void {
    const polygon = [...outer, ...inner.slice().reverse()];
    const projected = polygon.map(point => worldPoint(point, hexSize));
    const logical = polygon.map(point => ({ x: point.x, y: point.y }));
    let signedArea = 0;
    let logicalSignedArea = 0;
    for (let index = 0; index < projected.length; index += 1) {
        const next = projected[(index + 1) % projected.length];
        const logicalNext = logical[(index + 1) % logical.length];
        signedArea += projected[index].x * next.y - projected[index].y * next.x;
        logicalSignedArea += logical[index].x * logicalNext.y - logical[index].y * logicalNext.x;
    }
    if (Math.abs(signedArea) <= Number.EPSILON) {
        throw new TypeError("surface transition side has no area");
    }
    const orientation = Math.sign(signedArea);
    const logicalOrientation = Math.sign(logicalSignedArea);
    const remaining = polygon.map((_, index) => index);
    while (remaining.length > 3) {
        let clipped = false;
        for (let cursor = 0; cursor < remaining.length; cursor += 1) {
            const previous = remaining[(cursor + remaining.length - 1) % remaining.length];
            const current = remaining[cursor];
            const next = remaining[(cursor + 1) % remaining.length];
            if (orientation * determinant(projected[previous], projected[current], projected[next]) <= 1e-12) {
                continue;
            }
            if (logicalOrientation * determinant(logical[previous], logical[current], logical[next]) <= 1e-12) {
                continue;
            }
            let containsPoint = false;
            for (const candidate of remaining) {
                if (candidate === previous || candidate === current || candidate === next) continue;
                if (pointInOrOnTriangle(
                    projected[candidate],
                    projected[previous],
                    projected[current],
                    projected[next],
                    orientation
                )) {
                    containsPoint = true;
                    break;
                }
            }
            if (containsPoint) continue;
            addTriangle(builder, polygon[previous], polygon[current], polygon[next], hexSize);
            remaining.splice(cursor, 1);
            clipped = true;
            break;
        }
        if (!clipped) {
            throw new TypeError("surface transition side cannot be triangulated without overlap");
        }
    }
    addTriangle(
        builder,
        polygon[remaining[0]],
        polygon[remaining[1]],
        polygon[remaining[2]],
        hexSize
    );
}

function addTransitionGrid(builder: GeometryBuilder, step: 2 | 4, hexSize: number): void {
    const maximum = SURFACE_GROUND_BOUNDARY_INTERVALS;
    const innerMaximum = maximum - step;
    for (let x = step; x < innerMaximum; x += step) {
        for (let y = step; y < innerMaximum; y += step) addQuad(builder, x, y, step, hexSize);
    }

    // Stitch one coarse interval at a time. Triangulating an entire side as a
    // single collinear polygon creates legal but extremely long sliver
    // triangles whose interpolated height can cut across the whole chunk.
    for (let offset = step; offset < innerMaximum; offset += step) {
        stitchSide(builder,
            sidePoints({ x: offset, y: 0 }, { x: offset + step, y: 0 }, 1),
            sidePoints({ x: offset, y: step }, { x: offset + step, y: step }, step),
            hexSize);
        stitchSide(builder,
            sidePoints({ x: maximum, y: offset }, { x: maximum, y: offset + step }, 1),
            sidePoints({ x: innerMaximum, y: offset }, { x: innerMaximum, y: offset + step }, step),
            hexSize);
        stitchSide(builder,
            sidePoints({ x: maximum - offset, y: maximum }, { x: maximum - offset - step, y: maximum }, 1),
            sidePoints(
                { x: maximum - offset, y: innerMaximum },
                { x: maximum - offset - step, y: innerMaximum },
                step
            ),
            hexSize);
        stitchSide(builder,
            sidePoints({ x: 0, y: maximum - offset }, { x: 0, y: maximum - offset - step }, 1),
            sidePoints(
                { x: step, y: maximum - offset },
                { x: step, y: maximum - offset - step },
                step
            ),
            hexSize);
    }

    const cornerBoundaryChains = [
        [
            ...sidePoints({ x: step, y: 0 }, { x: 0, y: 0 }, 1),
            ...sidePoints({ x: 0, y: 1 }, { x: 0, y: step }, 1)
        ],
        [
            ...sidePoints({ x: maximum - step, y: 0 }, { x: maximum, y: 0 }, 1),
            ...sidePoints({ x: maximum, y: 1 }, { x: maximum, y: step }, 1)
        ],
        [
            ...sidePoints({ x: maximum, y: maximum - step }, { x: maximum, y: maximum }, 1),
            ...sidePoints({ x: maximum - 1, y: maximum }, { x: innerMaximum, y: maximum }, 1)
        ],
        [
            ...sidePoints({ x: step, y: maximum }, { x: 0, y: maximum }, 1),
            ...sidePoints({ x: 0, y: maximum - 1 }, { x: 0, y: innerMaximum }, 1)
        ]
    ] as const;
    const innerCorners = [
        { x: step, y: step },
        { x: innerMaximum, y: step },
        { x: innerMaximum, y: innerMaximum },
        { x: step, y: innerMaximum }
    ] as const;
    for (let corner = 0; corner < cornerBoundaryChains.length; corner += 1) {
        const boundary = cornerBoundaryChains[corner];
        const inner = innerCorners[corner];
        for (let index = 0; index < boundary.length - 1; index += 1) {
            addTriangle(builder, inner, boundary[index], boundary[index + 1], hexSize);
        }
    }
}

export function createSurfaceGroundGeometry(
    lod: WorldChunkLod,
    hexSize = 1,
    heightScale = 1
): BufferGeometry {
    assertLod(lod);
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface ground hexSize must be finite and positive");
    }
    if (!Number.isFinite(heightScale) || heightScale <= 0) {
        throw new RangeError("surface ground heightScale must be finite and positive");
    }
    const builder: GeometryBuilder = {
        positions: [],
        surfaceCoordinates: [],
        indices: [],
        vertexByPoint: new Map()
    };
    const step = SURFACE_GROUND_LOD_GRID_STEPS[lod];
    if (step === 1) addUniformGrid(builder, step, hexSize);
    else addTransitionGrid(builder, step, hexSize);

    const geometry = new BufferGeometry();
    geometry.name = `surface-ground-lod-${lod}`;
    const position = new BufferAttribute(new Float32Array(builder.positions), 3);
    geometry.setAttribute("position", position);
    geometry.setAttribute("surfaceUv", new BufferAttribute(new Float32Array(builder.surfaceCoordinates), 2));
    geometry.setIndex(new BufferAttribute(new Uint16Array(builder.indices), 1));
    const horizontalBounds = new Box3().setFromBufferAttribute(position);
    geometry.boundingBox = new Box3(
        new Vector3(horizontalBounds.min.x, 0, horizontalBounds.min.z),
        new Vector3(horizontalBounds.max.x, heightScale, horizontalBounds.max.z)
    );
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere = new Sphere());
    const byteLength = geometry.getAttribute("position").array.byteLength
        + geometry.getAttribute("surfaceUv").array.byteLength
        + geometry.getIndex()!.array.byteLength;
    const info: SurfaceGroundGeometryInfo = Object.freeze({
        lod,
        interiorGridStep: step,
        vertexCount: builder.positions.length / 3,
        triangleCount: builder.indices.length / 3,
        byteLength
    });
    geometry.userData.surfaceGround = info;
    return geometry;
}

export function getSurfaceGroundGeometryInfo(geometry: BufferGeometry): SurfaceGroundGeometryInfo {
    const info = geometry?.userData?.surfaceGround as SurfaceGroundGeometryInfo | undefined;
    if (!info || (info.lod !== 0 && info.lod !== 1 && info.lod !== 2)
        || info.interiorGridStep !== SURFACE_GROUND_LOD_GRID_STEPS[info.lod]
        || !Number.isInteger(info.vertexCount) || info.vertexCount <= 0
        || !Number.isInteger(info.triangleCount) || info.triangleCount <= 0
        || !Number.isSafeInteger(info.byteLength) || info.byteLength <= 0) {
        throw new TypeError("buffer geometry is not a valid surface ground geometry");
    }
    return info;
}

export class SurfaceGroundGeometryPool {
    private readonly geometries = new Map<WorldChunkLod, BufferGeometry>();
    private disposed = false;

    constructor(
        private readonly hexSize = 1,
        private readonly heightScale = 1
    ) {
        if (!Number.isFinite(hexSize) || hexSize <= 0) {
            throw new RangeError("surface ground geometry pool hexSize must be finite and positive");
        }
        if (!Number.isFinite(heightScale) || heightScale <= 0) {
            throw new RangeError("surface ground geometry pool heightScale must be finite and positive");
        }
    }

    public get(lod: WorldChunkLod): BufferGeometry {
        if (this.disposed) throw new TypeError("surface ground geometry pool is disposed");
        assertLod(lod);
        let geometry = this.geometries.get(lod);
        if (!geometry) {
            geometry = createSurfaceGroundGeometry(lod, this.hexSize, this.heightScale);
            this.geometries.set(lod, geometry);
        }
        return geometry;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
    }

    public get stats(): Readonly<SurfaceGroundGeometryPoolStats> {
        let vertexCount = 0;
        let triangleCount = 0;
        let byteLength = 0;
        for (const geometry of this.geometries.values()) {
            const info = getSurfaceGroundGeometryInfo(geometry);
            vertexCount += info.vertexCount;
            triangleCount += info.triangleCount;
            byteLength += info.byteLength;
        }
        return Object.freeze({
            state: this.disposed ? "disposed" : "ready",
            geometryCount: this.geometries.size,
            vertexCount,
            triangleCount,
            byteLength
        });
    }
}

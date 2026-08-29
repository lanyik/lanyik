import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    assertCompiledSurfaceField
} from "./CompiledSurfaceField";
import { SURFACE_COMPILE_PROFILE, SURFACE_CORE_TEXELS } from "./SurfaceCompileProfile";

export const COMPILED_WATER_GEOMETRY_FORMAT_VERSION = 1;
export const MAX_COMPILED_WATER_COVERAGE_VERTICES = 16_641;
export const MAX_COMPILED_WATER_COVERAGE_TRIANGLES = 16_384;

export interface CompiledNoWaterGeometry {
    readonly formatVersion: typeof COMPILED_WATER_GEOMETRY_FORMAT_VERSION;
    readonly kind: "none";
}

export interface CompiledFullWaterPatchGeometry {
    readonly formatVersion: typeof COMPILED_WATER_GEOMETRY_FORMAT_VERSION;
    readonly kind: "fullPatch";
}

export interface CompiledWaterCoverageGeometry {
    readonly formatVersion: typeof COMPILED_WATER_GEOMETRY_FORMAT_VERSION;
    readonly kind: "coverage";
    readonly positions: Float32Array;
    readonly surfaceFieldCoordinates: Float32Array;
    readonly indices: Uint16Array;
}

export type CompiledWaterGeometry = CompiledNoWaterGeometry
    | CompiledFullWaterPatchGeometry
    | CompiledWaterCoverageGeometry;

interface CoverageVertex {
    readonly key: string;
    readonly u: number;
    readonly v: number;
    readonly coverage: number;
}

interface MutableCoverageGeometry {
    readonly positions: number[];
    readonly surfaceFieldCoordinates: number[];
    readonly indices: number[];
    readonly vertexByKey: Map<string, number>;
}

function coverageAtGridVertex(field: Readonly<CompiledSurfaceField>, gridX: number, gridY: number): number {
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    const firstX = gridX;
    const firstY = gridY;
    return (
        field.waterCoverage[firstX * size + firstY]
        + field.waterCoverage[(firstX + 1) * size + firstY]
        + field.waterCoverage[firstX * size + firstY + 1]
        + field.waterCoverage[(firstX + 1) * size + firstY + 1]
    ) * 0.25;
}

function gridVertex(field: Readonly<CompiledSurfaceField>, gridX: number, gridY: number): CoverageVertex {
    const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    return {
        key: `g:${gridX}:${gridY}`,
        u: -0.5 + gridX / samplesPerTile,
        v: -0.5 + gridY / samplesPerTile,
        coverage: coverageAtGridVertex(field, gridX, gridY)
    };
}

function crossing(first: Readonly<CoverageVertex>, second: Readonly<CoverageVertex>): CoverageVertex {
    const threshold = SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold;
    const amount = (threshold - first.coverage) / (second.coverage - first.coverage);
    if (amount <= 0) return first;
    if (amount >= 1) return second;
    return {
        key: first.key < second.key ? `e:${first.key}:${second.key}` : `e:${second.key}:${first.key}`,
        u: first.u + (second.u - first.u) * amount,
        v: first.v + (second.v - first.v) * amount,
        coverage: threshold
    };
}

function clippedWetPolygon(vertices: readonly CoverageVertex[]): readonly CoverageVertex[] {
    const threshold = SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold;
    const output: CoverageVertex[] = [];
    let previous = vertices[vertices.length - 1];
    let previousWet = previous.coverage > threshold;
    for (const current of vertices) {
        const currentWet = current.coverage > threshold;
        if (currentWet !== previousWet) output.push(crossing(previous, current));
        if (currentWet) output.push(current);
        previous = current;
        previousWet = currentWet;
    }
    return output;
}

function outputVertex(output: MutableCoverageGeometry, vertex: Readonly<CoverageVertex>): number {
    const existing = output.vertexByKey.get(vertex.key);
    if (existing !== undefined) return existing;
    const index = output.positions.length / 3;
    output.positions.push(vertex.u, 0, vertex.v);
    output.surfaceFieldCoordinates.push(
        (vertex.u + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
            - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels,
        (vertex.v + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
            - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels
    );
    output.vertexByKey.set(vertex.key, index);
    return index;
}

function addCoverageTriangle(
    output: MutableCoverageGeometry,
    first: Readonly<CoverageVertex>,
    second: Readonly<CoverageVertex>,
    third: Readonly<CoverageVertex>
): void {
    const area = (second.u - first.u) * (third.v - first.v)
        - (second.v - first.v) * (third.u - first.u);
    if (Math.abs(area) <= Number.EPSILON) return;
    const firstIndex = outputVertex(output, first);
    const secondIndex = outputVertex(output, second);
    const thirdIndex = outputVertex(output, third);
    if (area < 0) output.indices.push(firstIndex, secondIndex, thirdIndex);
    else output.indices.push(firstIndex, thirdIndex, secondIndex);
}

function addClippedTriangle(
    output: MutableCoverageGeometry,
    first: Readonly<CoverageVertex>,
    second: Readonly<CoverageVertex>,
    third: Readonly<CoverageVertex>
): void {
    const polygon = clippedWetPolygon([first, second, third]);
    for (let index = 1; index < polygon.length - 1; index += 1) {
        addCoverageTriangle(output, polygon[0], polygon[index], polygon[index + 1]);
    }
}

export function assertCompiledWaterGeometry(geometry: Readonly<CompiledWaterGeometry>): void {
    if (!geometry || typeof geometry !== "object"
        || geometry.formatVersion !== COMPILED_WATER_GEOMETRY_FORMAT_VERSION
        || (geometry.kind !== "none" && geometry.kind !== "fullPatch" && geometry.kind !== "coverage")) {
        throw new TypeError("compiled water geometry format or kind is invalid");
    }
    if (geometry.kind !== "coverage") {
        if ("positions" in geometry || "surfaceFieldCoordinates" in geometry || "indices" in geometry) {
            throw new TypeError("marker water geometry cannot carry chunk-local buffers");
        }
        return;
    }
    if (!(geometry.positions instanceof Float32Array)
        || geometry.positions.length === 0 || geometry.positions.length % 3 !== 0
        || !(geometry.surfaceFieldCoordinates instanceof Float32Array)
        || geometry.surfaceFieldCoordinates.length !== geometry.positions.length / 3 * 2
        || !(geometry.indices instanceof Uint16Array)
        || geometry.indices.length === 0 || geometry.indices.length % 3 !== 0
        || geometry.positions.length / 3 > MAX_COMPILED_WATER_COVERAGE_VERTICES
        || geometry.indices.length / 3 > MAX_COMPILED_WATER_COVERAGE_TRIANGLES) {
        throw new TypeError("compiled water coverage arrays exceed their fixed layout or budget");
    }
    const vertexCount = geometry.positions.length / 3;
    const minimum = -0.5;
    const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    const seenCoordinates = new Set<string>();
    for (let index = 0; index < vertexCount; index += 1) {
        const u = geometry.positions[index * 3];
        const y = geometry.positions[index * 3 + 1];
        const v = geometry.positions[index * 3 + 2];
        if (!Number.isFinite(u) || y !== 0 || !Number.isFinite(v)
            || u < minimum || u > maximum || v < minimum || v > maximum) {
            throw new RangeError("compiled water coverage vertex is outside the render chunk core");
        }
        const key = `${u}:${v}`;
        if (seenCoordinates.has(key)) throw new Error("compiled water coverage contains duplicate vertices");
        seenCoordinates.add(key);
        const fieldX = geometry.surfaceFieldCoordinates[index * 2];
        const fieldY = geometry.surfaceFieldCoordinates[index * 2 + 1];
        if (fieldX !== (u + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
                - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels
            || fieldY !== (v + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
                - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels) {
            throw new Error("compiled water field coordinate drifted from its texel-center phase");
        }
    }
    const edgeUses = new Map<string, number>();
    for (let offset = 0; offset < geometry.indices.length; offset += 3) {
        const first = geometry.indices[offset];
        const second = geometry.indices[offset + 1];
        const third = geometry.indices[offset + 2];
        if (first >= vertexCount || second >= vertexCount || third >= vertexCount
            || first === second || second === third || first === third) {
            throw new RangeError("compiled water coverage triangle index is invalid");
        }
        const firstU = geometry.positions[first * 3];
        const firstV = geometry.positions[first * 3 + 2];
        const secondU = geometry.positions[second * 3];
        const secondV = geometry.positions[second * 3 + 2];
        const thirdU = geometry.positions[third * 3];
        const thirdV = geometry.positions[third * 3 + 2];
        const area = (secondU - firstU) * (thirdV - firstV)
            - (secondV - firstV) * (thirdU - firstU);
        if (!(area < 0)) throw new Error("compiled water coverage triangles must face positive world Y");
        for (const [edgeFirst, edgeSecond] of [
            [first, second],
            [second, third],
            [third, first]
        ] as const) {
            const key = edgeFirst < edgeSecond
                ? `${edgeFirst}:${edgeSecond}` : `${edgeSecond}:${edgeFirst}`;
            const uses = (edgeUses.get(key) ?? 0) + 1;
            if (uses > 2) throw new Error("compiled water coverage geometry is non-manifold");
            edgeUses.set(key, uses);
        }
    }
}

export function compileWaterGeometry(field: Readonly<CompiledSurfaceField>): CompiledWaterGeometry {
    assertCompiledSurfaceField(field);
    const gridSize = SURFACE_CORE_TEXELS + 1;
    const vertices = new Array<CoverageVertex>(gridSize * gridSize);
    let allDry = true;
    let allFull = true;
    for (let gridX = 0; gridX < gridSize; gridX += 1) {
        for (let gridY = 0; gridY < gridSize; gridY += 1) {
            const vertex = gridVertex(field, gridX, gridY);
            vertices[gridX * gridSize + gridY] = vertex;
            if (vertex.coverage > SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold) allDry = false;
            if (vertex.coverage < SURFACE_COMPILE_PROFILE.waterFullPatchCoverage) allFull = false;
        }
    }
    if (allDry) return Object.freeze({
        formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
        kind: "none" as const
    });
    if (allFull) return Object.freeze({
        formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
        kind: "fullPatch" as const
    });
    const output: MutableCoverageGeometry = {
        positions: [],
        surfaceFieldCoordinates: [],
        indices: [],
        vertexByKey: new Map()
    };
    for (let gridX = 0; gridX < SURFACE_CORE_TEXELS; gridX += 1) {
        for (let gridY = 0; gridY < SURFACE_CORE_TEXELS; gridY += 1) {
            const bottomLeft = vertices[gridX * gridSize + gridY];
            const topLeft = vertices[gridX * gridSize + gridY + 1];
            const bottomRight = vertices[(gridX + 1) * gridSize + gridY];
            const topRight = vertices[(gridX + 1) * gridSize + gridY + 1];
            addClippedTriangle(output, bottomLeft, topRight, bottomRight);
            addClippedTriangle(output, bottomLeft, topLeft, topRight);
        }
    }
    if (output.indices.length === 0) {
        throw new Error("surface water coverage classification produced no geometry");
    }
    const geometry: CompiledWaterCoverageGeometry = Object.freeze({
        formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
        kind: "coverage",
        positions: new Float32Array(output.positions),
        surfaceFieldCoordinates: new Float32Array(output.surfaceFieldCoordinates),
        indices: new Uint16Array(output.indices)
    });
    assertCompiledWaterGeometry(geometry);
    return geometry;
}

export function compiledWaterGeometryTransferables(
    geometry: Readonly<CompiledWaterGeometry>
): readonly ArrayBuffer[] {
    assertCompiledWaterGeometry(geometry);
    if (geometry.kind !== "coverage") return Object.freeze([]);
    const buffers: ArrayBufferLike[] = [
        geometry.positions.buffer,
        geometry.surfaceFieldCoordinates.buffer,
        geometry.indices.buffer
    ];
    if (buffers.some(buffer => !(buffer instanceof ArrayBuffer))
        || new Set(buffers).size !== buffers.length) {
        throw new TypeError("compiled water geometry requires distinct owned transferable buffers");
    }
    return Object.freeze(buffers as ArrayBuffer[]);
}

if (COMPILED_SURFACE_TEXEL_COUNT !== SURFACE_COMPILE_PROFILE.textureLayerSize ** 2) {
    throw new Error("compiled water geometry and surface field dimensions disagree");
}

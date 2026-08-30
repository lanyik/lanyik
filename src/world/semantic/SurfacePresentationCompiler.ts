import type {
    SurfaceWindowRiver,
    TransferableEffectiveWindow
} from "./EffectiveSurfaceWindow";
import { HydrologyWaterKind } from "./DerivedHydrologyRaster";
import {
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_EFFECTIVE_WINDOW_SIZE,
    SURFACE_INFLUENCE_RADIUS_TILES,
    SURFACE_MAX_VEGETATION_SEEDS,
    SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED,
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_SAMPLES_PER_TILE_INTERVAL,
    SURFACE_VEGETATION_COORDINATE_SCALE,
    SURFACE_WATER_COVERAGE_THRESHOLD
} from "./SurfaceCompileProfile";
import { decodeFloat16 } from "./SurfaceHalfFloat";
import {
    surfaceFieldTexelCoordinate,
    surfaceLatticeIndex,
    surfaceToWorld,
    worldToSurface
} from "./SurfaceLattice";
import type {
    CompiledSurfaceField,
    CompiledWaterBodyRef
} from "./SurfaceCompiler";
import {
    WORLD_VEGETATION_PROFILE_CATALOG,
    type VegetationSpeciesWeight
} from "./WorldSemanticCatalog";
import { HYDROLOGY_COORDINATE_SCALE } from "./WorldSemanticFormat";

export enum CompiledVegetationSpecies {
    Grass = 0,
    Palm = 1,
    Pinia = 2,
    Oak = 3
}

export interface CompiledWaterMesh {
    readonly surfaceUv: Float32Array;
    readonly indices: Uint16Array;
}

export type CompiledWaterGeometry = Readonly<{ readonly kind: "none" }>
    | Readonly<{ readonly kind: "full" }>
    | Readonly<{ readonly kind: "coverage"; readonly mesh: CompiledWaterMesh }>
    | Readonly<{
        readonly kind: "sweep";
        readonly mesh: CompiledWaterMesh;
        readonly featureKeys: readonly string[];
    }>;

export interface CompiledVegetationSeeds {
    readonly tileIndex: Uint16Array;
    readonly candidateIndex: Uint8Array;
    readonly randomKey: Uint32Array;
    readonly surfaceCoordinates: Int16Array;
    readonly groundHeight: Uint16Array;
    readonly species: Uint8Array;
    readonly scale: Uint8Array;
    readonly rotation: Uint16Array;
}

interface ScalarCorner {
    readonly x: number;
    readonly y: number;
    readonly coverage: number;
}

interface WaterMeshBuilder {
    readonly coordinates: number[];
    readonly indices: number[];
    readonly vertexByKey: Map<string, number>;
}

interface SeedRecord {
    readonly tileIndex: number;
    readonly candidateIndex: number;
    readonly randomKey: number;
    readonly localU: number;
    readonly localV: number;
    readonly groundHeight: number;
    readonly species: CompiledVegetationSpecies;
    readonly scale: number;
    readonly rotation: number;
}

const WATER_INTERSECTION_SCALE = 65_536;
const UINT32_SCALE = 0x1_0000_0000;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function fieldSampleIndices(localU: number, localV: number): Readonly<{
    indices: readonly [number, number, number, number];
    amountX: number;
    amountY: number;
}> {
    const coordinate = surfaceFieldTexelCoordinate(localU, localV);
    const x0 = clamp(Math.floor(coordinate.u), 0, SURFACE_FIELD_TEXTURE_SIZE - 2);
    const y0 = clamp(Math.floor(coordinate.v), 0, SURFACE_FIELD_TEXTURE_SIZE - 2);
    return {
        indices: [
            surfaceLatticeIndex(x0, y0),
            surfaceLatticeIndex(x0 + 1, y0),
            surfaceLatticeIndex(x0, y0 + 1),
            surfaceLatticeIndex(x0 + 1, y0 + 1)
        ],
        amountX: clamp(coordinate.u - x0, 0, 1),
        amountY: clamp(coordinate.v - y0, 0, 1)
    };
}

function bilinear(
    values: readonly [number, number, number, number],
    amountX: number,
    amountY: number
): number {
    const top = values[0] + (values[1] - values[0]) * amountX;
    const bottom = values[2] + (values[3] - values[2]) * amountX;
    return top + (bottom - top) * amountY;
}

function sampleField(
    field: CompiledSurfaceField,
    channel: "coverage" | "ground" | "shore",
    localU: number,
    localV: number
): number {
    const sample = fieldSampleIndices(localU, localV);
    const values = sample.indices.map(index => channel === "coverage"
        ? field.waterCoverage[index]
        : decodeFloat16(channel === "ground"
            ? field.groundHeight[index]
            : field.shorelineDistance[index])) as [number, number, number, number];
    return bilinear(values, sample.amountX, sample.amountY);
}

function quantizedWaterVertex(builder: WaterMeshBuilder, x: number, y: number): number {
    const quantizedX = Math.round(x * WATER_INTERSECTION_SCALE);
    const quantizedY = Math.round(y * WATER_INTERSECTION_SCALE);
    const key = `${quantizedX},${quantizedY}`;
    const existing = builder.vertexByKey.get(key);
    if (existing !== undefined) return existing;
    const index = builder.coordinates.length / 2;
    builder.coordinates.push(
        -0.5 + quantizedX / (WATER_INTERSECTION_SCALE * SURFACE_SAMPLES_PER_TILE_INTERVAL),
        -0.5 + quantizedY / (WATER_INTERSECTION_SCALE * SURFACE_SAMPLES_PER_TILE_INTERVAL)
    );
    builder.vertexByKey.set(key, index);
    return index;
}

function waterIntersection(first: ScalarCorner, second: ScalarCorner): ScalarCorner {
    const difference = second.coverage - first.coverage;
    const amount = difference === 0 ? 0.5
        : clamp((SURFACE_WATER_COVERAGE_THRESHOLD - first.coverage) / difference, 0, 1);
    return {
        x: first.x + (second.x - first.x) * amount,
        y: first.y + (second.y - first.y) * amount,
        coverage: SURFACE_WATER_COVERAGE_THRESHOLD
    };
}

function clipTriangleToWater(corners: readonly ScalarCorner[]): readonly ScalarCorner[] {
    const output: ScalarCorner[] = [];
    for (let index = 0; index < corners.length; index += 1) {
        const current = corners[index];
        const next = corners[(index + 1) % corners.length];
        const currentInside = current.coverage >= SURFACE_WATER_COVERAGE_THRESHOLD;
        const nextInside = next.coverage >= SURFACE_WATER_COVERAGE_THRESHOLD;
        if (currentInside) output.push(current);
        if (currentInside !== nextInside) output.push(waterIntersection(current, next));
    }
    return output;
}

function addWaterPolygon(builder: WaterMeshBuilder, polygon: readonly ScalarCorner[]): void {
    if (polygon.length < 3) return;
    const first = quantizedWaterVertex(builder, polygon[0].x, polygon[0].y);
    for (let index = 1; index < polygon.length - 1; index += 1) {
        const second = quantizedWaterVertex(builder, polygon[index].x, polygon[index].y);
        const third = quantizedWaterVertex(builder, polygon[index + 1].x, polygon[index + 1].y);
        if (first !== second && second !== third && first !== third) {
            builder.indices.push(first, second, third);
        }
    }
}

function coverageAtGridPoint(field: CompiledSurfaceField, x: number, y: number): number {
    return sampleField(
        field,
        "coverage",
        -0.5 + x / SURFACE_SAMPLES_PER_TILE_INTERVAL,
        -0.5 + y / SURFACE_SAMPLES_PER_TILE_INTERVAL
    );
}

function compileCoverageMesh(field: CompiledSurfaceField): CompiledWaterMesh {
    const builder: WaterMeshBuilder = { coordinates: [], indices: [], vertexByKey: new Map() };
    const intervals = SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
    const row = Array.from({ length: intervals + 1 }, () => 0);
    const nextRow = Array.from({ length: intervals + 1 }, () => 0);
    for (let y = 0; y <= intervals; y += 1) row[y] = coverageAtGridPoint(field, 0, y);
    for (let x = 0; x < intervals; x += 1) {
        for (let y = 0; y <= intervals; y += 1) nextRow[y] = coverageAtGridPoint(field, x + 1, y);
        for (let y = 0; y < intervals; y += 1) {
            const topLeft = { x, y, coverage: row[y] };
            const bottomLeft = { x, y: y + 1, coverage: row[y + 1] };
            const topRight = { x: x + 1, y, coverage: nextRow[y] };
            const bottomRight = { x: x + 1, y: y + 1, coverage: nextRow[y + 1] };
            addWaterPolygon(builder, clipTriangleToWater([topLeft, bottomLeft, bottomRight]));
            addWaterPolygon(builder, clipTriangleToWater([topLeft, bottomRight, topRight]));
        }
        for (let y = 0; y <= intervals; y += 1) row[y] = nextRow[y];
    }
    if (builder.coordinates.length / 2 > 65_535) {
        throw new RangeError("compiled water coverage mesh exceeds Uint16 vertex addressing");
    }
    return Object.freeze({
        surfaceUv: new Float32Array(builder.coordinates),
        indices: new Uint16Array(builder.indices)
    });
}

function maximumRiverWidth(river: SurfaceWindowRiver): number {
    let maximum = 0;
    for (const width of river.widthProfile) maximum = Math.max(maximum, width);
    return maximum;
}

function riverPointWidth(river: SurfaceWindowRiver, index: number): number {
    return river.widthProfile[index] / HYDROLOGY_COORDINATE_SCALE * Math.sqrt(3) / 2;
}

function compileSweepMesh(rivers: readonly SurfaceWindowRiver[]): Readonly<{
    mesh: CompiledWaterMesh;
    featureKeys: readonly string[];
}> {
    const builder: WaterMeshBuilder = { coordinates: [], indices: [], vertexByKey: new Map() };
    const featureKeys: string[] = [];
    for (const river of rivers) {
        if (maximumRiverWidth(river) > SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED) continue;
        featureKeys.push(river.featureKey);
        const pointCount = river.controlPoints.length / 2;
        const left: number[] = [];
        const right: number[] = [];
        for (let index = 0; index < pointCount; index += 1) {
            const current = surfaceToWorld(
                river.controlPoints[index * 2],
                river.controlPoints[index * 2 + 1]
            );
            const previous = surfaceToWorld(
                river.controlPoints[Math.max(0, index - 1) * 2],
                river.controlPoints[Math.max(0, index - 1) * 2 + 1]
            );
            const next = surfaceToWorld(
                river.controlPoints[Math.min(pointCount - 1, index + 1) * 2],
                river.controlPoints[Math.min(pointCount - 1, index + 1) * 2 + 1]
            );
            let tangentX = next.x - previous.x;
            let tangentZ = next.z - previous.z;
            const length = Math.hypot(tangentX, tangentZ);
            if (!(length > 0)) throw new TypeError("narrow river sweep contains a zero-length join");
            tangentX /= length;
            tangentZ /= length;
            const halfWidth = riverPointWidth(river, index);
            const leftSurface = worldToSurface(
                current.x - tangentZ * halfWidth,
                current.z + tangentX * halfWidth
            );
            const rightSurface = worldToSurface(
                current.x + tangentZ * halfWidth,
                current.z - tangentX * halfWidth
            );
            left.push(quantizedWaterVertex(
                builder,
                (leftSurface.u + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL,
                (leftSurface.v + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL
            ));
            right.push(quantizedWaterVertex(
                builder,
                (rightSurface.u + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL,
                (rightSurface.v + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL
            ));
        }
        for (let index = 0; index < pointCount - 1; index += 1) {
            if (left[index] === right[index] || left[index + 1] === right[index + 1]) continue;
            builder.indices.push(
                left[index], right[index], right[index + 1],
                left[index], right[index + 1], left[index + 1]
            );
        }
    }
    if (builder.coordinates.length / 2 > 65_535) {
        throw new RangeError("compiled narrow river sweep exceeds Uint16 vertex addressing");
    }
    return Object.freeze({
        mesh: Object.freeze({
            surfaceUv: new Float32Array(builder.coordinates),
            indices: new Uint16Array(builder.indices)
        }),
        featureKeys: Object.freeze(featureKeys)
    });
}

function coreCoverageState(field: CompiledSurfaceField): Readonly<{ any: boolean; full: boolean }> {
    const intervals = SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
    let any = false;
    let full = true;
    for (let x = 0; x <= intervals; x += 1) {
        for (let y = 0; y <= intervals; y += 1) {
            const coverage = coverageAtGridPoint(field, x, y);
            if (coverage >= SURFACE_WATER_COVERAGE_THRESHOLD) any = true;
            else full = false;
        }
    }
    return { any, full };
}

export function compileWaterGeometry(
    window: TransferableEffectiveWindow,
    field: CompiledSurfaceField,
    waterBodies: readonly CompiledWaterBodyRef[]
): CompiledWaterGeometry {
    const state = coreCoverageState(field);
    if (!state.any) return Object.freeze({ kind: "none" as const });
    if (state.full) return Object.freeze({ kind: "full" as const });
    const riverByBody = new Map<string, SurfaceWindowRiver[]>();
    for (const river of window.rivers) {
        const values = riverByBody.get(river.bodyId) ?? [];
        values.push(river);
        riverByBody.set(river.bodyId, values);
    }
    const narrowOnly = waterBodies.length > 0 && waterBodies.every(body => {
        const rivers = riverByBody.get(body.bodyId);
        return body.kind === "river" && rivers?.length
            && rivers.every(river => maximumRiverWidth(river) <= SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED);
    });
    if (narrowOnly && window.rivers.length === 1) {
        const sweep = compileSweepMesh(window.rivers);
        if (sweep.mesh.indices.length === 0) {
            throw new TypeError("narrow-river surface field produced no sweep geometry");
        }
        return Object.freeze({ kind: "sweep" as const, ...sweep });
    }
    const mesh = compileCoverageMesh(field);
    if (mesh.indices.length === 0) {
        throw new TypeError("wet surface field produced no coverage geometry");
    }
    return Object.freeze({ kind: "coverage" as const, mesh });
}

function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function mixHash(seed: number, value: number): number {
    let mixed = (seed ^ value) >>> 0;
    mixed = Math.imul(mixed ^ mixed >>> 16, 0x7feb352d);
    mixed = Math.imul(mixed ^ mixed >>> 15, 0x846ca68b);
    return (mixed ^ mixed >>> 16) >>> 0;
}

function mixSafeCoordinate(seed: number, coordinate: number): number {
    const magnitude = Math.abs(coordinate);
    const low = magnitude % UINT32_SCALE;
    const high = Math.floor(magnitude / UINT32_SCALE);
    let hash = mixHash(seed, low);
    hash = mixHash(hash, high);
    return mixHash(hash, coordinate < 0 ? 0xffff_ffff : 0);
}

function candidateHash(
    worldHash: number,
    globalX: number,
    globalY: number,
    candidate: number
): number {
    let hash = mixSafeCoordinate(worldHash, globalX);
    hash = mixSafeCoordinate(hash, globalY);
    return mixHash(hash, candidate);
}

function unitRandom(value: number): number {
    return value / UINT32_SCALE;
}

function speciesForProfile(
    weights: readonly VegetationSpeciesWeight[],
    random: number
): CompiledVegetationSpecies {
    let cursor = Math.floor(random * 255);
    for (const value of weights) {
        if (cursor < value.weight) {
            return value.species === "palm" ? CompiledVegetationSpecies.Palm
                : value.species === "pinia" ? CompiledVegetationSpecies.Pinia
                    : CompiledVegetationSpecies.Oak;
        }
        cursor -= value.weight;
    }
    return CompiledVegetationSpecies.Oak;
}

function pushSeed(
    output: SeedRecord[],
    field: CompiledSurfaceField,
    window: TransferableEffectiveWindow,
    tileX: number,
    tileY: number,
    candidateIndex: number,
    tree: boolean,
    worldHash: number
): void {
    const globalX = window.key.chunkX * SURFACE_RENDER_CHUNK_SIZE + tileX;
    const globalY = window.key.chunkY * SURFACE_RENDER_CHUNK_SIZE + tileY;
    if (!Number.isSafeInteger(globalX) || !Number.isSafeInteger(globalY)) {
        throw new RangeError("vegetation candidate world coordinates must be safe integers");
    }
    const randomKey = candidateHash(worldHash, globalX, globalY, candidateIndex);
    const randomX = mixHash(randomKey, 0xa341316c);
    const randomY = mixHash(randomKey, 0xc8013ea4);
    const localU = tileX + (unitRandom(randomX) - 0.5) * 0.84;
    const localV = tileY + (unitRandom(randomY) - 0.5) * 0.84;
    const coverage = sampleField(field, "coverage", localU, localV) / 255;
    if (coverage > 0.125) return;
    const groundHeight = sampleField(field, "ground", localU, localV);
    const groundU = sampleField(field, "ground", localU + 0.25, localV)
        - sampleField(field, "ground", localU - 0.25, localV);
    const groundV = sampleField(field, "ground", localU, localV + 0.25)
        - sampleField(field, "ground", localU, localV - 0.25);
    const slope = Math.hypot(groundU, groundV) * 2;
    if (slope > (tree ? 0.18 : 0.35)) return;
    const shore = sampleField(field, "shore", localU, localV);
    const shoreFactor = clamp((shore + 0.1) / 0.9, 0, 1);
    const semanticIndex = (tileX + SURFACE_INFLUENCE_RADIUS_TILES)
        * SURFACE_EFFECTIVE_WINDOW_SIZE
        + tileY + SURFACE_INFLUENCE_RADIUS_TILES;
    const density = window.vegetationDensity[semanticIndex] / 255;
    const acceptance = density * shoreFactor * (tree ? 0.42 : 1);
    if (unitRandom(mixHash(randomKey, 0xad90777d)) >= acceptance) return;
    const profileIndex = window.vegetationProfile[semanticIndex];
    const profile = WORLD_VEGETATION_PROFILE_CATALOG[profileIndex];
    if (!profile || profile.species.length === 0) return;
    output.push({
        tileIndex: tileX * SURFACE_RENDER_CHUNK_SIZE + tileY,
        candidateIndex,
        randomKey,
        localU,
        localV,
        groundHeight,
        species: tree
            ? speciesForProfile(profile.species, unitRandom(mixHash(randomKey, 0x9e3779b9)))
            : CompiledVegetationSpecies.Grass,
        scale: 160 + (mixHash(randomKey, 0x3c6ef372) & 95),
        rotation: mixHash(randomKey, 0xdaa66d2b) & 0xffff
    });
}

export function compileVegetationSeeds(
    window: TransferableEffectiveWindow,
    field: CompiledSurfaceField
): CompiledVegetationSeeds {
    const records: SeedRecord[] = [];
    const worldHash = hashString(window.worldIdentity);
    for (let tileX = window.validBounds.minX; tileX < window.validBounds.maxXExclusive; tileX += 1) {
        for (let tileY = window.validBounds.minY; tileY < window.validBounds.maxYExclusive; tileY += 1) {
            for (let candidate = 0; candidate < 8; candidate += 1) {
                pushSeed(records, field, window, tileX, tileY, candidate, false, worldHash);
            }
            for (let candidate = 8; candidate < 10; candidate += 1) {
                pushSeed(records, field, window, tileX, tileY, candidate, true, worldHash);
            }
        }
    }
    if (records.length > SURFACE_MAX_VEGETATION_SEEDS) {
        throw new RangeError("compiled surface exceeds the vegetation seed budget");
    }
    records.sort((first, second) => first.tileIndex - second.tileIndex
        || first.candidateIndex - second.candidateIndex);
    const count = records.length;
    const tileIndex = new Uint16Array(count);
    const candidateIndex = new Uint8Array(count);
    const randomKey = new Uint32Array(count);
    const surfaceCoordinates = new Int16Array(count * 2);
    const groundHeight = new Uint16Array(count);
    const species = new Uint8Array(count);
    const scale = new Uint8Array(count);
    const rotation = new Uint16Array(count);
    for (let index = 0; index < count; index += 1) {
        const record = records[index];
        tileIndex[index] = record.tileIndex;
        candidateIndex[index] = record.candidateIndex;
        randomKey[index] = record.randomKey;
        surfaceCoordinates[index * 2] = Math.round(record.localU * SURFACE_VEGETATION_COORDINATE_SCALE);
        surfaceCoordinates[index * 2 + 1] = Math.round(record.localV * SURFACE_VEGETATION_COORDINATE_SCALE);
        groundHeight[index] = Math.max(0, Math.min(0xffff, Math.round(record.groundHeight * 65_535)));
        species[index] = record.species;
        scale[index] = record.scale;
        rotation[index] = record.rotation;
    }
    return Object.freeze({
        tileIndex,
        candidateIndex,
        randomKey,
        surfaceCoordinates,
        groundHeight,
        species,
        scale,
        rotation
    });
}

export function waterGeometryByteLength(value: CompiledWaterGeometry): number {
    return value.kind === "coverage" || value.kind === "sweep"
        ? value.mesh.surfaceUv.byteLength + value.mesh.indices.byteLength : 0;
}

export function vegetationSeedsByteLength(value: CompiledVegetationSeeds): number {
    return value.tileIndex.byteLength
        + value.candidateIndex.byteLength
        + value.randomKey.byteLength
        + value.surfaceCoordinates.byteLength
        + value.groundHeight.byteLength
        + value.species.byteLength
        + value.scale.byteLength
        + value.rotation.byteLength;
}

export function surfacePresentationTransferables(
    waterGeometry: CompiledWaterGeometry,
    vegetationSeeds: CompiledVegetationSeeds
): readonly ArrayBuffer[] {
    const result: ArrayBuffer[] = [];
    if (waterGeometry.kind === "coverage" || waterGeometry.kind === "sweep") {
        result.push(waterGeometry.mesh.surfaceUv.buffer as ArrayBuffer);
        result.push(waterGeometry.mesh.indices.buffer as ArrayBuffer);
    }
    result.push(
        vegetationSeeds.tileIndex.buffer as ArrayBuffer,
        vegetationSeeds.candidateIndex.buffer as ArrayBuffer,
        vegetationSeeds.randomKey.buffer as ArrayBuffer,
        vegetationSeeds.surfaceCoordinates.buffer as ArrayBuffer,
        vegetationSeeds.groundHeight.buffer as ArrayBuffer,
        vegetationSeeds.species.buffer as ArrayBuffer,
        vegetationSeeds.scale.buffer as ArrayBuffer,
        vegetationSeeds.rotation.buffer as ArrayBuffer
    );
    return Object.freeze(result);
}

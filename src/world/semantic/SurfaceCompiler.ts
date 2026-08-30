import {
    assertTransferableEffectiveWindow,
    SurfaceWindowLake,
    SurfaceWindowRiver,
    SurfaceWindowValidBounds,
    TransferableEffectiveWindow
} from "./EffectiveSurfaceWindow";
import { HydrologyWaterKind } from "./DerivedHydrologyRaster";
import { HYDROLOGY_COORDINATE_SCALE } from "./WorldSemanticFormat";
import { HYDROLOGY_SEA_LEVEL, OCEAN_BODY_ID } from "./MacroDrainageGraph";
import { SubstrateClass, WORLD_SUBSTRATE_CATALOG } from "./WorldSemanticCatalog";
import {
    SURFACE_COMPILE_PROFILE_VERSION,
    SURFACE_COMPILER_REVISION,
    SURFACE_EFFECTIVE_WINDOW_SIZE,
    SURFACE_FIELD_TEXEL_COUNT,
    SURFACE_FIELD_GUTTER_TEXELS,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_INFLUENCE_RADIUS_TILES,
    SURFACE_MAX_WATER_BODY_COUNT,
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_SAMPLES_PER_TILE_INTERVAL
} from "./SurfaceCompileProfile";
import {
    surfaceFieldTexelCoordinate,
    surfaceLatticeIndex,
    surfaceLatticeTexelLocalCoordinate,
    surfaceToWorld
} from "./SurfaceLattice";
import { decodeFloat16, encodeFloat16 } from "./SurfaceHalfFloat";
import {
    assertSurfaceDependencyKey,
    cloneSurfaceDependencyKey,
    RenderChunkKey,
    SurfaceDependencyKey
} from "./SurfaceDependency";

export interface CompiledWaterBodyRef {
    readonly bodyId: string;
    readonly kind: "ocean" | "lake" | "river";
}

export interface CompiledSurfaceField {
    readonly groundHeight: Uint16Array;
    readonly materialWeights: Uint8Array;
    readonly waterLevel: Uint16Array;
    readonly waterDepth: Uint16Array;
    readonly shorelineDistance: Uint16Array;
    readonly flow: Int8Array;
    readonly waterCoverage: Uint8Array;
    readonly waterKind: Uint8Array;
    readonly waterProfile: Uint8Array;
    readonly waterBodyIndex: Uint8Array;
}

export interface CompiledSurfaceBounds {
    readonly validTiles: SurfaceWindowValidBounds;
    readonly minGroundHeight: number;
    readonly maxGroundHeight: number;
    readonly hasWater: boolean;
    readonly minWaterLevel: number;
    readonly maxWaterLevel: number;
}

export interface CompiledSurfaceChunk {
    readonly key: RenderChunkKey;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly effectiveRevision: number;
    readonly bounds: CompiledSurfaceBounds;
    readonly field: CompiledSurfaceField;
    readonly waterBodies: readonly CompiledWaterBodyRef[];
    readonly byteLength: number;
    readonly contentChecksum: string;
}

export interface CompiledSurfaceSample {
    readonly groundHeight: number;
    readonly materialWeights: readonly [number, number, number, number];
    readonly waterLevel: number;
    readonly waterDepth: number;
    readonly shorelineDistance: number;
    readonly flow: readonly [number, number];
    readonly waterCoverage: number;
    readonly waterKind: HydrologyWaterKind;
    readonly waterProfile: number;
    readonly waterBody: CompiledWaterBodyRef | undefined;
}

interface PreparedRiver extends SurfaceWindowRiver {
    readonly worldPoints: Float64Array;
}

interface PreparedLake extends SurfaceWindowLake {
    readonly worldPoints: Float64Array;
}

interface WaterCandidate {
    readonly coverage: number;
    readonly rank: number;
    readonly kind: HydrologyWaterKind;
    readonly bodyId: string;
    readonly profileIndex: number;
    readonly level: number;
    readonly flowX: number;
    readonly flowY: number;
}

const SQRT_THREE = Math.sqrt(3);
const TEXEL_ANTIALIAS_DISTANCE = SQRT_THREE / SURFACE_SAMPLES_PER_TILE_INTERVAL / 2;
const SHORE_DISTANCE_LIMIT = SURFACE_INFLUENCE_RADIUS_TILES;
const SHORE_SEARCH_TEXELS = Math.ceil(
    SHORE_DISTANCE_LIMIT / (1.5 / SURFACE_SAMPLES_PER_TILE_INTERVAL)
) + 2;
const SURFACE_WORK_MARGIN_TEXELS = SHORE_SEARCH_TEXELS;
const SURFACE_WORK_SIZE = SURFACE_FIELD_TEXTURE_SIZE + SURFACE_WORK_MARGIN_TEXELS * 2;
const SURFACE_WORK_TEXEL_COUNT = SURFACE_WORK_SIZE * SURFACE_WORK_SIZE;
const validatedCompiledChunks = new WeakSet<CompiledSurfaceChunk>();

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function windowIndex(x: number, y: number): number {
    return x * SURFACE_EFFECTIVE_WINDOW_SIZE + y;
}

function gridIndex(x: number, y: number, size: number): number {
    return x * size + y;
}

function workLocalCoordinate(x: number, y: number): Readonly<{ u: number; v: number }> {
    return {
        u: -0.5 + (x - SURFACE_WORK_MARGIN_TEXELS - SURFACE_FIELD_GUTTER_TEXELS + 0.5)
            / SURFACE_SAMPLES_PER_TILE_INTERVAL,
        v: -0.5 + (y - SURFACE_WORK_MARGIN_TEXELS - SURFACE_FIELD_GUTTER_TEXELS + 0.5)
            / SURFACE_SAMPLES_PER_TILE_INTERVAL
    };
}

function sampleWindowChannel(
    values: Uint8Array | Uint16Array,
    localU: number,
    localV: number,
    channels: number,
    channel: number
): number {
    const sampleU = clamp(localU, -SURFACE_INFLUENCE_RADIUS_TILES,
        SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1);
    const sampleV = clamp(localV, -SURFACE_INFLUENCE_RADIUS_TILES,
        SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1);
    let tileX = Math.floor(sampleU);
    let tileY = Math.floor(sampleV);
    let amountX = sampleU - tileX;
    let amountY = sampleV - tileY;
    if (tileX === SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1) {
        tileX -= 1;
        amountX = 1;
    }
    if (tileY === SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1) {
        tileY -= 1;
        amountY = 1;
    }
    const x0 = tileX + SURFACE_INFLUENCE_RADIUS_TILES;
    const y0 = tileY + SURFACE_INFLUENCE_RADIUS_TILES;
    const first = values[windowIndex(x0, y0) * channels + channel];
    const second = values[windowIndex(x0 + 1, y0) * channels + channel];
    const third = values[windowIndex(x0, y0 + 1) * channels + channel];
    const fourth = values[windowIndex(x0 + 1, y0 + 1) * channels + channel];
    const top = first + (second - first) * amountX;
    const bottom = third + (fourth - third) * amountX;
    return top + (bottom - top) * amountY;
}

function nearestWindowIndex(localU: number, localV: number): number {
    const x = Math.floor(localU + 0.5) + SURFACE_INFLUENCE_RADIUS_TILES;
    const y = Math.floor(localV + 0.5) + SURFACE_INFLUENCE_RADIUS_TILES;
    if (x < 0 || y < 0 || x >= SURFACE_EFFECTIVE_WINDOW_SIZE || y >= SURFACE_EFFECTIVE_WINDOW_SIZE) {
        throw new RangeError("surface compiler nearest semantic sample exceeds the effective halo");
    }
    return windowIndex(x, y);
}

function preparePoints(points: Float64Array): Float64Array {
    const result = new Float64Array(points.length);
    for (let index = 0; index < points.length; index += 2) {
        const world = surfaceToWorld(points[index], points[index + 1]);
        result[index] = world.x;
        result[index + 1] = world.z;
    }
    return result;
}

function prepareRivers(values: readonly SurfaceWindowRiver[]): readonly PreparedRiver[] {
    return values.map(value => Object.freeze({ ...value, worldPoints: preparePoints(value.controlPoints) }));
}

function prepareLakes(values: readonly SurfaceWindowLake[]): readonly PreparedLake[] {
    return values.map(value => Object.freeze({ ...value, worldPoints: preparePoints(value.boundaryPoints) }));
}

function coverageForSignedDistance(signedDistance: number): number {
    return clamp(Math.floor((0.5 + signedDistance / (TEXEL_ANTIALIAS_DISTANCE * 2)) * 255 + 0.5), 0, 255);
}

function riverCandidate(x: number, z: number, river: PreparedRiver): WaterCandidate | undefined {
    let best: WaterCandidate | undefined;
    let bestSignedDistance = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < river.worldPoints.length - 2; index += 2) {
        const startX = river.worldPoints[index];
        const startZ = river.worldPoints[index + 1];
        const dx = river.worldPoints[index + 2] - startX;
        const dz = river.worldPoints[index + 3] - startZ;
        const lengthSquared = dx * dx + dz * dz;
        if (lengthSquared === 0) continue;
        const amount = clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1);
        const nearestX = startX + dx * amount;
        const nearestZ = startZ + dz * amount;
        const distance = Math.hypot(x - nearestX, z - nearestZ);
        const width = river.widthProfile[index / 2]
            + (river.widthProfile[index / 2 + 1] - river.widthProfile[index / 2]) * amount;
        const halfWidth = width / HYDROLOGY_COORDINATE_SCALE * SQRT_THREE / 2;
        const signedDistance = halfWidth - distance;
        if (signedDistance < bestSignedDistance) continue;
        const length = Math.sqrt(lengthSquared);
        bestSignedDistance = signedDistance;
        best = {
            coverage: coverageForSignedDistance(signedDistance),
            rank: 3,
            kind: HydrologyWaterKind.River,
            bodyId: river.bodyId,
            profileIndex: river.profileIndex,
            level: (river.levelProfile[index / 2]
                + (river.levelProfile[index / 2 + 1] - river.levelProfile[index / 2]) * amount) / 65535,
            flowX: dx / length,
            flowY: dz / length
        };
    }
    return best?.coverage ? best : undefined;
}

function pointInPolygon(x: number, z: number, points: Float64Array): boolean {
    let inside = false;
    for (let current = 0, previous = points.length - 2;
        current < points.length;
        previous = current, current += 2) {
        const currentX = points[current];
        const currentZ = points[current + 1];
        const previousX = points[previous];
        const previousZ = points[previous + 1];
        const crosses = (currentZ > z) !== (previousZ > z)
            && x < (previousX - currentX) * (z - currentZ) / (previousZ - currentZ) + currentX;
        if (crosses) inside = !inside;
    }
    return inside;
}

function polygonDistance(x: number, z: number, points: Float64Array): number {
    let bestSquared = Number.POSITIVE_INFINITY;
    for (let current = 0, previous = points.length - 2;
        current < points.length;
        previous = current, current += 2) {
        const startX = points[previous];
        const startZ = points[previous + 1];
        const dx = points[current] - startX;
        const dz = points[current + 1] - startZ;
        const lengthSquared = dx * dx + dz * dz;
        const amount = lengthSquared === 0 ? 0
            : clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1);
        const offsetX = x - (startX + dx * amount);
        const offsetZ = z - (startZ + dz * amount);
        bestSquared = Math.min(bestSquared, offsetX * offsetX + offsetZ * offsetZ);
    }
    return Math.sqrt(bestSquared);
}

function surfaceLakeCandidate(x: number, z: number, lake: PreparedLake): WaterCandidate | undefined {
    const distance = polygonDistance(x, z, lake.worldPoints);
    const signedDistance = pointInPolygon(x, z, lake.worldPoints) ? distance : -distance;
    const coverage = coverageForSignedDistance(signedDistance);
    if (coverage === 0) return undefined;
    return {
        coverage,
        rank: 2,
        kind: HydrologyWaterKind.Lake,
        bodyId: lake.bodyId,
        profileIndex: lake.profileIndex,
        level: lake.level / 65535,
        flowX: 0,
        flowY: 0
    };
}

function candidateWins(candidate: WaterCandidate, current: WaterCandidate | undefined): boolean {
    return !current || candidate.coverage > current.coverage
        || candidate.coverage === current.coverage && (candidate.rank > current.rank
            || candidate.rank === current.rank && candidate.bodyId < current.bodyId);
}

function fieldGradient(
    ground: Float64Array,
    worldX: Float64Array,
    worldZ: Float64Array,
    physicalX: number,
    physicalY: number,
    size: number
): number {
    const leftX = Math.max(0, physicalX - 1);
    const rightX = Math.min(size - 1, physicalX + 1);
    const topY = Math.max(0, physicalY - 1);
    const bottomY = Math.min(size - 1, physicalY + 1);
    const left = gridIndex(leftX, physicalY, size);
    const right = gridIndex(rightX, physicalY, size);
    const top = gridIndex(physicalX, topY, size);
    const bottom = gridIndex(physicalX, bottomY, size);
    const horizontalDistance = Math.hypot(worldX[right] - worldX[left], worldZ[right] - worldZ[left]);
    const verticalDistance = Math.hypot(worldX[bottom] - worldX[top], worldZ[bottom] - worldZ[top]);
    const horizontal = horizontalDistance > 0 ? (ground[right] - ground[left]) / horizontalDistance : 0;
    const vertical = verticalDistance > 0 ? (ground[bottom] - ground[top]) / verticalDistance : 0;
    return Math.hypot(horizontal, vertical);
}

function oceanCandidate(groundHeight: number, slope: number): WaterCandidate | undefined {
    const seaLevel = HYDROLOGY_SEA_LEVEL / 65535;
    const difference = seaLevel - groundHeight;
    let coverage: number;
    if (difference === 0) coverage = 127;
    else if (slope <= 1e-9) coverage = difference > 0 ? 255 : 0;
    else coverage = coverageForSignedDistance(difference / slope);
    if (coverage === 0) return undefined;
    return {
        coverage,
        rank: 1,
        kind: HydrologyWaterKind.Ocean,
        bodyId: OCEAN_BODY_ID,
        profileIndex: 0,
        level: seaLevel,
        flowX: 0,
        flowY: 0
    };
}

function computeShoreDistances(
    coverage: Uint8Array,
    worldX: Float64Array,
    worldZ: Float64Array,
    size: number
): Float64Array {
    const wet = new Uint8Array(size * size);
    const boundaryByX: number[][] = Array.from(
        { length: size },
        () => [] as number[]
    );
    for (let index = 0; index < wet.length; index += 1) wet[index] = coverage[index] >= 128 ? 1 : 0;
    for (let x = 0; x < size; x += 1) {
        for (let y = 0; y < size; y += 1) {
            const index = gridIndex(x, y, size);
            let boundary = false;
            if (x > 0 && wet[gridIndex(x - 1, y, size)] !== wet[index]) boundary = true;
            if (x + 1 < size && wet[gridIndex(x + 1, y, size)] !== wet[index]) boundary = true;
            if (y > 0 && wet[gridIndex(x, y - 1, size)] !== wet[index]) boundary = true;
            if (y + 1 < size && wet[gridIndex(x, y + 1, size)] !== wet[index]) boundary = true;
            if (boundary) boundaryByX[x].push(y);
        }
    }
    const result = new Float64Array(size * size);
    for (let x = 0; x < size; x += 1) {
        for (let y = 0; y < size; y += 1) {
            const index = gridIndex(x, y, size);
            let bestSquared = Number.POSITIVE_INFINITY;
            const minX = Math.max(0, x - SHORE_SEARCH_TEXELS);
            const maxX = Math.min(size - 1, x + SHORE_SEARCH_TEXELS);
            for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
                for (const candidateY of boundaryByX[candidateX]) {
                    if (Math.abs(candidateY - y) > SHORE_SEARCH_TEXELS) continue;
                    const candidateIndex = gridIndex(candidateX, candidateY, size);
                    if (wet[candidateIndex] === wet[index]) continue;
                    const dx = worldX[candidateIndex] - worldX[index];
                    const dz = worldZ[candidateIndex] - worldZ[index];
                    bestSquared = Math.min(bestSquared, dx * dx + dz * dz);
                }
            }
            const distance = Number.isFinite(bestSquared)
                ? Math.max(0, Math.sqrt(bestSquared) - TEXEL_ANTIALIAS_DISTANCE)
                : SHORE_DISTANCE_LIMIT;
            result[index] = (wet[index] ? -1 : 1) * Math.min(SHORE_DISTANCE_LIMIT, distance);
        }
    }
    return result;
}

function quantizeWeights(values: readonly number[]): readonly [number, number, number, number] {
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (!(total > 0)) return [255, 0, 0, 0];
    const scaled = values.map(value => Math.max(0, value) / total * 255);
    const quantized = scaled.map(Math.floor);
    let remaining = 255 - quantized.reduce((sum, value) => sum + value, 0);
    const order = scaled.map((value, index) => ({ index, remainder: value - quantized[index] }))
        .sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    for (let index = 0; index < remaining; index += 1) quantized[order[index].index] += 1;
    return quantized as unknown as readonly [number, number, number, number];
}

function materialWeights(
    window: TransferableEffectiveWindow,
    localU: number,
    localV: number,
    slope: number,
    shoreDistance: number
): readonly [number, number, number, number] {
    const values = [0, 1, 2, 3].map(channel =>
        sampleWindowChannel(window.biomeWeights, localU, localV, 4, channel) / 255);
    const climateTemperature = sampleWindowChannel(window.climate, localU, localV, 2, 0) / 255;
    const climateMoisture = sampleWindowChannel(window.climate, localU, localV, 2, 1) / 255;
    const substrate = window.substrateClass[nearestWindowIndex(localU, localV)] as SubstrateClass;
    if (substrate < 0 || substrate >= WORLD_SUBSTRATE_CATALOG.length) {
        throw new RangeError("surface compiler encountered an invalid substrate class");
    }
    if (substrate === SubstrateClass.Sediment) values[1] += 0.2;
    else if (substrate === SubstrateClass.Soil) values[0] += 0.15;
    else if (substrate === SubstrateClass.Sand) values[1] += 0.45;
    else if (substrate === SubstrateClass.Rock) values[3] += 0.5;
    else if (substrate === SubstrateClass.Permafrost) values[2] += 0.5;
    const steepness = clamp(slope * 8, 0, 1);
    const shoreInfluence = clamp(1 - Math.abs(shoreDistance) / SHORE_DISTANCE_LIMIT, 0, 1);
    values[3] += steepness * 0.6;
    values[1] += shoreInfluence * 0.25;
    values[0] += climateMoisture * (1 - steepness) * 0.12;
    values[2] += (1 - climateTemperature) * 0.12;
    return quantizeWeights(values);
}

function fieldByteLength(field: CompiledSurfaceField): number {
    return field.groundHeight.byteLength
        + field.materialWeights.byteLength
        + field.waterLevel.byteLength
        + field.waterDepth.byteLength
        + field.shorelineDistance.byteLength
        + field.flow.byteLength
        + field.waterCoverage.byteLength
        + field.waterKind.byteLength
        + field.waterProfile.byteLength
        + field.waterBodyIndex.byteLength;
}

function updateChecksum(hash: number, values: ArrayBufferView): number {
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    for (const value of bytes) {
        hash ^= value;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash;
}

function surfaceChecksum(field: CompiledSurfaceField, bodies: readonly CompiledWaterBodyRef[]): string {
    let hash = 0x811c9dc5;
    for (const values of [
        field.groundHeight,
        field.materialWeights,
        field.waterLevel,
        field.waterDepth,
        field.shorelineDistance,
        field.flow,
        field.waterCoverage,
        field.waterKind,
        field.waterProfile,
        field.waterBodyIndex
    ]) hash = updateChecksum(hash, values);
    for (const body of bodies) {
        for (const character of `${body.bodyId}\0${body.kind}\0`) {
            const code = character.charCodeAt(0);
            hash ^= code & 0xff;
            hash = Math.imul(hash, 0x01000193);
            hash ^= code >>> 8;
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function compileSurfaceChunk(window: TransferableEffectiveWindow): CompiledSurfaceChunk {
    assertTransferableEffectiveWindow(window);
    if (window.dependencyKey.compilerRevision !== SURFACE_COMPILER_REVISION
        || window.dependencyKey.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION) {
        throw new TypeError("effective surface window uses an unsupported compiler or profile revision");
    }
    const rivers = prepareRivers(window.rivers);
    const lakes = prepareLakes(window.lakes);
    const ground = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const worldX = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const worldZ = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    for (let physicalX = 0; physicalX < SURFACE_WORK_SIZE; physicalX += 1) {
        for (let physicalY = 0; physicalY < SURFACE_WORK_SIZE; physicalY += 1) {
            const index = gridIndex(physicalX, physicalY, SURFACE_WORK_SIZE);
            const local = workLocalCoordinate(physicalX, physicalY);
            const world = surfaceToWorld(local.u, local.v);
            worldX[index] = world.x;
            worldZ[index] = world.z;
            ground[index] = sampleWindowChannel(window.macroHeight, local.u, local.v, 1, 0) / 65535;
        }
    }

    const workCoverage = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
    const workWaterKind = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
    const workWaterProfile = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
    const workWaterLevel = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const workFlow = new Float64Array(SURFACE_WORK_TEXEL_COUNT * 2);
    const workBodyIds: Array<string | undefined> = new Array(SURFACE_WORK_TEXEL_COUNT);
    for (let physicalX = 0; physicalX < SURFACE_WORK_SIZE; physicalX += 1) {
        for (let physicalY = 0; physicalY < SURFACE_WORK_SIZE; physicalY += 1) {
            const index = gridIndex(physicalX, physicalY, SURFACE_WORK_SIZE);
            let best: WaterCandidate | undefined;
            for (const river of rivers) {
                const candidate = riverCandidate(worldX[index], worldZ[index], river);
                if (candidate && candidateWins(candidate, best)) best = candidate;
            }
            for (const lake of lakes) {
                const candidate = surfaceLakeCandidate(worldX[index], worldZ[index], lake);
                if (candidate && candidateWins(candidate, best)) best = candidate;
            }
            const ocean = oceanCandidate(
                ground[index],
                fieldGradient(ground, worldX, worldZ, physicalX, physicalY, SURFACE_WORK_SIZE)
            );
            if (ocean && candidateWins(ocean, best)) best = ocean;
            if (!best) continue;
            workCoverage[index] = best.coverage;
            workWaterKind[index] = best.kind;
            workWaterProfile[index] = best.profileIndex;
            workWaterLevel[index] = best.level;
            workFlow[index * 2] = best.flowX;
            workFlow[index * 2 + 1] = best.flowY;
            workBodyIds[index] = best.bodyId;
        }
    }
    const shore = computeShoreDistances(workCoverage, worldX, worldZ, SURFACE_WORK_SIZE);
    const bodyDefinitions = new Map<string, CompiledWaterBodyRef>();
    for (let physicalX = 0; physicalX < SURFACE_FIELD_TEXTURE_SIZE; physicalX += 1) {
        for (let physicalY = 0; physicalY < SURFACE_FIELD_TEXTURE_SIZE; physicalY += 1) {
            const workIndex = gridIndex(
                physicalX + SURFACE_WORK_MARGIN_TEXELS,
                physicalY + SURFACE_WORK_MARGIN_TEXELS,
                SURFACE_WORK_SIZE
            );
            if (workCoverage[workIndex] === 0) continue;
            const bodyId = workBodyIds[workIndex] as string;
            const kind = workWaterKind[workIndex] === HydrologyWaterKind.River ? "river"
                : workWaterKind[workIndex] === HydrologyWaterKind.Lake ? "lake" : "ocean";
            const previous = bodyDefinitions.get(bodyId);
            if (previous && previous.kind !== kind) {
                throw new TypeError("surface compiler found conflicting water body metadata");
            }
            bodyDefinitions.set(bodyId, Object.freeze({ bodyId, kind }));
        }
    }
    const waterBodies = Object.freeze([...bodyDefinitions.values()]
        .sort((first, second) => first.bodyId.localeCompare(second.bodyId)));
    if (waterBodies.length > SURFACE_MAX_WATER_BODY_COUNT) {
        throw new RangeError("compiled surface chunk exceeds the 255-body palette budget");
    }
    const paletteById = new Map(waterBodies.map((body, index) => [body.bodyId, index + 1]));

    const field: CompiledSurfaceField = Object.freeze({
        groundHeight: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
        materialWeights: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT * 4),
        waterLevel: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
        waterDepth: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
        shorelineDistance: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
        flow: new Int8Array(SURFACE_FIELD_TEXEL_COUNT * 2),
        waterCoverage: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT),
        waterKind: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT),
        waterProfile: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT),
        waterBodyIndex: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT)
    });
    let minGroundHeight = Number.POSITIVE_INFINITY;
    let maxGroundHeight = Number.NEGATIVE_INFINITY;
    let minWaterLevel = Number.POSITIVE_INFINITY;
    let maxWaterLevel = Number.NEGATIVE_INFINITY;
    let hasWater = false;
    for (let physicalX = 0; physicalX < SURFACE_FIELD_TEXTURE_SIZE; physicalX += 1) {
        for (let physicalY = 0; physicalY < SURFACE_FIELD_TEXTURE_SIZE; physicalY += 1) {
            const index = surfaceLatticeIndex(physicalX, physicalY);
            const workX = physicalX + SURFACE_WORK_MARGIN_TEXELS;
            const workY = physicalY + SURFACE_WORK_MARGIN_TEXELS;
            const workIndex = gridIndex(workX, workY, SURFACE_WORK_SIZE);
            const local = surfaceLatticeTexelLocalCoordinate(physicalX, physicalY);
            field.groundHeight[index] = encodeFloat16(ground[workIndex]);
            field.shorelineDistance[index] = encodeFloat16(shore[workIndex]);
            field.waterCoverage[index] = workCoverage[workIndex];
            field.waterKind[index] = workWaterKind[workIndex];
            field.waterProfile[index] = workWaterProfile[workIndex];
            const slope = fieldGradient(ground, worldX, worldZ, workX, workY, SURFACE_WORK_SIZE);
            field.materialWeights.set(
                materialWeights(window, local.u, local.v, slope, shore[workIndex]),
                index * 4
            );
            if (workCoverage[workIndex] > 0) {
                const level = workWaterLevel[workIndex];
                const depth = Math.max(0, level - ground[workIndex]) * workCoverage[workIndex] / 255;
                field.waterLevel[index] = encodeFloat16(level);
                field.waterDepth[index] = encodeFloat16(depth);
                field.flow[index * 2] = Math.round(clamp(workFlow[workIndex * 2], -1, 1) * 127);
                field.flow[index * 2 + 1] = Math.round(clamp(workFlow[workIndex * 2 + 1], -1, 1) * 127);
                field.waterBodyIndex[index] = paletteById.get(workBodyIds[workIndex] as string) as number;
            }
            minGroundHeight = Math.min(minGroundHeight, decodeFloat16(field.groundHeight[index]));
            maxGroundHeight = Math.max(maxGroundHeight, decodeFloat16(field.groundHeight[index]));
            if (workCoverage[workIndex] >= 128) {
                const level = decodeFloat16(field.waterLevel[index]);
                minWaterLevel = Math.min(minWaterLevel, level);
                maxWaterLevel = Math.max(maxWaterLevel, level);
                hasWater = true;
            }
        }
    }
    const bounds: CompiledSurfaceBounds = Object.freeze({
        validTiles: Object.freeze({ ...window.validBounds }),
        minGroundHeight,
        maxGroundHeight,
        hasWater,
        minWaterLevel: hasWater ? minWaterLevel : 0,
        maxWaterLevel: hasWater ? maxWaterLevel : 0
    });
    const byteLength = fieldByteLength(field);
    const dependencyKey = cloneSurfaceDependencyKey(window.dependencyKey);
    const chunk: CompiledSurfaceChunk = Object.freeze({
        key: Object.freeze({ ...window.key }),
        dependencyKey,
        effectiveRevision: window.effectiveRevision,
        bounds,
        field,
        waterBodies,
        byteLength,
        contentChecksum: surfaceChecksum(field, waterBodies)
    });
    assertCompiledSurfaceChunk(chunk);
    validatedCompiledChunks.add(chunk);
    return chunk;
}

function assertField(field: CompiledSurfaceField): void {
    if (!field || typeof field !== "object"
        || Object.getOwnPropertyNames(field).some(name => ![
            "groundHeight", "materialWeights", "waterLevel", "waterDepth",
            "shorelineDistance", "flow", "waterCoverage", "waterKind",
            "waterProfile", "waterBodyIndex"
        ].includes(name))
        || !(field.groundHeight instanceof Uint16Array) || field.groundHeight.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.materialWeights instanceof Uint8Array)
        || field.materialWeights.length !== SURFACE_FIELD_TEXEL_COUNT * 4
        || !(field.waterLevel instanceof Uint16Array) || field.waterLevel.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.waterDepth instanceof Uint16Array) || field.waterDepth.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.shorelineDistance instanceof Uint16Array)
        || field.shorelineDistance.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.flow instanceof Int8Array) || field.flow.length !== SURFACE_FIELD_TEXEL_COUNT * 2
        || !(field.waterCoverage instanceof Uint8Array)
        || field.waterCoverage.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.waterKind instanceof Uint8Array) || field.waterKind.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.waterProfile instanceof Uint8Array) || field.waterProfile.length !== SURFACE_FIELD_TEXEL_COUNT
        || !(field.waterBodyIndex instanceof Uint8Array)
        || field.waterBodyIndex.length !== SURFACE_FIELD_TEXEL_COUNT) {
        throw new TypeError("compiled surface field layout is invalid");
    }
}

function assertBounds(bounds: CompiledSurfaceBounds): void {
    if (!bounds || typeof bounds !== "object"
        || Object.getOwnPropertyNames(bounds).some(name => ![
            "validTiles", "minGroundHeight", "maxGroundHeight", "hasWater",
            "minWaterLevel", "maxWaterLevel"
        ].includes(name))
        || !bounds.validTiles || !Number.isFinite(bounds.minGroundHeight)
        || !Number.isFinite(bounds.maxGroundHeight)
        || bounds.minGroundHeight > bounds.maxGroundHeight
        || typeof bounds.hasWater !== "boolean"
        || !Number.isFinite(bounds.minWaterLevel) || !Number.isFinite(bounds.maxWaterLevel)
        || bounds.minWaterLevel > bounds.maxWaterLevel
        || !Number.isInteger(bounds.validTiles.minX) || !Number.isInteger(bounds.validTiles.minY)
        || !Number.isInteger(bounds.validTiles.maxXExclusive)
        || !Number.isInteger(bounds.validTiles.maxYExclusive)
        || bounds.validTiles.minX < 0 || bounds.validTiles.minY < 0
        || bounds.validTiles.maxXExclusive > SURFACE_RENDER_CHUNK_SIZE
        || bounds.validTiles.maxYExclusive > SURFACE_RENDER_CHUNK_SIZE
        || bounds.validTiles.minX >= bounds.validTiles.maxXExclusive
        || bounds.validTiles.minY >= bounds.validTiles.maxYExclusive) {
        throw new TypeError("compiled surface bounds are invalid");
    }
}

export function assertCompiledSurfaceChunk(value: unknown): asserts value is CompiledSurfaceChunk {
    if (!value || typeof value !== "object") throw new TypeError("compiled surface chunk must be an object");
    const chunk = value as CompiledSurfaceChunk;
    if (Object.getOwnPropertyNames(chunk).some(name => ![
        "key", "dependencyKey", "effectiveRevision", "bounds", "field",
        "waterBodies", "byteLength", "contentChecksum"
    ].includes(name))) throw new TypeError("compiled surface chunk contains unknown fields");
    assertSurfaceDependencyKey(chunk.dependencyKey);
    if (chunk.key.chunkX !== chunk.dependencyKey.renderKey.chunkX
        || chunk.key.chunkY !== chunk.dependencyKey.renderKey.chunkY
        || chunk.dependencyKey.compilerRevision !== SURFACE_COMPILER_REVISION
        || chunk.dependencyKey.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION
        || !Number.isSafeInteger(chunk.effectiveRevision) || chunk.effectiveRevision < 0) {
        throw new TypeError("compiled surface chunk identity is invalid");
    }
    assertBounds(chunk.bounds);
    assertField(chunk.field);
    if (!Array.isArray(chunk.waterBodies) || chunk.waterBodies.length > SURFACE_MAX_WATER_BODY_COUNT) {
        throw new RangeError("compiled surface body palette exceeds its frozen budget");
    }
    const bodyIds = new Set<string>();
    for (const body of chunk.waterBodies) {
        if (!body || typeof body.bodyId !== "string" || bodyIds.has(body.bodyId)
            || !["ocean", "lake", "river"].includes(body.kind)
            || (body.kind === "ocean") !== (body.bodyId === OCEAN_BODY_ID)
            || Object.getOwnPropertyNames(body).some(name =>
                name !== "bodyId" && name !== "kind")) {
            throw new TypeError("compiled surface body palette is invalid");
        }
        bodyIds.add(body.bodyId);
    }
    for (let index = 1; index < chunk.waterBodies.length; index += 1) {
        if (chunk.waterBodies[index - 1].bodyId.localeCompare(chunk.waterBodies[index].bodyId) >= 0) {
            throw new TypeError("compiled surface body palette must be strictly ordered");
        }
    }
    let minGroundHeight = Number.POSITIVE_INFINITY;
    let maxGroundHeight = Number.NEGATIVE_INFINITY;
    let minWaterLevel = Number.POSITIVE_INFINITY;
    let maxWaterLevel = Number.NEGATIVE_INFINITY;
    let hasWater = false;
    for (let index = 0; index < SURFACE_FIELD_TEXEL_COUNT; index += 1) {
        const materialOffset = index * 4;
        if (chunk.field.materialWeights[materialOffset]
            + chunk.field.materialWeights[materialOffset + 1]
            + chunk.field.materialWeights[materialOffset + 2]
            + chunk.field.materialWeights[materialOffset + 3] !== 255) {
            throw new TypeError("compiled surface material weights must sum to 255");
        }
        const coverage = chunk.field.waterCoverage[index];
        const kind = chunk.field.waterKind[index];
        const bodyIndex = chunk.field.waterBodyIndex[index];
        const groundHeight = decodeFloat16(chunk.field.groundHeight[index]);
        const waterLevel = decodeFloat16(chunk.field.waterLevel[index]);
        const waterDepth = decodeFloat16(chunk.field.waterDepth[index]);
        const shoreDistance = decodeFloat16(chunk.field.shorelineDistance[index]);
        if ((coverage === 0) !== (kind === HydrologyWaterKind.None && bodyIndex === 0)
            || coverage > 0 && (kind < HydrologyWaterKind.Ocean || kind > HydrologyWaterKind.River
                || bodyIndex === 0 || bodyIndex > chunk.waterBodies.length)
            || coverage === 0 && (waterLevel !== 0 || waterDepth !== 0
                || chunk.field.waterProfile[index] !== 0
                || chunk.field.flow[index * 2] !== 0 || chunk.field.flow[index * 2 + 1] !== 0)
            || !Number.isFinite(groundHeight) || groundHeight < 0 || groundHeight > 1
            || !Number.isFinite(waterLevel) || waterLevel < 0 || waterLevel > 1
            || !Number.isFinite(waterDepth) || waterDepth < 0
            || !Number.isFinite(shoreDistance) || Math.abs(shoreDistance) > SHORE_DISTANCE_LIMIT + 0.01) {
            throw new TypeError("compiled surface field contains invalid texel data");
        }
        if (coverage > 0) {
            const body = chunk.waterBodies[bodyIndex - 1];
            const expectedKind = kind === HydrologyWaterKind.Ocean ? "ocean"
                : kind === HydrologyWaterKind.Lake ? "lake" : "river";
            if (body.kind !== expectedKind) {
                throw new TypeError("compiled surface texel disagrees with its water body palette");
            }
        }
        minGroundHeight = Math.min(minGroundHeight, groundHeight);
        maxGroundHeight = Math.max(maxGroundHeight, groundHeight);
        if (coverage >= 128) {
            minWaterLevel = Math.min(minWaterLevel, waterLevel);
            maxWaterLevel = Math.max(maxWaterLevel, waterLevel);
            hasWater = true;
        }
    }
    if (chunk.bounds.minGroundHeight !== minGroundHeight
        || chunk.bounds.maxGroundHeight !== maxGroundHeight
        || chunk.bounds.hasWater !== hasWater
        || chunk.bounds.minWaterLevel !== (hasWater ? minWaterLevel : 0)
        || chunk.bounds.maxWaterLevel !== (hasWater ? maxWaterLevel : 0)) {
        throw new TypeError("compiled surface bounds do not match the field payload");
    }
    if (chunk.byteLength !== fieldByteLength(chunk.field)
        || chunk.contentChecksum !== surfaceChecksum(chunk.field, chunk.waterBodies)) {
        throw new TypeError("compiled surface chunk byte length or checksum is invalid");
    }
}

function assertCompiledSurfaceChunkOnce(value: CompiledSurfaceChunk): void {
    if (validatedCompiledChunks.has(value)) return;
    assertCompiledSurfaceChunk(value);
    validatedCompiledChunks.add(value);
}

function bilinear(values: readonly number[], amountX: number, amountY: number): number {
    const top = values[0] + (values[1] - values[0]) * amountX;
    const bottom = values[2] + (values[3] - values[2]) * amountX;
    return top + (bottom - top) * amountY;
}

export function sampleCompiledSurfaceChunk(
    chunk: CompiledSurfaceChunk,
    localU: number,
    localV: number
): Readonly<CompiledSurfaceSample> {
    assertCompiledSurfaceChunkOnce(chunk);
    if (!Number.isFinite(localU) || !Number.isFinite(localV)
        || localU < chunk.bounds.validTiles.minX - 0.5
        || localU >= chunk.bounds.validTiles.maxXExclusive - 0.5
        || localV < chunk.bounds.validTiles.minY - 0.5
        || localV >= chunk.bounds.validTiles.maxYExclusive - 0.5) {
        throw new RangeError("compiled surface query lies outside the chunk valid domain");
    }
    const texel = surfaceFieldTexelCoordinate(localU, localV);
    const x0 = Math.floor(texel.u);
    const y0 = Math.floor(texel.v);
    const amountX = texel.u - x0;
    const amountY = texel.v - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= SURFACE_FIELD_TEXTURE_SIZE
        || y0 + 1 >= SURFACE_FIELD_TEXTURE_SIZE) {
        throw new RangeError("compiled surface query exceeds the field gutter");
    }
    const indices = [
        surfaceLatticeIndex(x0, y0),
        surfaceLatticeIndex(x0 + 1, y0),
        surfaceLatticeIndex(x0, y0 + 1),
        surfaceLatticeIndex(x0 + 1, y0 + 1)
    ];
    const interpolationWeights = [
        (1 - amountX) * (1 - amountY),
        amountX * (1 - amountY),
        (1 - amountX) * amountY,
        amountX * amountY
    ];
    const groundHeight = bilinear(
        indices.map(index => decodeFloat16(chunk.field.groundHeight[index])),
        amountX,
        amountY
    );
    const shorelineDistance = bilinear(
        indices.map(index => decodeFloat16(chunk.field.shorelineDistance[index])),
        amountX,
        amountY
    );
    const waterCoverage = bilinear(
        indices.map(index => chunk.field.waterCoverage[index] / 255),
        amountX,
        amountY
    );
    let wetWeight = 0;
    let waterLevel = 0;
    let waterDepth = 0;
    let flowX = 0;
    let flowY = 0;
    let selected = -1;
    let selectedWeight = -1;
    for (let index = 0; index < indices.length; index += 1) {
        const texelIndex = indices[index];
        const weight = interpolationWeights[index];
        const coverageWeight = weight * chunk.field.waterCoverage[texelIndex] / 255;
        wetWeight += coverageWeight;
        waterLevel += decodeFloat16(chunk.field.waterLevel[texelIndex]) * coverageWeight;
        waterDepth += decodeFloat16(chunk.field.waterDepth[texelIndex]) * weight;
        flowX += chunk.field.flow[texelIndex * 2] / 127 * coverageWeight;
        flowY += chunk.field.flow[texelIndex * 2 + 1] / 127 * coverageWeight;
        if (coverageWeight > selectedWeight
            || coverageWeight === selectedWeight && texelIndex < (selected < 0 ? Number.POSITIVE_INFINITY : indices[selected])) {
            selected = index;
            selectedWeight = coverageWeight;
        }
    }
    if (wetWeight > 0) waterLevel /= wetWeight;
    const flowLength = Math.hypot(flowX, flowY);
    if (flowLength > 0) {
        flowX /= flowLength;
        flowY /= flowLength;
    }
    const selectedIndex = selected >= 0 ? indices[selected] : indices[0];
    const bodyIndex = selectedWeight > 0 ? chunk.field.waterBodyIndex[selectedIndex] : 0;
    const material = [0, 1, 2, 3].map(channel => bilinear(
        indices.map(index => chunk.field.materialWeights[index * 4 + channel] / 255),
        amountX,
        amountY
    )) as [number, number, number, number];
    return Object.freeze({
        groundHeight,
        materialWeights: Object.freeze(material),
        waterLevel,
        waterDepth,
        shorelineDistance,
        flow: Object.freeze([flowX, flowY] as [number, number]),
        waterCoverage,
        waterKind: bodyIndex > 0
            ? chunk.field.waterKind[selectedIndex] as HydrologyWaterKind : HydrologyWaterKind.None,
        waterProfile: bodyIndex > 0 ? chunk.field.waterProfile[selectedIndex] : 0,
        waterBody: bodyIndex > 0 ? chunk.waterBodies[bodyIndex - 1] : undefined
    });
}

export function compiledSurfaceFieldTransferables(
    chunk: CompiledSurfaceChunk
): readonly ArrayBuffer[] {
    assertCompiledSurfaceChunkOnce(chunk);
    const candidates = [
        chunk.field.groundHeight.buffer,
        chunk.field.materialWeights.buffer,
        chunk.field.waterLevel.buffer,
        chunk.field.waterDepth.buffer,
        chunk.field.shorelineDistance.buffer,
        chunk.field.flow.buffer,
        chunk.field.waterCoverage.buffer,
        chunk.field.waterKind.buffer,
        chunk.field.waterProfile.buffer,
        chunk.field.waterBodyIndex.buffer
    ];
    if (candidates.some(buffer => !(buffer instanceof ArrayBuffer))) {
        throw new TypeError("compiled surface field buffers must be transferable ArrayBuffers");
    }
    const buffers = candidates as ArrayBuffer[];
    if (new Set(buffers).size !== buffers.length) {
        throw new TypeError("compiled surface field must own distinct transferable buffers");
    }
    return Object.freeze(buffers);
}

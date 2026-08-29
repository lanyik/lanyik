import {
    CompiledSurfaceBounds,
    assertCompiledSurfaceBounds,
    compileSurfaceBounds
} from "./CompiledSurfaceBounds";
import {
    CompiledSurfaceField,
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_OCEAN,
    SURFACE_WATER_KIND_RIVER,
    assertCompiledSurfaceField,
    compiledSurfaceFieldResidentBytes,
    compiledSurfaceFieldTransferables,
    createCompiledSurfaceField
} from "./CompiledSurfaceField";
import { CompiledSurfaceSampler } from "./CompiledSurfaceSampler";
import {
    CompiledVegetationSeeds,
    assertCompiledVegetationSeeds,
    compiledVegetationSeedsResidentBytes,
    compiledVegetationSeedsTransferables,
    createCompiledVegetationSeeds
} from "./CompiledVegetationSeeds";
import {
    CompiledWaterBodyPalette,
    assertCompiledWaterBodyPalette,
    createCompiledWaterBodyPalette
} from "./CompiledWaterBodyPalette";
import {
    CompiledWaterGeometry,
    assertCompiledWaterGeometry,
    compileWaterGeometry,
    compiledWaterGeometryTransferables
} from "./CompiledWaterGeometry";
import {
    RenderChunkKey,
    SurfaceDependencyKey,
    assertSurfaceDependencyKey,
    createSurfaceDependencyKey,
    serializeSurfaceDependencyKey
} from "./SurfaceDependencyKey";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import { surfaceToWorld, worldToSurface } from "./SurfaceLattice";

export const COMPILED_SURFACE_CHUNK_FORMAT_VERSION = 1;
export const COMPILED_SURFACE_CHUNK_BASE_RESIDENT_BYTES = 256;

export interface CompiledSurfaceChunk {
    readonly formatVersion: typeof COMPILED_SURFACE_CHUNK_FORMAT_VERSION;
    readonly key: RenderChunkKey;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly bounds: CompiledSurfaceBounds;
    readonly field: CompiledSurfaceField;
    readonly waterBodies: CompiledWaterBodyPalette;
    readonly waterGeometry: CompiledWaterGeometry;
    readonly vegetationSeeds: CompiledVegetationSeeds;
}

export interface CompiledSurfaceChunkInput extends Omit<CompiledSurfaceChunk,
    "formatVersion" | "key"> {}

function collectTransferables(chunk: Readonly<CompiledSurfaceChunk>): readonly ArrayBuffer[] {
    const buffers = [
        ...compiledSurfaceFieldTransferables(chunk.field),
        ...compiledWaterGeometryTransferables(chunk.waterGeometry),
        ...compiledVegetationSeedsTransferables(chunk.vegetationSeeds)
    ];
    if (new Set(buffers).size !== buffers.length) {
        throw new Error("compiled surface chunk component buffers must not alias");
    }
    return Object.freeze(buffers);
}

function typedArraysEqual(first: ArrayLike<number>, second: ArrayLike<number>): boolean {
    if (first.length !== second.length) return false;
    for (let index = 0; index < first.length; index += 1) {
        if (first[index] !== second[index]) return false;
    }
    return true;
}

function geometryEquals(
    first: Readonly<CompiledWaterGeometry>,
    second: Readonly<CompiledWaterGeometry>
): boolean {
    if (first.kind !== second.kind) return false;
    if (first.kind !== "coverage" || second.kind !== "coverage") return true;
    return typedArraysEqual(first.positions, second.positions)
        && typedArraysEqual(first.surfaceFieldCoordinates, second.surfaceFieldCoordinates)
        && typedArraysEqual(first.indices, second.indices);
}

function boundsEqual(
    first: Readonly<CompiledSurfaceBounds>,
    second: Readonly<CompiledSurfaceBounds>
): boolean {
    return first.formatVersion === second.formatVersion
        && first.visualProfileVersion === second.visualProfileVersion
        && first.minimumX === second.minimumX
        && first.maximumX === second.maximumX
        && first.minimumZ === second.minimumZ
        && first.maximumZ === second.maximumZ
        && first.minimumGroundHeight === second.minimumGroundHeight
        && first.maximumGroundHeight === second.maximumGroundHeight
        && first.minimumWaterHeight === second.minimumWaterHeight
        && first.maximumWaterHeight === second.maximumWaterHeight
        && first.minimumBaseHeight === second.minimumBaseHeight
        && first.maximumBaseHeight === second.maximumBaseHeight
        && first.groundMaximumDisplacement === second.groundMaximumDisplacement
        && first.waterMaximumDisplacement === second.waterMaximumDisplacement
        && first.minimumVisualHeight === second.minimumVisualHeight
        && first.maximumVisualHeight === second.maximumVisualHeight;
}

function waterKindForBody(kind: "ocean" | "lake" | "river"): number {
    return kind === "ocean" ? SURFACE_WATER_KIND_OCEAN
        : kind === "lake" ? SURFACE_WATER_KIND_LAKE : SURFACE_WATER_KIND_RIVER;
}

function assertFieldPaletteRelationship(chunk: Readonly<CompiledSurfaceChunk>): void {
    const used = new Uint8Array(chunk.waterBodies.entries.length);
    for (let index = 0; index < chunk.field.waterBodyIndex.length; index += 1) {
        const bodyIndex = chunk.field.waterBodyIndex[index];
        if (bodyIndex === 0) continue;
        const body = chunk.waterBodies.entries[bodyIndex - 1];
        if (!body
            || chunk.field.waterKind[index] !== waterKindForBody(body.kind)
            || chunk.field.waterProfile[index] !== body.profileIndex) {
            throw new Error("compiled surface field and body palette disagree");
        }
        used[bodyIndex - 1] = 1;
    }
    if (used.some(value => value === 0)) {
        throw new Error("compiled surface body palette contains an unused entry");
    }
}

function assertVegetationRoots(chunk: Readonly<CompiledSurfaceChunk>): void {
    const hexSize = chunk.dependencyKey.metrics.hexSize;
    const origin = surfaceToWorld(0, 0, hexSize);
    const sampler = new CompiledSurfaceSampler(chunk.field);
    const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    for (let index = 0; index < chunk.vegetationSeeds.count; index += 1) {
        const offset = index * 3;
        const logical = worldToSurface(
            chunk.vegetationSeeds.positions[offset] + origin.x,
            chunk.vegetationSeeds.positions[offset + 2] + origin.z,
            hexSize
        );
        if (logical.u < -0.5 || logical.u >= maximum
            || logical.v < -0.5 || logical.v >= maximum) {
            throw new RangeError("compiled vegetation root is outside its half-open surface core");
        }
        if (chunk.vegetationSeeds.positions[offset + 1]
            !== Math.fround(sampler.sampleGroundHeight(logical.u, logical.v))) {
            throw new Error("compiled vegetation root height drifted from canonical Ground");
        }
    }
}

function assertCompiledSurfaceChunkLayout(chunk: Readonly<CompiledSurfaceChunk>): void {
    if (!chunk || typeof chunk !== "object"
        || chunk.formatVersion !== COMPILED_SURFACE_CHUNK_FORMAT_VERSION) {
        throw new TypeError("compiled surface chunk format is invalid");
    }
    assertSurfaceDependencyKey(chunk.dependencyKey);
    if (!chunk.key || chunk.key.chunkX !== chunk.dependencyKey.renderKey.chunkX
        || chunk.key.chunkY !== chunk.dependencyKey.renderKey.chunkY) {
        throw new Error("compiled surface chunk key does not match its dependency key");
    }
    assertCompiledSurfaceField(chunk.field);
    assertCompiledWaterBodyPalette(chunk.waterBodies);
    assertCompiledWaterGeometry(chunk.waterGeometry);
    assertCompiledVegetationSeeds(chunk.vegetationSeeds);
    assertCompiledSurfaceBounds(chunk.bounds);
    assertFieldPaletteRelationship(chunk);
    assertVegetationRoots(chunk);
    collectTransferables(chunk);
}

export function assertCompiledSurfaceChunk(chunk: Readonly<CompiledSurfaceChunk>): void {
    assertCompiledSurfaceChunkLayout(chunk);
    const expectedGeometry = compileWaterGeometry(chunk.field);
    if (!geometryEquals(chunk.waterGeometry, expectedGeometry)) {
        throw new Error("compiled surface water geometry does not match its field");
    }
    const expectedBounds = compileSurfaceBounds(
        chunk.field,
        chunk.waterGeometry,
        chunk.dependencyKey.metrics.hexSize
    );
    if (!boundsEqual(chunk.bounds, expectedBounds)) {
        throw new Error("compiled surface bounds do not match its field and geometry");
    }
}

function publishGeometry(geometry: Readonly<CompiledWaterGeometry>): CompiledWaterGeometry {
    if (geometry.kind === "none") return Object.freeze({
        formatVersion: geometry.formatVersion,
        kind: geometry.kind
    });
    if (geometry.kind === "fullPatch") return Object.freeze({
        formatVersion: geometry.formatVersion,
        kind: geometry.kind
    });
    return Object.freeze({
        formatVersion: geometry.formatVersion,
        kind: geometry.kind,
        positions: geometry.positions,
        surfaceFieldCoordinates: geometry.surfaceFieldCoordinates,
        indices: geometry.indices
    });
}

export function createCompiledSurfaceChunk(
    input: Readonly<CompiledSurfaceChunkInput>
): CompiledSurfaceChunk {
    if (!input || typeof input !== "object") throw new TypeError("compiled surface chunk input is required");
    const dependencyKey = createSurfaceDependencyKey(input.dependencyKey);
    const chunk: CompiledSurfaceChunk = Object.freeze({
        formatVersion: COMPILED_SURFACE_CHUNK_FORMAT_VERSION,
        key: dependencyKey.renderKey,
        dependencyKey,
        bounds: Object.freeze({ ...input.bounds }),
        field: createCompiledSurfaceField(input.field),
        waterBodies: createCompiledWaterBodyPalette(input.waterBodies.entries),
        waterGeometry: publishGeometry(input.waterGeometry),
        vegetationSeeds: createCompiledVegetationSeeds(input.vegetationSeeds)
    });
    assertCompiledSurfaceChunk(chunk);
    return chunk;
}

export function compiledSurfaceChunkResidentBytes(chunk: Readonly<CompiledSurfaceChunk>): number {
    assertCompiledSurfaceChunkLayout(chunk);
    let bytes = COMPILED_SURFACE_CHUNK_BASE_RESIDENT_BYTES
        + compiledSurfaceFieldResidentBytes(chunk.field)
        + compiledVegetationSeedsResidentBytes(chunk.vegetationSeeds)
        + serializeSurfaceDependencyKey(chunk.dependencyKey).length * 2;
    for (const buffer of compiledWaterGeometryTransferables(chunk.waterGeometry)) {
        bytes += buffer.byteLength;
    }
    for (const body of chunk.waterBodies.entries) bytes += 16 + body.bodyId.length * 2;
    if (!Number.isSafeInteger(bytes)) {
        throw new RangeError("compiled surface resident byte accounting exceeds safe integers");
    }
    return bytes;
}

export function compiledSurfaceChunkTransferables(
    chunk: Readonly<CompiledSurfaceChunk>
): readonly ArrayBuffer[] {
    assertCompiledSurfaceChunkLayout(chunk);
    return collectTransferables(chunk);
}

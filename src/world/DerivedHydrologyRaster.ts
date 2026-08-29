import {
    HydrologyBodyRef,
    HydrologyRegionKey
} from "./HydrologyRegion";
import {
    HYDROLOGY_KIND_NONE,
    HydrologyRegionSpatialIndex,
    HydrologySample
} from "./HydrologyRegionSpatialIndex";

export const MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES = 1_048_576;
export const MAX_DERIVED_HYDROLOGY_BODY_PALETTE = 255;

export interface DerivedHydrologyRaster {
    readonly worldIdentity: string;
    readonly regionKey: HydrologyRegionKey;
    readonly regionRevision: number;
    readonly width: number;
    readonly height: number;
    readonly localOriginX: number;
    readonly localOriginY: number;
    readonly stepX: number;
    readonly stepY: number;
    readonly coverage: Uint8Array;
    readonly kind: Uint8Array;
    readonly level: Uint16Array;
    readonly depth: Uint16Array;
    readonly flow: Int8Array;
    readonly profile: Uint8Array;
    readonly bodyIndex: Uint8Array;
    readonly bodies: readonly HydrologyBodyRef[];
}

export interface DeriveHydrologyRasterOptions {
    readonly index: HydrologyRegionSpatialIndex;
    readonly width: number;
    readonly height: number;
    readonly localOriginX: number;
    readonly localOriginY: number;
    readonly stepX: number;
    readonly stepY: number;
    readonly groundHeight: Uint16Array;
    readonly seaLevel: number;
}

function compareIdentity(first: string, second: string): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

export function derivedHydrologyRasterIndex(x: number, y: number, width: number, height: number): number {
    if (!Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0
        || !Number.isInteger(width) || width <= 0 || x >= width
        || !Number.isInteger(height) || height <= 0 || y >= height) {
        throw new RangeError("derived hydrology raster coordinate is invalid");
    }
    const index = x * height + y;
    if (!Number.isSafeInteger(index)) throw new RangeError("derived hydrology raster index is unsafe");
    return index;
}

export function assertDerivedHydrologyRaster(raster: Readonly<DerivedHydrologyRaster>): void {
    if (!raster || typeof raster !== "object" || typeof raster.worldIdentity !== "string"
        || raster.worldIdentity.length === 0 || !raster.regionKey
        || !Number.isSafeInteger(raster.regionKey.regionX) || !Number.isSafeInteger(raster.regionKey.regionY)
        || !Number.isSafeInteger(raster.regionRevision) || raster.regionRevision < 0
        || !Number.isInteger(raster.width) || raster.width <= 0
        || !Number.isInteger(raster.height) || raster.height <= 0
        || !Number.isFinite(raster.localOriginX) || !Number.isFinite(raster.localOriginY)
        || !Number.isFinite(raster.stepX) || raster.stepX <= 0
        || !Number.isFinite(raster.stepY) || raster.stepY <= 0) {
        throw new TypeError("derived hydrology raster metadata is invalid");
    }
    const length = raster.width * raster.height;
    if (!Number.isSafeInteger(length) || length > MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES
        || !(raster.coverage instanceof Uint8Array) || raster.coverage.length !== length
        || !(raster.kind instanceof Uint8Array) || raster.kind.length !== length
        || !(raster.level instanceof Uint16Array) || raster.level.length !== length
        || !(raster.depth instanceof Uint16Array) || raster.depth.length !== length
        || !(raster.flow instanceof Int8Array) || raster.flow.length !== length * 2
        || !(raster.profile instanceof Uint8Array) || raster.profile.length !== length
        || !(raster.bodyIndex instanceof Uint8Array) || raster.bodyIndex.length !== length
        || !Array.isArray(raster.bodies) || raster.bodies.length > MAX_DERIVED_HYDROLOGY_BODY_PALETTE) {
        throw new TypeError("derived hydrology raster arrays violate the frozen layout");
    }
    let previousBodyId: string | undefined;
    for (const body of raster.bodies) {
        if (!body || typeof body.bodyId !== "string" || body.bodyId.length === 0
            || (body.kind !== "ocean" && body.kind !== "lake" && body.kind !== "river")
            || !Number.isInteger(body.profileIndex) || body.profileIndex < 0 || body.profileIndex > 0xff
            || previousBodyId !== undefined && previousBodyId >= body.bodyId) {
            throw new Error("derived hydrology body palette is invalid or not canonical");
        }
        previousBodyId = body.bodyId;
    }
    for (let index = 0; index < length; index += 1) {
        const bodyIndex = raster.bodyIndex[index];
        if (raster.coverage[index] === 0) {
            if (raster.kind[index] !== HYDROLOGY_KIND_NONE || bodyIndex !== 0
                || raster.level[index] !== 0 || raster.depth[index] !== 0
                || raster.flow[index * 2] !== 0 || raster.flow[index * 2 + 1] !== 0
                || raster.profile[index] !== 0) {
                throw new Error("dry derived hydrology samples must use the zero representation");
            }
            continue;
        }
        if (raster.kind[index] < 1 || raster.kind[index] > 3
            || bodyIndex === 0 || bodyIndex > raster.bodies.length
            || raster.profile[index] !== raster.bodies[bodyIndex - 1].profileIndex
            || raster.depth[index] > raster.level[index]
            || raster.flow[index * 2] < -1 || raster.flow[index * 2] > 1
            || raster.flow[index * 2 + 1] < -1 || raster.flow[index * 2 + 1] > 1) {
            throw new Error("wet derived hydrology sample has an invalid kind, flow or body reference");
        }
        const bodyKind = raster.bodies[bodyIndex - 1].kind;
        if ((raster.kind[index] === 1 && bodyKind !== "ocean")
            || (raster.kind[index] === 2 && bodyKind !== "lake")
            || (raster.kind[index] === 3 && bodyKind !== "river")
            || raster.kind[index] !== 3
                && (raster.flow[index * 2] !== 0 || raster.flow[index * 2 + 1] !== 0)) {
            throw new Error("derived hydrology kind does not match its body or flow semantics");
        }
    }
}

export function deriveHydrologyRaster(
    options: Readonly<DeriveHydrologyRasterOptions>
): DerivedHydrologyRaster {
    if (!options || typeof options !== "object" || !(options.index instanceof HydrologyRegionSpatialIndex)) {
        throw new TypeError("derived hydrology raster requires a spatial index");
    }
    if (!Number.isInteger(options.width) || options.width <= 0
        || !Number.isInteger(options.height) || options.height <= 0) {
        throw new RangeError("derived hydrology raster dimensions must be positive integers");
    }
    const length = options.width * options.height;
    if (!Number.isSafeInteger(length) || length > MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES
        || !(options.groundHeight instanceof Uint16Array) || options.groundHeight.length !== length) {
        throw new RangeError("derived hydrology raster exceeds its sample budget or ground input");
    }
    if (!Number.isFinite(options.localOriginX) || !Number.isFinite(options.localOriginY)
        || !Number.isFinite(options.stepX) || options.stepX <= 0
        || !Number.isFinite(options.stepY) || options.stepY <= 0
        || !Number.isInteger(options.seaLevel) || options.seaLevel < 0 || options.seaLevel > 0xffff) {
        throw new RangeError("derived hydrology sampling lattice or sea level is invalid");
    }
    const lastX = options.localOriginX + (options.width - 1) * options.stepX;
    const lastY = options.localOriginY + (options.height - 1) * options.stepY;
    if (options.localOriginX < 0 || options.localOriginY < 0
        || lastX >= options.index.region.validBounds.maxXExclusive
        || lastY >= options.index.region.validBounds.maxYExclusive) {
        throw new RangeError("derived hydrology sampling lattice leaves region valid bounds");
    }
    const samples = new Array<HydrologySample>(length);
    const usedBodies = new Map<string, HydrologyBodyRef>();
    for (let x = 0; x < options.width; x += 1) {
        for (let y = 0; y < options.height; y += 1) {
            const index = derivedHydrologyRasterIndex(x, y, options.width, options.height);
            const sample = options.index.query(
                options.localOriginX + x * options.stepX,
                options.localOriginY + y * options.stepY,
                options.groundHeight[index],
                options.seaLevel
            );
            samples[index] = sample;
            if (sample.body) usedBodies.set(sample.body.bodyId, sample.body);
        }
    }
    const bodies = [...usedBodies.values()].sort((first, second) => compareIdentity(first.bodyId, second.bodyId));
    if (bodies.length > MAX_DERIVED_HYDROLOGY_BODY_PALETTE) {
        throw new RangeError("derived hydrology raster exceeds the uint8 body palette");
    }
    const paletteIndices = new Map(bodies.map((body, index) => [body.bodyId, index + 1]));
    const coverage = new Uint8Array(length);
    const kind = new Uint8Array(length);
    const level = new Uint16Array(length);
    const depth = new Uint16Array(length);
    const flow = new Int8Array(length * 2);
    const profile = new Uint8Array(length);
    const bodyIndex = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
        const sample = samples[index];
        coverage[index] = sample.coverage;
        kind[index] = sample.kind;
        level[index] = sample.level;
        depth[index] = sample.depth;
        flow[index * 2] = sample.flowX;
        flow[index * 2 + 1] = sample.flowY;
        profile[index] = sample.profileIndex;
        if (sample.body) bodyIndex[index] = paletteIndices.get(sample.body.bodyId) as number;
    }
    const region = options.index.region;
    const raster: DerivedHydrologyRaster = Object.freeze({
        worldIdentity: region.worldIdentity,
        regionKey: region.key,
        regionRevision: region.revision,
        width: options.width,
        height: options.height,
        localOriginX: options.localOriginX,
        localOriginY: options.localOriginY,
        stepX: options.stepX,
        stepY: options.stepY,
        coverage,
        kind,
        level,
        depth,
        flow,
        profile,
        bodyIndex,
        bodies: Object.freeze(bodies)
    });
    assertDerivedHydrologyRaster(raster);
    return raster;
}

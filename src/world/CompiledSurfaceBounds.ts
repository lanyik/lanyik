import { CompiledSurfaceField } from "./CompiledSurfaceField";
import {
    CompiledSurfaceSampler,
    createCompiledSurfaceSample
} from "./CompiledSurfaceSampler";
import {
    CompiledWaterGeometry,
    assertCompiledWaterGeometry
} from "./CompiledWaterGeometry";
import { SURFACE_COMPILE_PROFILE, SURFACE_CORE_TEXELS } from "./SurfaceCompileProfile";
import { surfaceToWorld } from "./SurfaceLattice";

export const COMPILED_SURFACE_BOUNDS_FORMAT_VERSION = 1;

export interface CompiledSurfaceBounds {
    readonly formatVersion: typeof COMPILED_SURFACE_BOUNDS_FORMAT_VERSION;
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumZ: number;
    readonly maximumZ: number;
    readonly minimumGroundHeight: number;
    readonly maximumGroundHeight: number;
    readonly minimumWaterHeight: number | null;
    readonly maximumWaterHeight: number | null;
    readonly minimumBaseHeight: number;
    readonly maximumBaseHeight: number;
}

function finiteOrdered(name: string, minimum: number, maximum: number): void {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
        throw new RangeError(`${name} bounds must be finite and ordered`);
    }
}

export function assertCompiledSurfaceBounds(bounds: Readonly<CompiledSurfaceBounds>): void {
    if (!bounds || typeof bounds !== "object"
        || bounds.formatVersion !== COMPILED_SURFACE_BOUNDS_FORMAT_VERSION) {
        throw new TypeError("compiled surface bounds format is invalid");
    }
    finiteOrdered("compiled surface X", bounds.minimumX, bounds.maximumX);
    finiteOrdered("compiled surface Z", bounds.minimumZ, bounds.maximumZ);
    finiteOrdered(
        "compiled surface ground height",
        bounds.minimumGroundHeight,
        bounds.maximumGroundHeight
    );
    if ((bounds.minimumWaterHeight === null) !== (bounds.maximumWaterHeight === null)) {
        throw new TypeError("compiled surface water bounds must be both present or both absent");
    }
    if (bounds.minimumWaterHeight !== null && bounds.maximumWaterHeight !== null) {
        finiteOrdered("compiled surface water height", bounds.minimumWaterHeight, bounds.maximumWaterHeight);
    }
    finiteOrdered("compiled surface base height", bounds.minimumBaseHeight, bounds.maximumBaseHeight);
    const expectedMinimum = bounds.minimumWaterHeight === null
        ? bounds.minimumGroundHeight
        : Math.min(bounds.minimumGroundHeight, bounds.minimumWaterHeight);
    const expectedMaximum = bounds.maximumWaterHeight === null
        ? bounds.maximumGroundHeight
        : Math.max(bounds.maximumGroundHeight, bounds.maximumWaterHeight);
    if (bounds.minimumBaseHeight !== expectedMinimum || bounds.maximumBaseHeight !== expectedMaximum) {
        throw new Error("compiled surface base height does not enclose its ground and water ranges exactly");
    }
}

export function compileSurfaceBounds(
    field: Readonly<CompiledSurfaceField>,
    waterGeometry: Readonly<CompiledWaterGeometry>,
    hexSize: number
): CompiledSurfaceBounds {
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("compiled surface bounds require a positive finite hex size");
    }
    assertCompiledWaterGeometry(waterGeometry);
    const sampler = new CompiledSurfaceSampler(field);
    const sample = createCompiledSurfaceSample();
    const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const origin = surfaceToWorld(0, 0, hexSize);
    let minimumX = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let minimumZ = Number.POSITIVE_INFINITY;
    let maximumZ = Number.NEGATIVE_INFINITY;
    let minimumGroundHeight = Number.POSITIVE_INFINITY;
    let maximumGroundHeight = Number.NEGATIVE_INFINITY;
    let minimumWaterHeight = Number.POSITIVE_INFINITY;
    let maximumWaterHeight = Number.NEGATIVE_INFINITY;
    const includeWater = (localU: number, localV: number): void => {
        sampler.sampleBilinear(localU, localV, sample);
        if (!(sample.waterCoverage > 0) || sample.waterBodyIndex === 0) {
            throw new Error("compiled water geometry vertex has no sampleable water payload");
        }
        minimumWaterHeight = Math.min(minimumWaterHeight, sample.waterLevel);
        maximumWaterHeight = Math.max(maximumWaterHeight, sample.waterLevel);
    };
    for (let gridX = 0; gridX <= SURFACE_CORE_TEXELS; gridX += 1) {
        const localU = -0.5 + gridX / samplesPerTile;
        for (let gridY = 0; gridY <= SURFACE_CORE_TEXELS; gridY += 1) {
            const localV = -0.5 + gridY / samplesPerTile;
            const world = surfaceToWorld(localU, localV, hexSize);
            minimumX = Math.min(minimumX, world.x - origin.x);
            maximumX = Math.max(maximumX, world.x - origin.x);
            minimumZ = Math.min(minimumZ, world.z - origin.z);
            maximumZ = Math.max(maximumZ, world.z - origin.z);
            const groundHeight = sampler.sampleGroundHeight(localU, localV);
            minimumGroundHeight = Math.min(minimumGroundHeight, groundHeight);
            maximumGroundHeight = Math.max(maximumGroundHeight, groundHeight);
            if (waterGeometry.kind === "fullPatch") includeWater(localU, localV);
        }
    }
    if (waterGeometry.kind === "coverage") {
        for (let index = 0; index < waterGeometry.positions.length / 3; index += 1) {
            includeWater(
                waterGeometry.positions[index * 3],
                waterGeometry.positions[index * 3 + 2]
            );
        }
    }
    const hasWater = waterGeometry.kind !== "none";
    if (hasWater && (!Number.isFinite(minimumWaterHeight) || !Number.isFinite(maximumWaterHeight))) {
        throw new Error("compiled water geometry produced no finite height bounds");
    }
    const waterMinimum = hasWater ? minimumWaterHeight : null;
    const waterMaximum = hasWater ? maximumWaterHeight : null;
    const bounds: CompiledSurfaceBounds = Object.freeze({
        formatVersion: COMPILED_SURFACE_BOUNDS_FORMAT_VERSION,
        minimumX,
        maximumX,
        minimumZ,
        maximumZ,
        minimumGroundHeight,
        maximumGroundHeight,
        minimumWaterHeight: waterMinimum,
        maximumWaterHeight: waterMaximum,
        minimumBaseHeight: waterMinimum === null
            ? minimumGroundHeight : Math.min(minimumGroundHeight, waterMinimum),
        maximumBaseHeight: waterMaximum === null
            ? maximumGroundHeight : Math.max(maximumGroundHeight, waterMaximum)
    });
    assertCompiledSurfaceBounds(bounds);
    return bounds;
}

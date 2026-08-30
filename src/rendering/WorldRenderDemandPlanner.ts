import { SURFACE_RENDER_CHUNK_SIZE } from "../world/semantic/SurfaceCompileProfile";
import { canonicalizeRenderChunkKey } from "../world/semantic/SurfaceDependency";
import { WorldDescriptorV2 } from "../world/semantic/WorldDescriptorV2";
import { WorldRenderDemand } from "./WorldRenderSession";

export interface WorldRenderDemandPlanOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly centerX: number;
    readonly centerY: number;
    readonly visibleRadiusTiles: number;
    readonly prefetchRadiusTiles: number;
    readonly lod1DistanceTiles: number;
    readonly lod2DistanceTiles: number;
}

function assertRadius(name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
}

function distanceToChunk(centerX: number, centerY: number, chunkX: number, chunkY: number): number {
    const minX = chunkX * SURFACE_RENDER_CHUNK_SIZE - 0.5;
    const minY = chunkY * SURFACE_RENDER_CHUNK_SIZE - 0.5;
    const maxX = minX + SURFACE_RENDER_CHUNK_SIZE;
    const maxY = minY + SURFACE_RENDER_CHUNK_SIZE;
    const dx = centerX < minX ? minX - centerX : centerX > maxX ? centerX - maxX : 0;
    const dy = centerY < minY ? minY - centerY : centerY > maxY ? centerY - maxY : 0;
    return Math.hypot(dx, dy);
}

export function planWorldRenderDemand(options: WorldRenderDemandPlanOptions): readonly WorldRenderDemand[] {
    if (!options || typeof options !== "object" || !options.descriptor
        || !Number.isFinite(options.centerX) || !Number.isFinite(options.centerY)
        || options.centerX < Number.MIN_SAFE_INTEGER || options.centerX > Number.MAX_SAFE_INTEGER
        || options.centerY < Number.MIN_SAFE_INTEGER || options.centerY > Number.MAX_SAFE_INTEGER) {
        throw new TypeError("world render demand plan options are invalid");
    }
    assertRadius("visibleRadiusTiles", options.visibleRadiusTiles);
    assertRadius("prefetchRadiusTiles", options.prefetchRadiusTiles);
    assertRadius("lod1DistanceTiles", options.lod1DistanceTiles);
    assertRadius("lod2DistanceTiles", options.lod2DistanceTiles);
    if (options.prefetchRadiusTiles < options.visibleRadiusTiles
        || options.lod2DistanceTiles < options.lod1DistanceTiles) {
        throw new RangeError("world render demand radii must be monotonically increasing");
    }
    const radius = options.prefetchRadiusTiles;
    const minChunkX = Math.floor((options.centerX - radius) / SURFACE_RENDER_CHUNK_SIZE);
    const minChunkY = Math.floor((options.centerY - radius) / SURFACE_RENDER_CHUNK_SIZE);
    const maxChunkX = Math.floor((options.centerX + radius) / SURFACE_RENDER_CHUNK_SIZE);
    const maxChunkY = Math.floor((options.centerY + radius) / SURFACE_RENDER_CHUNK_SIZE);
    const byCanonical = new Map<string, WorldRenderDemand & { readonly distance: number }>();
    for (let rawX = minChunkX; rawX <= maxChunkX; rawX += 1) {
        for (let rawY = minChunkY; rawY <= maxChunkY; rawY += 1) {
            const distance = distanceToChunk(options.centerX, options.centerY, rawX, rawY);
            if (distance > radius) continue;
            let key;
            try {
                key = canonicalizeRenderChunkKey(options.descriptor, { chunkX: rawX, chunkY: rawY });
            } catch (reason) {
                if (options.descriptor.topology === "bounded" && reason instanceof RangeError) continue;
                throw reason;
            }
            const lane = distance <= options.visibleRadiusTiles ? "visible" as const : "prefetch" as const;
            const lod = distance < options.lod1DistanceTiles ? 0 as const
                : distance < options.lod2DistanceTiles ? 1 as const : 2 as const;
            const serialized = `${key.chunkX},${key.chunkY}`;
            const existing = byCanonical.get(serialized);
            if (existing && existing.distance <= distance) continue;
            byCanonical.set(serialized, Object.freeze({
                key: Object.freeze(key),
                lod,
                lane,
                priority: distance,
                distance
            }));
        }
    }
    return Object.freeze([...byCanonical.values()]
        .sort((first, second) => first.distance - second.distance
            || first.key.chunkX - second.key.chunkX || first.key.chunkY - second.key.chunkY)
        .map(({ distance: _distance, ...demand }) => Object.freeze(demand)));
}

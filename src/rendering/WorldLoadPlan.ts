import type { Point } from "../interfaces";
import type { ResolvedHexMapOptions, WorldLoadOptions } from "../HexMapOptions";
import { normalizeMapCoordinates } from "../helpers/topology";
import { WORLD_CHUNK_SIZE } from "../helpers/chunks";
import { AdaptiveStreamingController } from "./AdaptiveStreamingController";
import { MAX_WORLD_GENERATION_CHUNK_SIZE } from "../world/generateWorldChunk";
import { assertWorldSource, type WorldSource } from "../world/WorldSource";
import { createWorldSurfaceResolver } from "../world/WorldSurfaceResolver";
import { createWorldSurfaceView, type WorldSurfaceView } from "../world/WorldSurfaceView";

export interface WorldLoadPlan {
    source: WorldSource;
    chunkSize: number;
    initialTile: Point;
    loadRadius: number;
    retentionRadius: number;
    maxResidentChunks: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    frameBudgetMs: number;
    maxMountsPerFrame: number;
    predictionSeconds: number;
    predictionMaxChunks: number;
    floatingOriginThreshold: number;
    adaptiveController: AdaptiveStreamingController;
    surface: WorldSurfaceView;
}

// Resolves every deterministic world-session input before HexMap replaces the
// active session. Once this function succeeds the caller owns a complete plan;
// if it fails, the unpublishable source is disposed here.
export function createWorldLoadPlan(
    options: WorldLoadOptions,
    mapOptions: Readonly<ResolvedHexMapOptions>
): WorldLoadPlan {
    if (!options || typeof options !== "object" || !options.source) {
        throw new TypeError("world load options with a source are required");
    }
    const source = options.source;
    try {
        assertWorldSource(source);
        const chunkSize = source.chunkSize;
        if (!Number.isInteger(chunkSize) || chunkSize <= 0
            || chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE || chunkSize % WORLD_CHUNK_SIZE !== 0) {
            throw new RangeError(
                `source.chunkSize must be a positive multiple of ${WORLD_CHUNK_SIZE} up to ${MAX_WORLD_GENERATION_CHUNK_SIZE}`
            );
        }

        const defaultTile = source.bounds
            ? { x: Math.floor((source.bounds.width - 1) / 2), y: Math.floor((source.bounds.height - 1) / 2) }
            : { x: 0, y: 0 };
        const requestedTile = options.initialTile ?? defaultTile;
        const initialTile = normalizeMapCoordinates(source.map, requestedTile.x, requestedTile.y);
        if (!initialTile || !Number.isSafeInteger(initialTile.x) || !Number.isSafeInteger(initialTile.y)) {
            throw new RangeError("initialTile must identify a safe integer tile inside the world");
        }

        const chunkSpan = chunkSize * mapOptions.size * 1.5;
        const loadRadius = options.loadRadius ?? Math.max(1, Math.ceil(mapOptions.renderDistance / chunkSpan));
        const retentionRadius = options.retentionRadius ?? loadRadius + 1;
        const maxResidentChunks = options.maxResidentChunks ?? (retentionRadius * 2 + 1) ** 2;
        const maxRetries = options.maxRetries ?? 2;
        const retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
        const frameBudgetMs = options.frameBudgetMs ?? 3;
        const maxMountsPerFrame = options.maxMountsPerFrame ?? 2;
        const predictionSeconds = options.predictionSeconds ?? 1.25;
        const predictionMaxChunks = options.predictionMaxChunks ?? 1;
        integerAtLeast("loadRadius", loadRadius, 0);
        integerAtLeast("retentionRadius", retentionRadius, loadRadius);
        integerAtLeast("maxResidentChunks", maxResidentChunks, 1);
        integerAtLeast("maxRetries", maxRetries, 0);
        integerAtLeast("retryBaseDelayMs", retryBaseDelayMs, 0);
        integerAtLeast("maxMountsPerFrame", maxMountsPerFrame, 1);
        integerAtLeast("predictionMaxChunks", predictionMaxChunks, 0);
        if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) {
            throw new RangeError("frameBudgetMs must be a positive finite number");
        }
        if (!Number.isFinite(predictionSeconds) || predictionSeconds < 0) {
            throw new RangeError("predictionSeconds must be a non-negative finite number");
        }

        const floatingOriginThreshold = options.floatingOriginThreshold ?? 8192;
        if (!Number.isFinite(floatingOriginThreshold) || floatingOriginThreshold <= mapOptions.size * chunkSize) {
            throw new RangeError("floatingOriginThreshold must exceed one source chunk span");
        }

        const baseWorkerCount = Math.max(1, source.stats?.configuredWorkers ?? source.stats?.workers ?? 1);
        const adaptiveController = new AdaptiveStreamingController({
            enabled: options.adaptiveStreaming ?? true,
            targetFrameMs: options.targetFrameMs,
            baseFrameBudgetMs: frameBudgetMs,
            baseMaxTasksPerFrame: maxMountsPerFrame,
            baseWorkerCount,
            minimumWorkerCount: options.adaptiveMinWorkerCount ?? 1,
            baseLodDistances: {
                near: mapOptions.lodNearDistance,
                far: mapOptions.lodFarDistance,
                vegetation: mapOptions.vegetationRenderDistance,
                hysteresis: mapOptions.chunkLodHysteresis
            },
            degradeFrames: options.adaptiveDegradeFrames,
            recoverFrames: options.adaptiveRecoverFrames,
            cooldownFrames: options.adaptiveCooldownFrames
        });
        const descriptor = source.descriptor;
        const resolver = descriptor ? createWorldSurfaceResolver({
            seed: descriptor.seed,
            waterStyle: descriptor.waterStyle,
            domain: descriptor.topology === "toroidal"
                ? { topology: "toroidal", width: descriptor.width!, height: descriptor.height! }
                : { topology: "infinite" }
        }) : undefined;
        const surface = createWorldSurfaceView({
            map: source.map,
            resolver,
            tileSize: mapOptions.size,
            mountainHeight: mapOptions.mountainHeight
        });

        return {
            source,
            chunkSize,
            initialTile,
            loadRadius,
            retentionRadius,
            maxResidentChunks,
            maxRetries,
            retryBaseDelayMs,
            frameBudgetMs,
            maxMountsPerFrame,
            predictionSeconds,
            predictionMaxChunks: Math.min(predictionMaxChunks, Math.max(0, retentionRadius - loadRadius)),
            floatingOriginThreshold,
            adaptiveController,
            surface
        };
    } catch (reason) {
        if (typeof source.dispose === "function") source.dispose();
        throw reason;
    }
}

function integerAtLeast(name: string, value: number, minimum: number): void {
    if (!Number.isInteger(value) || value < minimum) {
        throw new RangeError(`${name} must be an integer >= ${minimum}`);
    }
}

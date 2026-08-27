import { Point } from "../interfaces";
import { LifecycleScope, LifecycleScopeStats, lifecycleAbortError } from "../runtime/LifecycleScope";
import { RuntimeWorkCoordinator } from "../runtime/RuntimeWorkCoordinator";
import {
    ChunkResidencyCoordinator,
    getChunkResidencyCoordinator
} from "../world/ChunkResidencyCoordinator";
import { WorldChunk, WorldSource } from "../world/WorldSource";
import {
    WorldStreamer,
    WorldStreamerHandlers,
    WorldStreamerOptions,
    WorldStreamingStats
} from "../world/WorldStreamer";

export interface RenderWorldStreamingOptions extends Omit<WorldStreamerOptions, "residency"> {}

export interface RenderWorldControllerOptions {
    drainTimeoutMs?: number;
    error?: (error: Error) => void;
}

// Owns the render session's source/residency/streamer lifecycle. Rendering
// callbacks stay in the host so this boundary can be adopted without moving
// Three.js objects or public interaction APIs at the same time.
export class RenderWorldController {
    public readonly residency: ChunkResidencyCoordinator;
    public readonly lifecycle: LifecycleScope;
    private activeStreamer: WorldStreamer | undefined;
    private disposed = false;
    private readonly detachWorkTelemetry: (() => void) | undefined;

    constructor(
        public readonly source: WorldSource,
        workCoordinator?: RuntimeWorkCoordinator,
        options: RenderWorldControllerOptions = {}
    ) {
        this.residency = getChunkResidencyCoordinator(source);
        this.lifecycle = new LifecycleScope("render-world", options);
        this.detachWorkTelemetry = workCoordinator?.registerTelemetry("streaming", () => ({
            pendingTasks: (this.stats?.pendingChunks ?? 0) + (this.stats?.queuedChunks ?? 0),
            pendingWeight: this.stats?.queuedWeight ?? this.stats?.queuedChunks ?? 0,
            busyTasks: this.stats?.busyWorkers ?? 0,
            oldestTaskAgeMs: this.stats?.oldestQueuedMs ?? 0,
            shedTasks: this.stats?.shedTasks ?? 0,
            starvationPromotions: this.stats?.starvationPromotions ?? 0
        }));
    }

    public startStreaming(
        handlers: WorldStreamerHandlers,
        options: RenderWorldStreamingOptions = {}
    ): WorldStreamer {
        if (this.disposed) throw new Error("RenderWorldController has been disposed");
        if (this.activeStreamer) throw new Error("Render world streaming has already started");
        const guardedHandlers: WorldStreamerHandlers = {
            chunkLoaded: chunk => { this.lifecycle.publish(chunk, handlers.chunkLoaded); },
            chunkUnloading: chunk => {
                // Unload is cleanup, not publication: it must still run while
                // the scope is closing so mounted resources are released.
                handlers.chunkUnloading(chunk);
            },
            error: error => { this.lifecycle.publish(error, value => handlers.error?.(value)); }
        };
        this.activeStreamer = new WorldStreamer(this.source, guardedHandlers, {
            ...options,
            residency: this.residency,
            residencyOwner: options.residencyOwner ?? "render-world"
        });
        return this.activeStreamer;
    }

    public setCenterTile(x: number, y: number, predictedTile?: Point): Promise<WorldChunk> {
        if (!this.activeStreamer) return Promise.reject(new Error("Render world streaming has not started"));
        const task = this.activeStreamer.setCenterTile(x, y, predictedTile).then(chunk => {
            if (!this.lifecycle.active) throw lifecycleAbortError("Render world session was superseded");
            return chunk;
        });
        // Track the guarded promise itself so settled cannot resolve one
        // microtask before the public request observes the generation gate.
        return this.lifecycle.track(task);
    }

    public get streamer(): WorldStreamer | undefined { return this.activeStreamer; }

    public get stats(): Readonly<WorldStreamingStats> | undefined {
        return this.activeStreamer?.stats;
    }

    public get lifecycleStats(): Readonly<LifecycleScopeStats> { return this.lifecycle.stats; }

    public get settled(): Promise<void> { return this.lifecycle.settled; }

    public stop(disposeSource = true): void {
        if (this.disposed) return;
        this.disposed = true;
        this.detachWorkTelemetry?.();
        // Speculative streamer requests are not individually public lifecycle
        // operations. Register their aggregate drain before closing the scope
        // so the same bounded shutdown policy also covers a source that ignores
        // cancellation instead of making RenderWorldController.settled hang.
        if (this.activeStreamer) void this.lifecycle.track(this.activeStreamer.settled).catch(() => undefined);
        void this.lifecycle.close();
        this.activeStreamer?.dispose(false);
        this.activeStreamer = undefined;
        this.residency.dispose(false);
        if (disposeSource) this.source.dispose();
    }
}

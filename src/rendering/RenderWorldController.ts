import { Point } from "../interfaces";
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

// Owns the render session's source/residency/streamer lifecycle. Rendering
// callbacks stay in the host so this boundary can be adopted without moving
// Three.js objects or public interaction APIs at the same time.
export class RenderWorldController {
    public readonly residency: ChunkResidencyCoordinator;
    private activeStreamer: WorldStreamer | undefined;
    private disposed = false;

    constructor(public readonly source: WorldSource) {
        this.residency = getChunkResidencyCoordinator(source);
    }

    public startStreaming(
        handlers: WorldStreamerHandlers,
        options: RenderWorldStreamingOptions = {}
    ): WorldStreamer {
        if (this.disposed) throw new Error("RenderWorldController has been disposed");
        if (this.activeStreamer) throw new Error("Render world streaming has already started");
        this.activeStreamer = new WorldStreamer(this.source, handlers, {
            ...options,
            residency: this.residency,
            residencyOwner: options.residencyOwner ?? "render-world"
        });
        return this.activeStreamer;
    }

    public setCenterTile(x: number, y: number, predictedTile?: Point): Promise<WorldChunk> {
        if (!this.activeStreamer) return Promise.reject(new Error("Render world streaming has not started"));
        return this.activeStreamer.setCenterTile(x, y, predictedTile);
    }

    public get streamer(): WorldStreamer | undefined { return this.activeStreamer; }

    public get stats(): Readonly<WorldStreamingStats> | undefined {
        return this.activeStreamer?.stats;
    }

    public stop(disposeSource = true): void {
        if (this.disposed) return;
        this.disposed = true;
        this.activeStreamer?.dispose(false);
        this.activeStreamer = undefined;
        this.residency.dispose(false);
        if (disposeSource) this.source.dispose();
    }
}

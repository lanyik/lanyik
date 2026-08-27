import { WorkQueueBackpressureError } from "../runtime/PriorityTaskQueue";
import { WorldChunk } from "../world/WorldSource";
import { WorldStreamer } from "../world/WorldStreamer";
import { FrameTaskScheduler } from "./FrameTaskScheduler";

export interface WorldChunkMountQueueOptions {
    frameTasks: FrameTaskScheduler;
    streamer(): WorldStreamer | undefined;
    demandKey(): string | undefined;
    signal(): AbortSignal | undefined;
    mounted(key: string): boolean;
    priority(chunk: WorldChunk): number;
    mount(chunk: WorldChunk): void;
}

export interface WorldChunkMountQueueStats {
    readonly deferredChunks: number;
}

interface DeferredMount {
    readonly chunk: WorldChunk;
    readonly priority: number;
    readonly sequence: number;
}

// Bridges source residency and the frame-budget executor. Backpressure may
// discard a queued mount, but never loses the resident permanently: shed keys
// retry one per frame in current-demand/distance order until capacity returns.
export class WorldChunkMountQueue {
    private readonly deferred = new Map<string, DeferredMount>();
    private sequence = 0;

    constructor(private readonly options: WorldChunkMountQueueOptions) {}

    public schedule(chunk: WorldChunk): void {
        const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
        const signal = this.options.signal();
        if (signal?.aborted || this.options.mounted(key)) {
            this.deferred.delete(key);
            return;
        }
        const priority = this.options.priority(chunk);
        if (key === this.options.demandKey()) {
            this.deferred.delete(key);
            this.options.mount(chunk);
            return;
        }
        this.options.frameTasks.enqueue(key, priority, () => {
            this.deferred.delete(key);
            if (this.options.streamer()?.hasResident(chunk.chunkX, chunk.chunkY)) {
                this.options.mount(chunk);
            }
        }, {
            lane: "visible",
            weight: Math.max(1, Math.ceil(chunk.coreTiles.length / 128)),
            signal,
            cancelled: reason => {
                if (reason instanceof WorkQueueBackpressureError
                    && this.options.streamer()?.hasResident(chunk.chunkX, chunk.chunkY)) {
                    const existing = this.deferred.get(key);
                    this.deferred.set(key, {
                        chunk,
                        priority,
                        sequence: existing?.sequence ?? this.sequence++
                    });
                }
            }
        });
    }

    public retryOne(): void {
        const streamer = this.options.streamer();
        if (!streamer) {
            this.deferred.clear();
            return;
        }
        const demandKey = this.options.demandKey();
        let selectedKey: string | undefined;
        let selected: DeferredMount | undefined;
        for (const [key, candidate] of this.deferred) {
            if (!streamer.hasResident(candidate.chunk.chunkX, candidate.chunk.chunkY)
                || this.options.mounted(key)) {
                this.deferred.delete(key);
                continue;
            }
            const demanded = key === demandKey;
            const selectedDemanded = selectedKey === demandKey;
            if (!selected
                || (demanded && !selectedDemanded)
                || (demanded === selectedDemanded && (
                    candidate.priority < selected.priority
                    || (candidate.priority === selected.priority && candidate.sequence < selected.sequence)
                ))) {
                selectedKey = key;
                selected = candidate;
            }
        }
        if (!selectedKey || !selected) return;
        this.deferred.delete(selectedKey);
        this.schedule(selected.chunk);
    }

    public forget(key: string): void {
        this.deferred.delete(key);
        this.options.frameTasks.cancel(key);
    }

    public clear(): void { this.deferred.clear(); }

    public get stats(): Readonly<WorldChunkMountQueueStats> {
        return { deferredChunks: this.deferred.size };
    }
}

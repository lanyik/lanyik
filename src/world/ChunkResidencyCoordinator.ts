import { ChunkRequestOptions } from "./WorldGeneratorPool";
import { assertWorldChunk, assertWorldSource, WorldChunk, WorldSource } from "./WorldSource";

export type ChunkLeaseOwner = string;

export interface ChunkLeaseOptions extends ChunkRequestOptions {
    owner: ChunkLeaseOwner;
}

export interface WorldChunkLease {
    readonly chunk: WorldChunk;
    readonly owner: ChunkLeaseOwner;
    readonly released: boolean;
    release(): void;
}

export interface ChunkResidencyStats {
    residentChunks: number;
    pendingChunks: number;
    activeLeases: number;
    leasesByOwner: Readonly<Record<string, number>>;
}

interface PendingAcquire {
    owner: ChunkLeaseOwner;
    signal?: AbortSignal;
    priority: number;
    settled: boolean;
    abort?: () => void;
    resolve(lease: WorldChunkLease): void;
    reject(reason: Error): void;
}

interface ResidencyEntry {
    readonly key: string;
    readonly chunkX: number;
    readonly chunkY: number;
    readonly waiters: Set<PendingAcquire>;
    readonly leases: Set<WorldChunkLeaseImpl>;
    chunk?: WorldChunk;
    loading?: Promise<void>;
    controller?: AbortController;
}

function abortError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function validateOwner(owner: unknown): asserts owner is string {
    if (typeof owner !== "string" || owner.trim().length === 0) {
        throw new TypeError("chunk lease owner must be a non-empty string");
    }
}

class WorldChunkLeaseImpl implements WorldChunkLease {
    private isReleased = false;

    constructor(
        public readonly chunk: WorldChunk,
        public readonly owner: ChunkLeaseOwner,
        private readonly onRelease: (lease: WorldChunkLeaseImpl) => void
    ) {}

    public get released(): boolean { return this.isReleased; }

    public release(): void {
        if (this.isReleased) return;
        this.isReleased = true;
        this.onRelease(this);
    }
}

// Coordinates all materialized detail-chunk ownership for one WorldSource.
// Each logical chunk is loaded once, concurrent callers receive independent
// leases, and WorldSource.releaseChunk() runs only after the final lease ends.
export class ChunkResidencyCoordinator {
    private readonly entries = new Map<string, ResidencyEntry>();
    private disposed = false;

    constructor(public readonly source: WorldSource) {
        assertWorldSource(source);
    }

    public acquireChunk(
        chunkX: number,
        chunkY: number,
        options: ChunkLeaseOptions
    ): Promise<WorldChunkLease> {
        if (this.disposed) return Promise.reject(new Error("ChunkResidencyCoordinator has been disposed"));
        const owner = options?.owner;
        try {
            validateOwner(owner);
        } catch (reason) {
            return Promise.reject(reason);
        }
        if (options?.signal?.aborted) return Promise.reject(abortError("Chunk lease request was aborted"));
        const resolved = this.source.resolveChunk(chunkX, chunkY);
        if (!resolved) return Promise.reject(new RangeError("chunk coordinates are outside the world bounds"));
        const key = ChunkResidencyCoordinator.key(resolved.x, resolved.y);
        let entry = this.entries.get(key);
        if (!entry) {
            entry = {
                key,
                chunkX: resolved.x,
                chunkY: resolved.y,
                waiters: new Set(),
                leases: new Set()
            };
            this.entries.set(key, entry);
        }
        if (entry.chunk) return Promise.resolve(this.createLease(entry, owner));

        return new Promise<WorldChunkLease>((resolve, reject) => {
            const waiter: PendingAcquire = {
                owner,
                signal: options?.signal,
                priority: Number.isFinite(options?.priority) ? options.priority as number : 0,
                settled: false,
                resolve,
                reject
            };
            if (options?.signal) {
                waiter.abort = () => this.abortWaiter(entry!, waiter);
                options.signal.addEventListener("abort", waiter.abort, { once: true });
            }
            entry!.waiters.add(waiter);
            if (!entry!.loading) this.startLoad(entry!);
        });
    }

    public get stats(): Readonly<ChunkResidencyStats> {
        const leasesByOwner: Record<string, number> = {};
        let residentChunks = 0;
        let pendingChunks = 0;
        let activeLeases = 0;
        for (const entry of this.entries.values()) {
            if (entry.chunk) residentChunks += 1;
            if (entry.loading && !entry.chunk) pendingChunks += 1;
            activeLeases += entry.leases.size;
            for (const lease of entry.leases) {
                leasesByOwner[lease.owner] = (leasesByOwner[lease.owner] ?? 0) + 1;
            }
        }
        return { residentChunks, pendingChunks, activeLeases, leasesByOwner };
    }

    public hasResident(chunkX: number, chunkY: number): boolean {
        const resolved = this.source.resolveChunk(chunkX, chunkY);
        return resolved !== undefined
            && this.entries.get(ChunkResidencyCoordinator.key(resolved.x, resolved.y))?.chunk !== undefined;
    }

    public dispose(disposeSource = false): void {
        if (this.disposed) {
            if (disposeSource) this.source.dispose();
            return;
        }
        this.disposed = true;
        for (const entry of this.entries.values()) {
            entry.controller?.abort();
            for (const waiter of [...entry.waiters]) {
                this.rejectWaiter(entry, waiter, abortError("Chunk residency was disposed"));
            }
            const chunk = entry.chunk;
            entry.chunk = undefined;
            for (const lease of entry.leases) lease.release();
            entry.leases.clear();
            if (chunk) this.releaseSourceChunk(chunk);
        }
        this.entries.clear();
        if (coordinators.get(this.source) === this) coordinators.delete(this.source);
        if (disposeSource) this.source.dispose();
    }

    private startLoad(entry: ResidencyEntry): void {
        const controller = new AbortController();
        entry.controller = controller;
        const priority = this.minimumPriority(entry);
        entry.loading = this.source.loadChunk(entry.chunkX, entry.chunkY, {
            priority,
            signal: controller.signal
        }).then(chunk => {
            try {
                assertWorldChunk(this.source, chunk, entry.chunkX, entry.chunkY);
            } catch (reason) {
                this.releaseSourceChunk(chunk);
                throw reason;
            }
            if (this.disposed || entry.waiters.size === 0) {
                this.releaseSourceChunk(chunk);
                return;
            }
            entry.chunk = chunk;
            for (const waiter of [...entry.waiters]) {
                if (waiter.signal?.aborted) {
                    this.rejectWaiter(entry, waiter, abortError("Chunk lease request was aborted"));
                    continue;
                }
                this.resolveWaiter(entry, waiter, this.createLease(entry, waiter.owner));
            }
            this.releaseIfUnused(entry);
        }).catch(reason => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            if (entry.waiters.size > 0 && controller.signal.aborted && !this.disposed) return;
            for (const waiter of [...entry.waiters]) this.rejectWaiter(entry, waiter, error);
        }).finally(() => {
            if (entry.controller !== controller) return;
            entry.loading = undefined;
            entry.controller = undefined;
            if (!this.disposed && entry.waiters.size > 0 && !entry.chunk) this.startLoad(entry);
            else this.releaseIfUnused(entry);
        });
    }

    private minimumPriority(entry: ResidencyEntry): number {
        let priority = 0;
        let initialized = false;
        for (const waiter of entry.waiters) {
            if (!initialized || waiter.priority < priority) priority = waiter.priority;
            initialized = true;
        }
        return priority;
    }

    private abortWaiter(entry: ResidencyEntry, waiter: PendingAcquire): void {
        if (waiter.settled) return;
        this.rejectWaiter(entry, waiter, abortError("Chunk lease request was aborted"));
        if (entry.waiters.size === 0 && entry.leases.size === 0 && entry.loading) entry.controller?.abort();
        this.releaseIfUnused(entry);
    }

    private createLease(entry: ResidencyEntry, owner: ChunkLeaseOwner): WorldChunkLeaseImpl {
        const lease = new WorldChunkLeaseImpl(entry.chunk!, owner, released => {
            entry.leases.delete(released);
            this.releaseIfUnused(entry);
        });
        entry.leases.add(lease);
        return lease;
    }

    private resolveWaiter(entry: ResidencyEntry, waiter: PendingAcquire, lease: WorldChunkLease): void {
        if (waiter.settled) return;
        waiter.settled = true;
        entry.waiters.delete(waiter);
        if (waiter.abort && waiter.signal) waiter.signal.removeEventListener("abort", waiter.abort);
        waiter.resolve(lease);
    }

    private rejectWaiter(entry: ResidencyEntry, waiter: PendingAcquire, reason: Error): void {
        if (waiter.settled) return;
        waiter.settled = true;
        entry.waiters.delete(waiter);
        if (waiter.abort && waiter.signal) waiter.signal.removeEventListener("abort", waiter.abort);
        waiter.reject(reason);
    }

    private releaseIfUnused(entry: ResidencyEntry): void {
        if ((entry.loading && !entry.chunk) || entry.waiters.size > 0 || entry.leases.size > 0) return;
        if (entry.chunk) this.releaseSourceChunk(entry.chunk);
        entry.chunk = undefined;
        if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    }

    private releaseSourceChunk(chunk: WorldChunk): void {
        try {
            this.source.releaseChunk(chunk);
        } catch {
            // Cleanup must remain idempotent even for a custom source whose
            // release hook fails after its surrounding world is disposed.
        }
    }

    public static key(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
    }
}

const coordinators = new WeakMap<WorldSource, ChunkResidencyCoordinator>();

export function getChunkResidencyCoordinator(source: WorldSource): ChunkResidencyCoordinator {
    const existing = coordinators.get(source);
    if (existing) return existing;
    const coordinator = new ChunkResidencyCoordinator(source);
    coordinators.set(source, coordinator);
    return coordinator;
}

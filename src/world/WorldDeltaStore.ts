import {
    assertWorldTileOverride,
    cloneWorldTileOverride,
    hasWorldTileOverride,
    worldTileOverridesEqual
} from "./generateWorldChunk";
import {
    assertWorldDeltaChunkIdentity,
    assertWorldDeltaChunkSize,
    normalizeWorldChunkDelta,
    worldDeltaTileBelongsToChunk,
    WorldDeltaConflictError,
    WORLD_DELTA_FORMAT_VERSION,
    type WorldChunkDelta,
    type WorldDeltaBatchOptions,
    type WorldDeltaChange,
    type WorldDeltaReadOptions,
    type WorldDeltaStore
} from "./WorldDeltaContract";

export {
    normalizeWorldChunkDelta,
    WorldDeltaConflictError,
    WORLD_DELTA_FORMAT_VERSION
} from "./WorldDeltaContract";
export type {
    WorldChunkDelta,
    WorldDeltaBatchOptions,
    WorldDeltaChange,
    WorldDeltaEntry,
    WorldDeltaReadOptions,
    WorldDeltaStore
} from "./WorldDeltaContract";

export interface IndexedDbWorldDeltaStoreOptions {
    databaseName?: string;
    openTimeoutMs?: number;
}

function chunkKey(worldId: string, chunkX: number, chunkY: number): string {
    return JSON.stringify([worldId, chunkX, chunkY]);
}

function assertChanges(
    changes: readonly WorldDeltaChange[],
    chunkX: number,
    chunkY: number,
    options: WorldDeltaBatchOptions
): void {
    assertWorldDeltaChunkSize(options.chunkSize);
    if (!Array.isArray(changes)) throw new TypeError("world delta changes must be an array");
    if (options.expectedRevision !== undefined
        && (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)) {
        throw new RangeError("expectedRevision must be a non-negative safe integer");
    }
    for (const change of changes) {
        if (!change || !Number.isSafeInteger(change.x) || !Number.isSafeInteger(change.y)) {
            throw new RangeError("world delta tile coordinates must be safe integers");
        }
        if (!worldDeltaTileBelongsToChunk(change.x, change.y, chunkX, chunkY, options.chunkSize)) {
            throw new RangeError("world delta tile coordinates do not belong to the declared chunk");
        }
        if (change.override !== null) assertWorldTileOverride(change.override);
    }
}

function mergeChunkDelta(
    current: WorldChunkDelta | undefined,
    worldId: string,
    chunkX: number,
    chunkY: number,
    changes: readonly WorldDeltaChange[],
    options: WorldDeltaBatchOptions
): WorldChunkDelta | undefined {
    assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
    assertChanges(changes, chunkX, chunkY, options);
    if (current) current = normalizeWorldChunkDelta(current, worldId, chunkX, chunkY, options);
    const actualRevision = current?.revision ?? 0;
    if (options.expectedRevision !== undefined && options.expectedRevision !== actualRevision) {
        throw new WorldDeltaConflictError(options.expectedRevision, actualRevision);
    }
    if (changes.length === 0) return current;

    const entries = new Map((current?.entries ?? []).map(entry => [
        `${entry.x},${entry.y}`,
        { x: entry.x, y: entry.y, override: cloneWorldTileOverride(entry.override) }
    ]));
    for (const change of changes) {
        const key = `${change.x},${change.y}`;
        if (change.override === null || !hasWorldTileOverride(change.override)) entries.delete(key);
        else entries.set(key, { x: change.x, y: change.y, override: cloneWorldTileOverride(change.override) });
    }
    const currentEntries = new Map((current?.entries ?? []).map(entry => [`${entry.x},${entry.y}`, entry.override]));
    const changed = entries.size !== currentEntries.size || [...entries].some(([key, entry]) =>
        !worldTileOverridesEqual(entry.override, currentEntries.get(key)));
    if (!changed) return current;
    return {
        version: WORLD_DELTA_FORMAT_VERSION,
        worldId,
        chunkX,
        chunkY,
        chunkSize: options.chunkSize,
        revision: actualRevision + 1,
        entries: [...entries.values()].sort((a, b) => a.x - b.x || a.y - b.y)
    };
}

function cloneDelta(delta: WorldChunkDelta): WorldChunkDelta {
    if (delta.version !== WORLD_DELTA_FORMAT_VERSION) throw new Error(`Unsupported world delta version: ${delta.version}`);
    return {
        ...delta,
        entries: delta.entries.map(entry => ({ ...entry, override: cloneWorldTileOverride(entry.override) }))
    };
}

export class MemoryWorldDeltaStore implements WorldDeltaStore {
    protected readonly chunks = new Map<string, WorldChunkDelta>();
    protected disposed = false;

    public loadChunk(
        worldId: string,
        chunkX: number,
        chunkY: number,
        options: WorldDeltaReadOptions
    ): Promise<WorldChunkDelta | undefined> {
        if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
        assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
        assertWorldDeltaChunkSize(options.chunkSize);
        const delta = this.chunks.get(chunkKey(worldId, chunkX, chunkY));
        return Promise.resolve(delta
            ? cloneDelta(normalizeWorldChunkDelta(delta, worldId, chunkX, chunkY, options))
            : undefined);
    }

    public putChunkDelta(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): Promise<WorldChunkDelta | undefined> {
        if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
        try {
            const result = this.applyChunkDelta(worldId, chunkX, chunkY, changes, options);
            return Promise.resolve(result ? cloneDelta(result) : undefined);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public flush(): Promise<void> { return Promise.resolve(); }

    public listWorld(worldId: string, signal?: AbortSignal): Promise<readonly WorldChunkDelta[]> {
        if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
        signal?.throwIfAborted();
        const deltas = [...this.chunks.values()]
            .filter(delta => delta.worldId === worldId)
            .sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY)
            .map(delta => cloneDelta(delta));
        return Promise.resolve(deltas);
    }

    public async replaceWorld(worldId: string, deltas: readonly WorldChunkDelta[], signal?: AbortSignal): Promise<void> {
        if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
        signal?.throwIfAborted();
        const replacements = new Map<string, WorldChunkDelta>();
        for (const delta of deltas) {
            const normalized = normalizeWorldChunkDelta(
                delta,
                worldId,
                delta.chunkX,
                delta.chunkY,
                { chunkSize: delta.chunkSize }
            );
            const key = chunkKey(worldId, normalized.chunkX, normalized.chunkY);
            if (replacements.has(key)) throw new TypeError("world delta checkpoint contains duplicate chunks");
            replacements.set(key, normalized);
        }
        for (const [key, delta] of this.chunks) if (delta.worldId === worldId) this.chunks.delete(key);
        for (const [key, delta] of replacements) this.chunks.set(key, cloneDelta(delta));
    }

    public async clear(worldId: string): Promise<void> {
        for (const [key, delta] of this.chunks) if (delta.worldId === worldId) this.chunks.delete(key);
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.chunks.clear();
    }

    protected applyChunkDelta(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): WorldChunkDelta | undefined {
        const key = chunkKey(worldId, chunkX, chunkY);
        const result = mergeChunkDelta(this.chunks.get(key), worldId, chunkX, chunkY, changes, options);
        if (result) this.chunks.set(key, result);
        return result;
    }
}

const DEFAULT_DELTA_DATABASE_NAME = "three-hex-map-world-deltas-v1";
const DELTA_DATABASE_VERSION = 1;
const DELTA_OBJECT_STORE = "deltas";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
}

function transactionComplete(transaction: IDBTransaction, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const abort = () => {
            try { transaction.abort(); } catch (error) {
                if (!(error instanceof DOMException) || error.name !== "InvalidStateError") throw error;
            }
        };
        const cleanup = () => signal?.removeEventListener("abort", abort);
        signal?.addEventListener("abort", abort, { once: true });
        transaction.addEventListener("complete", () => { cleanup(); resolve(); }, { once: true });
        transaction.addEventListener("abort", () => {
            cleanup();
            reject(signal?.aborted ? signal.reason : transaction.error ?? new Error("IndexedDB transaction aborted"));
        }, { once: true });
        if (signal?.aborted) abort();
    });
}

interface StoredWorldChunkDelta extends WorldChunkDelta { key: string }

//Durable gameplay deltas intentionally use a database separate from the
//rebuildable base-terrain cache. Writes are serialized; flush() is the save
//barrier applications should await before ending a session.
export class IndexedDbWorldDeltaStore implements WorldDeltaStore {
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private pending: Promise<void> = Promise.resolve();
    private pendingError: unknown;
    private closing = false;
    private disposed = false;

    constructor(options: IndexedDbWorldDeltaStoreOptions = {}) {
        this.databaseName = options.databaseName ?? DEFAULT_DELTA_DATABASE_NAME;
        this.openTimeoutMs = options.openTimeoutMs ?? 2000;
        if (!this.databaseName.trim()) throw new TypeError("delta databaseName must be a non-empty string");
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new RangeError("delta openTimeoutMs must be a positive finite number");
        }
    }

    public async loadChunk(
        worldId: string,
        chunkX: number,
        chunkY: number,
        options: WorldDeltaReadOptions
    ): Promise<WorldChunkDelta | undefined> {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
        assertWorldDeltaChunkSize(options.chunkSize);
        await this.flush();
        const database = await this.open();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
        const record = await requestResult(transaction.objectStore(DELTA_OBJECT_STORE).get(chunkKey(worldId, chunkX, chunkY))) as StoredWorldChunkDelta | undefined;
        await transactionComplete(transaction);
        if (!record) return undefined;
        const delta = normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options);
        return cloneDelta(delta);
    }

    public putChunkDelta(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): Promise<WorldChunkDelta | undefined> {
        if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
        return this.enqueue(async () => {
            const key = chunkKey(worldId, chunkX, chunkY);
            const database = await this.open();
            const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
            const completion = transactionComplete(transaction);
            try {
                const store = transaction.objectStore(DELTA_OBJECT_STORE);
                const record = await requestResult(store.get(key)) as StoredWorldChunkDelta | undefined;
                const current = record
                    ? normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options)
                    : undefined;
                const result = mergeChunkDelta(current, worldId, chunkX, chunkY, changes, options);
                const requiresWrite = result !== undefined && result.revision !== current?.revision;
                if (requiresWrite) store.put({ key, ...cloneDelta(result) } satisfies StoredWorldChunkDelta);
                await completion;
                return result ? cloneDelta(result) : undefined;
            } catch (reason) {
                try { transaction.abort(); } catch { /* transaction already settled */ }
                await completion.catch(() => undefined);
                throw reason;
            }
        });
    }

    public async flush(): Promise<void> {
        await this.pending;
        if (this.pendingError !== undefined) {
            const error = this.pendingError;
            this.pendingError = undefined;
            throw error;
        }
    }

    public async listWorld(worldId: string, signal?: AbortSignal): Promise<readonly WorldChunkDelta[]> {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        signal?.throwIfAborted();
        await this.flush();
        signal?.throwIfAborted();
        const database = await this.open();
        signal?.throwIfAborted();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
        const completion = transactionComplete(transaction, signal);
        let records: StoredWorldChunkDelta[];
        try {
            records = await requestResult(
                transaction.objectStore(DELTA_OBJECT_STORE).index("worldId").getAll(worldId)
            ) as StoredWorldChunkDelta[];
            await completion;
        } catch (reason) {
            await completion.catch(() => undefined);
            throw signal?.aborted ? signal.reason : reason;
        }
        return records.map(record => normalizeWorldChunkDelta(
            record,
            worldId,
            record.chunkX,
            record.chunkY,
            { chunkSize: record.chunkSize }
        )).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY);
    }

    public replaceWorld(worldId: string, deltas: readonly WorldChunkDelta[], signal?: AbortSignal): Promise<void> {
        if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
        signal?.throwIfAborted();
        const replacements = new Map<string, WorldChunkDelta>();
        for (const delta of deltas) {
            const normalized = normalizeWorldChunkDelta(
                delta,
                worldId,
                delta.chunkX,
                delta.chunkY,
                { chunkSize: delta.chunkSize }
            );
            const key = chunkKey(worldId, normalized.chunkX, normalized.chunkY);
            if (replacements.has(key)) return Promise.reject(new TypeError("world delta checkpoint contains duplicate chunks"));
            replacements.set(key, normalized);
        }
        return this.enqueue(async () => {
            signal?.throwIfAborted();
            const database = await this.open();
            signal?.throwIfAborted();
            const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
            const completion = transactionComplete(transaction, signal);
            try {
                const store = transaction.objectStore(DELTA_OBJECT_STORE);
                const keys = await requestResult(store.index("worldId").getAllKeys(worldId));
                signal?.throwIfAborted();
                for (const key of keys) store.delete(key);
                for (const [key, delta] of replacements) {
                    store.put({ key, ...cloneDelta(delta) } satisfies StoredWorldChunkDelta);
                }
                await completion;
            } catch (reason) {
                try { transaction.abort(); } catch { /* transaction already settled */ }
                await completion.catch(() => undefined);
                throw signal?.aborted ? signal.reason : reason;
            }
        });
    }

    public async clear(worldId: string): Promise<void> {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        await this.enqueue(async () => {
            const database = await this.open();
            const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
            const index = transaction.objectStore(DELTA_OBJECT_STORE).index("worldId");
            const keys = await requestResult(index.getAllKeys(worldId));
            for (const key of keys) transaction.objectStore(DELTA_OBJECT_STORE).delete(key);
            await transactionComplete(transaction);
        });
        await this.flush();
    }

    public dispose(): void {
        if (this.disposed || this.closing) return;
        this.closing = true;
        void this.flush().finally(() => {
            this.disposed = true;
            void this.databasePromise?.then(database => database.close(), () => undefined);
        }).catch(() => undefined);
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const result = this.pending.then(task, task);
        this.pending = result.then(() => undefined, error => { this.pendingError ??= error; });
        return result;
    }

    private open(): Promise<IDBDatabase> {
        if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
        this.databasePromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, DELTA_DATABASE_VERSION);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error("Opening the world delta database timed out"));
            }, this.openTimeoutMs);
            const finish = <T>(callback: (value: T) => void, value: T) => {
                if (settled) return false;
                settled = true;
                clearTimeout(timer);
                callback(value);
                return true;
            };
            request.addEventListener("upgradeneeded", () => {
                if (!request.result.objectStoreNames.contains(DELTA_OBJECT_STORE)) {
                    const store = request.result.createObjectStore(DELTA_OBJECT_STORE, { keyPath: "key" });
                    store.createIndex("worldId", "worldId", { unique: false });
                }
            });
            request.addEventListener("success", () => {
                if (settled) {
                    request.result.close();
                    return;
                }
                request.result.addEventListener("versionchange", () => request.result.close());
                finish(resolve, request.result);
            }, { once: true });
            request.addEventListener("error", () => finish(reject, request.error ?? new Error("Opening IndexedDB failed")), { once: true });
            request.addEventListener("blocked", () => finish(reject, new Error("Opening IndexedDB was blocked")), { once: true });
        });
        return this.databasePromise;
    }
}

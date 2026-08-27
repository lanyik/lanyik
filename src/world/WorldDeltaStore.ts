import {
    assertWorldTileOverride,
    cloneWorldTileOverride,
    hasWorldTileOverride,
    worldTileOverridesEqual,
    WorldTileOverride
} from "./generateWorldChunk";

export const WORLD_DELTA_FORMAT_VERSION = 2;
const LEGACY_WORLD_DELTA_FORMAT_VERSION = 1;

export interface WorldDeltaEntry {
    x: number;
    y: number;
    override: WorldTileOverride;
}

export interface WorldDeltaChange {
    x: number;
    y: number;
    // null removes a persisted override; an object replaces the complete
    // coordinate override after the caller has merged partial edits.
    override: WorldTileOverride | null;
}

export interface WorldDeltaReadOptions {
    chunkSize: number;
}

export interface WorldDeltaBatchOptions extends WorldDeltaReadOptions {
    // 0 means that no record may exist yet.
    expectedRevision?: number;
}

export interface WorldChunkDelta {
    version: typeof WORLD_DELTA_FORMAT_VERSION;
    worldId: string;
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    revision: number;
    entries: readonly WorldDeltaEntry[];
}

export interface WorldDeltaStore {
    loadChunk(
        worldId: string,
        chunkX: number,
        chunkY: number,
        options: WorldDeltaReadOptions
    ): Promise<WorldChunkDelta | undefined>;
    putChunkDelta?(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): Promise<WorldChunkDelta | undefined>;
    putTile(worldId: string, chunkX: number, chunkY: number, entry: WorldDeltaEntry, options: WorldDeltaReadOptions): void;
    deleteTile(
        worldId: string,
        chunkX: number,
        chunkY: number,
        x: number,
        y: number,
        options: WorldDeltaReadOptions
    ): void;
    flush(): Promise<void>;
    listWorld?(worldId: string): Promise<readonly WorldChunkDelta[]>;
    replaceWorld?(worldId: string, deltas: readonly WorldChunkDelta[]): Promise<void>;
    clear(worldId: string): Promise<void>;
    dispose(): void;
}

export class WorldDeltaConflictError extends Error {
    public readonly name = "WorldDeltaConflictError";

    constructor(
        public readonly expectedRevision: number,
        public readonly actualRevision: number
    ) {
        super(`World delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
    }
}

export interface IndexedDbWorldDeltaStoreOptions {
    databaseName?: string;
    openTimeoutMs?: number;
}

function chunkKey(worldId: string, chunkX: number, chunkY: number): string {
    return JSON.stringify([worldId, chunkX, chunkY]);
}

function assertChunkIdentity(worldId: string, chunkX: number, chunkY: number): void {
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
        throw new TypeError("worldId must be a non-empty string");
    }
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
        throw new RangeError("world delta chunk coordinates must be safe integers");
    }
}

function assertChunkSize(chunkSize: number): void {
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("world delta chunkSize must be a positive safe integer");
    }
}

function tileBelongsToChunk(x: number, y: number, chunkX: number, chunkY: number, chunkSize: number): boolean {
    return Math.floor(x / chunkSize) === chunkX && Math.floor(y / chunkSize) === chunkY;
}

function assertChanges(
    changes: readonly WorldDeltaChange[],
    chunkX: number,
    chunkY: number,
    options: WorldDeltaBatchOptions
): void {
    assertChunkSize(options.chunkSize);
    if (!Array.isArray(changes)) throw new TypeError("world delta changes must be an array");
    if (options.expectedRevision !== undefined
        && (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)) {
        throw new RangeError("expectedRevision must be a non-negative safe integer");
    }
    for (const change of changes) {
        if (!change || !Number.isSafeInteger(change.x) || !Number.isSafeInteger(change.y)) {
            throw new RangeError("world delta tile coordinates must be safe integers");
        }
        if (!tileBelongsToChunk(change.x, change.y, chunkX, chunkY, options.chunkSize)) {
            throw new RangeError("world delta tile coordinates do not belong to the declared chunk");
        }
        if (change.override !== null) assertWorldTileOverride(change.override);
    }
}

export function normalizeWorldChunkDelta(
    value: unknown,
    worldId: string,
    chunkX: number,
    chunkY: number,
    options: WorldDeltaReadOptions
): WorldChunkDelta {
    assertChunkIdentity(worldId, chunkX, chunkY);
    assertChunkSize(options.chunkSize);
    const candidate = value as Partial<WorldChunkDelta> & { version?: number; entries?: readonly WorldDeltaEntry[] };
    if (!candidate || (candidate.version !== WORLD_DELTA_FORMAT_VERSION
        && candidate.version !== LEGACY_WORLD_DELTA_FORMAT_VERSION) || candidate.worldId !== worldId
        || candidate.chunkX !== chunkX || candidate.chunkY !== chunkY
        || (candidate.version === WORLD_DELTA_FORMAT_VERSION && candidate.chunkSize !== options.chunkSize)
        || !Number.isSafeInteger(candidate.revision) || candidate.revision! < 1 || !Array.isArray(candidate.entries)
        || candidate.entries.some(entry => !entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y)
            || !tileBelongsToChunk(entry.x, entry.y, chunkX, chunkY, options.chunkSize)
            || !entry.override || typeof entry.override !== "object" || Array.isArray(entry.override))) {
        throw new TypeError("world chunk delta is invalid or incompatible");
    }
    const keys = new Set<string>();
    for (const entry of candidate.entries) {
        assertWorldTileOverride(entry.override);
        const key = `${entry.x},${entry.y}`;
        if (keys.has(key)) throw new TypeError("world chunk delta contains duplicate tile coordinates");
        keys.add(key);
    }
    return {
        version: WORLD_DELTA_FORMAT_VERSION,
        worldId,
        chunkX,
        chunkY,
        chunkSize: options.chunkSize,
        revision: candidate.revision!,
        entries: candidate.entries.map(entry => ({
            x: entry.x,
            y: entry.y,
            override: cloneWorldTileOverride(entry.override)
        }))
    };
}

function mergeChunkDelta(
    current: WorldChunkDelta | undefined,
    worldId: string,
    chunkX: number,
    chunkY: number,
    changes: readonly WorldDeltaChange[],
    options: WorldDeltaBatchOptions
): WorldChunkDelta | undefined {
    assertChunkIdentity(worldId, chunkX, chunkY);
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

export class MemoryWorldDeltaStore implements WorldDeltaStore {
    protected readonly chunks = new Map<string, WorldChunkDelta>();
    protected disposed = false;

    public loadChunk(
        worldId: string,
        chunkX: number,
        chunkY: number,
        options: WorldDeltaReadOptions
    ): Promise<WorldChunkDelta | undefined> {
        assertChunkIdentity(worldId, chunkX, chunkY);
        const delta = this.chunks.get(chunkKey(worldId, chunkX, chunkY));
        return Promise.resolve(delta
            ? this.cloneDelta(normalizeWorldChunkDelta(delta, worldId, chunkX, chunkY, options))
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
            return Promise.resolve(result ? this.cloneDelta(result) : undefined);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public putTile(
        worldId: string,
        chunkX: number,
        chunkY: number,
        entry: WorldDeltaEntry,
        options: WorldDeltaReadOptions
    ): void {
        if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
        this.applyChunkDelta(worldId, chunkX, chunkY, [entry], options);
    }

    public deleteTile(
        worldId: string,
        chunkX: number,
        chunkY: number,
        x: number,
        y: number,
        options: WorldDeltaReadOptions
    ): void {
        if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
        this.applyChunkDelta(worldId, chunkX, chunkY, [{ x, y, override: null }], options);
    }

    public flush(): Promise<void> { return Promise.resolve(); }

    public listWorld(worldId: string): Promise<readonly WorldChunkDelta[]> {
        if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
        const deltas = [...this.chunks.values()]
            .filter(delta => delta.worldId === worldId)
            .sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY)
            .map(delta => this.cloneDelta(delta));
        return Promise.resolve(deltas);
    }

    public async replaceWorld(worldId: string, deltas: readonly WorldChunkDelta[]): Promise<void> {
        if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
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
        await this.clear(worldId);
        for (const [key, delta] of replacements) this.chunks.set(key, this.cloneDelta(delta));
    }

    public async clear(worldId: string): Promise<void> {
        for (const [key, delta] of this.chunks) if (delta.worldId === worldId) this.chunks.delete(key);
    }

    public dispose(): void { this.disposed = true; }

    protected cloneDelta(delta: WorldChunkDelta): WorldChunkDelta {
        if (delta.version !== WORLD_DELTA_FORMAT_VERSION) throw new Error(`Unsupported world delta version: ${delta.version}`);
        return {
            ...delta,
            entries: delta.entries.map(entry => ({ ...entry, override: cloneWorldTileOverride(entry.override) }))
        };
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

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
    });
}

interface StoredWorldChunkDelta extends WorldChunkDelta { key: string }

//Durable gameplay deltas intentionally use a database separate from the
//rebuildable base-terrain cache. Writes are serialized; flush() is the save
//barrier applications should await before ending a session.
export class IndexedDbWorldDeltaStore extends MemoryWorldDeltaStore {
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private pending: Promise<void> = Promise.resolve();
    private pendingError: unknown;
    private closing = false;

    constructor(options: IndexedDbWorldDeltaStoreOptions = {}) {
        super();
        this.databaseName = options.databaseName ?? DEFAULT_DELTA_DATABASE_NAME;
        this.openTimeoutMs = options.openTimeoutMs ?? 2000;
        if (!this.databaseName.trim()) throw new TypeError("delta databaseName must be a non-empty string");
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new RangeError("delta openTimeoutMs must be a positive finite number");
        }
    }

    public override async loadChunk(
        worldId: string,
        chunkX: number,
        chunkY: number,
        options: WorldDeltaReadOptions
    ): Promise<WorldChunkDelta | undefined> {
        if (this.disposed || this.closing) return undefined;
        await this.flush();
        const memory = await super.loadChunk(worldId, chunkX, chunkY, options);
        if (memory) return memory;
        const database = await this.open();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
        const record = await requestResult(transaction.objectStore(DELTA_OBJECT_STORE).get(chunkKey(worldId, chunkX, chunkY))) as StoredWorldChunkDelta | undefined;
        await transactionComplete(transaction);
        if (!record) return undefined;
        const delta = normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options);
        this.chunks.set(record.key, delta);
        return this.cloneDelta(delta);
    }

    public override putChunkDelta(
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
                const requiresWrite = result !== undefined && (record?.version !== WORLD_DELTA_FORMAT_VERSION
                    || result.revision !== current?.revision);
                if (requiresWrite) store.put({ key, ...this.cloneDelta(result) } satisfies StoredWorldChunkDelta);
                await completion;
                if (result) this.chunks.set(key, this.cloneDelta(result));
                else this.chunks.delete(key);
                return result ? this.cloneDelta(result) : undefined;
            } catch (reason) {
                try { transaction.abort(); } catch { /* transaction already settled */ }
                await completion.catch(() => undefined);
                throw reason;
            }
        });
    }

    public override putTile(
        worldId: string,
        chunkX: number,
        chunkY: number,
        entry: WorldDeltaEntry,
        options: WorldDeltaReadOptions
    ): void {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        void this.putChunkDelta(worldId, chunkX, chunkY, [entry], options).catch(() => undefined);
    }

    public override deleteTile(
        worldId: string,
        chunkX: number,
        chunkY: number,
        x: number,
        y: number,
        options: WorldDeltaReadOptions
    ): void {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        void this.putChunkDelta(worldId, chunkX, chunkY, [{ x, y, override: null }], options).catch(() => undefined);
    }

    public override async flush(): Promise<void> {
        await this.pending;
        if (this.pendingError !== undefined) {
            const error = this.pendingError;
            this.pendingError = undefined;
            throw error;
        }
    }

    public override async listWorld(worldId: string): Promise<readonly WorldChunkDelta[]> {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        await this.flush();
        const database = await this.open();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
        const records = await requestResult(
            transaction.objectStore(DELTA_OBJECT_STORE).index("worldId").getAll(worldId)
        ) as StoredWorldChunkDelta[];
        await transactionComplete(transaction);
        return records.map(record => normalizeWorldChunkDelta(
            record,
            worldId,
            record.chunkX,
            record.chunkY,
            { chunkSize: record.chunkSize }
        )).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY);
    }

    public override replaceWorld(worldId: string, deltas: readonly WorldChunkDelta[]): Promise<void> {
        if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
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
            const database = await this.open();
            const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
            const store = transaction.objectStore(DELTA_OBJECT_STORE);
            const keys = await requestResult(store.index("worldId").getAllKeys(worldId));
            for (const key of keys) store.delete(key);
            for (const [key, delta] of replacements) {
                store.put({ key, ...this.cloneDelta(delta) } satisfies StoredWorldChunkDelta);
            }
            await transactionComplete(transaction);
            await super.clear(worldId);
            for (const [key, delta] of replacements) this.chunks.set(key, this.cloneDelta(delta));
        });
    }

    public override async clear(worldId: string): Promise<void> {
        if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
        await this.enqueue(async () => {
            await super.clear(worldId);
            const database = await this.open();
            const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
            const index = transaction.objectStore(DELTA_OBJECT_STORE).index("worldId");
            const keys = await requestResult(index.getAllKeys(worldId));
            for (const key of keys) transaction.objectStore(DELTA_OBJECT_STORE).delete(key);
            await transactionComplete(transaction);
        });
        await this.flush();
    }

    public override dispose(): void {
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

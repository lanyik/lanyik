import {
    assertPackedWorldChunk,
    BoundedWorldChunkGeneration,
    PackedWorldChunk,
    WORLD_GENERATOR_VERSION
} from "./generateWorldChunk";

const DEFAULT_DATABASE_NAME = "three-hex-map-world-cache-v1";
const DATABASE_VERSION = 1;
const CHUNK_STORE = "chunks";
const META_STORE = "meta";
const USAGE_KEY = "usage";

interface CachedChunkRecord {
    key: string;
    version: number;
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    padding: number;
    stride: number;
    tiles: ArrayBuffer;
    bytes: number;
    accessedAt: number;
}

interface CacheUsageRecord {
    key: typeof USAGE_KEY;
    bytes: number;
    entries: number;
}

export interface WorldChunkCacheStats {
    available: boolean;
    hits: number;
    misses: number;
    writes: number;
    errors: number;
    entries: number;
    bytes: number;
}

export interface WorldChunkCache {
    readonly stats: Readonly<WorldChunkCacheStats>;
    get(key: string): Promise<PackedWorldChunk | undefined>;
    put(key: string, chunk: PackedWorldChunk): Promise<boolean>;
    clear(): Promise<boolean>;
    dispose(): void;
}

export interface IndexedDbWorldChunkCacheOptions {
    databaseName?: string;
    maxBytes?: number;
    openTimeoutMs?: number;
}

export interface WorldChunkCacheKeyOptions {
    seed: string | number;
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    world?: BoundedWorldChunkGeneration;
    generatorVersion?: number;
}

export function createWorldChunkCacheKey(options: WorldChunkCacheKeyOptions): string {
    return JSON.stringify([
        options.generatorVersion ?? WORLD_GENERATOR_VERSION,
        String(options.seed),
        options.chunkSize,
        options.world?.topology ?? "infinite",
        options.world?.width ?? null,
        options.world?.height ?? null,
        options.chunkX,
        options.chunkY
    ]);
}

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

// Persistent immutable base-chunk cache. Every failure degrades to a cache miss;
// storage availability must never prevent the procedural world from loading.
export class IndexedDbWorldChunkCache implements WorldChunkCache {
    private readonly databaseName: string;
    private readonly maxBytes: number;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase | undefined> | undefined;
    private maintenance: Promise<unknown> = Promise.resolve();
    private disposed = false;
    private snapshot: WorldChunkCacheStats = {
        available: typeof indexedDB !== "undefined",
        hits: 0,
        misses: 0,
        writes: 0,
        errors: 0,
        entries: 0,
        bytes: 0
    };

    constructor(options: IndexedDbWorldChunkCacheOptions = {}) {
        this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
        this.maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
        this.openTimeoutMs = options.openTimeoutMs ?? 2000;
        if (typeof this.databaseName !== "string" || this.databaseName.trim().length === 0) {
            throw new TypeError("cache databaseName must be a non-empty string");
        }
        if (!Number.isFinite(this.maxBytes) || this.maxBytes <= 0) {
            throw new RangeError("cache maxBytes must be a positive finite number");
        }
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new RangeError("cache openTimeoutMs must be a positive finite number");
        }
    }

    public get stats(): Readonly<WorldChunkCacheStats> {
        return this.snapshot;
    }

    public async get(key: string): Promise<PackedWorldChunk | undefined> {
        if (this.disposed) return undefined;
        const database = await this.open();
        if (!database) {
            this.snapshot.misses += 1;
            return undefined;
        }
        try {
            const transaction = database.transaction(CHUNK_STORE, "readonly");
            const record = await requestResult(transaction.objectStore(CHUNK_STORE).get(key)) as CachedChunkRecord | undefined;
            await transactionComplete(transaction);
            if (!record) {
                this.snapshot.misses += 1;
                return undefined;
            }
            const chunk: PackedWorldChunk = {
                version: record.version as PackedWorldChunk["version"],
                chunkX: record.chunkX,
                chunkY: record.chunkY,
                chunkSize: record.chunkSize,
                padding: record.padding as PackedWorldChunk["padding"],
                stride: record.stride,
                tiles: new Uint16Array(record.tiles.slice(0))
            };
            assertPackedWorldChunk(chunk);
            this.snapshot.hits += 1;
            this.enqueueMaintenance(() => this.touch(database, record));
            return chunk;
        } catch {
            this.snapshot.errors += 1;
            this.snapshot.misses += 1;
            this.enqueueMaintenance(() => this.deleteKey(database, key));
            return undefined;
        }
    }

    public put(key: string, chunk: PackedWorldChunk): Promise<boolean> {
        assertPackedWorldChunk(chunk);
        if (this.disposed) return Promise.resolve(false);
        return this.enqueueMaintenance(async () => {
            const database = await this.open();
            if (!database) return false;
            try {
                const bytes = chunk.tiles.byteLength;
                const tiles = chunk.tiles.buffer.slice(
                    chunk.tiles.byteOffset,
                    chunk.tiles.byteOffset + chunk.tiles.byteLength
                ) as ArrayBuffer;
                const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
                const chunks = transaction.objectStore(CHUNK_STORE);
                const meta = transaction.objectStore(META_STORE);
                const [existing, usage] = await Promise.all([
                    requestResult(chunks.get(key)) as Promise<CachedChunkRecord | undefined>,
                    requestResult(meta.get(USAGE_KEY)) as Promise<CacheUsageRecord | undefined>
                ]);
                const nextUsage: CacheUsageRecord = {
                    key: USAGE_KEY,
                    bytes: Math.max(0, (usage?.bytes ?? 0) - (existing?.bytes ?? 0) + bytes),
                    entries: Math.max(0, (usage?.entries ?? 0) + (existing ? 0 : 1))
                };
                chunks.put({
                    key,
                    version: chunk.version,
                    chunkX: chunk.chunkX,
                    chunkY: chunk.chunkY,
                    chunkSize: chunk.chunkSize,
                    padding: chunk.padding,
                    stride: chunk.stride,
                    tiles,
                    bytes,
                    accessedAt: Date.now()
                } satisfies CachedChunkRecord);
                meta.put(nextUsage);
                await transactionComplete(transaction);
                this.snapshot.writes += 1;
                this.snapshot.entries = nextUsage.entries;
                this.snapshot.bytes = nextUsage.bytes;
                await this.prune(database);
                return true;
            } catch {
                this.snapshot.errors += 1;
                return false;
            }
        });
    }

    public async clear(): Promise<boolean> {
        if (this.disposed) return false;
        return this.enqueueMaintenance(async () => {
            const database = await this.open();
            if (!database) return false;
            try {
                const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
                transaction.objectStore(CHUNK_STORE).clear();
                transaction.objectStore(META_STORE).put({ key: USAGE_KEY, bytes: 0, entries: 0 } satisfies CacheUsageRecord);
                await transactionComplete(transaction);
                this.snapshot.entries = 0;
                this.snapshot.bytes = 0;
                return true;
            } catch {
                this.snapshot.errors += 1;
                return false;
            }
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        void this.databasePromise?.then(database => database?.close());
    }

    private enqueueMaintenance<T>(task: () => Promise<T>): Promise<T> {
        const result = this.maintenance.then(task, task);
        this.maintenance = result.then(() => undefined, () => undefined);
        return result;
    }

    private async open(): Promise<IDBDatabase | undefined> {
        if (this.disposed || typeof indexedDB === "undefined") return undefined;
        this.databasePromise ??= new Promise(resolve => {
            const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
            let settled = false;
            let timeout: ReturnType<typeof setTimeout> | undefined;
            const finish = (database: IDBDatabase | undefined) => {
                if (settled) {
                    database?.close();
                    return;
                }
                settled = true;
                if (timeout !== undefined) clearTimeout(timeout);
                resolve(database);
            };
            timeout = setTimeout(() => {
                this.snapshot.available = false;
                this.snapshot.errors += 1;
                finish(undefined);
            }, this.openTimeoutMs);
            request.addEventListener("upgradeneeded", () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(CHUNK_STORE)) {
                    const chunks = database.createObjectStore(CHUNK_STORE, { keyPath: "key" });
                    chunks.createIndex("accessedAt", "accessedAt");
                }
                if (!database.objectStoreNames.contains(META_STORE)) {
                    database.createObjectStore(META_STORE, { keyPath: "key" });
                }
            });
            request.addEventListener("success", () => {
                const database = request.result;
                if (settled) {
                    database.close();
                    return;
                }
                database.addEventListener("versionchange", () => {
                    database.close();
                    this.databasePromise = undefined;
                });
                this.snapshot.available = true;
                void this.readUsage(database);
                finish(database);
            }, { once: true });
            request.addEventListener("error", () => {
                if (settled) return;
                this.snapshot.available = false;
                this.snapshot.errors += 1;
                finish(undefined);
            }, { once: true });
            request.addEventListener("blocked", () => {
                if (settled) return;
                this.snapshot.available = false;
                this.snapshot.errors += 1;
                finish(undefined);
            });
        });
        return this.databasePromise;
    }

    private async readUsage(database: IDBDatabase): Promise<void> {
        try {
            const transaction = database.transaction(META_STORE, "readonly");
            const usage = await requestResult(transaction.objectStore(META_STORE).get(USAGE_KEY)) as CacheUsageRecord | undefined;
            await transactionComplete(transaction);
            this.snapshot.entries = usage?.entries ?? 0;
            this.snapshot.bytes = usage?.bytes ?? 0;
        } catch {
            this.snapshot.errors += 1;
        }
    }

    private async touch(database: IDBDatabase, record: CachedChunkRecord): Promise<void> {
        try {
            const transaction = database.transaction(CHUNK_STORE, "readwrite");
            transaction.objectStore(CHUNK_STORE).put({ ...record, accessedAt: Date.now() });
            await transactionComplete(transaction);
        } catch {
            this.snapshot.errors += 1;
        }
    }

    private async deleteKey(database: IDBDatabase, key: string): Promise<void> {
        try {
            const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
            const chunks = transaction.objectStore(CHUNK_STORE);
            const meta = transaction.objectStore(META_STORE);
            const [existing, usage] = await Promise.all([
                requestResult(chunks.get(key)) as Promise<CachedChunkRecord | undefined>,
                requestResult(meta.get(USAGE_KEY)) as Promise<CacheUsageRecord | undefined>
            ]);
            if (existing) {
                chunks.delete(key);
                const next = {
                    key: USAGE_KEY,
                    bytes: Math.max(0, (usage?.bytes ?? 0) - existing.bytes),
                    entries: Math.max(0, (usage?.entries ?? 0) - 1)
                } satisfies CacheUsageRecord;
                meta.put(next);
                this.snapshot.bytes = next.bytes;
                this.snapshot.entries = next.entries;
            }
            await transactionComplete(transaction);
        } catch {
            this.snapshot.errors += 1;
        }
    }

    private async prune(database: IDBDatabase): Promise<void> {
        if (this.snapshot.bytes <= this.maxBytes) return;
        const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
        const chunks = transaction.objectStore(CHUNK_STORE);
        const meta = transaction.objectStore(META_STORE);
        let bytes = this.snapshot.bytes;
        let entries = this.snapshot.entries;
        await new Promise<void>((resolve, reject) => {
            const request = chunks.index("accessedAt").openCursor();
            request.addEventListener("error", () => reject(request.error ?? new Error("cache pruning failed")), { once: true });
            request.addEventListener("success", () => {
                const cursor = request.result;
                if (!cursor || bytes <= this.maxBytes) {
                    resolve();
                    return;
                }
                const record = cursor.value as CachedChunkRecord;
                bytes = Math.max(0, bytes - record.bytes);
                entries = Math.max(0, entries - 1);
                cursor.delete();
                cursor.continue();
            });
        });
        meta.put({ key: USAGE_KEY, bytes, entries } satisfies CacheUsageRecord);
        await transactionComplete(transaction);
        this.snapshot.bytes = bytes;
        this.snapshot.entries = entries;
    }
}

export async function clearWorldChunkCache(options: IndexedDbWorldChunkCacheOptions = {}): Promise<boolean> {
    const cache = new IndexedDbWorldChunkCache(options);
    try {
        return await cache.clear();
    } finally {
        cache.dispose();
    }
}

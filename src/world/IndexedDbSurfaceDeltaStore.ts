import {
    HydrologyFeatureDelta,
    createHydrologyFeatureDelta,
    deserializeHydrologyFeatureDelta,
    hydrologyFeatureDeltaSerializedBytes,
    serializeHydrologyFeatureDelta
} from "./HydrologyFeatureDelta";
import {
    BaseHydrologyFeatureIndex,
    MemorySurfaceDeltaStore,
    PreparedSurfaceDeltaCommit,
    SurfaceDeltaCommit,
    SurfaceDeltaTransactionInput,
    SurfaceSemanticDeltaState,
    surfaceDeltaTransactionResidentBytes
} from "./SurfaceDeltaStore";
import {
    createSparseSemanticDelta,
    deserializeSparseSemanticDelta,
    sparseSemanticDeltaSerializedBytes,
    serializeSparseSemanticDelta
} from "./SparseSemanticDelta";
import { semanticCatalogLimits } from "./BaseSemanticChunk";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "./WorldDescriptorV2";

export const INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION = 1;

const DEFAULT_SURFACE_DELTA_DATABASE_NAME = "three-hex-map-surface-deltas-v2";
const SURFACE_DELTA_DATABASE_VERSION = 1;
const META_STORE = "surface-meta";
const SEMANTIC_STORE = "surface-semantic";
const HYDROLOGY_STORE = "surface-hydrology";

export interface IndexedDbSurfaceDeltaStoreOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly baseHydrology: BaseHydrologyFeatureIndex;
    readonly maxPendingCommitBytes: number;
    readonly databaseName?: string;
    readonly openTimeoutMs?: number;
}

export interface IndexedDbSurfaceDeltaStoreStats {
    readonly effectiveRevision: number;
    readonly persistedRevision: number;
    readonly pendingCommits: number;
    readonly pendingCommitBytes: number;
    readonly maximumPendingCommitBytes: number;
}

interface SurfaceMetaRecord {
    readonly key: string;
    readonly formatVersion: typeof INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly effectiveRevision: number;
}

interface SurfaceSemanticRecord {
    readonly key: string;
    readonly formatVersion: typeof INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly chunkX: number;
    readonly chunkY: number;
    readonly revision: number;
    readonly payload?: ArrayBuffer;
}

interface SurfaceHydrologyRecord {
    readonly key: string;
    readonly formatVersion: typeof INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly featureId: string;
    readonly revision: number;
    readonly payload: ArrayBuffer;
}

interface BarrierFailure {
    readonly sequence: number;
    readonly reason: Error;
}

function semanticRecordKey(worldIdentity: string, chunkX: number, chunkY: number): string {
    return JSON.stringify([worldIdentity, chunkX, chunkY]);
}

function hydrologyRecordKey(worldIdentity: string, featureId: string): string {
    return JSON.stringify([worldIdentity, featureId]);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(
            request.error ?? new Error("surface delta IndexedDB request failed")
        ), { once: true });
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(
            transaction.error ?? new Error("surface delta IndexedDB transaction aborted")
        ), { once: true });
        transaction.addEventListener("error", () => reject(
            transaction.error ?? new Error("surface delta IndexedDB transaction failed")
        ), { once: true });
    });
}

function asError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

function assertStoredRevision(name: string, revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

export function indexedDbSurfaceDeltaCommitBytes(
    descriptor: WorldDescriptorV2,
    input: Readonly<SurfaceDeltaTransactionInput>
): number {
    const worldIdentity = serializeWorldDescriptorV2(descriptor);
    if (!input || typeof input !== "object" || input.worldIdentity !== worldIdentity) {
        throw new TypeError("durable surface delta byte accounting requires a matching world identity");
    }
    let bytes = surfaceDeltaTransactionResidentBytes(input);
    const limits = semanticCatalogLimits(descriptor);
    for (const mutation of input.semanticMutations) {
        if (mutation.operation === "upsert") {
            const delta = createSparseSemanticDelta({
                ...mutation.payload,
                worldIdentity,
                key: mutation.key,
                revision: 1
            }, limits);
            bytes += sparseSemanticDeltaSerializedBytes(delta);
        }
    }
    for (const mutation of input.hydrologyMutations) {
        const delta = createHydrologyFeatureDelta(mutation.operation === "upsert" ? {
            worldIdentity,
            revision: 1,
            featureId: mutation.featureId,
            featureKind: mutation.featureKind,
            operation: "upsert",
            feature: mutation.feature
        } : {
            worldIdentity,
            revision: 1,
            featureId: mutation.featureId,
            featureKind: mutation.featureKind,
            operation: "delete"
        });
        bytes += hydrologyFeatureDeltaSerializedBytes(delta);
        if (mutation.operation === "upsert" && mutation.feature.kind === "lake") {
            // Lake publication re-canonicalizes into an independently owned
            // polygon even though the queued input is already isolated.
            bytes += mutation.feature.polygon.byteLength;
        }
    }
    if (!Number.isSafeInteger(bytes)) {
        throw new RangeError("durable surface delta transaction bytes exceed safe integers");
    }
    return bytes;
}

export class SurfaceDeltaSessionConflictError extends Error {
    public readonly name = "SurfaceDeltaSessionConflictError";

    constructor(
        public readonly expectedRevision: number,
        public readonly actualRevision: number
    ) {
        super(`durable surface delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
    }
}

export class SurfaceDeltaCommitBackpressureError extends Error {
    public readonly name = "SurfaceDeltaCommitBackpressureError";

    constructor(
        public readonly requestedBytes: number,
        public readonly pendingBytes: number,
        public readonly maximumBytes: number
    ) {
        super("surface delta commit exceeds the pending durable-write byte budget");
    }
}

export class SurfaceDeltaSaveBarrierError extends Error {
    public readonly name = "SurfaceDeltaSaveBarrierError";

    constructor(public readonly errors: readonly Error[]) {
        super(`surface delta save barrier observed ${errors.length} failed commits`);
    }
}

// Uses one native IndexedDB transaction for the meta revision and every
// changed semantic/hydrology record. The in-memory snapshot is published only
// after that durable transaction completes; there is no background-write mode.
export class IndexedDbSurfaceDeltaStore extends MemorySurfaceDeltaStore {
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private readonly maxPendingCommitBytes: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private tail: Promise<void> = Promise.resolve();
    private readonly barrierFailures: BarrierFailure[] = [];
    private nextSequence = 1;
    private lastSubmittedSequence = 0;
    private pendingCommits = 0;
    private pendingCommitBytes = 0;
    private closing = false;
    private closed = false;

    private constructor(options: Readonly<IndexedDbSurfaceDeltaStoreOptions>) {
        super(options.descriptor, options.baseHydrology);
        this.databaseName = options.databaseName ?? DEFAULT_SURFACE_DELTA_DATABASE_NAME;
        this.openTimeoutMs = options.openTimeoutMs ?? 2_000;
        this.maxPendingCommitBytes = options.maxPendingCommitBytes;
        if (this.databaseName.trim().length === 0) {
            throw new TypeError("surface delta databaseName must be a non-empty string");
        }
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new RangeError("surface delta openTimeoutMs must be positive and finite");
        }
        if (!Number.isSafeInteger(this.maxPendingCommitBytes) || this.maxPendingCommitBytes <= 0) {
            throw new RangeError("surface delta pending commit budget must be a positive safe integer");
        }
    }

    public static async open(
        options: Readonly<IndexedDbSurfaceDeltaStoreOptions>
    ): Promise<IndexedDbSurfaceDeltaStore> {
        if (!options || typeof options !== "object") {
            throw new TypeError("IndexedDB surface delta store options are required");
        }
        const store = new IndexedDbSurfaceDeltaStore(options);
        try {
            await store.hydrate();
            return store;
        } catch (reason) {
            try { (await store.databasePromise)?.close(); } catch { /* preserve the hydration failure */ }
            store.closed = true;
            throw reason;
        }
    }

    public override commit(
        input: Readonly<SurfaceDeltaTransactionInput>
    ): Promise<SurfaceDeltaCommit> {
        if (this.closing || this.closed) {
            return Promise.reject(new Error("IndexedDbSurfaceDeltaStore has been closed"));
        }
        let snapshot: SurfaceDeltaTransactionInput;
        let bytes: number;
        try {
            snapshot = this.snapshotTransactionInput(input);
            bytes = indexedDbSurfaceDeltaCommitBytes(this.descriptor, snapshot);
        } catch (reason) {
            return Promise.reject(asError(reason));
        }
        if (bytes > this.maxPendingCommitBytes - this.pendingCommitBytes) {
            return Promise.reject(new SurfaceDeltaCommitBackpressureError(
                bytes,
                this.pendingCommitBytes,
                this.maxPendingCommitBytes
            ));
        }
        if (!Number.isSafeInteger(this.nextSequence)) {
            return Promise.reject(new RangeError("surface delta commit sequence space is exhausted"));
        }
        const sequence = this.nextSequence;
        this.nextSequence += 1;
        this.lastSubmittedSequence = sequence;
        this.pendingCommits += 1;
        this.pendingCommitBytes += bytes;

        const operation = this.tail.then(() => this.persistCommit(snapshot));
        this.tail = operation.then(() => undefined, () => undefined);
        void operation.then(() => {
            this.pendingCommits -= 1;
            this.pendingCommitBytes -= bytes;
        }, reason => {
            this.pendingCommits -= 1;
            this.pendingCommitBytes -= bytes;
            this.barrierFailures.push({ sequence, reason: asError(reason) });
        });
        return operation;
    }

    public override preview(
        input: Readonly<SurfaceDeltaTransactionInput>
    ): Promise<PreparedSurfaceDeltaCommit> {
        if (this.closing || this.closed) {
            return Promise.reject(new Error("IndexedDbSurfaceDeltaStore has been closed"));
        }
        let snapshot: SurfaceDeltaTransactionInput;
        try {
            snapshot = this.snapshotTransactionInput(input);
        } catch (reason) {
            return Promise.reject(asError(reason));
        }
        return this.tail.then(() => this.prepareCommit(snapshot, true));
    }

    public override async flush(): Promise<void> {
        const targetSequence = this.lastSubmittedSequence;
        const barrier = this.tail;
        await barrier;
        const observed = this.barrierFailures.filter(failure => failure.sequence <= targetSequence);
        if (observed.length === 0) return;
        for (let index = this.barrierFailures.length - 1; index >= 0; index -= 1) {
            if (this.barrierFailures[index].sequence <= targetSequence) {
                this.barrierFailures.splice(index, 1);
            }
        }
        if (observed.length === 1) throw observed[0].reason;
        throw new SurfaceDeltaSaveBarrierError(Object.freeze(observed.map(failure => failure.reason)));
    }

    public get stats(): Readonly<IndexedDbSurfaceDeltaStoreStats> {
        return Object.freeze({
            effectiveRevision: this.current.effectiveRevision,
            persistedRevision: this.current.effectiveRevision,
            pendingCommits: this.pendingCommits,
            pendingCommitBytes: this.pendingCommitBytes,
            maximumPendingCommitBytes: this.maxPendingCommitBytes
        });
    }

    public async close(): Promise<void> {
        if (this.closed) return;
        this.closing = true;
        let failure: unknown;
        try {
            await this.flush();
        } catch (reason) {
            failure = reason;
        }
        try {
            (await this.databasePromise)?.close();
        } finally {
            this.closed = true;
        }
        if (failure !== undefined) throw failure;
    }

    private async persistCommit(
        input: Readonly<SurfaceDeltaTransactionInput>
    ): Promise<SurfaceDeltaCommit> {
        const prepared = this.prepareCommit(input, true);
        const database = await this.openDatabase();
        const transaction = database.transaction(
            [META_STORE, SEMANTIC_STORE, HYDROLOGY_STORE],
            "readwrite"
        );
        const completion = transactionComplete(transaction);
        try {
            const metaStore = transaction.objectStore(META_STORE);
            const semanticStore = transaction.objectStore(SEMANTIC_STORE);
            const hydrologyStore = transaction.objectStore(HYDROLOGY_STORE);
            const currentMeta = await requestResult(
                metaStore.get(this.worldIdentity)
            ) as SurfaceMetaRecord | undefined;
            const actualRevision = this.validateMeta(currentMeta);
            const expectedRevision = this.current.effectiveRevision;
            if (actualRevision !== expectedRevision) {
                throw new SurfaceDeltaSessionConflictError(expectedRevision, actualRevision);
            }
            const limits = semanticCatalogLimits(this.descriptor);
            for (const change of prepared.commit.semanticChanges) {
                const key = change.operation === "upsert" ? change.delta.key : change.key;
                const revision = change.operation === "upsert" ? change.delta.revision : change.revision;
                const record: SurfaceSemanticRecord = {
                    key: semanticRecordKey(this.worldIdentity, key.chunkX, key.chunkY),
                    formatVersion: INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION,
                    worldIdentity: this.worldIdentity,
                    chunkX: key.chunkX,
                    chunkY: key.chunkY,
                    revision,
                    ...(change.operation === "upsert"
                        ? { payload: serializeSparseSemanticDelta(change.delta, limits) }
                        : {})
                };
                semanticStore.put(record);
            }
            for (const change of prepared.commit.hydrologyChanges) {
                const delta = change.delta;
                const record: SurfaceHydrologyRecord = {
                    key: hydrologyRecordKey(this.worldIdentity, delta.featureId),
                    formatVersion: INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION,
                    worldIdentity: this.worldIdentity,
                    featureId: delta.featureId,
                    revision: delta.revision,
                    payload: serializeHydrologyFeatureDelta(delta)
                };
                hydrologyStore.put(record);
            }
            metaStore.put({
                key: this.worldIdentity,
                formatVersion: INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION,
                worldIdentity: this.worldIdentity,
                effectiveRevision: prepared.commit.revision
            } satisfies SurfaceMetaRecord);
            await completion;
        } catch (reason) {
            try { transaction.abort(); } catch { /* the transaction has already settled */ }
            await completion.catch(() => undefined);
            throw reason;
        }
        this.publishPreparedCommit(prepared);
        return prepared.commit;
    }

    private async hydrate(): Promise<void> {
        const database = await this.openDatabase();
        const transaction = database.transaction(
            [META_STORE, SEMANTIC_STORE, HYDROLOGY_STORE],
            "readonly"
        );
        const completion = transactionComplete(transaction);
        const metaRequest = transaction.objectStore(META_STORE).get(this.worldIdentity);
        const semanticRequest = transaction.objectStore(SEMANTIC_STORE)
            .index("worldIdentity").getAll(this.worldIdentity);
        const hydrologyRequest = transaction.objectStore(HYDROLOGY_STORE)
            .index("worldIdentity").getAll(this.worldIdentity);
        const [meta, semanticRecords, hydrologyRecords] = await Promise.all([
            requestResult(metaRequest) as Promise<SurfaceMetaRecord | undefined>,
            requestResult(semanticRequest) as Promise<SurfaceSemanticRecord[]>,
            requestResult(hydrologyRequest) as Promise<SurfaceHydrologyRecord[]>
        ]);
        await completion;
        const effectiveRevision = this.validateMeta(meta);
        if (!meta) {
            if (semanticRecords.length !== 0 || hydrologyRecords.length !== 0) {
                throw new Error("surface delta database contains records without an atomic meta revision");
            }
            return;
        }
        const semanticStates = semanticRecords.map(record => this.loadSemanticRecord(
            record,
            effectiveRevision
        ));
        const hydrologyDeltas = hydrologyRecords.map(record => this.loadHydrologyRecord(
            record,
            effectiveRevision
        ));
        this.installSnapshot(effectiveRevision, semanticStates, hydrologyDeltas);
    }

    private validateMeta(record: SurfaceMetaRecord | undefined): number {
        if (!record) return 0;
        if (!record || typeof record !== "object"
            || record.key !== this.worldIdentity || record.worldIdentity !== this.worldIdentity
            || record.formatVersion !== INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION) {
            throw new TypeError("surface delta IndexedDB meta record is invalid or incompatible");
        }
        assertStoredRevision("surface delta IndexedDB meta revision", record.effectiveRevision);
        if (record.effectiveRevision === 0) {
            throw new RangeError("surface delta IndexedDB must not persist an empty revision zero meta record");
        }
        return record.effectiveRevision;
    }

    private loadSemanticRecord(
        record: SurfaceSemanticRecord,
        effectiveRevision: number
    ): SurfaceSemanticDeltaState {
        if (!record || typeof record !== "object"
            || record.formatVersion !== INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION
            || record.worldIdentity !== this.worldIdentity
            || record.key !== semanticRecordKey(this.worldIdentity, record.chunkX, record.chunkY)) {
            throw new TypeError("surface semantic IndexedDB record is invalid or incompatible");
        }
        assertStoredRevision("surface semantic IndexedDB revision", record.revision);
        if (record.revision <= 0 || record.revision > effectiveRevision) {
            throw new RangeError("surface semantic IndexedDB revision is outside its snapshot");
        }
        const key = Object.freeze({ chunkX: record.chunkX, chunkY: record.chunkY });
        if (record.payload === undefined) return Object.freeze({ key, revision: record.revision });
        if (!(record.payload instanceof ArrayBuffer)) {
            throw new TypeError("surface semantic IndexedDB payload must be a binary delta");
        }
        const delta = deserializeSparseSemanticDelta(
            record.payload,
            semanticCatalogLimits(this.descriptor)
        );
        if (delta.worldIdentity !== this.worldIdentity || delta.key.chunkX !== record.chunkX
            || delta.key.chunkY !== record.chunkY || delta.revision !== record.revision) {
            throw new Error("surface semantic IndexedDB payload does not match its record key");
        }
        return Object.freeze({ key: delta.key, revision: record.revision, delta });
    }

    private loadHydrologyRecord(
        record: SurfaceHydrologyRecord,
        effectiveRevision: number
    ): HydrologyFeatureDelta {
        if (!record || typeof record !== "object"
            || record.formatVersion !== INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION
            || record.worldIdentity !== this.worldIdentity
            || record.key !== hydrologyRecordKey(this.worldIdentity, record.featureId)
            || !(record.payload instanceof ArrayBuffer)) {
            throw new TypeError("surface hydrology IndexedDB record is invalid or incompatible");
        }
        assertStoredRevision("surface hydrology IndexedDB revision", record.revision);
        if (record.revision <= 0 || record.revision > effectiveRevision) {
            throw new RangeError("surface hydrology IndexedDB revision is outside its snapshot");
        }
        const delta = deserializeHydrologyFeatureDelta(record.payload);
        if (delta.worldIdentity !== this.worldIdentity || delta.featureId !== record.featureId
            || delta.revision !== record.revision) {
            throw new Error("surface hydrology IndexedDB payload does not match its record key");
        }
        return delta;
    }

    private openDatabase(): Promise<IDBDatabase> {
        if (this.databasePromise) return this.databasePromise;
        if (typeof indexedDB === "undefined") {
            return Promise.reject(new Error("IndexedDB is unavailable for durable surface deltas"));
        }
        this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, SURFACE_DELTA_DATABASE_VERSION);
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error("opening surface delta IndexedDB timed out"));
            }, this.openTimeoutMs);
            const finish = (callback: (value: IDBDatabase) => void, value: IDBDatabase): void => {
                if (settled) {
                    value.close();
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                callback(value);
            };
            const fail = (reason: unknown): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(asError(reason));
            };
            request.addEventListener("upgradeneeded", () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(META_STORE)) {
                    database.createObjectStore(META_STORE, { keyPath: "key" });
                }
                if (!database.objectStoreNames.contains(SEMANTIC_STORE)) {
                    database.createObjectStore(SEMANTIC_STORE, { keyPath: "key" })
                        .createIndex("worldIdentity", "worldIdentity", { unique: false });
                }
                if (!database.objectStoreNames.contains(HYDROLOGY_STORE)) {
                    database.createObjectStore(HYDROLOGY_STORE, { keyPath: "key" })
                        .createIndex("worldIdentity", "worldIdentity", { unique: false });
                }
            });
            request.addEventListener("success", () => {
                request.result.addEventListener("versionchange", () => request.result.close());
                finish(resolve, request.result);
            }, { once: true });
            request.addEventListener("error", () => fail(
                request.error ?? new Error("opening surface delta IndexedDB failed")
            ), { once: true });
            request.addEventListener("blocked", () => fail(
                new Error("opening surface delta IndexedDB was blocked")
            ), { once: true });
        });
        return this.databasePromise;
    }
}

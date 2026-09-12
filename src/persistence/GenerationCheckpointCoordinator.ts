import {
    assertWorldDescriptor,
    serializeWorldDescriptor,
    WorldDescriptor
} from "../world/WorldDescriptor";
import { CheckpointConflictError, CheckpointRecoveryError } from "./CheckpointErrors";

export const GENERATION_CHECKPOINT_FORMAT_VERSION = 2;

export interface GenerationCheckpointContext {
    readonly worldId: string;
    readonly generation: number;
    readonly saveId: string;
    readonly descriptor: WorldDescriptor;
    readonly signal: AbortSignal;
    readonly startedAt: number;
}

export interface GenerationCheckpointParticipant<Snapshot = unknown> {
    readonly id: string;
    readonly version: number;
    readonly required?: boolean;
    capture(context: GenerationCheckpointContext): Promise<Snapshot> | Snapshot;
    restore(context: GenerationCheckpointContext, snapshot: Snapshot): Promise<void> | void;
}

export interface GenerationCheckpointParticipantRecord {
    id: string;
    version: number;
    required: boolean;
    state: "staged" | "skipped";
    stageKey?: string;
    checksum?: string;
    error?: string;
}

export interface CommittedCheckpointGeneration {
    generation: number;
    saveId: string;
    descriptor: WorldDescriptor;
    committedAt: number;
    participants: GenerationCheckpointParticipantRecord[];
}

export interface GenerationCheckpointManifest extends CommittedCheckpointGeneration {
    formatVersion: typeof GENERATION_CHECKPOINT_FORMAT_VERSION;
    worldId: string;
    revision: number;
    previous?: CommittedCheckpointGeneration;
}

export interface GenerationCheckpointStageRecord {
    key: string;
    worldId: string;
    generation: number;
    saveId: string;
    participantId: string;
    participantVersion: number;
    createdAt: number;
    checksum: string;
    snapshot: unknown;
}

export interface GenerationCheckpointStore {
    loadManifest(worldId: string, signal?: AbortSignal): Promise<GenerationCheckpointManifest | undefined>;
    putStage(record: GenerationCheckpointStageRecord, signal?: AbortSignal): Promise<void>;
    loadStage(key: string, signal?: AbortSignal): Promise<GenerationCheckpointStageRecord | undefined>;
    /** Abort before publication; once committed, resolve successfully even if cancellation follows. */
    compareAndSetManifest(
        worldId: string,
        expectedRevision: number,
        manifest: GenerationCheckpointManifest,
        signal?: AbortSignal
    ): Promise<void>;
    listStages(worldId: string, signal?: AbortSignal): Promise<readonly GenerationCheckpointStageRecord[]>;
    // Implementations must read the active manifest and remove unreferenced
    // stages atomically with respect to compareAndSetManifest(). Otherwise a
    // collector can delete a verified stage immediately before it is published.
    collectGarbage(worldId: string, cutoffCreatedAt: number, signal?: AbortSignal): Promise<number>;
    dispose(): void;
}

export interface GenerationCheckpointCoordinatorOptions {
    worldId: string;
    descriptor: WorldDescriptor;
    participants: readonly GenerationCheckpointParticipant[];
    store: GenerationCheckpointStore;
    /** Runs capture/restore exclusively with respect to authoritative mutations. */
    withWorldState: <T>(operation: () => Promise<T>) => Promise<T>;
    operationTimeoutMs?: number;
    orphanGraceMs?: number;
    now?: () => number;
    createSaveId?: () => string;
}

export interface GenerationCheckpointCoordinatorStats {
    readonly worldId: string;
    readonly running: boolean;
    readonly completedCheckpoints: number;
    readonly recoveredCheckpoints: number;
    readonly failedOperations: number;
    readonly reclaimedStages: number;
    readonly latestGeneration: number;
}

function cloneValue<T>(value: T): T {
    return structuredClone(value);
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}

function abortError(message: string): Error {
    return new DOMException(message, "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw signal.reason;
}

function abortable<T>(signal: AbortSignal | undefined, operation: () => Promise<T> | T): Promise<T> {
    throwIfAborted(signal);
    return new Promise<T>((resolve, reject) => {
        const aborted = () => reject(signal!.reason);
        signal?.addEventListener("abort", aborted, { once: true });
        Promise.resolve().then(() => {
            throwIfAborted(signal);
            return operation();
        }).then(resolve, reject).finally(() => signal?.removeEventListener("abort", aborted));
    });
}

interface StableSnapshotContext {
    readonly ancestors: WeakSet<object>;
}

function stableSnapshotValue(
    value: unknown,
    context: StableSnapshotContext = { ancestors: new WeakSet() }
): unknown {
    if (value === undefined) return ["undefined"];
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return ["number", String(value)];
        return Object.is(value, -0) ? ["number", "-0"] : value;
    }
    if (typeof value === "bigint") return ["bigint", value.toString()];
    if (typeof value !== "object") {
        throw new TypeError(`checkpoint snapshot contains unsupported ${typeof value} value`);
    }

    if (value instanceof ArrayBuffer) return ["bytes", ...new Uint8Array(value)];
    if (ArrayBuffer.isView(value)) {
        return [
            value.constructor.name,
            ...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        ];
    }
    if (value instanceof Date) return ["date", stableSnapshotValue(value.getTime(), context)];
    if (value instanceof RegExp) return ["regexp", value.source, value.flags, value.lastIndex];
    if (context.ancestors.has(value)) {
        throw new TypeError("checkpoint snapshot contains a cyclic object graph");
    }
    context.ancestors.add(value);
    try {
        if (value instanceof Map) {
            return [
                "map",
                [...value].map(([key, entry]) => [
                    stableSnapshotValue(key, context),
                    stableSnapshotValue(entry, context)
                ])
            ];
        }
        if (value instanceof Set) {
            return ["set", [...value].map(entry => stableSnapshotValue(entry, context))];
        }
        if (Array.isArray(value)) {
            return ["array", Array.from({ length: value.length }, (_, index) => Object.prototype.hasOwnProperty.call(value, index)
                ? ["value", stableSnapshotValue(value[index], context)] : ["hole"])];
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            const name = value.constructor?.name || Object.prototype.toString.call(value);
            throw new TypeError(`checkpoint snapshot contains unsupported ${name} object`);
        }
        const object = value as Record<string, unknown>;
        return ["object", Object.keys(object).sort().map(key => [key, stableSnapshotValue(object[key], context)])];
    } finally {
        context.ancestors.delete(value);
    }
}

function checksumStableValue(value: unknown): string {
    const text = JSON.stringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        const value = text.charCodeAt(index);
        hash ^= value & 0xff;
        hash = Math.imul(hash, 0x01000193) >>> 0;
        hash ^= value >>> 8;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export function checksumCheckpointSnapshot(snapshot: unknown): string {
    return checksumStableValue(stableSnapshotValue(snapshot));
}

function cloneParticipantRecord(record: GenerationCheckpointParticipantRecord): GenerationCheckpointParticipantRecord {
    return { ...record };
}

function cloneGeneration(generation: CommittedCheckpointGeneration): CommittedCheckpointGeneration {
    return {
        generation: generation.generation,
        saveId: generation.saveId,
        descriptor: cloneValue(generation.descriptor),
        committedAt: generation.committedAt,
        participants: generation.participants.map(cloneParticipantRecord)
    };
}

function cloneManifest(manifest: GenerationCheckpointManifest): GenerationCheckpointManifest {
    return {
        ...cloneGeneration(manifest),
        formatVersion: manifest.formatVersion,
        worldId: manifest.worldId,
        revision: manifest.revision,
        ...(manifest.previous ? { previous: cloneGeneration(manifest.previous) } : {})
    };
}

function cloneStage(record: GenerationCheckpointStageRecord): GenerationCheckpointStageRecord {
    return { ...record, snapshot: cloneValue(record.snapshot) };
}

function retainedStageKeys(manifest: GenerationCheckpointManifest | undefined): Set<string> {
    const retained = new Set<string>();
    for (const generation of [manifest, manifest?.previous]) {
        for (const record of generation?.participants ?? []) {
            if (record.state === "staged" && record.stageKey) retained.add(record.stageKey);
        }
    }
    return retained;
}

function assertManifestStage(
    stage: GenerationCheckpointStageRecord | undefined,
    manifest: GenerationCheckpointManifest,
    record: GenerationCheckpointParticipantRecord
): asserts stage is GenerationCheckpointStageRecord {
    const checksumMatches = stage && checksumCheckpointSnapshot(stage.snapshot) === record.checksum;
    if (!stage || stage.key !== record.stageKey || stage.worldId !== manifest.worldId
        || stage.generation !== manifest.generation || stage.saveId !== manifest.saveId
        || stage.participantId !== record.id || stage.participantVersion !== record.version
        || stage.checksum !== record.checksum
        || !checksumMatches) {
        throw new CheckpointRecoveryError(`checkpoint stage for "${record.id}" is missing or corrupt`);
    }
}

function assertParticipantRecords(records: unknown): asserts records is GenerationCheckpointParticipantRecord[] {
    if (!Array.isArray(records)) throw new TypeError("checkpoint manifest participants must be an array");
    const ids = new Set<string>();
    for (const record of records) {
        if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim()
            || ids.has(record.id) || !Number.isSafeInteger(record.version) || record.version < 0
            || typeof record.required !== "boolean" || !["staged", "skipped"].includes(record.state)
            || (record.state === "staged" && (typeof record.stageKey !== "string"
                || typeof record.checksum !== "string"))
            || (record.state === "skipped" && record.required)) {
            throw new TypeError("checkpoint manifest participant record is invalid");
        }
        ids.add(record.id);
    }
}

function assertGeneration(value: unknown): asserts value is CommittedCheckpointGeneration {
    if (!value || typeof value !== "object") throw new TypeError("checkpoint generation must be an object");
    const generation = value as Partial<CommittedCheckpointGeneration>;
    if (!Number.isSafeInteger(generation.generation) || (generation.generation as number) <= 0
        || typeof generation.saveId !== "string" || !generation.saveId.trim()
        || !Number.isFinite(generation.committedAt)) {
        throw new TypeError("checkpoint generation metadata is invalid");
    }
    assertWorldDescriptor(generation.descriptor);
    assertParticipantRecords(generation.participants);
}

export function assertGenerationCheckpointManifest(
    value: unknown,
    worldId?: string
): asserts value is GenerationCheckpointManifest {
    assertGeneration(value);
    const manifest = value as GenerationCheckpointManifest;
    if (manifest.formatVersion !== GENERATION_CHECKPOINT_FORMAT_VERSION
        || typeof manifest.worldId !== "string" || !manifest.worldId.trim()
        || (worldId !== undefined && manifest.worldId !== worldId)
        || !Number.isSafeInteger(manifest.revision) || manifest.revision <= 0) {
        throw new TypeError("checkpoint manifest metadata is invalid");
    }
    if (manifest.previous) {
        assertGeneration(manifest.previous);
        if (manifest.previous.generation >= manifest.generation) {
            throw new TypeError("previous checkpoint generation must precede the active generation");
        }
    }
}

export class MemoryGenerationCheckpointStore implements GenerationCheckpointStore {
    private readonly manifests = new Map<string, GenerationCheckpointManifest>();
    private readonly stages = new Map<string, GenerationCheckpointStageRecord>();
    private disposed = false;

    public loadManifest(worldId: string, signal?: AbortSignal): Promise<GenerationCheckpointManifest | undefined> {
        this.assertActive();
        throwIfAborted(signal);
        const manifest = this.manifests.get(worldId);
        return Promise.resolve(manifest ? cloneManifest(manifest) : undefined);
    }

    public putStage(record: GenerationCheckpointStageRecord, signal?: AbortSignal): Promise<void> {
        this.assertActive();
        throwIfAborted(signal);
        if (this.stages.has(record.key)) return Promise.reject(new Error("checkpoint stage key already exists"));
        this.stages.set(record.key, cloneStage(record));
        return Promise.resolve();
    }

    public loadStage(key: string, signal?: AbortSignal): Promise<GenerationCheckpointStageRecord | undefined> {
        this.assertActive();
        throwIfAborted(signal);
        const record = this.stages.get(key);
        return Promise.resolve(record ? cloneStage(record) : undefined);
    }

    public compareAndSetManifest(
        worldId: string,
        expectedRevision: number,
        manifest: GenerationCheckpointManifest,
        signal?: AbortSignal
    ): Promise<void> {
        this.assertActive();
        throwIfAborted(signal);
        assertGenerationCheckpointManifest(manifest, worldId);
        const actualRevision = this.manifests.get(worldId)?.revision ?? 0;
        if (actualRevision !== expectedRevision) {
            return Promise.reject(new CheckpointConflictError(expectedRevision, actualRevision));
        }
        if (manifest.revision !== expectedRevision + 1) {
            return Promise.reject(new RangeError("checkpoint manifest revision must advance exactly once"));
        }
        for (const record of manifest.participants) {
            if (record.state === "staged") {
                assertManifestStage(this.stages.get(record.stageKey!), manifest, record);
            }
        }
        this.manifests.set(worldId, cloneManifest(manifest));
        return Promise.resolve();
    }

    public listStages(worldId: string, signal?: AbortSignal): Promise<readonly GenerationCheckpointStageRecord[]> {
        this.assertActive();
        throwIfAborted(signal);
        return Promise.resolve([...this.stages.values()]
            .filter(record => record.worldId === worldId)
            .map(cloneStage));
    }

    public collectGarbage(worldId: string, cutoffCreatedAt: number, signal?: AbortSignal): Promise<number> {
        this.assertActive();
        throwIfAborted(signal);
        if (!Number.isFinite(cutoffCreatedAt)) throw new RangeError("checkpoint garbage-collection cutoff must be finite");
        const retained = retainedStageKeys(this.manifests.get(worldId));
        let reclaimed = 0;
        for (const [key, stage] of this.stages) {
            if (stage.worldId !== worldId || retained.has(key) || stage.createdAt > cutoffCreatedAt) continue;
            this.stages.delete(key);
            reclaimed += 1;
        }
        return Promise.resolve(reclaimed);
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.manifests.clear();
        this.stages.clear();
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("GenerationCheckpointStore has been disposed");
    }
}

export interface IndexedDbGenerationCheckpointStoreOptions {
    databaseName?: string;
    openTimeoutMs?: number;
}

const MANIFEST_STORE = "manifests";
const STAGING_STORE = "staging";
const GENERATION_DATABASE_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
}

function transactionComplete(transaction: IDBTransaction, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const abort = () => {
            // A completed transaction cannot be rolled back; its completion event owns the result.
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

export class IndexedDbGenerationCheckpointStore implements GenerationCheckpointStore {
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private disposed = false;

    constructor(options: IndexedDbGenerationCheckpointStoreOptions = {}) {
        this.databaseName = options.databaseName ?? "three-hex-map-generation-checkpoints-v1";
        this.openTimeoutMs = options.openTimeoutMs ?? 2_000;
        if (!this.databaseName.trim()) throw new TypeError("checkpoint databaseName must be a non-empty string");
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new RangeError("checkpoint openTimeoutMs must be positive and finite");
        }
    }

    public loadManifest(worldId: string, signal?: AbortSignal): Promise<GenerationCheckpointManifest | undefined> {
        return this.transact(MANIFEST_STORE, "readonly", signal, async transaction => {
            const manifest = await requestResult(transaction.objectStore(MANIFEST_STORE).get(worldId)) as GenerationCheckpointManifest | undefined;
            if (!manifest) return undefined;
            assertGenerationCheckpointManifest(manifest, worldId);
            return cloneManifest(manifest);
        });
    }

    public putStage(record: GenerationCheckpointStageRecord, signal?: AbortSignal): Promise<void> {
        return this.transact(STAGING_STORE, "readwrite", signal, transaction => {
            transaction.objectStore(STAGING_STORE).add(cloneStage(record));
        });
    }

    public loadStage(key: string, signal?: AbortSignal): Promise<GenerationCheckpointStageRecord | undefined> {
        return this.transact(STAGING_STORE, "readonly", signal, async transaction => {
            const record = await requestResult(transaction.objectStore(STAGING_STORE).get(key)) as GenerationCheckpointStageRecord | undefined;
            return record ? cloneStage(record) : undefined;
        });
    }

    public compareAndSetManifest(
        worldId: string,
        expectedRevision: number,
        manifest: GenerationCheckpointManifest,
        signal?: AbortSignal
    ): Promise<void> {
        assertGenerationCheckpointManifest(manifest, worldId);
        if (manifest.revision !== expectedRevision + 1) {
            return Promise.reject(new RangeError("checkpoint manifest revision must advance exactly once"));
        }
        return this.transact([MANIFEST_STORE, STAGING_STORE], "readwrite", signal, async transaction => {
            const store = transaction.objectStore(MANIFEST_STORE);
            const staging = transaction.objectStore(STAGING_STORE);
            const current = await requestResult(store.get(worldId)) as GenerationCheckpointManifest | undefined;
            const actualRevision = current?.revision ?? 0;
            if (actualRevision !== expectedRevision) throw new CheckpointConflictError(expectedRevision, actualRevision);
            for (const record of manifest.participants) {
                if (record.state !== "staged") continue;
                const stage = await requestResult(staging.get(record.stageKey!)) as GenerationCheckpointStageRecord | undefined;
                assertManifestStage(stage, manifest, record);
            }
            throwIfAborted(signal);
            store.put(cloneManifest(manifest));
        });
    }

    public listStages(worldId: string, signal?: AbortSignal): Promise<readonly GenerationCheckpointStageRecord[]> {
        return this.transact(STAGING_STORE, "readonly", signal, async transaction => {
            const records = await requestResult(transaction.objectStore(STAGING_STORE).index("worldId").getAll(worldId)) as GenerationCheckpointStageRecord[];
            return records.map(cloneStage);
        });
    }

    public collectGarbage(worldId: string, cutoffCreatedAt: number, signal?: AbortSignal): Promise<number> {
        if (!Number.isFinite(cutoffCreatedAt)) return Promise.reject(new RangeError("checkpoint garbage-collection cutoff must be finite"));
        return this.transact([MANIFEST_STORE, STAGING_STORE], "readwrite", signal, async transaction => {
            const staging = transaction.objectStore(STAGING_STORE);
            const manifest = await requestResult(transaction.objectStore(MANIFEST_STORE).get(worldId)) as GenerationCheckpointManifest | undefined;
            if (manifest) assertGenerationCheckpointManifest(manifest, worldId);
            const retained = retainedStageKeys(manifest);
            const stages = await requestResult(staging.index("worldId").getAll(worldId)) as GenerationCheckpointStageRecord[];
            let reclaimed = 0;
            for (const stage of stages) {
                if (retained.has(stage.key) || stage.createdAt > cutoffCreatedAt) continue;
                staging.delete(stage.key);
                reclaimed++;
            }
            return reclaimed;
        });
    }

    private async transact<T>(stores: string | string[], mode: IDBTransactionMode, signal: AbortSignal | undefined,
        operation: (transaction: IDBTransaction) => Promise<T> | T): Promise<T> {
        this.assertActive();
        const database = await abortable(signal, () => this.open());
        this.assertActive();
        throwIfAborted(signal);
        const transaction = database.transaction(stores, mode);
        const completion = transactionComplete(transaction, signal);
        try {
            const result = await operation(transaction);
            await completion;
            return result;
        } catch (reason) {
            try { transaction.abort(); } catch { /* already settled */ }
            await completion.catch(() => undefined);
            throw signal?.aborted ? signal.reason : reason;
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        void this.databasePromise?.then(database => database.close(), () => undefined);
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("GenerationCheckpointStore has been disposed");
    }

    private open(): Promise<IDBDatabase> {
        if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
        this.databasePromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, GENERATION_DATABASE_VERSION);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error("Opening the generation checkpoint database timed out"));
            }, this.openTimeoutMs);
            const finish = <T>(callback: (value: T) => void, value: T): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback(value);
            };
            request.addEventListener("upgradeneeded", () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(MANIFEST_STORE)) {
                    database.createObjectStore(MANIFEST_STORE, { keyPath: "worldId" });
                }
                if (!database.objectStoreNames.contains(STAGING_STORE)) {
                    const store = database.createObjectStore(STAGING_STORE, { keyPath: "key" });
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
            request.addEventListener("error", () => finish(reject, request.error ?? new Error("Opening checkpoint IndexedDB failed")), { once: true });
            request.addEventListener("blocked", () => finish(reject, new Error("Opening checkpoint IndexedDB was blocked")), { once: true });
        });
        return this.databasePromise;
    }
}

function randomSaveId(): string {
    return crypto.randomUUID();
}

export class GenerationCheckpointCoordinator {
    private readonly worldId: string;
    private readonly descriptor: WorldDescriptor;
    private readonly participants: readonly GenerationCheckpointParticipant[];
    private readonly participantById = new Map<string, GenerationCheckpointParticipant>();
    private readonly store: GenerationCheckpointStore;
    private readonly withWorldState: GenerationCheckpointCoordinatorOptions["withWorldState"];
    private readonly timeoutMs: number;
    private readonly orphanGraceMs: number;
    private readonly now: () => number;
    private readonly createSaveId: () => string;
    private operation: Promise<void> = Promise.resolve();
    private activeController: AbortController | undefined;
    private operationCleanup: (() => void) | undefined;
    private disposed = false;
    private running = false;
    private completedCheckpoints = 0;
    private recoveredCheckpoints = 0;
    private failedOperations = 0;
    private reclaimedStages = 0;
    private latestGeneration = 0;

    constructor(options: GenerationCheckpointCoordinatorOptions) {
        if (!options?.worldId?.trim()) throw new TypeError("checkpoint worldId must be a non-empty string");
        assertWorldDescriptor(options.descriptor);
        if (!Array.isArray(options.participants) || options.participants.length === 0) {
            throw new TypeError("checkpoint participants must be a non-empty array");
        }
        if (typeof options.withWorldState !== "function") {
            throw new TypeError("checkpoint withWorldState must provide an authoritative state boundary");
        }
        this.worldId = options.worldId;
        this.descriptor = cloneValue(options.descriptor);
        this.participants = [...options.participants];
        this.store = options.store;
        this.withWorldState = options.withWorldState;
        this.timeoutMs = options.operationTimeoutMs ?? 10_000;
        this.orphanGraceMs = options.orphanGraceMs ?? 5 * 60_000;
        this.now = options.now ?? Date.now;
        this.createSaveId = options.createSaveId ?? randomSaveId;
        if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
            throw new RangeError("checkpoint operationTimeoutMs must be positive and finite");
        }
        if (!Number.isFinite(this.orphanGraceMs) || this.orphanGraceMs < 0) {
            throw new RangeError("checkpoint orphanGraceMs must be non-negative and finite");
        }
        for (const participant of this.participants) {
            if (!participant?.id?.trim() || this.participantById.has(participant.id)
                || !Number.isSafeInteger(participant.version) || participant.version < 0
                || typeof participant.capture !== "function" || typeof participant.restore !== "function") {
                throw new TypeError("generation checkpoint participants are invalid or duplicated");
            }
            this.participantById.set(participant.id, participant);
        }
    }

    public checkpoint(signal?: AbortSignal): Promise<Readonly<GenerationCheckpointManifest>> {
        return this.enqueue(() => this.createCheckpoint(signal));
    }

    public recover(signal?: AbortSignal): Promise<Readonly<GenerationCheckpointManifest> | undefined> {
        return this.enqueue(() => this.recoverLatest(signal));
    }

    public collectGarbage(signal?: AbortSignal): Promise<number> {
        return this.enqueue(async () => {
            const controller = this.startOperation(signal);
            try { return await this.collectUnreferencedStages(controller); }
            finally { this.finishOperation(controller); }
        });
    }

    public get settled(): Promise<void> { return this.operation; }

    public get stats(): Readonly<GenerationCheckpointCoordinatorStats> {
        return {
            worldId: this.worldId,
            running: this.running,
            completedCheckpoints: this.completedCheckpoints,
            recoveredCheckpoints: this.recoveredCheckpoints,
            failedOperations: this.failedOperations,
            reclaimedStages: this.reclaimedStages,
            latestGeneration: this.latestGeneration
        };
    }

    public dispose(disposeStore = true): void {
        if (this.disposed) return;
        this.disposed = true;
        this.activeController?.abort(abortError("GenerationCheckpointCoordinator was disposed"));
        if (disposeStore) void this.operation.finally(() => this.store.dispose());
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        if (this.disposed) return Promise.reject(new Error("GenerationCheckpointCoordinator has been disposed"));
        const result = this.operation.then(task, task);
        this.operation = result.then(() => undefined, () => undefined);
        return result;
    }

    private async createCheckpoint(signal?: AbortSignal): Promise<GenerationCheckpointManifest> {
        const controller = this.startOperation(signal);
        try {
            await this.collectUnreferencedStages(controller);
            const existing = await this.runStep(controller, () => this.store.loadManifest(this.worldId, controller.signal));
            if (existing) {
                assertGenerationCheckpointManifest(existing, this.worldId);
                this.assertDescriptor(existing.descriptor);
            }
            const generation = (existing?.generation ?? 0) + 1;
            const saveId = this.createSaveId();
            if (!saveId.trim()) throw new TypeError("checkpoint saveId must be a non-empty string");
            const context: GenerationCheckpointContext = {
                worldId: this.worldId, generation, saveId, descriptor: cloneValue(this.descriptor),
                signal: controller.signal, startedAt: this.now()
            };
            const captures = await this.runInWorldState(controller, async () => {
                const results = await Promise.all(this.participants.map(async participant => {
                    try {
                        const snapshot = await this.runStep(controller, () => participant.capture(context));
                        const copy = cloneValue(snapshot);
                        return { participant, snapshot: copy, checksum: checksumCheckpointSnapshot(copy) } as const;
                    } catch (reason) {
                        return { participant, error: errorMessage(reason), reason } as const;
                    }
                }));
                const failed = results.find(result => "error" in result && (result.participant.required ?? true));
                if (failed && "reason" in failed) throw failed.reason;
                return results;
            });
            const records: GenerationCheckpointParticipantRecord[] = [];
            for (const capture of captures) {
                if ("error" in capture) {
                    records.push({
                        id: capture.participant.id,
                        version: capture.participant.version,
                        required: false,
                        state: "skipped",
                        error: capture.error
                    });
                    continue;
                }
                const key = JSON.stringify([this.worldId, saveId, capture.participant.id]);
                const stage: GenerationCheckpointStageRecord = {
                    key,
                    worldId: this.worldId,
                    generation,
                    saveId,
                    participantId: capture.participant.id,
                    participantVersion: capture.participant.version,
                    createdAt: this.now(),
                    checksum: capture.checksum,
                    snapshot: capture.snapshot
                };
                await this.runStep(controller, () => this.store.putStage(stage, controller.signal));
                const verified = await this.runStep(controller, () => this.store.loadStage(key, controller.signal));
                if (!verified || verified.checksum !== capture.checksum
                    || checksumCheckpointSnapshot(verified.snapshot) !== capture.checksum) {
                    throw new CheckpointRecoveryError(`checkpoint staging verification failed for "${capture.participant.id}"`);
                }
                records.push({
                    id: capture.participant.id,
                    version: capture.participant.version,
                    required: capture.participant.required ?? true,
                    state: "staged",
                    stageKey: key,
                    checksum: capture.checksum
                });
            }
            const committedAt = this.now();
            const manifest: GenerationCheckpointManifest = {
                formatVersion: GENERATION_CHECKPOINT_FORMAT_VERSION,
                worldId: this.worldId,
                revision: (existing?.revision ?? 0) + 1,
                generation,
                saveId,
                descriptor: cloneValue(this.descriptor),
                committedAt,
                participants: records,
                ...(existing ? { previous: cloneGeneration(existing) } : {})
            };
            throwIfAborted(controller.signal);
            // The store owns cancellation at the atomic commit point. Once it commits,
            // no later cancellation or maintenance failure may turn success into failure.
            await this.store.compareAndSetManifest(this.worldId, existing?.revision ?? 0, manifest, controller.signal);
            this.latestGeneration = generation;
            this.completedCheckpoints += 1;
            return manifest;
        } catch (reason) {
            this.failedOperations += 1;
            // Do not infer publication from a failed acknowledgement or reread.
            // Atomic garbage collection is the only staging deletion path.
            throw reason;
        } finally {
            this.finishOperation(controller);
        }
    }

    private async recoverLatest(signal?: AbortSignal): Promise<GenerationCheckpointManifest | undefined> {
        const controller = this.startOperation(signal);
        try {
            await this.collectUnreferencedStages(controller);
            const manifest = await this.runStep(controller, () => this.store.loadManifest(this.worldId, controller.signal));
            if (!manifest) return undefined;
            assertGenerationCheckpointManifest(manifest, this.worldId);
            this.assertDescriptor(manifest.descriptor);
            const restores: Array<{ participant: GenerationCheckpointParticipant; snapshot: unknown }> = [];
            for (const record of manifest.participants) {
                if (record.state === "skipped") continue;
                const participant = this.participantById.get(record.id);
                if (!participant) {
                    if (record.required) throw new CheckpointRecoveryError('checkpoint participant "' + record.id + '" is unavailable');
                    continue;
                }
                if (record.version !== participant.version) {
                    throw new CheckpointRecoveryError('participant "' + record.id + '" checkpoint version does not match ' + participant.version);
                }
                const stage = await this.runStep(controller, () => this.store.loadStage(record.stageKey!, controller.signal));
                assertManifestStage(stage, manifest, record);
                restores.push({ participant, snapshot: cloneValue(stage.snapshot) });
            }
            for (const participant of this.participants) {
                if ((participant.required ?? true)
                    && !manifest.participants.some(record => record.id === participant.id && record.state === "staged")) {
                    throw new CheckpointRecoveryError('required checkpoint participant "' + participant.id + '" is missing');
                }
            }
            const context: GenerationCheckpointContext = {
                worldId: this.worldId, generation: manifest.generation, saveId: manifest.saveId,
                descriptor: cloneValue(this.descriptor), signal: controller.signal, startedAt: this.now()
            };
            await this.runInWorldState(controller, async () => {
                for (const restore of restores) {
                    await this.runStep(controller, () => restore.participant.restore(context, restore.snapshot));
                }
            });
            this.latestGeneration = manifest.generation;
            this.recoveredCheckpoints++;
            return manifest;
        } catch (reason) {
            this.failedOperations++;
            throw reason;
        } finally {
            this.finishOperation(controller);
        }
    }

    private async collectUnreferencedStages(controller: AbortController): Promise<number> {
        const cutoff = this.now() - this.orphanGraceMs;
        const reclaimed = await this.runStep(controller, () => this.store.collectGarbage(this.worldId, cutoff, controller.signal));
        this.reclaimedStages += reclaimed;
        return reclaimed;
    }

    private assertDescriptor(descriptor: WorldDescriptor): void {
        if (serializeWorldDescriptor(descriptor) !== serializeWorldDescriptor(this.descriptor)) {
            throw new CheckpointRecoveryError("checkpoint world descriptor does not match the requested world");
        }
    }

    private startOperation(signal?: AbortSignal): AbortController {
        if (this.disposed) throw new Error("GenerationCheckpointCoordinator has been disposed");
        this.running = true;
        const controller = new AbortController();
        this.activeController = controller;
        const abort = () => controller.abort(signal!.reason);
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException(
            'checkpoint operation timed out after ' + this.timeoutMs + 'ms', "TimeoutError")), this.timeoutMs);
        this.operationCleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
        return controller;
    }

    private finishOperation(controller: AbortController): void {
        if (this.activeController !== controller) return;
        this.operationCleanup?.();
        this.operationCleanup = undefined;
        this.activeController = undefined;
        this.running = false;
    }

    private runStep<T>(controller: AbortController, operation: () => Promise<T> | T): Promise<T> {
        return abortable(controller.signal, operation);
    }

    private async runInWorldState<T>(controller: AbortController, operation: () => Promise<T>): Promise<T> {
        let invoked = false;
        let completed = false;
        let active = true;
        try {
            const result = await this.runStep(controller, () => this.withWorldState(async () => {
                if (!active || invoked) throw new Error("checkpoint state boundary must invoke its operation exactly once while active");
                invoked = true;
                throwIfAborted(controller.signal);
                const value = await operation();
                completed = true;
                return value;
            }));
            if (!completed) throw new Error("checkpoint state boundary must await its operation");
            return result;
        } finally {
            active = false;
        }
    }
}

import {
    assertWorldDescriptor,
    serializeWorldDescriptor,
    WorldDescriptor
} from "../world/WorldDescriptor";
import { CheckpointConflictError, CheckpointRecoveryError } from "./CheckpointCoordinator";

export const GENERATION_CHECKPOINT_FORMAT_VERSION = 1;

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
    migrate?(
        snapshot: unknown,
        fromVersion: number,
        context: GenerationCheckpointContext
    ): Promise<Snapshot> | Snapshot;
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
    loadManifest(worldId: string): Promise<GenerationCheckpointManifest | undefined>;
    putStage(record: GenerationCheckpointStageRecord): Promise<void>;
    loadStage(key: string): Promise<GenerationCheckpointStageRecord | undefined>;
    compareAndSetManifest(
        worldId: string,
        expectedRevision: number,
        manifest: GenerationCheckpointManifest
    ): Promise<void>;
    listStages(worldId: string): Promise<readonly GenerationCheckpointStageRecord[]>;
    deleteStages(keys: readonly string[]): Promise<void>;
    // Implementations must read the active manifest and remove unreferenced
    // stages atomically with respect to compareAndSetManifest(). Otherwise a
    // collector can delete a verified stage immediately before it is published.
    collectGarbage?(worldId: string, cutoffCreatedAt: number): Promise<number>;
    dispose(): void;
}

export interface GenerationCheckpointCoordinatorOptions {
    worldId: string;
    descriptor: WorldDescriptor;
    participants: readonly GenerationCheckpointParticipant[];
    store: GenerationCheckpointStore;
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
    readonly migratedCheckpoints: number;
    readonly failedOperations: number;
    readonly reclaimedStages: number;
    readonly latestGeneration: number;
}

function cloneValue<T>(value: T): T {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}

function abortError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
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
        if (Array.isArray(value)) return value.map(entry => stableSnapshotValue(entry, context));

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            const name = value.constructor?.name || Object.prototype.toString.call(value);
            throw new TypeError(`checkpoint snapshot contains unsupported ${name} object`);
        }
        const object = value as Record<string, unknown>;
        return Object.keys(object).sort().map(key => [key, stableSnapshotValue(object[key], context)]);
    } finally {
        context.ancestors.delete(value);
    }
}

// v1 originally treated object types without enumerable own properties (for
// example Map, Set, and Date) as the same empty object. Recovery accepts those
// already-published checksums so an upgrade does not strand an existing save;
// all newly staged snapshots use the type-aware representation above.
function legacyStableSnapshotValue(value: unknown): unknown {
    if (value === undefined) return ["undefined"];
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return ["number", String(value)];
        return Object.is(value, -0) ? ["number", "-0"] : value;
    }
    if (typeof value === "bigint") return ["bigint", value.toString()];
    if (value instanceof ArrayBuffer) return ["bytes", ...new Uint8Array(value)];
    if (ArrayBuffer.isView(value)) {
        return [
            value.constructor.name,
            ...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        ];
    }
    if (Array.isArray(value)) return value.map(legacyStableSnapshotValue);
    if (typeof value === "object") {
        const object = value as Record<string, unknown>;
        return Object.keys(object).sort().map(key => [key, legacyStableSnapshotValue(object[key])]);
    }
    throw new TypeError(`checkpoint snapshot contains unsupported ${typeof value} value`);
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

function legacyChecksumCheckpointSnapshot(snapshot: unknown): string {
    return checksumStableValue(legacyStableSnapshotValue(snapshot));
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
    record: GenerationCheckpointParticipantRecord,
    allowLegacyChecksum = false
): asserts stage is GenerationCheckpointStageRecord {
    let checksumMatches = false;
    if (stage) {
        try {
            checksumMatches = checksumCheckpointSnapshot(stage.snapshot) === record.checksum;
        } catch (reason) {
            if (!allowLegacyChecksum) throw reason;
        }
        if (!checksumMatches && allowLegacyChecksum) {
            checksumMatches = legacyChecksumCheckpointSnapshot(stage.snapshot) === record.checksum;
        }
    }
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

    public loadManifest(worldId: string): Promise<GenerationCheckpointManifest | undefined> {
        this.assertActive();
        const manifest = this.manifests.get(worldId);
        return Promise.resolve(manifest ? cloneManifest(manifest) : undefined);
    }

    public putStage(record: GenerationCheckpointStageRecord): Promise<void> {
        this.assertActive();
        if (this.stages.has(record.key)) return Promise.reject(new Error("checkpoint stage key already exists"));
        this.stages.set(record.key, cloneStage(record));
        return Promise.resolve();
    }

    public loadStage(key: string): Promise<GenerationCheckpointStageRecord | undefined> {
        this.assertActive();
        const record = this.stages.get(key);
        return Promise.resolve(record ? cloneStage(record) : undefined);
    }

    public compareAndSetManifest(
        worldId: string,
        expectedRevision: number,
        manifest: GenerationCheckpointManifest
    ): Promise<void> {
        this.assertActive();
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

    public listStages(worldId: string): Promise<readonly GenerationCheckpointStageRecord[]> {
        this.assertActive();
        return Promise.resolve([...this.stages.values()]
            .filter(record => record.worldId === worldId)
            .map(cloneStage));
    }

    public deleteStages(keys: readonly string[]): Promise<void> {
        this.assertActive();
        for (const key of keys) this.stages.delete(key);
        return Promise.resolve();
    }

    public collectGarbage(worldId: string, cutoffCreatedAt: number): Promise<number> {
        this.assertActive();
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

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
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

    public async loadManifest(worldId: string): Promise<GenerationCheckpointManifest | undefined> {
        this.assertActive();
        const database = await this.open();
        const transaction = database.transaction(MANIFEST_STORE, "readonly");
        const manifest = await requestResult(transaction.objectStore(MANIFEST_STORE).get(worldId)) as GenerationCheckpointManifest | undefined;
        await transactionComplete(transaction);
        if (!manifest) return undefined;
        assertGenerationCheckpointManifest(manifest, worldId);
        return cloneManifest(manifest);
    }

    public async putStage(record: GenerationCheckpointStageRecord): Promise<void> {
        this.assertActive();
        const database = await this.open();
        const transaction = database.transaction(STAGING_STORE, "readwrite");
        transaction.objectStore(STAGING_STORE).add(cloneStage(record));
        await transactionComplete(transaction);
    }

    public async loadStage(key: string): Promise<GenerationCheckpointStageRecord | undefined> {
        this.assertActive();
        const database = await this.open();
        const transaction = database.transaction(STAGING_STORE, "readonly");
        const record = await requestResult(transaction.objectStore(STAGING_STORE).get(key)) as GenerationCheckpointStageRecord | undefined;
        await transactionComplete(transaction);
        return record ? cloneStage(record) : undefined;
    }

    public async compareAndSetManifest(
        worldId: string,
        expectedRevision: number,
        manifest: GenerationCheckpointManifest
    ): Promise<void> {
        this.assertActive();
        assertGenerationCheckpointManifest(manifest, worldId);
        if (manifest.revision !== expectedRevision + 1) {
            throw new RangeError("checkpoint manifest revision must advance exactly once");
        }
        const database = await this.open();
        const transaction = database.transaction([MANIFEST_STORE, STAGING_STORE], "readwrite");
        const completion = transactionComplete(transaction);
        try {
            const store = transaction.objectStore(MANIFEST_STORE);
            const staging = transaction.objectStore(STAGING_STORE);
            const current = await requestResult(store.get(worldId)) as GenerationCheckpointManifest | undefined;
            const actualRevision = current?.revision ?? 0;
            if (actualRevision !== expectedRevision) {
                throw new CheckpointConflictError(expectedRevision, actualRevision);
            }
            for (const record of manifest.participants) {
                if (record.state !== "staged") continue;
                const stage = await requestResult(
                    staging.get(record.stageKey!)
                ) as GenerationCheckpointStageRecord | undefined;
                assertManifestStage(stage, manifest, record);
            }
            store.put(cloneManifest(manifest));
            await completion;
        } catch (reason) {
            try { transaction.abort(); } catch { /* already complete */ }
            await completion.catch(() => undefined);
            throw reason;
        }
    }

    public async listStages(worldId: string): Promise<readonly GenerationCheckpointStageRecord[]> {
        this.assertActive();
        const database = await this.open();
        const transaction = database.transaction(STAGING_STORE, "readonly");
        const records = await requestResult(
            transaction.objectStore(STAGING_STORE).index("worldId").getAll(worldId)
        ) as GenerationCheckpointStageRecord[];
        await transactionComplete(transaction);
        return records.map(cloneStage);
    }

    public async deleteStages(keys: readonly string[]): Promise<void> {
        this.assertActive();
        if (keys.length === 0) return;
        const database = await this.open();
        const transaction = database.transaction(STAGING_STORE, "readwrite");
        const store = transaction.objectStore(STAGING_STORE);
        for (const key of keys) store.delete(key);
        await transactionComplete(transaction);
    }

    public async collectGarbage(worldId: string, cutoffCreatedAt: number): Promise<number> {
        this.assertActive();
        if (!Number.isFinite(cutoffCreatedAt)) throw new RangeError("checkpoint garbage-collection cutoff must be finite");
        const database = await this.open();
        const transaction = database.transaction([MANIFEST_STORE, STAGING_STORE], "readwrite");
        const completion = transactionComplete(transaction);
        try {
            const manifestStore = transaction.objectStore(MANIFEST_STORE);
            const staging = transaction.objectStore(STAGING_STORE);
            const manifest = await requestResult(
                manifestStore.get(worldId)
            ) as GenerationCheckpointManifest | undefined;
            if (manifest) assertGenerationCheckpointManifest(manifest, worldId);
            const retained = retainedStageKeys(manifest);
            const stages = await requestResult(
                staging.index("worldId").getAll(worldId)
            ) as GenerationCheckpointStageRecord[];
            let reclaimed = 0;
            for (const stage of stages) {
                if (retained.has(stage.key) || stage.createdAt > cutoffCreatedAt) continue;
                staging.delete(stage.key);
                reclaimed += 1;
            }
            await completion;
            return reclaimed;
        } catch (reason) {
            try { transaction.abort(); } catch { /* already complete */ }
            await completion.catch(() => undefined);
            throw reason;
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
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class GenerationCheckpointCoordinator {
    private readonly worldId: string;
    private readonly descriptor: WorldDescriptor;
    private readonly participants: readonly GenerationCheckpointParticipant[];
    private readonly participantById = new Map<string, GenerationCheckpointParticipant>();
    private readonly store: GenerationCheckpointStore;
    private readonly timeoutMs: number;
    private readonly orphanGraceMs: number;
    private readonly now: () => number;
    private readonly createSaveId: () => string;
    private operation: Promise<void> = Promise.resolve();
    private activeController: AbortController | undefined;
    private disposed = false;
    private running = false;
    private completedCheckpoints = 0;
    private recoveredCheckpoints = 0;
    private migratedCheckpoints = 0;
    private failedOperations = 0;
    private reclaimedStages = 0;
    private latestGeneration = 0;

    constructor(options: GenerationCheckpointCoordinatorOptions) {
        if (!options?.worldId?.trim()) throw new TypeError("checkpoint worldId must be a non-empty string");
        assertWorldDescriptor(options.descriptor);
        if (!Array.isArray(options.participants) || options.participants.length === 0) {
            throw new TypeError("checkpoint participants must be a non-empty array");
        }
        this.worldId = options.worldId;
        this.descriptor = cloneValue(options.descriptor);
        this.participants = [...options.participants];
        this.store = options.store;
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
            if (signal?.aborted) throw signal.reason ?? abortError("Checkpoint garbage collection was aborted");
            return this.collectUnreferencedStages(signal);
        });
    }

    public get settled(): Promise<void> { return this.operation; }

    public get stats(): Readonly<GenerationCheckpointCoordinatorStats> {
        return {
            worldId: this.worldId,
            running: this.running,
            completedCheckpoints: this.completedCheckpoints,
            recoveredCheckpoints: this.recoveredCheckpoints,
            migratedCheckpoints: this.migratedCheckpoints,
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
        const existing = await this.store.loadManifest(this.worldId);
        if (existing) {
            assertGenerationCheckpointManifest(existing, this.worldId);
            this.assertDescriptor(existing.descriptor);
        }
        const generation = (existing?.generation ?? 0) + 1;
        const saveId = this.createSaveId();
        if (!saveId.trim()) throw new TypeError("checkpoint saveId must be a non-empty string");
        const controller = this.startOperation(signal);
        const context: GenerationCheckpointContext = {
            worldId: this.worldId,
            generation,
            saveId,
            descriptor: cloneValue(this.descriptor),
            signal: controller.signal,
            startedAt: this.now()
        };
        const stagedKeys: string[] = [];
        let publishStarted = false;
        try {
            const captures = await Promise.all(this.participants.map(async participant => {
                try {
                    const snapshot = await this.runParticipant(controller, () => participant.capture(context));
                    const copy = cloneValue(snapshot);
                    return { participant, snapshot: copy, checksum: checksumCheckpointSnapshot(copy) } as const;
                } catch (reason) {
                    if (participant.required ?? true) throw reason;
                    return { participant, error: errorMessage(reason) } as const;
                }
            }));
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
                await this.store.putStage(stage);
                stagedKeys.push(key);
                const verified = await this.store.loadStage(key);
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
            publishStarted = true;
            await this.store.compareAndSetManifest(this.worldId, existing?.revision ?? 0, manifest);
            this.latestGeneration = generation;
            this.completedCheckpoints += 1;
            await this.collectUnreferencedStages(controller.signal);
            return manifest;
        } catch (reason) {
            this.failedOperations += 1;
            if (!publishStarted) {
                await this.store.deleteStages(stagedKeys).catch(() => undefined);
            } else {
                // A storage error after the manifest transaction started is
                // outcome-ambiguous: the manifest may already point at these
                // stages. Only reclaim them after proving another save won.
                const published = await this.store.loadManifest(this.worldId).catch(() => undefined);
                if (published?.saveId !== saveId) {
                    await this.store.deleteStages(stagedKeys).catch(() => undefined);
                }
            }
            throw reason;
        } finally {
            this.finishOperation(controller, signal);
        }
    }

    private async recoverLatest(signal?: AbortSignal): Promise<GenerationCheckpointManifest | undefined> {
        const manifest = await this.store.loadManifest(this.worldId);
        if (!manifest) {
            await this.collectUnreferencedStages(signal);
            return undefined;
        }
        assertGenerationCheckpointManifest(manifest, this.worldId);
        this.assertDescriptor(manifest.descriptor);
        this.latestGeneration = manifest.generation;
        const controller = this.startOperation(signal);
        let migrated = false;
        try {
            const restores: Array<{
                participant: GenerationCheckpointParticipant;
                snapshot: unknown;
            }> = [];
            for (const record of manifest.participants) {
                if (record.state === "skipped") continue;
                const participant = this.participantById.get(record.id);
                if (!participant) {
                    if (record.required) throw new CheckpointRecoveryError(`checkpoint participant "${record.id}" is unavailable`);
                    continue;
                }
                const stage = await this.store.loadStage(record.stageKey!);
                assertManifestStage(stage, manifest, record, true);
                let snapshot = stage.snapshot;
                if (record.version !== participant.version) {
                    if (record.version > participant.version || !participant.migrate) {
                        throw new CheckpointRecoveryError(
                            `participant "${record.id}" checkpoint version ${record.version} cannot migrate to ${participant.version}`
                        );
                    }
                    snapshot = await this.runParticipant(
                        controller,
                        () => participant.migrate!(cloneValue(snapshot), record.version, {
                            worldId: this.worldId,
                            generation: manifest.generation,
                            saveId: manifest.saveId,
                            descriptor: cloneValue(this.descriptor),
                            signal: controller.signal,
                            startedAt: this.now()
                        })
                    );
                    migrated = true;
                }
                restores.push({ participant, snapshot: cloneValue(snapshot) });
            }
            for (const participant of this.participants) {
                if ((participant.required ?? true)
                    && !manifest.participants.some(record => record.id === participant.id && record.state === "staged")) {
                    throw new CheckpointRecoveryError(`required checkpoint participant "${participant.id}" is missing`);
                }
            }
            const context: GenerationCheckpointContext = {
                worldId: this.worldId,
                generation: manifest.generation,
                saveId: manifest.saveId,
                descriptor: cloneValue(this.descriptor),
                signal: controller.signal,
                startedAt: this.now()
            };
            for (const restore of restores) {
                await this.runParticipant(controller, () => restore.participant.restore(context, restore.snapshot));
            }
            this.recoveredCheckpoints += 1;
            await this.collectUnreferencedStages(controller.signal);
        } catch (reason) {
            this.failedOperations += 1;
            throw reason;
        } finally {
            this.finishOperation(controller, signal);
        }
        if (!migrated) return manifest;
        this.migratedCheckpoints += 1;
        return this.createCheckpoint(signal);
    }

    private async collectUnreferencedStages(signal?: AbortSignal): Promise<number> {
        if (signal?.aborted) throw signal.reason ?? abortError("Checkpoint garbage collection was aborted");
        // Older custom stores do not have an atomic GC primitive. Skipping GC
        // for them is safe (at worst it retains orphan staging); composing
        // listStages() + deleteStages() here would reintroduce the publish race.
        if (!this.store.collectGarbage) return 0;
        const cutoff = this.now() - this.orphanGraceMs;
        const reclaimed = await this.store.collectGarbage(this.worldId, cutoff);
        this.reclaimedStages += reclaimed;
        return reclaimed;
    }

    private assertDescriptor(descriptor: WorldDescriptor): void {
        if (serializeWorldDescriptor(descriptor) !== serializeWorldDescriptor(this.descriptor)) {
            throw new CheckpointRecoveryError("checkpoint world descriptor does not match the requested world");
        }
    }

    private startOperation(signal?: AbortSignal): AbortController {
        this.running = true;
        const controller = new AbortController();
        this.activeController = controller;
        const abort = () => controller.abort(signal?.reason ?? abortError("Checkpoint operation was aborted"));
        (controller as AbortController & { externalAbort?: () => void }).externalAbort = abort;
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
        return controller;
    }

    private finishOperation(controller: AbortController, signal?: AbortSignal): void {
        const abort = (controller as AbortController & { externalAbort?: () => void }).externalAbort;
        if (abort) signal?.removeEventListener("abort", abort);
        if (this.activeController === controller) this.activeController = undefined;
        this.running = false;
    }

    private async runParticipant<T>(controller: AbortController, operation: () => Promise<T> | T): Promise<T> {
        if (controller.signal.aborted) throw controller.signal.reason ?? abortError("Checkpoint operation was aborted");
        let task: Promise<T>;
        try { task = Promise.resolve(operation()); }
        catch (reason) { task = Promise.reject(reason); }
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            const finish = (callback: (value: T | unknown) => void, value: T | unknown): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                controller.signal.removeEventListener("abort", aborted);
                callback(value);
            };
            const aborted = () => finish(reject, controller.signal.reason ?? abortError("Checkpoint operation was aborted"));
            const timer = setTimeout(() => {
                const error = new Error(`checkpoint participant operation timed out after ${this.timeoutMs}ms`);
                error.name = "TimeoutError";
                controller.abort(error);
                finish(reject, error);
            }, this.timeoutMs);
            controller.signal.addEventListener("abort", aborted, { once: true });
            void task.then(value => finish(resolve as (value: T | unknown) => void, value), reason => finish(reject, reason));
        });
    }
}

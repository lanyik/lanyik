import { Point } from "../interfaces";
import { WorkQueueBackpressureError } from "../runtime/PriorityTaskQueue";
import { RuntimeWorkCoordinator } from "../runtime/RuntimeWorkCoordinator";

export const WORLD_SIMULATION_FORMAT_VERSION = 1;
export const WORLD_SIMULATION_CHECKPOINT_FORMAT_VERSION = 1;

export interface SimulationEntity<State = unknown> extends Point {
    id: string;
    state: State;
}

export interface SimulationChunkSnapshot<State = unknown> {
    version: typeof WORLD_SIMULATION_FORMAT_VERSION;
    chunkX: number;
    chunkY: number;
    revision: number;
    savedAt: number;
    simulatedSeconds: number;
    entities: readonly SimulationEntity<State>[];
}

export interface SimulationChunkStore<State = unknown> {
    load(chunkX: number, chunkY: number): Promise<SimulationChunkSnapshot<State> | undefined>;
    save(snapshot: SimulationChunkSnapshot<State>): Promise<void>;
    delete(chunkX: number, chunkY: number): Promise<void>;
    listChunks?(): Promise<readonly Point[]>;
    replaceAll?(snapshots: readonly SimulationChunkSnapshot<State>[]): Promise<void>;
    flush(): Promise<void>;
    dispose(): void;
}

export interface WorldSimulationCheckpointChunk<State = unknown> extends SimulationChunkSnapshot<State> {
    accumulator: number;
}

export interface WorldSimulationCheckpoint<State = unknown> {
    version: typeof WORLD_SIMULATION_CHECKPOINT_FORMAT_VERSION;
    elapsedSeconds: number;
    checkpointElapsedSeconds: number;
    tick: number;
    chunks: readonly WorldSimulationCheckpointChunk<State>[];
}

function simulationChunkKey(chunkX: number, chunkY: number): string {
    return `${chunkX},${chunkY}`;
}

function cloneValue<T>(value: T): T {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

function cloneEntity<State>(entity: SimulationEntity<State>): SimulationEntity<State> {
    return { ...entity, state: cloneValue(entity.state) };
}

function cloneSnapshot<State>(snapshot: SimulationChunkSnapshot<State>): SimulationChunkSnapshot<State> {
    return { ...snapshot, entities: snapshot.entities.map(cloneEntity) };
}

export class MemorySimulationChunkStore<State = unknown> implements SimulationChunkStore<State> {
    private readonly snapshots = new Map<string, SimulationChunkSnapshot<State>>();
    private disposed = false;

    public load(chunkX: number, chunkY: number): Promise<SimulationChunkSnapshot<State> | undefined> {
        if (this.disposed) return Promise.resolve(undefined);
        const snapshot = this.snapshots.get(simulationChunkKey(chunkX, chunkY));
        return Promise.resolve(snapshot ? cloneSnapshot(snapshot) : undefined);
    }

    public save(snapshot: SimulationChunkSnapshot<State>): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
        this.snapshots.set(simulationChunkKey(snapshot.chunkX, snapshot.chunkY), cloneSnapshot(snapshot));
        return Promise.resolve();
    }

    public delete(chunkX: number, chunkY: number): Promise<void> {
        this.snapshots.delete(simulationChunkKey(chunkX, chunkY));
        return Promise.resolve();
    }

    public listChunks(): Promise<readonly Point[]> {
        if (this.disposed) return Promise.resolve([]);
        return Promise.resolve([...this.snapshots.values()]
            .map(snapshot => ({ x: snapshot.chunkX, y: snapshot.chunkY }))
            .sort((first, second) => first.x - second.x || first.y - second.y));
    }

    public replaceAll(snapshots: readonly SimulationChunkSnapshot<State>[]): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
        this.snapshots.clear();
        for (const snapshot of snapshots) {
            this.snapshots.set(simulationChunkKey(snapshot.chunkX, snapshot.chunkY), cloneSnapshot(snapshot));
        }
        return Promise.resolve();
    }

    public flush(): Promise<void> { return Promise.resolve(); }
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.snapshots.clear();
    }

}

export interface IndexedDbSimulationChunkStoreOptions {
    worldId: string;
    databaseName?: string;
    openTimeoutMs?: number;
}

interface StoredSimulationChunk<State> extends SimulationChunkSnapshot<State> {
    key: string;
    worldId: string;
}

const SIMULATION_DATABASE_VERSION = 1;
const SIMULATION_OBJECT_STORE = "simulationChunks";

function idbResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
}

function idbTransactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
    });
}

export class IndexedDbSimulationChunkStore<State = unknown> implements SimulationChunkStore<State> {
    private readonly worldId: string;
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private pending: Promise<void> = Promise.resolve();
    private pendingError: unknown;
    private disposed = false;

    constructor(options: IndexedDbSimulationChunkStoreOptions) {
        if (!options?.worldId?.trim()) throw new TypeError("simulation store worldId must be a non-empty string");
        this.worldId = options.worldId;
        this.databaseName = options.databaseName ?? "three-hex-map-simulation-v1";
        this.openTimeoutMs = options.openTimeoutMs ?? 2000;
        if (!this.databaseName.trim()) throw new TypeError("simulation databaseName must be a non-empty string");
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) throw new RangeError("simulation openTimeoutMs must be positive and finite");
    }

    public async load(chunkX: number, chunkY: number): Promise<SimulationChunkSnapshot<State> | undefined> {
        if (this.disposed) return undefined;
        await this.flush();
        const database = await this.open();
        const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readonly");
        const stored = await idbResult(transaction.objectStore(SIMULATION_OBJECT_STORE).get(this.key(chunkX, chunkY))) as StoredSimulationChunk<State> | undefined;
        await idbTransactionComplete(transaction);
        if (!stored) return undefined;
        if (stored.worldId !== this.worldId || stored.chunkX !== chunkX || stored.chunkY !== chunkY
            || stored.version !== WORLD_SIMULATION_FORMAT_VERSION) throw new TypeError("stored simulation chunk is invalid or incompatible");
        return cloneSnapshot(stored);
    }

    public save(snapshot: SimulationChunkSnapshot<State>): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
        const copy = cloneSnapshot(snapshot);
        return this.enqueue(async () => {
            const database = await this.open();
            const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readwrite");
            transaction.objectStore(SIMULATION_OBJECT_STORE).put({
                ...copy, key: this.key(copy.chunkX, copy.chunkY), worldId: this.worldId
            } satisfies StoredSimulationChunk<State>);
            await idbTransactionComplete(transaction);
        });
    }

    public delete(chunkX: number, chunkY: number): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
        return this.enqueue(async () => {
            const database = await this.open();
            const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readwrite");
            transaction.objectStore(SIMULATION_OBJECT_STORE).delete(this.key(chunkX, chunkY));
            await idbTransactionComplete(transaction);
        });
    }

    public async listChunks(): Promise<readonly Point[]> {
        if (this.disposed) return [];
        await this.flush();
        const database = await this.open();
        const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readonly");
        const records = await idbResult(
            transaction.objectStore(SIMULATION_OBJECT_STORE).index("worldId").getAll(this.worldId)
        ) as StoredSimulationChunk<State>[];
        await idbTransactionComplete(transaction);
        const chunks = records.map(record => {
            if (record.worldId !== this.worldId || !Number.isSafeInteger(record.chunkX)
                || !Number.isSafeInteger(record.chunkY)) {
                throw new TypeError("stored simulation chunk index is invalid or incompatible");
            }
            return { x: record.chunkX, y: record.chunkY };
        });
        return chunks.sort((first, second) => first.x - second.x || first.y - second.y);
    }

    public replaceAll(snapshots: readonly SimulationChunkSnapshot<State>[]): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
        const copies = snapshots.map(cloneSnapshot);
        return this.enqueue(async () => {
            const database = await this.open();
            const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readwrite");
            const store = transaction.objectStore(SIMULATION_OBJECT_STORE);
            const keys = await idbResult(store.index("worldId").getAllKeys(this.worldId));
            for (const key of keys) store.delete(key);
            for (const snapshot of copies) {
                store.put({
                    ...snapshot,
                    key: this.key(snapshot.chunkX, snapshot.chunkY),
                    worldId: this.worldId
                } satisfies StoredSimulationChunk<State>);
            }
            await idbTransactionComplete(transaction);
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

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        void this.flush().finally(() => {
            void this.databasePromise?.then(database => database.close(), () => undefined);
        }).catch(() => undefined);
    }

    private key(chunkX: number, chunkY: number): string {
        return JSON.stringify([this.worldId, chunkX, chunkY]);
    }

    private enqueue(task: () => Promise<void>): Promise<void> {
        const result = this.pending.then(task, task);
        this.pending = result.catch(error => { this.pendingError ??= error; });
        return result;
    }

    private open(): Promise<IDBDatabase> {
        if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
        this.databasePromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, SIMULATION_DATABASE_VERSION);
            let settled = false;
            const finish = <T>(callback: (value: T) => void, value: T): boolean => {
                if (settled) return false;
                settled = true;
                clearTimeout(timer);
                callback(value);
                return true;
            };
            const timer = setTimeout(() => finish(reject, new Error("Opening the simulation database timed out")), this.openTimeoutMs);
            request.addEventListener("upgradeneeded", () => {
                if (!request.result.objectStoreNames.contains(SIMULATION_OBJECT_STORE)) {
                    const store = request.result.createObjectStore(SIMULATION_OBJECT_STORE, { keyPath: "key" });
                    store.createIndex("worldId", "worldId", { unique: false });
                }
            });
            request.addEventListener("success", () => {
                if (!finish(resolve, request.result)) request.result.close();
                else request.result.addEventListener("versionchange", () => request.result.close());
            }, { once: true });
            request.addEventListener("error", () => finish(reject, request.error ?? new Error("Opening IndexedDB failed")), { once: true });
            request.addEventListener("blocked", () => finish(reject, new Error("Opening IndexedDB was blocked")), { once: true });
        });
        return this.databasePromise;
    }
}

export interface WorldSimulationRuntimeOptions<State = unknown> {
    chunkSize?: number;
    activeTickIntervalSeconds?: number;
    backgroundTickIntervalSeconds?: number;
    maxTicksPerAdvance?: number;
    checkpointIntervalSeconds?: number;
    bounds?: { width: number; height: number; wrapX?: boolean; wrapY?: boolean };
    store?: SimulationChunkStore<State>;
    maxQueuedOperations?: number;
    workCoordinator?: RuntimeWorkCoordinator;
}

export interface SimulationActivityAnchor extends Point {
    id: string;
    radiusChunks: number;
}

export interface SimulationChunkInfo<State = unknown> {
    readonly chunkX: number;
    readonly chunkY: number;
    readonly revision: number;
    readonly active: boolean;
    readonly entities: readonly SimulationEntity<State>[];
}

export interface SimulationTickContext<State = unknown> {
    readonly chunkX: number;
    readonly chunkY: number;
    readonly active: boolean;
    readonly deltaSeconds: number;
    readonly elapsedSeconds: number;
    readonly tick: number;
    readonly entities: readonly SimulationEntity<State>[];
    setEntityState(id: string, state: State): void;
    moveEntity(id: string, x: number, y: number): void;
    removeEntity(id: string): void;
    spawnEntity(entity: SimulationEntity<State>): void;
}

export interface SimulationSystem<State = unknown> {
    readonly id: string;
    update(context: SimulationTickContext<State>): void | Promise<void>;
}

export interface WorldSimulationStats {
    elapsedSeconds: number;
    tick: number;
    residentChunks: number;
    activeChunks: number;
    backgroundChunks: number;
    entities: number;
    ticksRun: number;
    ticksDropped: number;
    dirtyChunks: number;
    queuedOperations: number;
    shedOperations: number;
}

interface SimulationChunkRecord<State> {
    chunkX: number;
    chunkY: number;
    revision: number;
    accumulator: number;
    simulatedSeconds: number;
    entities: Map<string, SimulationEntity<State>>;
    dirty: boolean;
    active: boolean;
}

type Mutation<State> =
    | { kind: "state"; id: string; state: State }
    | { kind: "move"; id: string; x: number; y: number }
    | { kind: "remove"; id: string }
    | { kind: "spawn"; entity: SimulationEntity<State> };

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

//Pure-data world simulation. It has no camera and never mounts render objects:
//activity anchors only choose tick frequency, while every resident chunk with
//entities continues at least at the background cadence.
export class WorldSimulationRuntime<State = unknown> {
    public readonly chunkSize: number;
    private readonly activeInterval: number;
    private readonly backgroundInterval: number;
    private readonly maxTicksPerAdvance: number;
    private readonly checkpointInterval: number;
    private readonly bounds: WorldSimulationRuntimeOptions<State>["bounds"];
    private readonly store: SimulationChunkStore<State> | undefined;
    private readonly maxQueuedOperations: number;
    private readonly chunks = new Map<string, SimulationChunkRecord<State>>();
    private readonly orderedChunkKeys: string[] = [];
    private readonly entityChunks = new Map<string, string>();
    private readonly anchors = new Map<string, SimulationActivityAnchor>();
    private readonly systems = new Map<string, SimulationSystem<State>>();
    private queue: Promise<void> = Promise.resolve();
    private queuedOperations = 0;
    private shedOperations = 0;
    private elapsed = 0;
    private checkpointElapsed = 0;
    private tickCount = 0;
    private disposed = false;
    private storeDisposed = false;
    private lifecycleRevision = 0;
    private readonly detachWorkTelemetry: (() => void) | undefined;
    private readonly coordinatorSignal: AbortSignal | undefined;
    private readonly coordinatorAbort: (() => void) | undefined;
    private activeChunkCount = 0;
    private dirtyChunkCount = 0;
    private snapshot: WorldSimulationStats = {
        elapsedSeconds: 0, tick: 0, residentChunks: 0, activeChunks: 0,
        backgroundChunks: 0, entities: 0, ticksRun: 0, ticksDropped: 0, dirtyChunks: 0,
        queuedOperations: 0, shedOperations: 0
    };

    constructor(options: WorldSimulationRuntimeOptions<State> = {}) {
        this.chunkSize = options.chunkSize ?? 96;
        this.activeInterval = options.activeTickIntervalSeconds ?? 0.1;
        this.backgroundInterval = options.backgroundTickIntervalSeconds ?? 5;
        this.maxTicksPerAdvance = options.maxTicksPerAdvance ?? 50;
        this.checkpointInterval = options.checkpointIntervalSeconds ?? 30;
        this.bounds = options.bounds;
        this.store = options.store;
        this.maxQueuedOperations = options.maxQueuedOperations ?? 1024;
        if (!Number.isSafeInteger(this.chunkSize) || this.chunkSize <= 0) throw new RangeError("simulation chunkSize must be a positive safe integer");
        for (const [name, value] of [
            ["activeTickIntervalSeconds", this.activeInterval],
            ["backgroundTickIntervalSeconds", this.backgroundInterval],
            ["checkpointIntervalSeconds", this.checkpointInterval]
        ] as const) if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
        if (!Number.isInteger(this.maxTicksPerAdvance) || this.maxTicksPerAdvance <= 0) {
            throw new RangeError("maxTicksPerAdvance must be a positive integer");
        }
        if (!Number.isSafeInteger(this.maxQueuedOperations) || this.maxQueuedOperations <= 0) {
            throw new RangeError("maxQueuedOperations must be a positive safe integer");
        }
        if (this.bounds && (!Number.isSafeInteger(this.bounds.width) || this.bounds.width <= 0
            || !Number.isSafeInteger(this.bounds.height) || this.bounds.height <= 0)) {
            throw new RangeError("simulation bounds must use positive safe integer dimensions");
        }
        this.detachWorkTelemetry = options.workCoordinator?.registerTelemetry("simulation", () => ({
            pendingTasks: Math.max(0, this.queuedOperations - 1),
            pendingWeight: Math.max(0, this.queuedOperations - 1),
            busyTasks: this.queuedOperations > 0 ? 1 : 0,
            shedTasks: this.shedOperations
        }));
        this.coordinatorSignal = options.workCoordinator?.signal;
        this.coordinatorAbort = this.coordinatorSignal ? () => this.dispose() : undefined;
        this.coordinatorSignal?.addEventListener("abort", this.coordinatorAbort!, { once: true });
    }

    public get stats(): Readonly<WorldSimulationStats> { return this.snapshot; }

    public registerSystem(system: SimulationSystem<State>): void {
        this.assertSynchronousMutationAllowed();
        if (!system?.id?.trim() || typeof system.update !== "function") throw new TypeError("simulation system is invalid");
        if (this.systems.has(system.id)) throw new Error(`simulation system "${system.id}" is already registered`);
        this.systems.set(system.id, system);
    }

    public unregisterSystem(id: string): boolean {
        this.assertSynchronousMutationAllowed();
        return this.systems.delete(id);
    }

    public setActivityAnchor(anchor: SimulationActivityAnchor): void {
        this.assertSynchronousMutationAllowed();
        if (!anchor || typeof anchor !== "object") throw new TypeError("simulation activity anchor is invalid");
        const point = this.normalize(anchor.x, anchor.y);
        if (!anchor?.id?.trim() || !point || !Number.isInteger(anchor.radiusChunks) || anchor.radiusChunks < 0) {
            throw new TypeError("simulation activity anchor is invalid");
        }
        this.anchors.set(anchor.id, { ...point, id: anchor.id, radiusChunks: anchor.radiusChunks });
        this.refreshChunkActivity();
    }

    public removeActivityAnchor(id: string): boolean {
        this.assertSynchronousMutationAllowed();
        const removed = this.anchors.delete(id);
        if (removed) this.refreshChunkActivity();
        return removed;
    }

    public addEntity(entity: SimulationEntity<State>): void {
        this.assertSynchronousMutationAllowed();
        this.addEntityNow(entity);
    }

    private addEntityNow(entity: SimulationEntity<State>): void {
        if (!entity?.id?.trim() || this.entityChunks.has(entity.id)) throw new Error("simulation entity id must be non-empty and unique");
        const point = this.normalize(entity.x, entity.y);
        if (!point) throw new RangeError("simulation entity coordinates are outside the world");
        const record = this.getOrCreateChunkForTile(point.x, point.y);
        if (record.entities.size === 0) record.simulatedSeconds = this.elapsed;
        record.entities.set(entity.id, cloneEntity({ ...entity, ...point }));
        this.entityChunks.set(entity.id, simulationChunkKey(record.chunkX, record.chunkY));
        this.touch(record);
        this.updateStats(0, 0);
    }

    public getEntity(id: string): SimulationEntity<State> | undefined {
        const key = this.entityChunks.get(id);
        const entity = key ? this.chunks.get(key)?.entities.get(id) : undefined;
        return entity ? cloneEntity(entity) : undefined;
    }

    public setEntityState(id: string, state: State): boolean {
        this.assertSynchronousMutationAllowed();
        const key = this.entityChunks.get(id);
        const record = key ? this.chunks.get(key) : undefined;
        const entity = record?.entities.get(id);
        if (!record || !entity) return false;
        entity.state = cloneValue(state);
        this.touch(record);
        this.updateStats(0, 0);
        return true;
    }

    public removeEntity(id: string): boolean {
        this.assertSynchronousMutationAllowed();
        const key = this.entityChunks.get(id);
        const record = key ? this.chunks.get(key) : undefined;
        if (!key || !record || !record.entities.delete(id)) return false;
        this.entityChunks.delete(id);
        this.touch(record);
        this.updateStats(0, 0);
        return true;
    }

    public chunkAt(x: number, y: number): SimulationChunkInfo<State> | undefined {
        const point = this.normalize(x, y);
        if (!point) return undefined;
        const record = this.chunks.get(this.chunkKeyForTile(point.x, point.y));
        return record ? this.chunkInfo(record) : undefined;
    }

    public wakeChunk(chunkX: number, chunkY: number): Promise<SimulationChunkInfo<State>> {
        this.assertChunkCoordinates(chunkX, chunkY);
        return this.enqueueOperation(async lifecycleRevision => {
            const key = simulationChunkKey(chunkX, chunkY);
            let record = this.chunks.get(key);
            if (record) return this.chunkInfo(record);
            const saved = await this.store?.load(chunkX, chunkY);
            this.assertLifecycleCurrent(lifecycleRevision);
            if (saved) this.assertSnapshot(saved, chunkX, chunkY);
            record = {
                chunkX, chunkY, revision: saved?.revision ?? 0, accumulator: 0,
                simulatedSeconds: saved?.simulatedSeconds ?? this.elapsed,
                entities: new Map(), dirty: false, active: false
            };
            for (const entity of saved?.entities ?? []) {
                if (this.entityChunks.has(entity.id)) throw new Error(`duplicate restored simulation entity "${entity.id}"`);
                const point = this.normalize(entity.x, entity.y);
                if (!point || this.chunkKeyForTile(point.x, point.y) !== key) throw new TypeError("simulation snapshot entity is in the wrong chunk");
                record.entities.set(entity.id, cloneEntity(entity));
            }
            this.assertLifecycleCurrent(lifecycleRevision);
            if (saved) this.elapsed = Math.max(this.elapsed, saved.simulatedSeconds);
            for (const id of record.entities.keys()) this.entityChunks.set(id, key);
            this.registerChunk(key, record);
            this.updateStats(0, 0);
            return this.chunkInfo(record);
        });
    }

    public restoreStoredChunks(): Promise<readonly SimulationChunkInfo<State>[]> {
        const store = this.store;
        if (!store?.listChunks) {
            return Promise.reject(new Error("SimulationChunkStore does not support stored chunk enumeration"));
        }
        return this.enqueueOperation(async lifecycleRevision => {
            const listed = await store.listChunks!();
            this.assertLifecycleCurrent(lifecycleRevision);
            if (!Array.isArray(listed)) throw new TypeError("stored simulation chunk list must be an array");
            const points = listed.map(point => {
                if (!point || typeof point !== "object") {
                    throw new TypeError("stored simulation chunk coordinates are invalid");
                }
                this.assertChunkCoordinates(point.x, point.y);
                return { x: point.x, y: point.y };
            }).sort((first, second) => first.x - second.x || first.y - second.y);
            const seenChunks = new Set<string>();
            const seenEntities = new Set(this.entityChunks.keys());
            const pending: Array<{ key: string; snapshot: SimulationChunkSnapshot<State> }> = [];
            const result: SimulationChunkInfo<State>[] = [];
            for (const point of points) {
                const key = simulationChunkKey(point.x, point.y);
                if (seenChunks.has(key)) throw new TypeError("simulation store listed duplicate chunk coordinates");
                seenChunks.add(key);
                const resident = this.chunks.get(key);
                if (resident) {
                    result.push(this.chunkInfo(resident));
                    continue;
                }
                const snapshot = await store.load(point.x, point.y);
                this.assertLifecycleCurrent(lifecycleRevision);
                if (!snapshot) continue;
                this.assertSnapshot(snapshot, point.x, point.y);
                for (const entity of snapshot.entities) {
                    if (seenEntities.has(entity.id)) {
                        throw new Error(`duplicate restored simulation entity "${entity.id}"`);
                    }
                    seenEntities.add(entity.id);
                }
                pending.push({ key, snapshot });
            }
            // No restored record is made visible until every indexed snapshot
            // has loaded and validated successfully.
            this.elapsed = pending.reduce(
                (elapsed, entry) => Math.max(elapsed, entry.snapshot.simulatedSeconds),
                this.elapsed
            );
            for (const { key, snapshot } of pending) {
                const record: SimulationChunkRecord<State> = {
                    chunkX: snapshot.chunkX,
                    chunkY: snapshot.chunkY,
                    revision: snapshot.revision,
                    accumulator: 0,
                    simulatedSeconds: snapshot.simulatedSeconds,
                    entities: new Map(snapshot.entities.map(entity => [entity.id, cloneEntity(entity)])),
                    dirty: false,
                    active: false
                };
                for (const id of record.entities.keys()) this.entityChunks.set(id, key);
                this.registerChunk(key, record);
                result.push(this.chunkInfo(record));
            }
            this.updateStats(0, 0);
            return result.sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY);
        });
    }

    public hibernateChunk(chunkX: number, chunkY: number): Promise<boolean> {
        this.assertChunkCoordinates(chunkX, chunkY);
        return this.enqueueOperation(async lifecycleRevision => {
            const key = simulationChunkKey(chunkX, chunkY);
            const record = this.chunks.get(key);
            if (!record) return false;
            if (this.isActive(record)) throw new Error("cannot hibernate an active simulation chunk");
            await this.saveRecord(record, lifecycleRevision);
            this.assertLifecycleCurrent(lifecycleRevision);
            if (this.chunks.get(key) !== record) return false;
            this.unregisterChunk(key, record);
            for (const id of record.entities.keys()) {
                if (this.entityChunks.get(id) === key) this.entityChunks.delete(id);
            }
            this.updateStats(0, 0);
            return true;
        });
    }

    public advance(deltaSeconds: number): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("WorldSimulationRuntime has been disposed"));
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return Promise.reject(new RangeError("simulation deltaSeconds must be non-negative and finite"));
        return this.enqueueOperation(revision => this.advanceNow(deltaSeconds, revision));
    }

    public createCheckpointSnapshot(): Promise<WorldSimulationCheckpoint<State>> {
        return this.enqueueOperation(async lifecycleRevision => {
            for (const record of this.chunks.values()) {
                if (!record.dirty) continue;
                await this.saveRecord(record, lifecycleRevision);
                this.assertLifecycleCurrent(lifecycleRevision);
            }
            await this.store?.flush();
            this.assertLifecycleCurrent(lifecycleRevision);

            const snapshots = new Map<string, WorldSimulationCheckpointChunk<State>>();
            if (this.store) {
                if (!this.store.listChunks) {
                    throw new Error("SimulationChunkStore does not support checkpoint enumeration");
                }
                const points = await this.store.listChunks();
                for (const point of points) {
                    this.assertChunkCoordinates(point.x, point.y);
                    const stored = await this.store.load(point.x, point.y);
                    this.assertLifecycleCurrent(lifecycleRevision);
                    if (!stored) continue;
                    this.assertSnapshot(stored, point.x, point.y);
                    snapshots.set(simulationChunkKey(point.x, point.y), {
                        ...cloneSnapshot(stored),
                        accumulator: 0
                    });
                }
            }
            const capturedAt = Date.now();
            for (const [key, record] of this.chunks) {
                if (record.entities.size === 0) {
                    snapshots.delete(key);
                    continue;
                }
                snapshots.set(key, {
                    version: WORLD_SIMULATION_FORMAT_VERSION,
                    chunkX: record.chunkX,
                    chunkY: record.chunkY,
                    revision: record.revision,
                    savedAt: capturedAt,
                    simulatedSeconds: record.simulatedSeconds,
                    accumulator: record.accumulator,
                    entities: [...record.entities.values()].map(cloneEntity)
                });
            }
            return {
                version: WORLD_SIMULATION_CHECKPOINT_FORMAT_VERSION,
                elapsedSeconds: this.elapsed,
                checkpointElapsedSeconds: this.checkpointElapsed,
                tick: this.tickCount,
                chunks: [...snapshots.values()]
                    .sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY)
                    .map(cloneValue)
            };
        });
    }

    public restoreCheckpointSnapshot(snapshot: WorldSimulationCheckpoint<State>): Promise<void> {
        return this.enqueueOperation(async lifecycleRevision => {
            if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
                || snapshot.version !== WORLD_SIMULATION_CHECKPOINT_FORMAT_VERSION
                || !Number.isFinite(snapshot.elapsedSeconds) || snapshot.elapsedSeconds < 0
                || !Number.isFinite(snapshot.checkpointElapsedSeconds) || snapshot.checkpointElapsedSeconds < 0
                || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0
                || !Array.isArray(snapshot.chunks)) {
                throw new TypeError("simulation checkpoint is invalid or incompatible");
            }
            const chunks: WorldSimulationCheckpointChunk<State>[] = snapshot.chunks.map(chunk => cloneValue(chunk));
            const chunkKeys = new Set<string>();
            const entityIds = new Set<string>();
            for (const chunk of chunks) {
                this.assertSnapshot(chunk, chunk.chunkX, chunk.chunkY);
                if (!Number.isFinite(chunk.accumulator) || chunk.accumulator < 0) {
                    throw new TypeError("simulation checkpoint accumulator is invalid");
                }
                const key = simulationChunkKey(chunk.chunkX, chunk.chunkY);
                if (chunkKeys.has(key)) throw new TypeError("simulation checkpoint contains duplicate chunks");
                chunkKeys.add(key);
                for (const entity of chunk.entities) {
                    if (entityIds.has(entity.id)) {
                        throw new TypeError(`simulation checkpoint contains duplicate entity id "${entity.id}"`);
                    }
                    entityIds.add(entity.id);
                }
            }
            if (this.store) {
                if (!this.store.replaceAll) {
                    throw new Error("SimulationChunkStore does not support atomic checkpoint replacement");
                }
                await this.store.replaceAll(chunks);
                await this.store.flush();
                this.assertLifecycleCurrent(lifecycleRevision);
            }

            this.chunks.clear();
            this.orderedChunkKeys.length = 0;
            this.entityChunks.clear();
            this.activeChunkCount = 0;
            this.dirtyChunkCount = 0;
            this.elapsed = snapshot.elapsedSeconds;
            this.checkpointElapsed = snapshot.checkpointElapsedSeconds;
            this.tickCount = snapshot.tick;
            for (const chunk of chunks) {
                const key = simulationChunkKey(chunk.chunkX, chunk.chunkY);
                const record: SimulationChunkRecord<State> = {
                    chunkX: chunk.chunkX,
                    chunkY: chunk.chunkY,
                    revision: chunk.revision,
                    accumulator: chunk.accumulator,
                    simulatedSeconds: chunk.simulatedSeconds,
                    entities: new Map(chunk.entities.map((entity: SimulationEntity<State>) => [entity.id, cloneEntity(entity)])),
                    dirty: false,
                    active: false
                };
                for (const id of record.entities.keys()) this.entityChunks.set(id, key);
                this.registerChunk(key, record);
            }
            this.updateStats(0, 0);
        });
    }

    public flush(): Promise<void> {
        return this.enqueueOperation(async lifecycleRevision => {
            for (const record of this.chunks.values()) {
                if (!record.dirty) continue;
                await this.saveRecord(record, lifecycleRevision);
                this.assertLifecycleCurrent(lifecycleRevision);
            }
            await this.store?.flush();
            this.assertLifecycleCurrent(lifecycleRevision);
            this.updateStats(0, 0);
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.detachWorkTelemetry?.();
        if (this.coordinatorAbort) this.coordinatorSignal?.removeEventListener("abort", this.coordinatorAbort);
        this.lifecycleRevision += 1;
        this.chunks.clear();
        this.orderedChunkKeys.length = 0;
        this.entityChunks.clear();
        this.anchors.clear();
        this.systems.clear();
        this.activeChunkCount = 0;
        this.dirtyChunkCount = 0;
        this.updateStats(0, 0);
        void this.queue.finally(() => this.disposeStore()).catch(() => undefined);
    }

    private async advanceNow(deltaSeconds: number, lifecycleRevision: number): Promise<void> {
        this.elapsed += deltaSeconds;
        this.checkpointElapsed += deltaSeconds;
        const due = new Map<string, { record: SimulationChunkRecord<State>; active: boolean; count: number; interval: number }>();
        let activeChunks = 0;
        let backgroundChunks = 0;
        let dropped = 0;
        let maximumDue = 0;
        for (const key of this.orderedChunkKeys) {
            const record = this.chunks.get(key)!;
            const active = record.active;
            if (active) activeChunks += 1;
            else backgroundChunks += 1;
            const interval = active ? this.activeInterval : this.backgroundInterval;
            record.accumulator += deltaSeconds;
            const raw = Math.floor(record.accumulator / interval);
            const count = Math.min(raw, this.maxTicksPerAdvance);
            if (raw > count) dropped += raw - count;
            record.accumulator = raw > count ? record.accumulator % interval : record.accumulator - count * interval;
            if (count > 0) due.set(key, { record, active, count, interval });
            maximumDue = Math.max(maximumDue, count);
        }

        let ticksRun = 0;
        for (let step = 0; step < maximumDue; step += 1) {
            const mutations: Mutation<State>[] = [];
            for (const { record, active, count, interval } of due.values()) {
                if (step >= count || record.entities.size === 0) continue;
                record.simulatedSeconds += interval;
                const entities = [...record.entities.values()].map(cloneEntity);
                const context: SimulationTickContext<State> = {
                    chunkX: record.chunkX, chunkY: record.chunkY, active,
                    deltaSeconds: interval, elapsedSeconds: record.simulatedSeconds,
                    tick: ++this.tickCount, entities,
                    setEntityState: (id, state) => mutations.push({ kind: "state", id, state: cloneValue(state) }),
                    moveEntity: (id, x, y) => mutations.push({ kind: "move", id, x, y }),
                    removeEntity: id => mutations.push({ kind: "remove", id }),
                    spawnEntity: entity => mutations.push({ kind: "spawn", entity: cloneEntity(entity) })
                };
                for (const system of this.systems.values()) await system.update(context);
                this.assertLifecycleCurrent(lifecycleRevision);
                ticksRun += 1;
            }
            this.applyMutations(mutations);
        }

        if (this.store && this.checkpointElapsed >= this.checkpointInterval) {
            this.checkpointElapsed %= this.checkpointInterval;
            for (const record of this.chunks.values()) {
                if (!record.dirty) continue;
                await this.saveRecord(record, lifecycleRevision);
                this.assertLifecycleCurrent(lifecycleRevision);
            }
        }
        this.updateStats(ticksRun, dropped, activeChunks, backgroundChunks);
    }

    private applyMutations(mutations: readonly Mutation<State>[]): void {
        for (const mutation of mutations) {
            if (mutation.kind === "spawn") {
                if (!this.entityChunks.has(mutation.entity.id)) this.addEntityNow(mutation.entity);
                continue;
            }
            const key = this.entityChunks.get(mutation.id);
            const source = key ? this.chunks.get(key) : undefined;
            const entity = source?.entities.get(mutation.id);
            if (!key || !source || !entity) continue;
            if (mutation.kind === "remove") {
                source.entities.delete(mutation.id);
                this.entityChunks.delete(mutation.id);
                this.touch(source);
            } else if (mutation.kind === "state") {
                entity.state = cloneValue(mutation.state);
                this.touch(source);
            } else {
                const point = this.normalize(mutation.x, mutation.y);
                if (!point) continue;
                const destination = this.getOrCreateChunkForTile(point.x, point.y);
                if (destination.entities.size === 0) destination.simulatedSeconds = this.elapsed;
                source.entities.delete(mutation.id);
                entity.x = point.x;
                entity.y = point.y;
                destination.entities.set(entity.id, entity);
                this.entityChunks.set(entity.id, simulationChunkKey(destination.chunkX, destination.chunkY));
                this.touch(source);
                if (destination !== source) this.touch(destination);
            }
        }
    }

    private normalize(x: number, y: number): Point | undefined {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
        if (!this.bounds) return { x, y };
        const nx = this.bounds.wrapX ? positiveModulo(x, this.bounds.width) : x;
        const ny = this.bounds.wrapY ? positiveModulo(y, this.bounds.height) : y;
        return nx < 0 || nx >= this.bounds.width || ny < 0 || ny >= this.bounds.height ? undefined : { x: nx, y: ny };
    }

    private chunkKeyForTile(x: number, y: number): string {
        return simulationChunkKey(Math.floor(x / this.chunkSize), Math.floor(y / this.chunkSize));
    }

    private getOrCreateChunkForTile(x: number, y: number): SimulationChunkRecord<State> {
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkY = Math.floor(y / this.chunkSize);
        const key = simulationChunkKey(chunkX, chunkY);
        let record = this.chunks.get(key);
        if (!record) {
            record = {
                chunkX, chunkY, revision: 0, accumulator: 0,
                simulatedSeconds: this.elapsed, entities: new Map(), dirty: false,
                active: false
            };
            this.registerChunk(key, record);
        }
        return record;
    }

    private isActive(record: SimulationChunkRecord<State>): boolean {
        return record.active;
    }

    private computeActive(record: SimulationChunkRecord<State>): boolean {
        for (const anchor of this.anchors.values()) {
            const anchorX = Math.floor(anchor.x / this.chunkSize);
            const anchorY = Math.floor(anchor.y / this.chunkSize);
            let dx = Math.abs(record.chunkX - anchorX);
            let dy = Math.abs(record.chunkY - anchorY);
            if (this.bounds?.wrapX) dx = Math.min(dx, Math.ceil(this.bounds.width / this.chunkSize) - dx);
            if (this.bounds?.wrapY) dy = Math.min(dy, Math.ceil(this.bounds.height / this.chunkSize) - dy);
            if (Math.max(dx, dy) <= anchor.radiusChunks) return true;
        }
        return false;
    }

    private touch(record: SimulationChunkRecord<State>): void {
        record.revision += 1;
        if (!record.dirty) this.dirtyChunkCount += 1;
        record.dirty = true;
    }

    private async saveRecord(record: SimulationChunkRecord<State>, lifecycleRevision: number): Promise<void> {
        if (!this.store || !record.dirty) return;
        const savedRevision = record.revision;
        if (record.entities.size === 0) {
            await this.store.delete(record.chunkX, record.chunkY);
        } else {
            await this.store.save({
                version: WORLD_SIMULATION_FORMAT_VERSION,
                chunkX: record.chunkX, chunkY: record.chunkY, revision: savedRevision,
                savedAt: Date.now(), simulatedSeconds: record.simulatedSeconds,
                entities: [...record.entities.values()].map(cloneEntity)
            });
        }
        this.assertLifecycleCurrent(lifecycleRevision);
        const key = simulationChunkKey(record.chunkX, record.chunkY);
        if (this.chunks.get(key) === record && record.dirty && record.revision === savedRevision) {
            record.dirty = false;
            this.dirtyChunkCount -= 1;
        }
    }

    private chunkInfo(record: SimulationChunkRecord<State>): SimulationChunkInfo<State> {
        return {
            chunkX: record.chunkX, chunkY: record.chunkY, revision: record.revision,
            active: record.active, entities: [...record.entities.values()].map(cloneEntity)
        };
    }

    private assertChunkCoordinates(chunkX: number, chunkY: number): void {
        if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) throw new RangeError("simulation chunk coordinates must be safe integers");
        if (this.bounds) {
            const countX = Math.ceil(this.bounds.width / this.chunkSize);
            const countY = Math.ceil(this.bounds.height / this.chunkSize);
            if (chunkX < 0 || chunkX >= countX || chunkY < 0 || chunkY >= countY) {
                throw new RangeError("simulation chunk coordinates are outside the world");
            }
        }
    }

    private assertSnapshot(snapshot: SimulationChunkSnapshot<State>, chunkX: number, chunkY: number): void {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
            || snapshot.version !== WORLD_SIMULATION_FORMAT_VERSION
            || snapshot.chunkX !== chunkX || snapshot.chunkY !== chunkY
            || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
            || !Number.isSafeInteger(snapshot.savedAt) || snapshot.savedAt < 0
            || !Number.isFinite(snapshot.simulatedSeconds) || snapshot.simulatedSeconds < 0
            || !Array.isArray(snapshot.entities)) {
            throw new TypeError("simulation chunk snapshot is invalid or incompatible");
        }
        const ids = new Set<string>();
        const key = simulationChunkKey(chunkX, chunkY);
        for (const entity of snapshot.entities) {
            if (!entity || typeof entity !== "object" || Array.isArray(entity)
                || typeof entity.id !== "string" || entity.id.trim().length === 0) {
                throw new TypeError("simulation snapshot entity must be an object with a non-empty id");
            }
            if (ids.has(entity.id)) {
                throw new TypeError(`simulation snapshot contains duplicate entity id "${entity.id}"`);
            }
            ids.add(entity.id);
            const point = this.normalize(entity.x, entity.y);
            if (!point || point.x !== entity.x || point.y !== entity.y
                || this.chunkKeyForTile(point.x, point.y) !== key) {
                throw new TypeError("simulation snapshot entity has invalid or non-canonical chunk coordinates");
            }
        }
    }

    private updateStats(
        ticksRun: number,
        ticksDropped: number,
        activeChunks = this.activeChunkCount,
        backgroundChunks = this.chunks.size - activeChunks
    ): void {
        this.snapshot = {
            elapsedSeconds: this.elapsed, tick: this.tickCount,
            residentChunks: this.chunks.size, activeChunks, backgroundChunks,
            entities: this.entityChunks.size, ticksRun, ticksDropped,
            dirtyChunks: this.dirtyChunkCount,
            queuedOperations: this.queuedOperations,
            shedOperations: this.shedOperations
        };
    }

    private registerChunk(key: string, record: SimulationChunkRecord<State>): void {
        record.active = this.computeActive(record);
        this.chunks.set(key, record);
        if (record.active) this.activeChunkCount += 1;
        this.orderedChunkKeys.push(key);
    }

    private unregisterChunk(key: string, record: SimulationChunkRecord<State>): void {
        if (!this.chunks.delete(key)) return;
        if (record.active) this.activeChunkCount -= 1;
        if (record.dirty) this.dirtyChunkCount -= 1;
        const index = this.orderedChunkKeys.indexOf(key);
        if (index >= 0) this.orderedChunkKeys.splice(index, 1);
    }

    private refreshChunkActivity(): void {
        let active = 0;
        for (const record of this.chunks.values()) {
            record.active = this.computeActive(record);
            if (record.active) active += 1;
        }
        this.activeChunkCount = active;
        this.updateStats(0, 0);
    }

    private enqueueOperation<T>(operation: (lifecycleRevision: number) => T | Promise<T>): Promise<T> {
        if (this.disposed) return Promise.reject(new Error("WorldSimulationRuntime has been disposed"));
        if (this.queuedOperations >= this.maxQueuedOperations) {
            this.shedOperations += 1;
            this.updateQueueStats();
            return Promise.reject(new WorkQueueBackpressureError("Simulation operation queue is full"));
        }
        const lifecycleRevision = this.lifecycleRevision;
        this.queuedOperations += 1;
        this.updateQueueStats();
        const result = this.queue.then(async () => {
            this.assertLifecycleCurrent(lifecycleRevision);
            const value = await operation(lifecycleRevision);
            this.assertLifecycleCurrent(lifecycleRevision);
            return value;
        });
        this.queue = result.then(() => undefined, () => undefined);
        void result.finally(() => {
            this.queuedOperations -= 1;
            this.updateQueueStats();
        }).catch(() => undefined);
        return result;
    }

    private updateQueueStats(): void {
        this.snapshot = {
            ...this.snapshot,
            queuedOperations: this.queuedOperations,
            shedOperations: this.shedOperations
        };
    }

    private assertSynchronousMutationAllowed(): void {
        if (this.disposed) throw new Error("WorldSimulationRuntime has been disposed");
        if (this.queuedOperations > 0) {
            throw new Error("WorldSimulationRuntime operation is pending; await it before mutating simulation structure");
        }
    }

    private assertLifecycleCurrent(lifecycleRevision: number): void {
        if (this.disposed || lifecycleRevision !== this.lifecycleRevision) {
            throw new Error("WorldSimulationRuntime has been disposed");
        }
    }

    private disposeStore(): void {
        if (this.storeDisposed) return;
        this.storeDisposed = true;
        this.store?.dispose();
    }
}

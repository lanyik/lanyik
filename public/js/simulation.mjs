// src/simulation/WorldSimulationRuntime.ts
var WORLD_SIMULATION_FORMAT_VERSION = 1;
function simulationChunkKey(chunkX, chunkY) {
  return `${chunkX},${chunkY}`;
}
function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function cloneEntity(entity) {
  return { ...entity, state: cloneValue(entity.state) };
}
function cloneSnapshot(snapshot) {
  return { ...snapshot, entities: snapshot.entities.map(cloneEntity) };
}
var MemorySimulationChunkStore = class {
  constructor() {
    this.snapshots = /* @__PURE__ */ new Map();
    this.disposed = false;
  }
  load(chunkX, chunkY) {
    if (this.disposed) return Promise.resolve(void 0);
    const snapshot = this.snapshots.get(simulationChunkKey(chunkX, chunkY));
    return Promise.resolve(snapshot ? cloneSnapshot(snapshot) : void 0);
  }
  save(snapshot) {
    if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
    this.snapshots.set(simulationChunkKey(snapshot.chunkX, snapshot.chunkY), cloneSnapshot(snapshot));
    return Promise.resolve();
  }
  delete(chunkX, chunkY) {
    this.snapshots.delete(simulationChunkKey(chunkX, chunkY));
    return Promise.resolve();
  }
  listChunks() {
    if (this.disposed) return Promise.resolve([]);
    return Promise.resolve([...this.snapshots.values()].map((snapshot) => ({ x: snapshot.chunkX, y: snapshot.chunkY })).sort((first, second) => first.x - second.x || first.y - second.y));
  }
  flush() {
    return Promise.resolve();
  }
  dispose() {
    this.disposed = true;
  }
};
var SIMULATION_DATABASE_VERSION = 1;
var SIMULATION_OBJECT_STORE = "simulationChunks";
function idbResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}
function idbTransactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}
var IndexedDbSimulationChunkStore = class {
  constructor(options) {
    this.pending = Promise.resolve();
    this.disposed = false;
    if (!options?.worldId?.trim()) throw new TypeError("simulation store worldId must be a non-empty string");
    this.worldId = options.worldId;
    this.databaseName = options.databaseName ?? "three-hex-map-simulation-v1";
    this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
    if (!this.databaseName.trim()) throw new TypeError("simulation databaseName must be a non-empty string");
    if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) throw new RangeError("simulation openTimeoutMs must be positive and finite");
  }
  async load(chunkX, chunkY) {
    if (this.disposed) return void 0;
    await this.flush();
    const database = await this.open();
    const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readonly");
    const stored = await idbResult(transaction.objectStore(SIMULATION_OBJECT_STORE).get(this.key(chunkX, chunkY)));
    await idbTransactionComplete(transaction);
    if (!stored) return void 0;
    if (stored.worldId !== this.worldId || stored.chunkX !== chunkX || stored.chunkY !== chunkY || stored.version !== WORLD_SIMULATION_FORMAT_VERSION) throw new TypeError("stored simulation chunk is invalid or incompatible");
    return cloneSnapshot(stored);
  }
  save(snapshot) {
    if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
    const copy = cloneSnapshot(snapshot);
    return this.enqueue(async () => {
      const database = await this.open();
      const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readwrite");
      transaction.objectStore(SIMULATION_OBJECT_STORE).put({
        ...copy,
        key: this.key(copy.chunkX, copy.chunkY),
        worldId: this.worldId
      });
      await idbTransactionComplete(transaction);
    });
  }
  delete(chunkX, chunkY) {
    if (this.disposed) return Promise.reject(new Error("SimulationChunkStore has been disposed"));
    return this.enqueue(async () => {
      const database = await this.open();
      const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readwrite");
      transaction.objectStore(SIMULATION_OBJECT_STORE).delete(this.key(chunkX, chunkY));
      await idbTransactionComplete(transaction);
    });
  }
  async listChunks() {
    if (this.disposed) return [];
    await this.flush();
    const database = await this.open();
    const transaction = database.transaction(SIMULATION_OBJECT_STORE, "readonly");
    const records = await idbResult(
      transaction.objectStore(SIMULATION_OBJECT_STORE).index("worldId").getAll(this.worldId)
    );
    await idbTransactionComplete(transaction);
    const chunks = records.map((record) => {
      if (record.worldId !== this.worldId || !Number.isSafeInteger(record.chunkX) || !Number.isSafeInteger(record.chunkY)) {
        throw new TypeError("stored simulation chunk index is invalid or incompatible");
      }
      return { x: record.chunkX, y: record.chunkY };
    });
    return chunks.sort((first, second) => first.x - second.x || first.y - second.y);
  }
  async flush() {
    await this.pending;
    if (this.pendingError !== void 0) {
      const error = this.pendingError;
      this.pendingError = void 0;
      throw error;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    void this.flush().finally(() => {
      void this.databasePromise?.then((database) => database.close(), () => void 0);
    }).catch(() => void 0);
  }
  key(chunkX, chunkY) {
    return JSON.stringify([this.worldId, chunkX, chunkY]);
  }
  enqueue(task) {
    const result = this.pending.then(task, task);
    this.pending = result.catch((error) => {
      this.pendingError ?? (this.pendingError = error);
    });
    return result;
  }
  open() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
    this.databasePromise ?? (this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, SIMULATION_DATABASE_VERSION);
      let settled = false;
      const finish = (callback, value) => {
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
    }));
    return this.databasePromise;
  }
};
var positiveModulo = (value, modulus) => (value % modulus + modulus) % modulus;
var WorldSimulationRuntime = class {
  constructor(options = {}) {
    this.chunks = /* @__PURE__ */ new Map();
    this.orderedChunkKeys = [];
    this.entityChunks = /* @__PURE__ */ new Map();
    this.anchors = /* @__PURE__ */ new Map();
    this.systems = /* @__PURE__ */ new Map();
    this.queue = Promise.resolve();
    this.queuedOperations = 0;
    this.elapsed = 0;
    this.checkpointElapsed = 0;
    this.tickCount = 0;
    this.disposed = false;
    this.storeDisposed = false;
    this.lifecycleRevision = 0;
    this.activeChunkCount = 0;
    this.dirtyChunkCount = 0;
    this.snapshot = {
      elapsedSeconds: 0,
      tick: 0,
      residentChunks: 0,
      activeChunks: 0,
      backgroundChunks: 0,
      entities: 0,
      ticksRun: 0,
      ticksDropped: 0,
      dirtyChunks: 0
    };
    this.chunkSize = options.chunkSize ?? 96;
    this.activeInterval = options.activeTickIntervalSeconds ?? 0.1;
    this.backgroundInterval = options.backgroundTickIntervalSeconds ?? 5;
    this.maxTicksPerAdvance = options.maxTicksPerAdvance ?? 50;
    this.checkpointInterval = options.checkpointIntervalSeconds ?? 30;
    this.bounds = options.bounds;
    this.store = options.store;
    if (!Number.isSafeInteger(this.chunkSize) || this.chunkSize <= 0) throw new RangeError("simulation chunkSize must be a positive safe integer");
    for (const [name, value] of [
      ["activeTickIntervalSeconds", this.activeInterval],
      ["backgroundTickIntervalSeconds", this.backgroundInterval],
      ["checkpointIntervalSeconds", this.checkpointInterval]
    ]) if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
    if (!Number.isInteger(this.maxTicksPerAdvance) || this.maxTicksPerAdvance <= 0) {
      throw new RangeError("maxTicksPerAdvance must be a positive integer");
    }
    if (this.bounds && (!Number.isSafeInteger(this.bounds.width) || this.bounds.width <= 0 || !Number.isSafeInteger(this.bounds.height) || this.bounds.height <= 0)) {
      throw new RangeError("simulation bounds must use positive safe integer dimensions");
    }
  }
  get stats() {
    return this.snapshot;
  }
  registerSystem(system) {
    this.assertSynchronousMutationAllowed();
    if (!system?.id?.trim() || typeof system.update !== "function") throw new TypeError("simulation system is invalid");
    if (this.systems.has(system.id)) throw new Error(`simulation system "${system.id}" is already registered`);
    this.systems.set(system.id, system);
  }
  unregisterSystem(id) {
    this.assertSynchronousMutationAllowed();
    return this.systems.delete(id);
  }
  setActivityAnchor(anchor) {
    this.assertSynchronousMutationAllowed();
    if (!anchor || typeof anchor !== "object") throw new TypeError("simulation activity anchor is invalid");
    const point = this.normalize(anchor.x, anchor.y);
    if (!anchor?.id?.trim() || !point || !Number.isInteger(anchor.radiusChunks) || anchor.radiusChunks < 0) {
      throw new TypeError("simulation activity anchor is invalid");
    }
    this.anchors.set(anchor.id, { ...point, id: anchor.id, radiusChunks: anchor.radiusChunks });
    this.refreshChunkActivity();
  }
  removeActivityAnchor(id) {
    this.assertSynchronousMutationAllowed();
    const removed = this.anchors.delete(id);
    if (removed) this.refreshChunkActivity();
    return removed;
  }
  addEntity(entity) {
    this.assertSynchronousMutationAllowed();
    this.addEntityNow(entity);
  }
  addEntityNow(entity) {
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
  getEntity(id) {
    const key = this.entityChunks.get(id);
    const entity = key ? this.chunks.get(key)?.entities.get(id) : void 0;
    return entity ? cloneEntity(entity) : void 0;
  }
  setEntityState(id, state) {
    this.assertSynchronousMutationAllowed();
    const key = this.entityChunks.get(id);
    const record = key ? this.chunks.get(key) : void 0;
    const entity = record?.entities.get(id);
    if (!record || !entity) return false;
    entity.state = cloneValue(state);
    this.touch(record);
    this.updateStats(0, 0);
    return true;
  }
  removeEntity(id) {
    this.assertSynchronousMutationAllowed();
    const key = this.entityChunks.get(id);
    const record = key ? this.chunks.get(key) : void 0;
    if (!key || !record || !record.entities.delete(id)) return false;
    this.entityChunks.delete(id);
    this.touch(record);
    this.updateStats(0, 0);
    return true;
  }
  chunkAt(x, y) {
    const point = this.normalize(x, y);
    if (!point) return void 0;
    const record = this.chunks.get(this.chunkKeyForTile(point.x, point.y));
    return record ? this.chunkInfo(record) : void 0;
  }
  wakeChunk(chunkX, chunkY) {
    this.assertChunkCoordinates(chunkX, chunkY);
    return this.enqueueOperation(async (lifecycleRevision) => {
      const key = simulationChunkKey(chunkX, chunkY);
      let record = this.chunks.get(key);
      if (record) return this.chunkInfo(record);
      const saved = await this.store?.load(chunkX, chunkY);
      this.assertLifecycleCurrent(lifecycleRevision);
      if (saved) this.assertSnapshot(saved, chunkX, chunkY);
      record = {
        chunkX,
        chunkY,
        revision: saved?.revision ?? 0,
        accumulator: 0,
        simulatedSeconds: saved?.simulatedSeconds ?? this.elapsed,
        entities: /* @__PURE__ */ new Map(),
        dirty: false,
        active: false
      };
      for (const entity of saved?.entities ?? []) {
        if (this.entityChunks.has(entity.id)) throw new Error(`duplicate restored simulation entity "${entity.id}"`);
        const point = this.normalize(entity.x, entity.y);
        if (!point || this.chunkKeyForTile(point.x, point.y) !== key) throw new TypeError("simulation snapshot entity is in the wrong chunk");
        record.entities.set(entity.id, cloneEntity(entity));
      }
      this.assertLifecycleCurrent(lifecycleRevision);
      for (const id of record.entities.keys()) this.entityChunks.set(id, key);
      this.registerChunk(key, record);
      this.updateStats(0, 0);
      return this.chunkInfo(record);
    });
  }
  restoreStoredChunks() {
    const store = this.store;
    if (!store?.listChunks) {
      return Promise.reject(new Error("SimulationChunkStore does not support stored chunk enumeration"));
    }
    return this.enqueueOperation(async (lifecycleRevision) => {
      const listed = await store.listChunks();
      this.assertLifecycleCurrent(lifecycleRevision);
      if (!Array.isArray(listed)) throw new TypeError("stored simulation chunk list must be an array");
      const points = listed.map((point) => {
        if (!point || typeof point !== "object") {
          throw new TypeError("stored simulation chunk coordinates are invalid");
        }
        this.assertChunkCoordinates(point.x, point.y);
        return { x: point.x, y: point.y };
      }).sort((first, second) => first.x - second.x || first.y - second.y);
      const seenChunks = /* @__PURE__ */ new Set();
      const seenEntities = new Set(this.entityChunks.keys());
      const pending = [];
      const result = [];
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
      for (const { key, snapshot } of pending) {
        const record = {
          chunkX: snapshot.chunkX,
          chunkY: snapshot.chunkY,
          revision: snapshot.revision,
          accumulator: 0,
          simulatedSeconds: snapshot.simulatedSeconds,
          entities: new Map(snapshot.entities.map((entity) => [entity.id, cloneEntity(entity)])),
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
  hibernateChunk(chunkX, chunkY) {
    this.assertChunkCoordinates(chunkX, chunkY);
    return this.enqueueOperation(async (lifecycleRevision) => {
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
  advance(deltaSeconds) {
    if (this.disposed) return Promise.reject(new Error("WorldSimulationRuntime has been disposed"));
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return Promise.reject(new RangeError("simulation deltaSeconds must be non-negative and finite"));
    return this.enqueueOperation((revision) => this.advanceNow(deltaSeconds, revision));
  }
  flush() {
    return this.enqueueOperation(async (lifecycleRevision) => {
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
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycleRevision += 1;
    this.chunks.clear();
    this.orderedChunkKeys.length = 0;
    this.entityChunks.clear();
    this.anchors.clear();
    this.systems.clear();
    this.activeChunkCount = 0;
    this.dirtyChunkCount = 0;
    this.updateStats(0, 0);
    void this.queue.finally(() => this.disposeStore()).catch(() => void 0);
  }
  async advanceNow(deltaSeconds, lifecycleRevision) {
    this.elapsed += deltaSeconds;
    this.checkpointElapsed += deltaSeconds;
    const due = /* @__PURE__ */ new Map();
    let activeChunks = 0;
    let backgroundChunks = 0;
    let dropped = 0;
    let maximumDue = 0;
    for (const key of this.orderedChunkKeys) {
      const record = this.chunks.get(key);
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
      const mutations = [];
      for (const { record, active, count, interval } of due.values()) {
        if (step >= count || record.entities.size === 0) continue;
        record.simulatedSeconds += interval;
        const entities = [...record.entities.values()].map(cloneEntity);
        const context = {
          chunkX: record.chunkX,
          chunkY: record.chunkY,
          active,
          deltaSeconds: interval,
          elapsedSeconds: record.simulatedSeconds,
          tick: ++this.tickCount,
          entities,
          setEntityState: (id, state) => mutations.push({ kind: "state", id, state: cloneValue(state) }),
          moveEntity: (id, x, y) => mutations.push({ kind: "move", id, x, y }),
          removeEntity: (id) => mutations.push({ kind: "remove", id }),
          spawnEntity: (entity) => mutations.push({ kind: "spawn", entity: cloneEntity(entity) })
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
  applyMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.kind === "spawn") {
        if (!this.entityChunks.has(mutation.entity.id)) this.addEntityNow(mutation.entity);
        continue;
      }
      const key = this.entityChunks.get(mutation.id);
      const source = key ? this.chunks.get(key) : void 0;
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
  normalize(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return void 0;
    if (!this.bounds) return { x, y };
    const nx = this.bounds.wrapX ? positiveModulo(x, this.bounds.width) : x;
    const ny = this.bounds.wrapY ? positiveModulo(y, this.bounds.height) : y;
    return nx < 0 || nx >= this.bounds.width || ny < 0 || ny >= this.bounds.height ? void 0 : { x: nx, y: ny };
  }
  chunkKeyForTile(x, y) {
    return simulationChunkKey(Math.floor(x / this.chunkSize), Math.floor(y / this.chunkSize));
  }
  getOrCreateChunkForTile(x, y) {
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkY = Math.floor(y / this.chunkSize);
    const key = simulationChunkKey(chunkX, chunkY);
    let record = this.chunks.get(key);
    if (!record) {
      record = {
        chunkX,
        chunkY,
        revision: 0,
        accumulator: 0,
        simulatedSeconds: this.elapsed,
        entities: /* @__PURE__ */ new Map(),
        dirty: false,
        active: false
      };
      this.registerChunk(key, record);
    }
    return record;
  }
  isActive(record) {
    return record.active;
  }
  computeActive(record) {
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
  touch(record) {
    record.revision += 1;
    if (!record.dirty) this.dirtyChunkCount += 1;
    record.dirty = true;
  }
  async saveRecord(record, lifecycleRevision) {
    if (!this.store || !record.dirty) return;
    const savedRevision = record.revision;
    if (record.entities.size === 0) {
      await this.store.delete(record.chunkX, record.chunkY);
    } else {
      await this.store.save({
        version: WORLD_SIMULATION_FORMAT_VERSION,
        chunkX: record.chunkX,
        chunkY: record.chunkY,
        revision: savedRevision,
        savedAt: Date.now(),
        simulatedSeconds: record.simulatedSeconds,
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
  chunkInfo(record) {
    return {
      chunkX: record.chunkX,
      chunkY: record.chunkY,
      revision: record.revision,
      active: record.active,
      entities: [...record.entities.values()].map(cloneEntity)
    };
  }
  assertChunkCoordinates(chunkX, chunkY) {
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) throw new RangeError("simulation chunk coordinates must be safe integers");
    if (this.bounds) {
      const countX = Math.ceil(this.bounds.width / this.chunkSize);
      const countY = Math.ceil(this.bounds.height / this.chunkSize);
      if (chunkX < 0 || chunkX >= countX || chunkY < 0 || chunkY >= countY) {
        throw new RangeError("simulation chunk coordinates are outside the world");
      }
    }
  }
  assertSnapshot(snapshot, chunkX, chunkY) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== WORLD_SIMULATION_FORMAT_VERSION || snapshot.chunkX !== chunkX || snapshot.chunkY !== chunkY || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !Number.isSafeInteger(snapshot.savedAt) || snapshot.savedAt < 0 || !Number.isFinite(snapshot.simulatedSeconds) || snapshot.simulatedSeconds < 0 || !Array.isArray(snapshot.entities)) {
      throw new TypeError("simulation chunk snapshot is invalid or incompatible");
    }
    const ids = /* @__PURE__ */ new Set();
    const key = simulationChunkKey(chunkX, chunkY);
    for (const entity of snapshot.entities) {
      if (!entity || typeof entity !== "object" || Array.isArray(entity) || typeof entity.id !== "string" || entity.id.trim().length === 0) {
        throw new TypeError("simulation snapshot entity must be an object with a non-empty id");
      }
      if (ids.has(entity.id)) {
        throw new TypeError(`simulation snapshot contains duplicate entity id "${entity.id}"`);
      }
      ids.add(entity.id);
      const point = this.normalize(entity.x, entity.y);
      if (!point || point.x !== entity.x || point.y !== entity.y || this.chunkKeyForTile(point.x, point.y) !== key) {
        throw new TypeError("simulation snapshot entity has invalid or non-canonical chunk coordinates");
      }
    }
  }
  updateStats(ticksRun, ticksDropped, activeChunks = this.activeChunkCount, backgroundChunks = this.chunks.size - activeChunks) {
    this.snapshot = {
      elapsedSeconds: this.elapsed,
      tick: this.tickCount,
      residentChunks: this.chunks.size,
      activeChunks,
      backgroundChunks,
      entities: this.entityChunks.size,
      ticksRun,
      ticksDropped,
      dirtyChunks: this.dirtyChunkCount
    };
  }
  registerChunk(key, record) {
    record.active = this.computeActive(record);
    this.chunks.set(key, record);
    if (record.active) this.activeChunkCount += 1;
    this.orderedChunkKeys.push(key);
  }
  unregisterChunk(key, record) {
    if (!this.chunks.delete(key)) return;
    if (record.active) this.activeChunkCount -= 1;
    if (record.dirty) this.dirtyChunkCount -= 1;
    const index = this.orderedChunkKeys.indexOf(key);
    if (index >= 0) this.orderedChunkKeys.splice(index, 1);
  }
  refreshChunkActivity() {
    let active = 0;
    for (const record of this.chunks.values()) {
      record.active = this.computeActive(record);
      if (record.active) active += 1;
    }
    this.activeChunkCount = active;
    this.updateStats(0, 0);
  }
  enqueueOperation(operation) {
    if (this.disposed) return Promise.reject(new Error("WorldSimulationRuntime has been disposed"));
    const lifecycleRevision = this.lifecycleRevision;
    this.queuedOperations += 1;
    const result = this.queue.then(async () => {
      this.assertLifecycleCurrent(lifecycleRevision);
      const value = await operation(lifecycleRevision);
      this.assertLifecycleCurrent(lifecycleRevision);
      return value;
    });
    this.queue = result.then(() => void 0, () => void 0);
    void result.finally(() => {
      this.queuedOperations -= 1;
    }).catch(() => void 0);
    return result;
  }
  assertSynchronousMutationAllowed() {
    if (this.disposed) throw new Error("WorldSimulationRuntime has been disposed");
    if (this.queuedOperations > 0) {
      throw new Error("WorldSimulationRuntime operation is pending; await it before mutating simulation structure");
    }
  }
  assertLifecycleCurrent(lifecycleRevision) {
    if (this.disposed || lifecycleRevision !== this.lifecycleRevision) {
      throw new Error("WorldSimulationRuntime has been disposed");
    }
  }
  disposeStore() {
    if (this.storeDisposed) return;
    this.storeDisposed = true;
    this.store?.dispose();
  }
};

// src/simulation/ArmyMarch.ts
var ArmyMarchRouteNotFoundError = class extends Error {
  constructor(armyId, destination) {
    super(`army "${armyId}" cannot reach (${destination.x}, ${destination.y})`);
    this.armyId = armyId;
    this.destination = destination;
    this.name = "ArmyMarchRouteNotFoundError";
  }
};
var copyPoint = (point) => ({ x: point.x, y: point.y });
function createArmyMarchState(options = {}) {
  const label = options.label ?? "Army";
  const speedTilesPerSecond = options.speedTilesPerSecond ?? 2;
  if (typeof label !== "string" || !label.trim()) throw new TypeError("army label must be non-empty");
  if (!Number.isFinite(speedTilesPerSecond) || speedTilesPerSecond <= 0) {
    throw new RangeError("army speedTilesPerSecond must be positive and finite");
  }
  return {
    label,
    speedTilesPerSecond,
    status: "idle",
    route: [],
    nextWaypointIndex: 0,
    tileProgress: 0,
    tilesTravelled: 0,
    completedMarches: 0
  };
}
function assertArmyMarchState(state) {
  if (!state || typeof state !== "object" || typeof state.label !== "string" || !state.label.trim() || !Number.isFinite(state.speedTilesPerSecond) || state.speedTilesPerSecond <= 0 || !["idle", "marching", "arrived"].includes(state.status) || !Array.isArray(state.route) || !Number.isSafeInteger(state.nextWaypointIndex) || state.nextWaypointIndex < 0 || !Number.isFinite(state.tileProgress) || state.tileProgress < 0 || state.tileProgress >= 1 || !Number.isSafeInteger(state.tilesTravelled) || state.tilesTravelled < 0 || !Number.isSafeInteger(state.completedMarches) || state.completedMarches < 0) {
    throw new TypeError("army march state is invalid");
  }
  for (const point of state.route) {
    if (!point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
      throw new TypeError("army march route contains invalid coordinates");
    }
  }
  if (state.destination && (!Number.isSafeInteger(state.destination.x) || !Number.isSafeInteger(state.destination.y))) {
    throw new TypeError("army march destination is invalid");
  }
  if (state.status === "marching" && (state.route.length < 2 || state.nextWaypointIndex <= 0 || state.nextWaypointIndex >= state.route.length)) {
    throw new TypeError("marching army route cursor is invalid");
  }
}
function createArmyMarchSystem(id = "army-march") {
  if (typeof id !== "string" || !id.trim()) throw new TypeError("army march system id must be non-empty");
  return {
    id,
    update(context) {
      for (const entity of context.entities) {
        const state = entity.state;
        assertArmyMarchState(state);
        if (state.status !== "marching") continue;
        let progress = state.tileProgress + context.deltaSeconds * state.speedTilesPerSecond;
        let nextWaypointIndex = state.nextWaypointIndex;
        let tilesTravelled = state.tilesTravelled;
        while (progress >= 1 && nextWaypointIndex < state.route.length) {
          const waypoint = state.route[nextWaypointIndex];
          context.moveEntity(entity.id, waypoint.x, waypoint.y);
          nextWaypointIndex += 1;
          tilesTravelled += 1;
          progress -= 1;
        }
        const arrived = nextWaypointIndex >= state.route.length;
        context.setEntityState(entity.id, {
          ...state,
          status: arrived ? "arrived" : "marching",
          route: arrived ? [] : state.route.map(copyPoint),
          nextWaypointIndex: arrived ? 0 : nextWaypointIndex,
          tileProgress: arrived ? 0 : progress,
          tilesTravelled,
          completedMarches: state.completedMarches + (arrived ? 1 : 0)
        });
      }
    }
  };
}
async function orderArmyMarch(runtime, pathfinder, armyId, destination, options = {}) {
  if (typeof armyId !== "string" || !armyId.trim()) throw new TypeError("army id must be non-empty");
  if (!destination || typeof destination !== "object" || !Number.isSafeInteger(destination.x) || !Number.isSafeInteger(destination.y)) {
    throw new TypeError("army destination must use safe integer coordinates");
  }
  const army = runtime.getEntity(armyId);
  if (!army) throw new Error(`simulation army "${armyId}" does not exist`);
  assertArmyMarchState(army.state);
  const result = await pathfinder.find(army, destination, options);
  try {
    if (result.path.length === 0) {
      throw new ArmyMarchRouteNotFoundError(armyId, copyPoint(destination));
    }
    const route = result.path.map(copyPoint);
    const state = route.length === 1 ? {
      ...army.state,
      status: "arrived",
      destination: copyPoint(destination),
      route: [],
      nextWaypointIndex: 0,
      tileProgress: 0
    } : {
      ...army.state,
      status: "marching",
      destination: copyPoint(destination),
      route,
      nextWaypointIndex: 1,
      tileProgress: 0
    };
    if (!runtime.setEntityState(armyId, state)) {
      throw new Error(`simulation army "${armyId}" disappeared while assigning its route`);
    }
    return {
      pathLength: route.length,
      sourceChunks: result.chunks.length,
      visitedPortals: result.visitedPortals,
      destination: copyPoint(destination)
    };
  } finally {
    result.release();
  }
}
export {
  ArmyMarchRouteNotFoundError,
  IndexedDbSimulationChunkStore,
  MemorySimulationChunkStore,
  WORLD_SIMULATION_FORMAT_VERSION,
  WorldSimulationRuntime,
  assertArmyMarchState,
  createArmyMarchState,
  createArmyMarchSystem,
  orderArmyMarch
};
//# sourceMappingURL=simulation.mjs.map
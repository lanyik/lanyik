// src/enums.ts
var Land = /* @__PURE__ */ ((Land2) => {
  Land2["sea"] = "sea";
  Land2["coastal"] = "coastal";
  Land2["land"] = "land";
  Land2["sand"] = "sand";
  Land2["tundra"] = "tundra";
  Land2["snow"] = "snow";
  Land2["mountain"] = "mountain";
  return Land2;
})(Land || {});

// src/world/WorldGeneratorVersion.ts
var WORLD_GENERATOR_VERSION = 5;

// src/world/WorldStyleProfile.ts
var field = (salt, openScale, toroidalScale, octaves, minimumToroidalCells) => Object.freeze({
  salt,
  openScale,
  toroidalScale,
  octaves,
  minimumToroidalCells
});
var WORLD_STYLE_PROFILE = Object.freeze({
  generatorVersion: WORLD_GENERATOR_VERSION,
  fields: Object.freeze({
    warpX: field(1374496523, 0.018, 0.022, 3, 2),
    warpY: field(1757159915, 0.018, 0.022, 3, 2),
    continent: field(0, 0.052, 0.052, 5, 2),
    detail: field(2738958700, 0.145, 0.145, 3, 3),
    ridge: field(2654435769, 0.032, 0.032, 4, 2),
    valley: field(2135587861, 0.024, 0.024, 3, 2),
    roughness: field(2496678331, 0.31, 0.31, 3, 4),
    moisture: field(3355524772, 0.08, 0.08, 4, 2),
    temperature: field(2911926141, 0.035, 0.035, 3, 2),
    forestPatch: field(1291169091, 0.026, 0.026, 3, 2),
    lakePatch: field(374761393, 0.021, 0.021, 3, 2),
    openWarpAmplitude: 15,
    toroidalWarpAmplitude: 0.12,
    continentWeight: 0.72,
    detailWeight: 0.16,
    landMaskStart: 0.38,
    landMaskEnd: 0.68,
    ridgeExponent: 2.35,
    ridgeWeight: 0.27,
    valleyMaskStart: 0.34,
    valleyMaskEnd: 0.7,
    valleyExponent: 3.1,
    valleyWeight: 0.075,
    elevationBias: 0.01,
    moistureNoiseWeight: 0.86,
    moistureValleyWeight: 0.18,
    moistureRidgeWeight: 0.08,
    temperatureNoiseMinimum: 0.18,
    temperatureNoiseWeight: 0.74,
    temperatureLatitudeWeight: 0.82,
    temperatureElevationStart: 0.55,
    temperatureElevationWeight: 0.8,
    temperatureLatitudeNoiseWeight: 0.18,
    boundedEdgePower: 3,
    boundedEdgeFalloff: 0.58
  }),
  terrain: Object.freeze({
    seaLevel: 0.43,
    mountainElevation: 0.7,
    mountainRidge: 0.2,
    mountainPeakElevation: 0.82,
    snowTemperature: 0.18,
    tundraTemperature: 0.34,
    sandTemperature: 0.68,
    sandMoisture: 0.42,
    hillElevation: 0.57,
    climateTransition: 0.08
  }),
  relief: Object.freeze({
    shoreline: 0,
    staticMountain: 1,
    staticHill: 0.22,
    plainMinimum: 0.018,
    plainMaximum: 0.11,
    plainElevationScale: 0.1,
    plainRoughnessScale: 0.025,
    valleyDepth: 0.035,
    hillElevationStart: 0.55,
    hillElevationEnd: 0.72,
    hillScale: 0.22,
    hillMinimum: 0.13,
    hillMaximum: 0.38,
    mountainElevationStart: 0.66,
    mountainElevationSpan: 0.25,
    mountainMinimum: 0.36,
    mountainPower: 1.35,
    mountainScale: 0.78,
    mountainRidgeScale: 0.22,
    mountainMaximum: 1.25
  }),
  vegetation: Object.freeze({
    moistureStart: 0.36,
    moistureFull: 0.7,
    temperatureMinimum: 0.18,
    temperatureMaximum: 0.9,
    temperatureTransition: 0.12,
    densityScale: 1,
    maximumDensity: 0.72,
    neutralDensity: 0.45,
    patchStart: 0.38,
    patchFull: 0.72,
    patchMinimum: 0.22,
    ridgePenalty: 0.72,
    roughnessPenalty: 0.18,
    placementThreshold: 0.24,
    placementJitter: 0.08,
    placementSalt: 668265263,
    palmTemperature: 0.67,
    piniaTemperature: 0.4
  }),
  lakes: Object.freeze({
    minimumElevation: 0.455,
    maximumElevation: 0.63,
    minimumMoisture: 0.56,
    fullMoisture: 0.8,
    valleyStart: 0.03,
    valleyFull: 0.35,
    patchStart: 0.4,
    patchFull: 0.72,
    minimumPotential: 0.18,
    minimumNeighbors: 1,
    placementScale: 0.65,
    placementSalt: 1821285621
  })
});
var finite = (name, value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
};
var positive = (name, value) => {
  const number = finite(name, value);
  if (number <= 0) throw new RangeError(`${name} must be positive`);
  return number;
};
var nonNegative = (name, value) => {
  const number = finite(name, value);
  if (number < 0) throw new RangeError(`${name} must be non-negative`);
  return number;
};
var unitInterval = (name, value) => {
  const number = finite(name, value);
  if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
  return number;
};
function assertFiniteNumbers(value, path) {
  for (const [name, candidate] of Object.entries(value)) {
    const key = path ? `${path}.${name}` : name;
    if (typeof candidate === "number") finite(key, candidate);
    else if (candidate && typeof candidate === "object") assertFiniteNumbers(candidate, key);
  }
}
function assertWorldStyleProfile(value) {
  if (!value || typeof value !== "object") throw new TypeError("world style profile must be an object");
  const profile = value;
  if (profile.generatorVersion !== WORLD_GENERATOR_VERSION) {
    throw new RangeError("world style profile generatorVersion is unsupported");
  }
  if (!profile.fields || !profile.terrain || !profile.relief || !profile.vegetation || !profile.lakes) {
    throw new TypeError("world style profile groups are required");
  }
  assertFiniteNumbers(profile, "");
  const noiseFieldNames = [
    "warpX",
    "warpY",
    "continent",
    "detail",
    "ridge",
    "valley",
    "roughness",
    "moisture",
    "temperature",
    "forestPatch",
    "lakePatch"
  ];
  for (const name of noiseFieldNames) {
    const candidate = profile.fields[name];
    if (!candidate || typeof candidate !== "object") {
      throw new TypeError(`fields.${name} must be a noise field profile`);
    }
    const noise = candidate;
    positive(`fields.${name}.openScale`, noise.openScale);
    positive(`fields.${name}.toroidalScale`, noise.toroidalScale);
    if (!Number.isInteger(noise.octaves) || noise.octaves <= 0) {
      throw new RangeError(`fields.${name}.octaves must be a positive integer`);
    }
    if (!Number.isInteger(noise.minimumToroidalCells) || noise.minimumToroidalCells <= 0) {
      throw new RangeError(`fields.${name}.minimumToroidalCells must be a positive integer`);
    }
    if (!Number.isSafeInteger(noise.salt)) throw new RangeError(`fields.${name}.salt must be a safe integer`);
  }
  const nonNegativeFieldNames = [
    "openWarpAmplitude",
    "toroidalWarpAmplitude",
    "continentWeight",
    "detailWeight",
    "ridgeWeight",
    "valleyWeight",
    "moistureNoiseWeight",
    "moistureValleyWeight",
    "moistureRidgeWeight",
    "temperatureNoiseMinimum",
    "temperatureNoiseWeight",
    "temperatureLatitudeWeight",
    "temperatureElevationStart",
    "temperatureElevationWeight",
    "temperatureLatitudeNoiseWeight",
    "boundedEdgeFalloff"
  ];
  for (const name of nonNegativeFieldNames) nonNegative(`fields.${name}`, profile.fields[name]);
  finite("fields.elevationBias", profile.fields.elevationBias);
  unitInterval("fields.landMaskStart", profile.fields.landMaskStart);
  unitInterval("fields.landMaskEnd", profile.fields.landMaskEnd);
  unitInterval("fields.valleyMaskStart", profile.fields.valleyMaskStart);
  unitInterval("fields.valleyMaskEnd", profile.fields.valleyMaskEnd);
  if (!(profile.fields.landMaskStart < profile.fields.landMaskEnd) || !(profile.fields.valleyMaskStart < profile.fields.valleyMaskEnd)) {
    throw new RangeError("world style field mask thresholds must be ordered");
  }
  positive("fields.ridgeExponent", profile.fields.ridgeExponent);
  positive("fields.valleyExponent", profile.fields.valleyExponent);
  positive("fields.boundedEdgePower", profile.fields.boundedEdgePower);
  const terrain = profile.terrain;
  const terrainNames = [
    "seaLevel",
    "mountainElevation",
    "mountainRidge",
    "mountainPeakElevation",
    "snowTemperature",
    "tundraTemperature",
    "sandTemperature",
    "sandMoisture",
    "hillElevation",
    "climateTransition"
  ];
  for (const name of terrainNames) unitInterval(`terrain.${name}`, terrain[name]);
  positive("terrain.climateTransition", terrain.climateTransition);
  if (!(finite("terrain.mountainElevation", terrain.mountainElevation) < finite("terrain.mountainPeakElevation", terrain.mountainPeakElevation))) {
    throw new RangeError("terrain mountain thresholds must be ordered");
  }
  if (!(finite("terrain.snowTemperature", terrain.snowTemperature) < finite("terrain.tundraTemperature", terrain.tundraTemperature))) {
    throw new RangeError("terrain temperature thresholds must be ordered");
  }
  const relief = profile.relief;
  for (const [name, candidate] of Object.entries(relief)) {
    if (finite(`relief.${name}`, candidate) < 0) {
      throw new RangeError("relief heights and scales must be non-negative");
    }
  }
  positive("relief.mountainElevationSpan", relief.mountainElevationSpan);
  positive("relief.mountainPower", relief.mountainPower);
  positive("relief.mountainScale", relief.mountainScale);
  unitInterval("relief.mountainElevationStart", relief.mountainElevationStart);
  unitInterval("relief.hillElevationStart", relief.hillElevationStart);
  unitInterval("relief.hillElevationEnd", relief.hillElevationEnd);
  if (!(relief.hillElevationStart < relief.hillElevationEnd) || !(relief.plainMinimum <= relief.plainMaximum) || !(relief.hillMinimum <= relief.hillMaximum) || !(relief.plainMaximum < relief.hillMinimum)) {
    throw new RangeError("relief plain and hill ranges must be ordered");
  }
  if (finite("relief.mountainMinimum", relief.mountainMinimum) > finite("relief.mountainMaximum", relief.mountainMaximum)) {
    throw new RangeError("relief mountain range must be ordered");
  }
  if (relief.staticHill < relief.hillMinimum || relief.staticHill > relief.hillMaximum || relief.staticMountain < relief.mountainMinimum || relief.staticMountain > relief.mountainMaximum) {
    throw new RangeError("static relief heights must stay inside their terrain ranges");
  }
  const lakes = profile.lakes;
  unitInterval("lakes.minimumElevation", lakes.minimumElevation);
  unitInterval("lakes.maximumElevation", lakes.maximumElevation);
  unitInterval("lakes.minimumMoisture", lakes.minimumMoisture);
  unitInterval("lakes.fullMoisture", lakes.fullMoisture);
  unitInterval("lakes.valleyStart", lakes.valleyStart);
  unitInterval("lakes.valleyFull", lakes.valleyFull);
  unitInterval("lakes.patchStart", lakes.patchStart);
  unitInterval("lakes.patchFull", lakes.patchFull);
  unitInterval("lakes.minimumPotential", lakes.minimumPotential);
  unitInterval("lakes.placementScale", lakes.placementScale);
  if (!Number.isInteger(lakes.minimumNeighbors) || lakes.minimumNeighbors < 1 || lakes.minimumNeighbors > 6) {
    throw new RangeError("lakes.minimumNeighbors must be an integer between 1 and 6");
  }
  if (!(finite("lakes.minimumElevation", lakes.minimumElevation) < finite("lakes.maximumElevation", lakes.maximumElevation)) || !(lakes.minimumMoisture < lakes.fullMoisture) || !(lakes.valleyStart < lakes.valleyFull) || !(lakes.patchStart < lakes.patchFull)) {
    throw new RangeError("lake thresholds must be ordered");
  }
  unitInterval("vegetation.moistureStart", profile.vegetation.moistureStart);
  unitInterval("vegetation.moistureFull", profile.vegetation.moistureFull);
  unitInterval("vegetation.maximumDensity", profile.vegetation.maximumDensity);
  unitInterval("vegetation.neutralDensity", profile.vegetation.neutralDensity);
  unitInterval("vegetation.temperatureMinimum", profile.vegetation.temperatureMinimum);
  unitInterval("vegetation.temperatureMaximum", profile.vegetation.temperatureMaximum);
  unitInterval("vegetation.temperatureTransition", profile.vegetation.temperatureTransition);
  positive("vegetation.temperatureTransition", profile.vegetation.temperatureTransition);
  unitInterval("vegetation.patchStart", profile.vegetation.patchStart);
  unitInterval("vegetation.patchFull", profile.vegetation.patchFull);
  unitInterval("vegetation.patchMinimum", profile.vegetation.patchMinimum);
  unitInterval("vegetation.ridgePenalty", profile.vegetation.ridgePenalty);
  unitInterval("vegetation.roughnessPenalty", profile.vegetation.roughnessPenalty);
  unitInterval("vegetation.placementThreshold", profile.vegetation.placementThreshold);
  unitInterval("vegetation.placementJitter", profile.vegetation.placementJitter);
  unitInterval("vegetation.palmTemperature", profile.vegetation.palmTemperature);
  unitInterval("vegetation.piniaTemperature", profile.vegetation.piniaTemperature);
  positive("vegetation.densityScale", profile.vegetation.densityScale);
  if (!(profile.vegetation.moistureStart < profile.vegetation.moistureFull) || !(profile.vegetation.temperatureMinimum < profile.vegetation.temperatureMaximum) || !(profile.vegetation.patchStart < profile.vegetation.patchFull)) {
    throw new RangeError("vegetation suitability thresholds must be ordered");
  }
  if (profile.vegetation.neutralDensity > profile.vegetation.maximumDensity) {
    throw new RangeError("vegetation neutral density must not exceed maximum density");
  }
  if (profile.vegetation.placementThreshold <= profile.vegetation.placementJitter * 0.5 || profile.vegetation.placementThreshold > profile.vegetation.maximumDensity + profile.vegetation.placementJitter * 0.5) {
    throw new RangeError("vegetation placement threshold must reject zero density and intersect the density range");
  }
  if (!(profile.vegetation.piniaTemperature < profile.vegetation.palmTemperature)) {
    throw new RangeError("vegetation temperature thresholds must be ordered");
  }
  if (!Number.isSafeInteger(profile.vegetation.placementSalt) || !Number.isSafeInteger(profile.lakes.placementSalt)) {
    throw new RangeError("world style placement salts must be safe integers");
  }
}
assertWorldStyleProfile(WORLD_STYLE_PROFILE);

// src/world/LandformSampler.ts
var LANDFORM_SEA_LEVEL = WORLD_STYLE_PROFILE.terrain.seaLevel;

// src/world/SemanticLandformSampler.ts
var SEMANTIC_NOISE_BASE_CELL_SHIFTS = Object.freeze({
  warpX: 5,
  warpY: 5,
  continent: 5,
  detail: 3,
  ridge: 5,
  valley: 5,
  roughness: 3,
  moisture: 4,
  temperature: 5,
  forestPatch: 5,
  lakePatch: 5
});

// src/world/generateWorldChunk.ts
var MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
var WORLD_CHUNK_FORMAT_VERSION = 1;
var WORLD_CHUNK_PADDING = 1;
function cloneWorldTileOverride(value) {
  const copy = { ...value };
  if (value.modifiers) copy.modifiers = [...value.modifiers];
  if (value.rivers) copy.rivers = value.rivers.map((river) => ({ ...river }));
  if (value.city) copy.city = { ...value.city };
  return copy;
}
function worldTileOverridesEqual(first, second) {
  if (first === second) return true;
  if (!first || !second) return !hasWorldTileOverride(first) && !hasWorldTileOverride(second);
  if (first.type !== second.type || first.treeModel !== second.treeModel || first.unit !== second.unit || first.city?.name !== second.city?.name || first.city?.model !== second.city?.model || Boolean(first.city) !== Boolean(second.city)) return false;
  const firstModifiers = first.modifiers;
  const secondModifiers = second.modifiers;
  if (firstModifiers?.length !== secondModifiers?.length || firstModifiers?.some((value, index) => value !== secondModifiers?.[index])) return false;
  const firstRivers = first.rivers;
  const secondRivers = second.rivers;
  return firstRivers?.length === secondRivers?.length && !firstRivers?.some((value, index) => value.riverIndex !== secondRivers?.[index]?.riverIndex || value.riverTileIndex !== secondRivers?.[index]?.riverTileIndex);
}
function hasWorldTileOverride(value) {
  return !!value && (value.type !== void 0 || value.modifiers !== void 0 || value.treeModel !== void 0 || value.rivers !== void 0 || value.unit !== void 0 || value.city !== void 0);
}
function assertWorldTileOverride(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("tile override must be an object");
  }
  if (value.type !== void 0 && !Object.values(Land).includes(value.type)) {
    throw new TypeError("tile override type is invalid");
  }
  if (value.modifiers !== void 0 && (!Array.isArray(value.modifiers) || value.modifiers.some((item) => typeof item !== "string"))) {
    throw new TypeError("tile override modifiers must be strings");
  }
  if (value.treeModel !== void 0 && typeof value.treeModel !== "string") {
    throw new TypeError("tile override treeModel must be a string");
  }
  if (value.unit !== void 0 && typeof value.unit !== "string") {
    throw new TypeError("tile override unit must be a string");
  }
  if (value.rivers !== void 0 && (!Array.isArray(value.rivers) || value.rivers.some((river) => !river || !Number.isSafeInteger(river.riverIndex) || !Number.isSafeInteger(river.riverTileIndex)))) {
    throw new TypeError("tile override rivers are invalid");
  }
  if (value.city !== void 0 && (!value.city || typeof value.city !== "object" || Array.isArray(value.city) || value.city.name !== void 0 && typeof value.city.name !== "string" || value.city.model !== void 0 && typeof value.city.model !== "string")) {
    throw new TypeError("tile override city is invalid");
  }
}
function assertPackedWorldChunk(chunk) {
  if (!chunk || typeof chunk !== "object" || chunk.version !== WORLD_CHUNK_FORMAT_VERSION || !Number.isSafeInteger(chunk.chunkX) || !Number.isSafeInteger(chunk.chunkY) || !Number.isInteger(chunk.chunkSize) || chunk.chunkSize <= 0 || chunk.chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE || chunk.padding !== WORLD_CHUNK_PADDING || chunk.stride !== chunk.chunkSize + chunk.padding * 2 || !(chunk.tiles instanceof Uint16Array) || chunk.tiles.length !== chunk.stride * chunk.stride) {
    throw new TypeError("packed world chunk payload is invalid");
  }
}
var LAND_BY_CODE = [
  "sea" /* sea */,
  "coastal" /* coastal */,
  "land" /* land */,
  "sand" /* sand */,
  "tundra" /* tundra */,
  "snow" /* snow */,
  "mountain" /* mountain */
];
var LAND_CODE = new Map(LAND_BY_CODE.map((land, index) => [land, index]));
var FLAG_HILL = 1 << 3;
var FLAG_WOOD = 1 << 4;
var FLAG_LAKE = 1 << 5;
var TREE_SHIFT = 6;
var TREE_MASK = 3 << TREE_SHIFT;

// src/world/WorldDescriptor.ts
var WORLD_DESCRIPTOR_FORMAT_VERSION = 1;
function assertChunkSize(value) {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
  }
}
function assertSupportedWorldGeneratorVersion(value) {
  if (value !== WORLD_GENERATOR_VERSION) {
    throw new RangeError(
      `unsupported world generator version ${String(value)}; this build supports ${WORLD_GENERATOR_VERSION}`
    );
  }
}
function assertWorldDescriptor(value) {
  if (!value || typeof value !== "object") throw new TypeError("world descriptor must be an object");
  const descriptor = value;
  if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_FORMAT_VERSION) {
    throw new TypeError(`unsupported world descriptor format ${String(descriptor.descriptorVersion)}`);
  }
  if (descriptor.sourceKind !== "procedural-infinite" && descriptor.sourceKind !== "procedural-toroidal") {
    throw new TypeError("world descriptor sourceKind is invalid");
  }
  if (typeof descriptor.seed !== "string") throw new TypeError("world descriptor seed must be a string");
  assertSupportedWorldGeneratorVersion(descriptor.generatorVersion);
  if (descriptor.chunkFormatVersion !== WORLD_CHUNK_FORMAT_VERSION) {
    throw new TypeError(`unsupported world chunk format ${String(descriptor.chunkFormatVersion)}`);
  }
  assertChunkSize(descriptor.chunkSize);
  if (descriptor.sourceKind === "procedural-infinite") {
    if (descriptor.topology !== "infinite" || descriptor.width !== void 0 || descriptor.height !== void 0) {
      throw new TypeError("infinite world descriptor topology is invalid");
    }
    return;
  }
  if (descriptor.topology !== "toroidal" || !Number.isInteger(descriptor.width) || descriptor.width < 8 || descriptor.width % 2 !== 0 || !Number.isInteger(descriptor.height) || descriptor.height < 8) {
    throw new TypeError("toroidal world descriptor topology is invalid");
  }
}
function serializeWorldDescriptor(descriptor) {
  assertWorldDescriptor(descriptor);
  return JSON.stringify([
    descriptor.descriptorVersion,
    descriptor.sourceKind,
    descriptor.seed,
    descriptor.generatorVersion,
    descriptor.chunkFormatVersion,
    descriptor.chunkSize,
    descriptor.topology,
    descriptor.width ?? null,
    descriptor.height ?? null
  ]);
}

// src/world/WorldChunkCache.ts
var DEFAULT_DATABASE_NAME = "three-hex-map-world-cache-v1";
var DATABASE_VERSION = 1;
var CHUNK_STORE = "chunks";
var META_STORE = "meta";
var USAGE_KEY = "usage";
function createWorldChunkCacheKey(options) {
  if (!options || typeof options !== "object") throw new TypeError("world chunk cache key options are required");
  assertWorldDescriptor(options.descriptor);
  if (!Number.isSafeInteger(options.chunkX) || !Number.isSafeInteger(options.chunkY)) {
    throw new RangeError("world chunk cache coordinates must be safe integers");
  }
  return JSON.stringify([
    serializeWorldDescriptor(options.descriptor),
    options.chunkX,
    options.chunkY
  ]);
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}
function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}
var IndexedDbWorldChunkCache = class {
  constructor(options = {}) {
    this.maintenance = Promise.resolve();
    this.disposed = false;
    this.snapshot = {
      available: typeof indexedDB !== "undefined",
      hits: 0,
      misses: 0,
      writes: 0,
      errors: 0,
      entries: 0,
      bytes: 0
    };
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
    this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
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
  get stats() {
    return this.snapshot;
  }
  async get(key) {
    if (this.disposed) return void 0;
    const database = await this.open();
    if (!database) {
      this.snapshot.misses += 1;
      return void 0;
    }
    try {
      const transaction = database.transaction(CHUNK_STORE, "readonly");
      const record = await requestResult(transaction.objectStore(CHUNK_STORE).get(key));
      await transactionComplete(transaction);
      if (!record) {
        this.snapshot.misses += 1;
        return void 0;
      }
      const chunk = {
        version: record.version,
        chunkX: record.chunkX,
        chunkY: record.chunkY,
        chunkSize: record.chunkSize,
        padding: record.padding,
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
      return void 0;
    }
  }
  put(key, chunk) {
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
        );
        const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
        const chunks = transaction.objectStore(CHUNK_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [existing, usage] = await Promise.all([
          requestResult(chunks.get(key)),
          requestResult(meta.get(USAGE_KEY))
        ]);
        const nextUsage = {
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
        });
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
  async clear() {
    if (this.disposed) return false;
    return this.enqueueMaintenance(async () => {
      const database = await this.open();
      if (!database) return false;
      try {
        const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
        transaction.objectStore(CHUNK_STORE).clear();
        transaction.objectStore(META_STORE).put({ key: USAGE_KEY, bytes: 0, entries: 0 });
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
  flush() {
    return this.maintenance.then(() => void 0);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    void this.databasePromise?.then((database) => database?.close());
  }
  enqueueMaintenance(task) {
    const result = this.maintenance.then(task, task);
    this.maintenance = result.then(() => void 0, () => void 0);
    return result;
  }
  async open() {
    if (this.disposed || typeof indexedDB === "undefined") return void 0;
    this.databasePromise ?? (this.databasePromise = new Promise((resolve) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      let settled = false;
      let timeout;
      const finish = (database) => {
        if (settled) {
          database?.close();
          return;
        }
        settled = true;
        if (timeout !== void 0) clearTimeout(timeout);
        resolve(database);
      };
      timeout = setTimeout(() => {
        this.snapshot.available = false;
        this.snapshot.errors += 1;
        finish(void 0);
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
          this.databasePromise = void 0;
        });
        this.snapshot.available = true;
        void this.readUsage(database);
        finish(database);
      }, { once: true });
      request.addEventListener("error", () => {
        if (settled) return;
        this.snapshot.available = false;
        this.snapshot.errors += 1;
        finish(void 0);
      }, { once: true });
      request.addEventListener("blocked", () => {
        if (settled) return;
        this.snapshot.available = false;
        this.snapshot.errors += 1;
        finish(void 0);
      });
    }));
    return this.databasePromise;
  }
  async readUsage(database) {
    try {
      const transaction = database.transaction(META_STORE, "readonly");
      const usage = await requestResult(transaction.objectStore(META_STORE).get(USAGE_KEY));
      await transactionComplete(transaction);
      this.snapshot.entries = usage?.entries ?? 0;
      this.snapshot.bytes = usage?.bytes ?? 0;
    } catch {
      this.snapshot.errors += 1;
    }
  }
  async touch(database, record) {
    try {
      const transaction = database.transaction(CHUNK_STORE, "readwrite");
      transaction.objectStore(CHUNK_STORE).put({ ...record, accessedAt: Date.now() });
      await transactionComplete(transaction);
    } catch {
      this.snapshot.errors += 1;
    }
  }
  async deleteKey(database, key) {
    try {
      const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
      const chunks = transaction.objectStore(CHUNK_STORE);
      const meta = transaction.objectStore(META_STORE);
      const [existing, usage] = await Promise.all([
        requestResult(chunks.get(key)),
        requestResult(meta.get(USAGE_KEY))
      ]);
      if (existing) {
        chunks.delete(key);
        const next = {
          key: USAGE_KEY,
          bytes: Math.max(0, (usage?.bytes ?? 0) - existing.bytes),
          entries: Math.max(0, (usage?.entries ?? 0) - 1)
        };
        meta.put(next);
        this.snapshot.bytes = next.bytes;
        this.snapshot.entries = next.entries;
      }
      await transactionComplete(transaction);
    } catch {
      this.snapshot.errors += 1;
    }
  }
  async prune(database) {
    if (this.snapshot.bytes <= this.maxBytes) return;
    const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
    const chunks = transaction.objectStore(CHUNK_STORE);
    const meta = transaction.objectStore(META_STORE);
    let bytes = this.snapshot.bytes;
    let entries = this.snapshot.entries;
    await new Promise((resolve, reject) => {
      const request = chunks.index("accessedAt").openCursor();
      request.addEventListener("error", () => reject(request.error ?? new Error("cache pruning failed")), { once: true });
      request.addEventListener("success", () => {
        const cursor = request.result;
        if (!cursor || bytes <= this.maxBytes) {
          resolve();
          return;
        }
        const record = cursor.value;
        bytes = Math.max(0, bytes - record.bytes);
        entries = Math.max(0, entries - 1);
        cursor.delete();
        cursor.continue();
      });
    });
    meta.put({ key: USAGE_KEY, bytes, entries });
    await transactionComplete(transaction);
    this.snapshot.bytes = bytes;
    this.snapshot.entries = entries;
  }
};
async function clearWorldChunkCache(options = {}) {
  const cache = new IndexedDbWorldChunkCache(options);
  try {
    return await cache.clear();
  } finally {
    cache.dispose();
  }
}

// src/world/WorldDeltaStore.ts
var WORLD_DELTA_FORMAT_VERSION = 2;
var LEGACY_WORLD_DELTA_FORMAT_VERSION = 1;
var WorldDeltaConflictError = class extends Error {
  constructor(expectedRevision, actualRevision) {
    super(`World delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.name = "WorldDeltaConflictError";
  }
};
function chunkKey(worldId, chunkX, chunkY) {
  return JSON.stringify([worldId, chunkX, chunkY]);
}
function assertChunkIdentity(worldId, chunkX, chunkY) {
  if (typeof worldId !== "string" || worldId.trim().length === 0) {
    throw new TypeError("worldId must be a non-empty string");
  }
  if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
    throw new RangeError("world delta chunk coordinates must be safe integers");
  }
}
function assertChunkSize2(chunkSize) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("world delta chunkSize must be a positive safe integer");
  }
}
function tileBelongsToChunk(x, y, chunkX, chunkY, chunkSize) {
  return Math.floor(x / chunkSize) === chunkX && Math.floor(y / chunkSize) === chunkY;
}
function assertChanges(changes, chunkX, chunkY, options) {
  assertChunkSize2(options.chunkSize);
  if (!Array.isArray(changes)) throw new TypeError("world delta changes must be an array");
  if (options.expectedRevision !== void 0 && (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)) {
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
function normalizeWorldChunkDelta(value, worldId, chunkX, chunkY, options) {
  assertChunkIdentity(worldId, chunkX, chunkY);
  assertChunkSize2(options.chunkSize);
  const candidate = value;
  if (!candidate || candidate.version !== WORLD_DELTA_FORMAT_VERSION && candidate.version !== LEGACY_WORLD_DELTA_FORMAT_VERSION || candidate.worldId !== worldId || candidate.chunkX !== chunkX || candidate.chunkY !== chunkY || candidate.version === WORLD_DELTA_FORMAT_VERSION && candidate.chunkSize !== options.chunkSize || !Number.isSafeInteger(candidate.revision) || candidate.revision < 1 || !Array.isArray(candidate.entries) || candidate.entries.some((entry) => !entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y) || !tileBelongsToChunk(entry.x, entry.y, chunkX, chunkY, options.chunkSize) || !entry.override || typeof entry.override !== "object" || Array.isArray(entry.override))) {
    throw new TypeError("world chunk delta is invalid or incompatible");
  }
  const keys = /* @__PURE__ */ new Set();
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
    revision: candidate.revision,
    entries: candidate.entries.map((entry) => ({
      x: entry.x,
      y: entry.y,
      override: cloneWorldTileOverride(entry.override)
    }))
  };
}
function mergeChunkDelta(current, worldId, chunkX, chunkY, changes, options) {
  assertChunkIdentity(worldId, chunkX, chunkY);
  assertChanges(changes, chunkX, chunkY, options);
  if (current) current = normalizeWorldChunkDelta(current, worldId, chunkX, chunkY, options);
  const actualRevision = current?.revision ?? 0;
  if (options.expectedRevision !== void 0 && options.expectedRevision !== actualRevision) {
    throw new WorldDeltaConflictError(options.expectedRevision, actualRevision);
  }
  if (changes.length === 0) return current;
  const entries = new Map((current?.entries ?? []).map((entry) => [
    `${entry.x},${entry.y}`,
    { x: entry.x, y: entry.y, override: cloneWorldTileOverride(entry.override) }
  ]));
  for (const change of changes) {
    const key = `${change.x},${change.y}`;
    if (change.override === null || !hasWorldTileOverride(change.override)) entries.delete(key);
    else entries.set(key, { x: change.x, y: change.y, override: cloneWorldTileOverride(change.override) });
  }
  const currentEntries = new Map((current?.entries ?? []).map((entry) => [`${entry.x},${entry.y}`, entry.override]));
  const changed = entries.size !== currentEntries.size || [...entries].some(([key, entry]) => !worldTileOverridesEqual(entry.override, currentEntries.get(key)));
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
var MemoryWorldDeltaStore = class {
  constructor() {
    this.chunks = /* @__PURE__ */ new Map();
    this.disposed = false;
  }
  loadChunk(worldId, chunkX, chunkY, options) {
    assertChunkIdentity(worldId, chunkX, chunkY);
    const delta = this.chunks.get(chunkKey(worldId, chunkX, chunkY));
    return Promise.resolve(delta ? this.cloneDelta(normalizeWorldChunkDelta(delta, worldId, chunkX, chunkY, options)) : void 0);
  }
  putChunkDelta(worldId, chunkX, chunkY, changes, options) {
    if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
    try {
      const result = this.applyChunkDelta(worldId, chunkX, chunkY, changes, options);
      return Promise.resolve(result ? this.cloneDelta(result) : void 0);
    } catch (reason) {
      return Promise.reject(reason);
    }
  }
  putTile(worldId, chunkX, chunkY, entry, options) {
    if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
    this.applyChunkDelta(worldId, chunkX, chunkY, [entry], options);
  }
  deleteTile(worldId, chunkX, chunkY, x, y, options) {
    if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
    this.applyChunkDelta(worldId, chunkX, chunkY, [{ x, y, override: null }], options);
  }
  flush() {
    return Promise.resolve();
  }
  listWorld(worldId) {
    if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
    const deltas = [...this.chunks.values()].filter((delta) => delta.worldId === worldId).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY).map((delta) => this.cloneDelta(delta));
    return Promise.resolve(deltas);
  }
  async replaceWorld(worldId, deltas) {
    if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
    const replacements = /* @__PURE__ */ new Map();
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
  async clear(worldId) {
    for (const [key, delta] of this.chunks) if (delta.worldId === worldId) this.chunks.delete(key);
  }
  dispose() {
    this.disposed = true;
  }
  cloneDelta(delta) {
    if (delta.version !== WORLD_DELTA_FORMAT_VERSION) throw new Error(`Unsupported world delta version: ${delta.version}`);
    return {
      ...delta,
      entries: delta.entries.map((entry) => ({ ...entry, override: cloneWorldTileOverride(entry.override) }))
    };
  }
  applyChunkDelta(worldId, chunkX, chunkY, changes, options) {
    const key = chunkKey(worldId, chunkX, chunkY);
    const result = mergeChunkDelta(this.chunks.get(key), worldId, chunkX, chunkY, changes, options);
    if (result) this.chunks.set(key, result);
    return result;
  }
};
var DEFAULT_DELTA_DATABASE_NAME = "three-hex-map-world-deltas-v1";
var DELTA_DATABASE_VERSION = 1;
var DELTA_OBJECT_STORE = "deltas";
function requestResult2(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}
function transactionComplete2(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}
var IndexedDbWorldDeltaStore = class extends MemoryWorldDeltaStore {
  constructor(options = {}) {
    super();
    this.pending = Promise.resolve();
    this.closing = false;
    this.databaseName = options.databaseName ?? DEFAULT_DELTA_DATABASE_NAME;
    this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
    if (!this.databaseName.trim()) throw new TypeError("delta databaseName must be a non-empty string");
    if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
      throw new RangeError("delta openTimeoutMs must be a positive finite number");
    }
  }
  async loadChunk(worldId, chunkX, chunkY, options) {
    if (this.disposed || this.closing) return void 0;
    await this.flush();
    const memory = await super.loadChunk(worldId, chunkX, chunkY, options);
    if (memory) return memory;
    const database = await this.open();
    const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
    const record = await requestResult2(transaction.objectStore(DELTA_OBJECT_STORE).get(chunkKey(worldId, chunkX, chunkY)));
    await transactionComplete2(transaction);
    if (!record) return void 0;
    const delta = normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options);
    this.chunks.set(record.key, delta);
    return this.cloneDelta(delta);
  }
  putChunkDelta(worldId, chunkX, chunkY, changes, options) {
    if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
    return this.enqueue(async () => {
      const key = chunkKey(worldId, chunkX, chunkY);
      const database = await this.open();
      const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
      const completion = transactionComplete2(transaction);
      try {
        const store = transaction.objectStore(DELTA_OBJECT_STORE);
        const record = await requestResult2(store.get(key));
        const current = record ? normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options) : void 0;
        const result = mergeChunkDelta(current, worldId, chunkX, chunkY, changes, options);
        const requiresWrite = result !== void 0 && (record?.version !== WORLD_DELTA_FORMAT_VERSION || result.revision !== current?.revision);
        if (requiresWrite) store.put({ key, ...this.cloneDelta(result) });
        await completion;
        if (result) this.chunks.set(key, this.cloneDelta(result));
        else this.chunks.delete(key);
        return result ? this.cloneDelta(result) : void 0;
      } catch (reason) {
        try {
          transaction.abort();
        } catch {
        }
        await completion.catch(() => void 0);
        throw reason;
      }
    });
  }
  putTile(worldId, chunkX, chunkY, entry, options) {
    if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
    void this.putChunkDelta(worldId, chunkX, chunkY, [entry], options).catch(() => void 0);
  }
  deleteTile(worldId, chunkX, chunkY, x, y, options) {
    if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
    void this.putChunkDelta(worldId, chunkX, chunkY, [{ x, y, override: null }], options).catch(() => void 0);
  }
  async flush() {
    await this.pending;
    if (this.pendingError !== void 0) {
      const error = this.pendingError;
      this.pendingError = void 0;
      throw error;
    }
  }
  async listWorld(worldId) {
    if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
    await this.flush();
    const database = await this.open();
    const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
    const records = await requestResult2(
      transaction.objectStore(DELTA_OBJECT_STORE).index("worldId").getAll(worldId)
    );
    await transactionComplete2(transaction);
    return records.map((record) => normalizeWorldChunkDelta(
      record,
      worldId,
      record.chunkX,
      record.chunkY,
      { chunkSize: record.chunkSize }
    )).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY);
  }
  replaceWorld(worldId, deltas) {
    if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
    const replacements = /* @__PURE__ */ new Map();
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
      const keys = await requestResult2(store.index("worldId").getAllKeys(worldId));
      for (const key of keys) store.delete(key);
      for (const [key, delta] of replacements) {
        store.put({ key, ...this.cloneDelta(delta) });
      }
      await transactionComplete2(transaction);
      await super.clear(worldId);
      for (const [key, delta] of replacements) this.chunks.set(key, this.cloneDelta(delta));
    });
  }
  async clear(worldId) {
    if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
    await this.enqueue(async () => {
      await super.clear(worldId);
      const database = await this.open();
      const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
      const index = transaction.objectStore(DELTA_OBJECT_STORE).index("worldId");
      const keys = await requestResult2(index.getAllKeys(worldId));
      for (const key of keys) transaction.objectStore(DELTA_OBJECT_STORE).delete(key);
      await transactionComplete2(transaction);
    });
    await this.flush();
  }
  dispose() {
    if (this.disposed || this.closing) return;
    this.closing = true;
    void this.flush().finally(() => {
      this.disposed = true;
      void this.databasePromise?.then((database) => database.close(), () => void 0);
    }).catch(() => void 0);
  }
  enqueue(task) {
    const result = this.pending.then(task, task);
    this.pending = result.then(() => void 0, (error) => {
      this.pendingError ?? (this.pendingError = error);
    });
    return result;
  }
  open() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
    this.databasePromise ?? (this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DELTA_DATABASE_VERSION);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Opening the world delta database timed out"));
      }, this.openTimeoutMs);
      const finish = (callback, value) => {
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
    }));
    return this.databasePromise;
  }
};

// src/world/SurfaceCompileProfile.ts
var WORLD_SEMANTIC_CHUNK_SIZE = 32;
var HYDROLOGY_REGION_SIZE = 128;
var SURFACE_COMPILE_PROFILE_VERSION = 1;
var SURFACE_COMPILE_PROFILE = Object.freeze({
  version: SURFACE_COMPILE_PROFILE_VERSION,
  renderChunkSize: 16,
  samplesPerTileInterval: 4,
  gutterTexels: 1,
  influenceRadiusTiles: 2,
  textureLayerSize: 66,
  pageLayers: 128,
  waterGeometryCoverageThreshold: 0.5,
  waterFullPatchCoverage: 128
});
var SURFACE_CORE_TEXELS = SURFACE_COMPILE_PROFILE.renderChunkSize * SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
var SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL = 18;
var SURFACE_FIELD_CPU_BYTES = SURFACE_COMPILE_PROFILE.textureLayerSize * SURFACE_COMPILE_PROFILE.textureLayerSize * SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL;
function assertSurfaceCompileProfile(profile) {
  const integerFields = [
    profile.version,
    profile.renderChunkSize,
    profile.samplesPerTileInterval,
    profile.gutterTexels,
    profile.influenceRadiusTiles,
    profile.textureLayerSize,
    profile.pageLayers
  ];
  if (integerFields.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new RangeError("surface compile profile fields must be positive integers");
  }
  if (profile.version !== SURFACE_COMPILE_PROFILE_VERSION) {
    throw new RangeError("surface compile profile version is unsupported");
  }
  if (WORLD_SEMANTIC_CHUNK_SIZE % profile.renderChunkSize !== 0 || HYDROLOGY_REGION_SIZE % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
    throw new RangeError("surface compile profile must align with the world formats");
  }
  const coreTexels = profile.renderChunkSize * profile.samplesPerTileInterval;
  if (profile.textureLayerSize !== coreTexels + profile.gutterTexels * 2) {
    throw new RangeError("surface texture layer size does not match its core and gutter");
  }
  if (profile.influenceRadiusTiles < profile.gutterTexels) {
    throw new RangeError("surface influence radius cannot be smaller than its texture gutter");
  }
  if (profile.pageLayers > 128) {
    throw new RangeError("surface texture page exceeds the profile v1 layer budget");
  }
  if (!Number.isFinite(profile.waterGeometryCoverageThreshold) || profile.waterGeometryCoverageThreshold < 0 || profile.waterGeometryCoverageThreshold >= 1 || profile.waterFullPatchCoverage !== 128) {
    throw new RangeError("surface water geometry thresholds do not match profile v1");
  }
  if (profile.renderChunkSize !== 16 || profile.samplesPerTileInterval !== 4 || profile.gutterTexels !== 1 || profile.influenceRadiusTiles !== 2 || profile.textureLayerSize !== 66 || profile.pageLayers !== 128 || profile.waterGeometryCoverageThreshold !== 0.5 || profile.waterFullPatchCoverage !== 128) {
    throw new RangeError("surface compile profile does not match the frozen profile v1");
  }
}
assertSurfaceCompileProfile(SURFACE_COMPILE_PROFILE);

// src/world/WorldDescriptorV2.ts
var WORLD_GENERATOR_VERSION_V2 = 6;
var WORLD_DESCRIPTOR_FORMAT_VERSION_V2 = 2;
var WORLD_CHUNK_FORMAT_VERSION_V2 = 2;
var HYDROLOGY_REGION_FORMAT_VERSION = 1;
var CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
function assertContentHash(name, value) {
  if (typeof value !== "string" || !CONTENT_HASH_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase sha256 content hash`);
  }
}
function assertIdentity(name, value, catalog) {
  if (!value || typeof value !== "object") throw new TypeError(`${name} identity must be an object`);
  const identity = value;
  if (typeof identity.id !== "string" || identity.id.trim() !== identity.id || identity.id.length === 0) {
    throw new TypeError(`${name} id must be a non-empty canonical string`);
  }
  assertContentHash(`${name} contentHash`, identity.contentHash);
  if (catalog && (!Number.isInteger(identity.entryCount) || identity.entryCount <= 0 || identity.entryCount > 256)) {
    throw new RangeError(`${name} entryCount must be an integer between 1 and 256`);
  }
}
function assertSemantics(value) {
  if (!Number.isInteger(value.seaLevel) || value.seaLevel < 0 || value.seaLevel > 65535) {
    throw new RangeError("world descriptor seaLevel must be a uint16 value");
  }
  assertIdentity("substrate catalog", value.substrateCatalog, true);
  assertIdentity("vegetation catalog", value.vegetationCatalog, true);
  if (!Array.isArray(value.biomeBasis) || value.biomeBasis.length !== 4) {
    throw new TypeError("world descriptor must contain exactly four biome basis identities");
  }
  const ids = /* @__PURE__ */ new Set();
  for (const basis of value.biomeBasis) {
    assertIdentity("biome basis", basis, false);
    if (ids.has(basis.id)) throw new TypeError("world descriptor biome basis ids must be unique");
    ids.add(basis.id);
  }
}
function assertFiniteBounds(width, height) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError("world descriptor bounds must be positive safe integers");
  }
}
function assertWorldDescriptorV2(value) {
  if (!value || typeof value !== "object") throw new TypeError("world descriptor v2 must be an object");
  const descriptor = value;
  if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_FORMAT_VERSION_V2 || descriptor.generatorVersion !== WORLD_GENERATOR_VERSION_V2 || descriptor.chunkFormatVersion !== WORLD_CHUNK_FORMAT_VERSION_V2 || descriptor.hydrologyRegionFormatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
    throw new TypeError("world descriptor v2 format or generator version is unsupported");
  }
  assertSemantics(descriptor);
  if (descriptor.sourceKind === "static") {
    if (descriptor.topology !== "finite" || "seed" in descriptor) {
      throw new TypeError("static world descriptor v2 topology is invalid");
    }
    assertContentHash("static world sourceContentHash", descriptor.sourceContentHash);
    assertFiniteBounds(descriptor.width, descriptor.height);
    return;
  }
  if (descriptor.sourceKind === "procedural-infinite") {
    if (descriptor.topology !== "infinite" || typeof descriptor.seed !== "string" || "width" in descriptor || "height" in descriptor || "sourceContentHash" in descriptor) {
      throw new TypeError("infinite world descriptor v2 topology is invalid");
    }
    return;
  }
  if (descriptor.sourceKind === "procedural-toroidal") {
    if (descriptor.topology !== "toroidal" || typeof descriptor.seed !== "string" || "sourceContentHash" in descriptor) {
      throw new TypeError("toroidal world descriptor v2 topology is invalid");
    }
    assertFiniteBounds(descriptor.width, descriptor.height);
    if (descriptor.width < WORLD_SEMANTIC_CHUNK_SIZE || descriptor.height < WORLD_SEMANTIC_CHUNK_SIZE || descriptor.width % WORLD_SEMANTIC_CHUNK_SIZE !== 0 || descriptor.height % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
      throw new RangeError("toroidal v2 bounds must be positive multiples of the semantic chunk size");
    }
    return;
  }
  throw new TypeError("world descriptor v2 sourceKind is invalid");
}
function serializeWorldDescriptorV2(descriptor) {
  assertWorldDescriptorV2(descriptor);
  return JSON.stringify([
    descriptor.descriptorVersion,
    descriptor.sourceKind,
    "seed" in descriptor ? descriptor.seed : null,
    "sourceContentHash" in descriptor ? descriptor.sourceContentHash : null,
    descriptor.generatorVersion,
    descriptor.chunkFormatVersion,
    descriptor.hydrologyRegionFormatVersion,
    descriptor.topology,
    "width" in descriptor ? descriptor.width : null,
    "height" in descriptor ? descriptor.height : null,
    descriptor.seaLevel,
    [
      descriptor.substrateCatalog.id,
      descriptor.substrateCatalog.contentHash,
      descriptor.substrateCatalog.entryCount
    ],
    descriptor.biomeBasis.map((basis) => [basis.id, basis.contentHash]),
    [
      descriptor.vegetationCatalog.id,
      descriptor.vegetationCatalog.contentHash,
      descriptor.vegetationCatalog.entryCount
    ]
  ]);
}
if (HYDROLOGY_REGION_SIZE % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
  throw new Error("world descriptor v2 formats are not spatially aligned");
}

// src/world/WorldGrid.ts
function assertLogicalCoordinate(name, value) {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}
function chunkOrigin(chunkX, chunkY, chunkSize) {
  assertLogicalCoordinate("chunk x", chunkX);
  assertLogicalCoordinate("chunk y", chunkY);
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunk size must be a positive safe integer");
  }
  const x = chunkX * chunkSize;
  const y = chunkY * chunkSize;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(x + chunkSize - 1) || !Number.isSafeInteger(y + chunkSize - 1)) {
    throw new RangeError("chunk bounds exceed the safe logical coordinate range");
  }
  return { x, y };
}

// src/world/HydrologyIdentity.ts
var OCEAN_BODY_ID = "ocean";

// src/world/HydrologyRegion.ts
var HYDROLOGY_POINT_QUANTIZATION = 64;
var HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE = -HYDROLOGY_POINT_QUANTIZATION / 2;
var HYDROLOGY_BOUNDARY_MIN_X = 1;
var HYDROLOGY_BOUNDARY_MAX_X = 2;
var HYDROLOGY_BOUNDARY_MIN_Y = 4;
var HYDROLOGY_BOUNDARY_MAX_Y = 8;
var ALL_BOUNDARY_BITS = HYDROLOGY_BOUNDARY_MIN_X | HYDROLOGY_BOUNDARY_MAX_X | HYDROLOGY_BOUNDARY_MIN_Y | HYDROLOGY_BOUNDARY_MAX_Y;

// src/world/HydrologyFeatureDelta.ts
var HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION = 1;
var MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS = 256;
var MAX_AUTHORED_LAKE_POLYGON_POINTS = 256;
var MAX_AUTHORED_HYDROLOGY_ID_LENGTH = 256;
var MAX_HYDROLOGY_FEATURE_WORLD_IDENTITY_LENGTH = 16384;
var HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES = 48;
var HYDROLOGY_FEATURE_DELTA_SERIALIZED_MAGIC = 843335240;
var SERIALIZED_OPERATION_DELETE = 0;
var SERIALIZED_OPERATION_UPSERT = 1;
var SERIALIZED_FEATURE_RIVER = 1;
var SERIALIZED_FEATURE_LAKE = 2;
var SERIALIZED_SOURCE_NONE = 0;
var SERIALIZED_SOURCE_SPRING = 1;
var SERIALIZED_SOURCE_RIVER = 2;
var SERIALIZED_OUTLET_NONE = 0;
var SERIALIZED_OUTLET_OCEAN = 1;
var SERIALIZED_OUTLET_LAKE = 2;
var SERIALIZED_OUTLET_RIVER = 3;
function assertStableId(name, value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_AUTHORED_HYDROLOGY_ID_LENGTH || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${name} must be a canonical stable identity`);
  }
}
function assertUint8(name, value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be a uint8 value`);
  }
}
function assertUint16(name, value) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new RangeError(`${name} must be a uint16 value`);
  }
}
function pointAt(points, index) {
  return { x: points[index * 2], y: points[index * 2 + 1] };
}
function comparePoint(first, second) {
  return first.x - second.x || first.y - second.y;
}
function assertQuantizedPoints(name, points, minimum, maximum) {
  if (!(points instanceof Float64Array) || points.length % 2 !== 0 || points.length / 2 < minimum || points.length / 2 > maximum) {
    throw new TypeError(`${name} does not match its bounded q64 layout`);
  }
  for (const coordinate of points) {
    if (!Number.isSafeInteger(coordinate)) {
      throw new RangeError(`${name} coordinates must be safe q64 integers`);
    }
  }
}
function orientation(first, second, third) {
  const firstX = BigInt(first.x);
  const firstY = BigInt(first.y);
  const secondX = BigInt(second.x);
  const secondY = BigInt(second.y);
  const thirdX = BigInt(third.x);
  const thirdY = BigInt(third.y);
  return (secondX - firstX) * (thirdY - firstY) - (secondY - firstY) * (thirdX - firstX);
}
function between(value, first, second) {
  return value >= Math.min(first, second) && value <= Math.max(first, second);
}
function pointOnSegment(point, first, second) {
  return orientation(first, second, point) === 0n && between(point.x, first.x, second.x) && between(point.y, first.y, second.y);
}
function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  if ((firstOrientation > 0n && secondOrientation < 0n || firstOrientation < 0n && secondOrientation > 0n) && (thirdOrientation > 0n && fourthOrientation < 0n || thirdOrientation < 0n && fourthOrientation > 0n)) return true;
  return firstOrientation === 0n && pointOnSegment(secondStart, firstStart, firstEnd) || secondOrientation === 0n && pointOnSegment(secondEnd, firstStart, firstEnd) || thirdOrientation === 0n && pointOnSegment(firstStart, secondStart, secondEnd) || fourthOrientation === 0n && pointOnSegment(firstEnd, secondStart, secondEnd);
}
function adjacentSegmentsOverlap(previous, current, next) {
  return orientation(previous, current, next) === 0n && (pointOnSegment(next, previous, current) || pointOnSegment(previous, current, next));
}
function polygonTwiceArea(points) {
  let area = 0n;
  const pointCount = points.length / 2;
  for (let index = 0; index < pointCount; index += 1) {
    const current = pointAt(points, index);
    const next = pointAt(points, (index + 1) % pointCount);
    area += BigInt(current.x) * BigInt(next.y) - BigInt(current.y) * BigInt(next.x);
  }
  return area;
}
function assertSimpleCanonicalPolygon(points) {
  const pointCount = points.length / 2;
  const identities = /* @__PURE__ */ new Set();
  let minimumIndex = 0;
  for (let index = 0; index < pointCount; index += 1) {
    const point = pointAt(points, index);
    const identity = `${point.x}:${point.y}`;
    if (identities.has(identity)) throw new Error("authored lake polygon contains a repeated vertex");
    identities.add(identity);
    if (comparePoint(point, pointAt(points, minimumIndex)) < 0) minimumIndex = index;
  }
  for (let index = 0; index < pointCount; index += 1) {
    if (adjacentSegmentsOverlap(
      pointAt(points, (index - 1 + pointCount) % pointCount),
      pointAt(points, index),
      pointAt(points, (index + 1) % pointCount)
    )) {
      throw new Error("authored lake polygon cannot contain overlapping adjacent edges");
    }
  }
  if (minimumIndex !== 0) throw new Error("authored lake polygon must start at its lexicographic minimum");
  if (polygonTwiceArea(points) <= 0n) {
    throw new Error("authored lake polygon must be non-degenerate and counter-clockwise");
  }
  for (let firstIndex = 0; firstIndex < pointCount; firstIndex += 1) {
    const firstNext = (firstIndex + 1) % pointCount;
    const firstStart = pointAt(points, firstIndex);
    const firstEnd = pointAt(points, firstNext);
    for (let secondIndex = firstIndex + 1; secondIndex < pointCount; secondIndex += 1) {
      const secondNext = (secondIndex + 1) % pointCount;
      if (secondIndex === firstIndex || secondIndex === firstNext || secondNext === firstIndex) continue;
      if (segmentsIntersect(firstStart, firstEnd, pointAt(points, secondIndex), pointAt(points, secondNext))) {
        throw new Error("authored lake polygon must be simple and non-self-intersecting");
      }
    }
  }
}
function assertSimpleRiverLine(points) {
  const pointCount = points.length / 2;
  const identities = /* @__PURE__ */ new Set();
  for (let index = 0; index < pointCount; index += 1) {
    const point = pointAt(points, index);
    const identity = `${point.x}:${point.y}`;
    if (identities.has(identity)) throw new Error("authored river contains a repeated control point");
    identities.add(identity);
  }
  for (let index = 1; index < pointCount - 1; index += 1) {
    if (adjacentSegmentsOverlap(
      pointAt(points, index - 1),
      pointAt(points, index),
      pointAt(points, index + 1)
    )) {
      throw new Error("authored river cannot contain overlapping adjacent spans");
    }
  }
  for (let firstIndex = 0; firstIndex < pointCount - 1; firstIndex += 1) {
    const firstStart = pointAt(points, firstIndex);
    const firstEnd = pointAt(points, firstIndex + 1);
    for (let secondIndex = firstIndex + 2; secondIndex < pointCount - 1; secondIndex += 1) {
      if (segmentsIntersect(
        firstStart,
        firstEnd,
        pointAt(points, secondIndex),
        pointAt(points, secondIndex + 1)
      )) {
        throw new Error("authored river must be a simple non-self-intersecting line");
      }
    }
  }
}
function canonicalPolygon(input) {
  assertQuantizedPoints(
    "authored lake polygon",
    input,
    3,
    MAX_AUTHORED_LAKE_POLYGON_POINTS
  );
  const pointCount = input.length / 2;
  const identities = /* @__PURE__ */ new Set();
  let minimumIndex = 0;
  for (let index = 0; index < pointCount; index += 1) {
    const point = pointAt(input, index);
    const identity = `${point.x}:${point.y}`;
    if (identities.has(identity)) throw new Error("authored lake polygon contains a repeated vertex");
    identities.add(identity);
    if (comparePoint(point, pointAt(input, minimumIndex)) < 0) minimumIndex = index;
  }
  const area = polygonTwiceArea(input);
  const counterClockwise = area > 0n;
  if (area === 0n) throw new Error("authored lake polygon is degenerate");
  const output = new Float64Array(input.length);
  for (let targetIndex = 0; targetIndex < pointCount; targetIndex += 1) {
    const sourceIndex = counterClockwise ? (minimumIndex + targetIndex) % pointCount : (minimumIndex - targetIndex + pointCount) % pointCount;
    output[targetIndex * 2] = input[sourceIndex * 2];
    output[targetIndex * 2 + 1] = input[sourceIndex * 2 + 1];
  }
  assertSimpleCanonicalPolygon(output);
  return output;
}
function cloneSource(source) {
  return source.kind === "spring" ? Object.freeze({ kind: "spring", sourceId: source.sourceId }) : Object.freeze({ kind: "river", riverId: source.riverId });
}
function cloneOutlet(outlet) {
  if (outlet.kind === "river") return Object.freeze({ kind: "river", riverId: outlet.riverId });
  return Object.freeze({ kind: outlet.kind, bodyId: outlet.bodyId });
}
function assertAuthoredRiverFeature(feature) {
  if (!feature || typeof feature !== "object" || feature.kind !== "river") {
    throw new TypeError("authored river feature is invalid");
  }
  assertStableId("authored river feature", feature.featureId);
  if (feature.featureId === OCEAN_BODY_ID) {
    throw new Error("authored river cannot use the reserved ocean body identity");
  }
  assertQuantizedPoints(
    "authored river control points",
    feature.controlPoints,
    2,
    MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS
  );
  const pointCount = feature.controlPoints.length / 2;
  if (!(feature.widthProfile instanceof Uint8Array) || feature.widthProfile.length !== pointCount || !(feature.levelProfile instanceof Uint16Array) || feature.levelProfile.length !== pointCount) {
    throw new TypeError("authored river profiles must match its control point count");
  }
  assertSimpleRiverLine(feature.controlPoints);
  if (!feature.source || typeof feature.source !== "object") {
    throw new TypeError("authored river source is required");
  }
  if (feature.source.kind === "spring") assertStableId("authored river spring", feature.source.sourceId);
  else if (feature.source.kind === "river") {
    assertStableId("authored river source river", feature.source.riverId);
    if (feature.source.riverId === feature.featureId) throw new Error("authored river cannot source from itself");
  } else throw new TypeError("authored river source kind is invalid");
  if (!feature.outlet || typeof feature.outlet !== "object") {
    throw new TypeError("authored river outlet is required");
  }
  if (feature.outlet.kind === "ocean") {
    if (feature.outlet.bodyId !== OCEAN_BODY_ID) {
      throw new Error("authored ocean outlet must use the ocean body");
    }
  } else if (feature.outlet.kind === "lake") {
    assertStableId("authored river outlet lake", feature.outlet.bodyId);
    if (feature.outlet.bodyId === OCEAN_BODY_ID) {
      throw new Error("authored lake outlet cannot use the reserved ocean body identity");
    }
  } else if (feature.outlet.kind === "river") {
    assertStableId("authored river outlet river", feature.outlet.riverId);
    if (feature.outlet.riverId === OCEAN_BODY_ID) {
      throw new Error("authored river outlet cannot use the reserved ocean body identity");
    }
    if (feature.outlet.riverId === feature.featureId) throw new Error("authored river cannot outlet to itself");
  } else throw new TypeError("authored river outlet kind is invalid");
  for (let index = 0; index < pointCount; index += 1) {
    if (feature.widthProfile[index] === 0) throw new RangeError("authored river width must be positive");
    if (index > 0) {
      const previous = pointAt(feature.controlPoints, index - 1);
      const current = pointAt(feature.controlPoints, index);
      if (previous.x === current.x && previous.y === current.y) {
        throw new Error("authored river cannot contain a zero-length span");
      }
      if (feature.widthProfile[index] < feature.widthProfile[index - 1] || feature.levelProfile[index] > feature.levelProfile[index - 1]) {
        throw new Error("authored river cannot narrow or rise downstream");
      }
    }
  }
  assertUint8("authored river discharge class", feature.dischargeClass);
  assertUint8("authored river profile", feature.profileIndex);
}
function createAuthoredRiverFeature(input) {
  if (!input || typeof input !== "object") throw new TypeError("authored river input is required");
  if (!input.source || typeof input.source !== "object") {
    throw new TypeError("authored river source is required");
  }
  if (!input.outlet || typeof input.outlet !== "object") {
    throw new TypeError("authored river outlet is required");
  }
  const feature = Object.freeze({
    kind: "river",
    featureId: input.featureId,
    source: cloneSource(input.source),
    outlet: cloneOutlet(input.outlet),
    controlPoints: input.controlPoints,
    widthProfile: input.widthProfile,
    levelProfile: input.levelProfile,
    dischargeClass: input.dischargeClass,
    profileIndex: input.profileIndex
  });
  assertAuthoredRiverFeature(feature);
  return feature;
}
function assertAuthoredLakeFeature(feature) {
  if (!feature || typeof feature !== "object" || feature.kind !== "lake") {
    throw new TypeError("authored lake feature is invalid");
  }
  assertStableId("authored lake feature", feature.featureId);
  if (feature.featureId === OCEAN_BODY_ID) {
    throw new Error("authored lake cannot use the reserved ocean body identity");
  }
  assertQuantizedPoints(
    "authored lake polygon",
    feature.polygon,
    3,
    MAX_AUTHORED_LAKE_POLYGON_POINTS
  );
  assertSimpleCanonicalPolygon(feature.polygon);
  assertUint16("authored lake level", feature.level);
  assertUint8("authored lake profile", feature.profileIndex);
}
function createAuthoredLakeFeature(input) {
  if (!input || typeof input !== "object") throw new TypeError("authored lake input is required");
  const feature = Object.freeze({
    kind: "lake",
    featureId: input.featureId,
    polygon: canonicalPolygon(input.polygon),
    level: input.level,
    profileIndex: input.profileIndex
  });
  assertAuthoredLakeFeature(feature);
  return feature;
}
function assertHydrologyFeatureDelta(delta) {
  if (!delta || typeof delta !== "object" || delta.formatVersion !== HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION) {
    throw new TypeError("hydrology feature delta format version is unsupported");
  }
  if (typeof delta.worldIdentity !== "string" || delta.worldIdentity.length === 0 || delta.worldIdentity.length > MAX_HYDROLOGY_FEATURE_WORLD_IDENTITY_LENGTH) {
    throw new TypeError("hydrology feature delta world identity is invalid");
  }
  if (!Number.isSafeInteger(delta.revision) || delta.revision <= 0) {
    throw new RangeError("hydrology feature delta revision must be a positive safe integer");
  }
  assertStableId("hydrology delta feature", delta.featureId);
  if (delta.featureKind !== "river" && delta.featureKind !== "lake") {
    throw new TypeError("hydrology delta feature kind is invalid");
  }
  if (delta.operation === "delete") {
    if ("feature" in delta) throw new Error("hydrology tombstone cannot carry a feature payload");
    return;
  }
  if (delta.operation !== "upsert" || !delta.feature || delta.feature.kind !== delta.featureKind || delta.feature.featureId !== delta.featureId) {
    throw new Error("hydrology upsert identity or kind does not match its complete feature");
  }
  if (delta.feature.kind === "river") assertAuthoredRiverFeature(delta.feature);
  else assertAuthoredLakeFeature(delta.feature);
}
function createHydrologyFeatureDelta(input) {
  if (!input || typeof input !== "object") throw new TypeError("hydrology feature delta input is required");
  let delta;
  if (input.operation === "upsert") {
    if (!input.feature || typeof input.feature !== "object") {
      throw new TypeError("hydrology feature delta upsert requires a complete feature");
    }
    const feature = input.feature.kind === "river" ? createAuthoredRiverFeature(input.feature) : input.feature.kind === "lake" ? createAuthoredLakeFeature(input.feature) : (() => {
      throw new TypeError("hydrology feature delta kind is invalid");
    })();
    delta = Object.freeze({
      formatVersion: HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION,
      worldIdentity: input.worldIdentity,
      revision: input.revision,
      featureId: input.featureId,
      featureKind: input.featureKind,
      operation: "upsert",
      feature
    });
  } else if (input.operation === "delete") {
    delta = Object.freeze({
      formatVersion: HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION,
      worldIdentity: input.worldIdentity,
      revision: input.revision,
      featureId: input.featureId,
      featureKind: input.featureKind,
      operation: "delete"
    });
  } else throw new TypeError("hydrology feature delta operation is invalid");
  assertHydrologyFeatureDelta(delta);
  return delta;
}
function serializedLayout(worldIdentityBytes, featureIdBytes, sourceIdBytes, outletIdBytes, pointCount, riverPayload) {
  const worldIdentity = HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES;
  const featureId = worldIdentity + worldIdentityBytes;
  const sourceId = featureId + featureIdBytes;
  const outletId = sourceId + sourceIdBytes;
  const points = outletId + outletIdBytes;
  const widthProfile = points + pointCount * 2 * BigInt64Array.BYTES_PER_ELEMENT;
  const levelProfile = widthProfile + (riverPayload ? pointCount : 0);
  const totalBytes = levelProfile + (riverPayload ? pointCount * Uint16Array.BYTES_PER_ELEMENT : 0);
  if (!Number.isSafeInteger(totalBytes)) {
    throw new RangeError("serialized hydrology feature delta exceeds the safe byte range");
  }
  return { worldIdentity, featureId, sourceId, outletId, points, widthProfile, levelProfile, totalBytes };
}
function encoded(value) {
  return new TextEncoder().encode(value);
}
function sourceIdentity(source) {
  return source.kind === "spring" ? source.sourceId : source.riverId;
}
function outletIdentity(outlet) {
  return outlet.kind === "river" ? outlet.riverId : outlet.bodyId;
}
function serializedSourceKind(source) {
  return source.kind === "spring" ? SERIALIZED_SOURCE_SPRING : SERIALIZED_SOURCE_RIVER;
}
function serializedOutletKind(outlet) {
  return outlet.kind === "ocean" ? SERIALIZED_OUTLET_OCEAN : outlet.kind === "lake" ? SERIALIZED_OUTLET_LAKE : SERIALIZED_OUTLET_RIVER;
}
function hydrologyFeatureDeltaSerializedBytes(delta) {
  assertHydrologyFeatureDelta(delta);
  const worldIdentityBytes = encoded(delta.worldIdentity).byteLength;
  const featureIdBytes = encoded(delta.featureId).byteLength;
  const river = delta.operation === "upsert" && delta.feature.kind === "river" ? delta.feature : void 0;
  const sourceIdBytes = river ? encoded(sourceIdentity(river.source)).byteLength : 0;
  const outletIdBytes = river ? encoded(outletIdentity(river.outlet)).byteLength : 0;
  const pointCount = delta.operation === "delete" ? 0 : (delta.feature.kind === "river" ? delta.feature.controlPoints : delta.feature.polygon).length / 2;
  return serializedLayout(
    worldIdentityBytes,
    featureIdBytes,
    sourceIdBytes,
    outletIdBytes,
    pointCount,
    river !== void 0
  ).totalBytes;
}
function serializeHydrologyFeatureDelta(delta) {
  assertHydrologyFeatureDelta(delta);
  const worldIdentity = encoded(delta.worldIdentity);
  const featureId = encoded(delta.featureId);
  const river = delta.operation === "upsert" && delta.feature.kind === "river" ? delta.feature : void 0;
  const sourceId = river ? encoded(sourceIdentity(river.source)) : new Uint8Array(0);
  const outletId = river ? encoded(outletIdentity(river.outlet)) : new Uint8Array(0);
  const points = delta.operation === "delete" ? void 0 : delta.feature.kind === "river" ? delta.feature.controlPoints : delta.feature.polygon;
  const pointCount = points ? points.length / 2 : 0;
  const layout = serializedLayout(
    worldIdentity.byteLength,
    featureId.byteLength,
    sourceId.byteLength,
    outletId.byteLength,
    pointCount,
    river !== void 0
  );
  const buffer = new ArrayBuffer(layout.totalBytes);
  const view = new DataView(buffer);
  view.setUint32(0, HYDROLOGY_FEATURE_DELTA_SERIALIZED_MAGIC, true);
  view.setUint16(4, HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION, true);
  view.setUint16(6, HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES, true);
  view.setUint8(8, delta.operation === "delete" ? SERIALIZED_OPERATION_DELETE : SERIALIZED_OPERATION_UPSERT);
  view.setUint8(9, delta.featureKind === "river" ? SERIALIZED_FEATURE_RIVER : SERIALIZED_FEATURE_LAKE);
  view.setUint8(10, river ? serializedSourceKind(river.source) : SERIALIZED_SOURCE_NONE);
  view.setUint8(11, river ? serializedOutletKind(river.outlet) : SERIALIZED_OUTLET_NONE);
  view.setBigUint64(12, BigInt(delta.revision), true);
  view.setUint32(20, worldIdentity.byteLength, true);
  view.setUint32(24, featureId.byteLength, true);
  view.setUint32(28, sourceId.byteLength, true);
  view.setUint32(32, outletId.byteLength, true);
  view.setUint16(36, pointCount, true);
  view.setUint8(38, river?.dischargeClass ?? 0);
  view.setUint8(39, delta.operation === "upsert" ? delta.feature.profileIndex : 0);
  view.setUint16(40, delta.operation === "upsert" && delta.feature.kind === "lake" ? delta.feature.level : 0, true);
  view.setUint16(42, 0, true);
  view.setUint32(44, layout.totalBytes, true);
  new Uint8Array(buffer, layout.worldIdentity, worldIdentity.byteLength).set(worldIdentity);
  new Uint8Array(buffer, layout.featureId, featureId.byteLength).set(featureId);
  new Uint8Array(buffer, layout.sourceId, sourceId.byteLength).set(sourceId);
  new Uint8Array(buffer, layout.outletId, outletId.byteLength).set(outletId);
  if (points) {
    for (let index = 0; index < points.length; index += 1) {
      view.setBigInt64(
        layout.points + index * BigInt64Array.BYTES_PER_ELEMENT,
        BigInt(points[index]),
        true
      );
    }
  }
  if (river) {
    new Uint8Array(buffer, layout.widthProfile, pointCount).set(river.widthProfile);
    for (let index = 0; index < pointCount; index += 1) {
      view.setUint16(
        layout.levelProfile + index * Uint16Array.BYTES_PER_ELEMENT,
        river.levelProfile[index],
        true
      );
    }
  }
  return buffer;
}
function decoded(name, buffer, offset, length) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(buffer, offset, length)
    );
  } catch {
    throw new TypeError(`serialized hydrology ${name} is not valid UTF-8`);
  }
}
function safeBigIntNumber(name, value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || BigInt(numeric) !== value) {
    throw new RangeError(`serialized hydrology ${name} exceeds the safe integer range`);
  }
  return numeric;
}
function deserializeHydrologyFeatureDelta(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES) {
    throw new TypeError("serialized hydrology feature delta has an invalid byte length");
  }
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== HYDROLOGY_FEATURE_DELTA_SERIALIZED_MAGIC || view.getUint16(4, true) !== HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION || view.getUint16(6, true) !== HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES || view.getUint16(42, true) !== 0 || view.getUint32(44, true) !== buffer.byteLength) {
    throw new TypeError("serialized hydrology feature delta header is invalid or unsupported");
  }
  const operation = view.getUint8(8);
  const featureKind = view.getUint8(9);
  const sourceKind = view.getUint8(10);
  const outletKind = view.getUint8(11);
  const worldIdentityBytes = view.getUint32(20, true);
  const featureIdBytes = view.getUint32(24, true);
  const sourceIdBytes = view.getUint32(28, true);
  const outletIdBytes = view.getUint32(32, true);
  const pointCount = view.getUint16(36, true);
  const dischargeClass = view.getUint8(38);
  const profileIndex = view.getUint8(39);
  const lakeLevel = view.getUint16(40, true);
  const isRiverUpsert = operation === SERIALIZED_OPERATION_UPSERT && featureKind === SERIALIZED_FEATURE_RIVER;
  const layout = serializedLayout(
    worldIdentityBytes,
    featureIdBytes,
    sourceIdBytes,
    outletIdBytes,
    pointCount,
    isRiverUpsert
  );
  if (layout.totalBytes !== buffer.byteLength || worldIdentityBytes === 0 || featureIdBytes === 0) {
    throw new TypeError("serialized hydrology feature delta byte layout is invalid");
  }
  const worldIdentity = decoded("world identity", buffer, layout.worldIdentity, worldIdentityBytes);
  const featureId = decoded("feature identity", buffer, layout.featureId, featureIdBytes);
  const revision = safeBigIntNumber("revision", view.getBigUint64(12, true));
  const kind = featureKind === SERIALIZED_FEATURE_RIVER ? "river" : featureKind === SERIALIZED_FEATURE_LAKE ? "lake" : void 0;
  if (!kind) throw new TypeError("serialized hydrology feature kind is invalid");
  if (operation === SERIALIZED_OPERATION_DELETE) {
    if (sourceKind !== SERIALIZED_SOURCE_NONE || outletKind !== SERIALIZED_OUTLET_NONE || sourceIdBytes !== 0 || outletIdBytes !== 0 || pointCount !== 0 || dischargeClass !== 0 || profileIndex !== 0 || lakeLevel !== 0) {
      throw new Error("serialized hydrology tombstone contains non-canonical payload");
    }
    return createHydrologyFeatureDelta({
      worldIdentity,
      revision,
      featureId,
      featureKind: kind,
      operation: "delete"
    });
  }
  if (operation !== SERIALIZED_OPERATION_UPSERT) {
    throw new TypeError("serialized hydrology feature operation is invalid");
  }
  const points = new Float64Array(pointCount * 2);
  for (let index = 0; index < points.length; index += 1) {
    points[index] = safeBigIntNumber(
      "q64 coordinate",
      view.getBigInt64(layout.points + index * BigInt64Array.BYTES_PER_ELEMENT, true)
    );
  }
  if (kind === "lake") {
    if (sourceKind !== SERIALIZED_SOURCE_NONE || outletKind !== SERIALIZED_OUTLET_NONE || sourceIdBytes !== 0 || outletIdBytes !== 0 || dischargeClass !== 0) {
      throw new Error("serialized authored lake contains non-canonical river payload");
    }
    const feature = {
      kind: "lake",
      featureId,
      polygon: points,
      level: lakeLevel,
      profileIndex
    };
    assertAuthoredLakeFeature(feature);
    return createHydrologyFeatureDelta({
      worldIdentity,
      revision,
      featureId,
      featureKind: kind,
      operation: "upsert",
      feature
    });
  }
  if (lakeLevel !== 0 || sourceIdBytes === 0 || outletIdBytes === 0) {
    throw new Error("serialized authored river header is non-canonical");
  }
  const sourceId = decoded("river source identity", buffer, layout.sourceId, sourceIdBytes);
  const outletId = decoded("river outlet identity", buffer, layout.outletId, outletIdBytes);
  const source = sourceKind === SERIALIZED_SOURCE_SPRING ? { kind: "spring", sourceId } : sourceKind === SERIALIZED_SOURCE_RIVER ? { kind: "river", riverId: sourceId } : (() => {
    throw new TypeError("serialized authored river source kind is invalid");
  })();
  const outlet = outletKind === SERIALIZED_OUTLET_OCEAN ? { kind: "ocean", bodyId: outletId } : outletKind === SERIALIZED_OUTLET_LAKE ? { kind: "lake", bodyId: outletId } : outletKind === SERIALIZED_OUTLET_RIVER ? { kind: "river", riverId: outletId } : (() => {
    throw new TypeError("serialized authored river outlet kind is invalid");
  })();
  const widthProfile = new Uint8Array(buffer, layout.widthProfile, pointCount).slice();
  const levelProfile = new Uint16Array(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    levelProfile[index] = view.getUint16(
      layout.levelProfile + index * Uint16Array.BYTES_PER_ELEMENT,
      true
    );
  }
  return createHydrologyFeatureDelta({
    worldIdentity,
    revision,
    featureId,
    featureKind: kind,
    operation: "upsert",
    feature: {
      kind: "river",
      featureId,
      source,
      outlet,
      controlPoints: points,
      widthProfile,
      levelProfile,
      dischargeClass,
      profileIndex
    }
  });
}

// src/world/BaseSemanticChunk.ts
var BASE_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE;
var BASE_SEMANTIC_CHUNK_HEADER_BYTES = 40;
var BIOME_BASIS_COUNT = 4;
var CLIMATE_CHANNEL_COUNT = 2;
var SUBSTRATE_OFFSET = BASE_SEMANTIC_CHUNK_HEADER_BYTES;
var MACRO_HEIGHT_OFFSET = SUBSTRATE_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT;
var BIOME_WEIGHTS_OFFSET = MACRO_HEIGHT_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT * Uint16Array.BYTES_PER_ELEMENT;
var CLIMATE_OFFSET = BIOME_WEIGHTS_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT * BIOME_BASIS_COUNT;
var VEGETATION_DENSITY_OFFSET = CLIMATE_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNEL_COUNT;
var VEGETATION_PROFILE_OFFSET = VEGETATION_DENSITY_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT;
var BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES = VEGETATION_PROFILE_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT;
var FULL_LOCAL_BOUNDS = Object.freeze({
  minX: 0,
  minY: 0,
  maxXExclusive: WORLD_SEMANTIC_CHUNK_SIZE,
  maxYExclusive: WORLD_SEMANTIC_CHUNK_SIZE
});
function semanticCatalogLimits(descriptor) {
  return Object.freeze({
    substrateCount: descriptor.substrateCatalog.entryCount,
    vegetationProfileCount: descriptor.vegetationCatalog.entryCount
  });
}

// src/world/SparseSemanticDelta.ts
var SPARSE_SEMANTIC_DELTA_FORMAT_VERSION = 1;
var SPARSE_SEMANTIC_DELTA_HEADER_BYTES = 40;
var SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY = 12;
var MAX_SPARSE_SEMANTIC_DELTA_WORLD_IDENTITY_LENGTH = 16384;
var SEMANTIC_DELTA_FIELD_HEIGHT = 1 << 0;
var SEMANTIC_DELTA_FIELD_SUBSTRATE = 1 << 1;
var SEMANTIC_DELTA_FIELD_BIOME = 1 << 2;
var SEMANTIC_DELTA_FIELD_VEGETATION = 1 << 3;
var SEMANTIC_DELTA_ALL_FIELDS = SEMANTIC_DELTA_FIELD_HEIGHT | SEMANTIC_DELTA_FIELD_SUBSTRATE | SEMANTIC_DELTA_FIELD_BIOME | SEMANTIC_DELTA_FIELD_VEGETATION;
var BIOME_BASIS_COUNT2 = 4;
var SERIALIZED_MAGIC = 843338579;
function assertCatalogLimits(limits) {
  if (!limits || !Number.isInteger(limits.substrateCount) || limits.substrateCount <= 0 || limits.substrateCount > 256 || !Number.isInteger(limits.vegetationProfileCount) || limits.vegetationProfileCount <= 0 || limits.vegetationProfileCount > 256) {
    throw new RangeError("sparse semantic delta catalog limits must be integers between 1 and 256");
  }
}
function offsets(identityBytes, entryCount) {
  const identity = SPARSE_SEMANTIC_DELTA_HEADER_BYTES;
  const tileIndex = identity + identityBytes;
  const fieldMask = tileIndex + entryCount * Uint16Array.BYTES_PER_ELEMENT;
  const macroHeight = fieldMask + entryCount;
  const substrateClass = macroHeight + entryCount * Uint16Array.BYTES_PER_ELEMENT;
  const biomeWeights = substrateClass + entryCount;
  const vegetationDensity = biomeWeights + entryCount * BIOME_BASIS_COUNT2;
  const vegetationProfile = vegetationDensity + entryCount;
  const totalBytes = vegetationProfile + entryCount;
  if (!Number.isSafeInteger(totalBytes)) {
    throw new RangeError("serialized sparse semantic delta exceeds safe byte addressing");
  }
  return {
    identity,
    tileIndex,
    fieldMask,
    macroHeight,
    substrateClass,
    biomeWeights,
    vegetationDensity,
    vegetationProfile,
    totalBytes
  };
}
function safeBigIntNumber2(name, value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || BigInt(number) !== value) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }
  return number;
}
function assertSparseSemanticDelta(delta, limits) {
  if (!delta || typeof delta !== "object" || delta.formatVersion !== SPARSE_SEMANTIC_DELTA_FORMAT_VERSION) {
    throw new TypeError("sparse semantic delta format version is unsupported");
  }
  assertCatalogLimits(limits);
  if (typeof delta.worldIdentity !== "string" || delta.worldIdentity.length === 0 || delta.worldIdentity.length > MAX_SPARSE_SEMANTIC_DELTA_WORLD_IDENTITY_LENGTH) {
    throw new TypeError("sparse semantic delta world identity is invalid");
  }
  if (!delta.key || !Number.isSafeInteger(delta.key.chunkX) || !Number.isSafeInteger(delta.key.chunkY)) {
    throw new RangeError("sparse semantic delta key must use safe integers");
  }
  chunkOrigin(delta.key.chunkX, delta.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
  if (!Number.isSafeInteger(delta.revision) || delta.revision <= 0) {
    throw new RangeError("sparse semantic delta revision must be a positive safe integer");
  }
  const entryCount = delta.tileIndex?.length;
  if (!(delta.tileIndex instanceof Uint16Array) || entryCount <= 0 || entryCount > BASE_SEMANTIC_CHUNK_TILE_COUNT || !(delta.fieldMask instanceof Uint8Array) || delta.fieldMask.length !== entryCount || !(delta.macroHeight instanceof Uint16Array) || delta.macroHeight.length !== entryCount || !(delta.substrateClass instanceof Uint8Array) || delta.substrateClass.length !== entryCount || !(delta.biomeWeights instanceof Uint8Array) || delta.biomeWeights.length !== entryCount * BIOME_BASIS_COUNT2 || !(delta.vegetationDensity instanceof Uint8Array) || delta.vegetationDensity.length !== entryCount || !(delta.vegetationProfile instanceof Uint8Array) || delta.vegetationProfile.length !== entryCount) {
    throw new TypeError("sparse semantic delta arrays do not match the frozen layout");
  }
  let previousTileIndex = -1;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    const tileIndex = delta.tileIndex[entryIndex];
    const mask = delta.fieldMask[entryIndex];
    const biomeOffset = entryIndex * BIOME_BASIS_COUNT2;
    if (tileIndex <= previousTileIndex || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT) {
      throw new Error("sparse semantic delta tile indices must be unique ascending X-major indices");
    }
    previousTileIndex = tileIndex;
    if (mask === 0 || (mask & ~SEMANTIC_DELTA_ALL_FIELDS) !== 0) {
      throw new RangeError("sparse semantic delta field mask is empty or unknown");
    }
    if ((mask & SEMANTIC_DELTA_FIELD_HEIGHT) === 0 && delta.macroHeight[entryIndex] !== 0) {
      throw new Error("sparse semantic delta unused height slot must be zero");
    }
    if ((mask & SEMANTIC_DELTA_FIELD_SUBSTRATE) !== 0) {
      if (delta.substrateClass[entryIndex] >= limits.substrateCount) {
        throw new RangeError("sparse semantic delta substrate exceeds its catalog");
      }
    } else if (delta.substrateClass[entryIndex] !== 0) {
      throw new Error("sparse semantic delta unused substrate slot must be zero");
    }
    const biomeSum = delta.biomeWeights[biomeOffset] + delta.biomeWeights[biomeOffset + 1] + delta.biomeWeights[biomeOffset + 2] + delta.biomeWeights[biomeOffset + 3];
    if ((mask & SEMANTIC_DELTA_FIELD_BIOME) !== 0) {
      if (biomeSum !== 255) {
        throw new RangeError("sparse semantic delta biome weights must sum to 255");
      }
    } else if (biomeSum !== 0) {
      throw new Error("sparse semantic delta unused biome slots must be zero");
    }
    if ((mask & SEMANTIC_DELTA_FIELD_VEGETATION) !== 0) {
      if (delta.vegetationProfile[entryIndex] >= limits.vegetationProfileCount) {
        throw new RangeError("sparse semantic delta vegetation profile exceeds its catalog");
      }
    } else if (delta.vegetationDensity[entryIndex] !== 0 || delta.vegetationProfile[entryIndex] !== 0) {
      throw new Error("sparse semantic delta unused vegetation slots must be zero");
    }
  }
}
function createSparseSemanticDelta(input, limits) {
  if (!input || typeof input !== "object") throw new TypeError("sparse semantic delta input is required");
  const delta = Object.freeze({
    formatVersion: SPARSE_SEMANTIC_DELTA_FORMAT_VERSION,
    worldIdentity: input.worldIdentity,
    key: Object.freeze({ chunkX: input.key.chunkX, chunkY: input.key.chunkY }),
    revision: input.revision,
    tileIndex: input.tileIndex,
    fieldMask: input.fieldMask,
    macroHeight: input.macroHeight,
    substrateClass: input.substrateClass,
    biomeWeights: input.biomeWeights,
    vegetationDensity: input.vegetationDensity,
    vegetationProfile: input.vegetationProfile
  });
  assertSparseSemanticDelta(delta, limits);
  return delta;
}
function sparseSemanticDeltaSerializedBytes(delta) {
  const identityBytes = new TextEncoder().encode(delta.worldIdentity).byteLength;
  return offsets(identityBytes, delta.tileIndex.length).totalBytes;
}
function serializeSparseSemanticDelta(delta, limits) {
  assertSparseSemanticDelta(delta, limits);
  const identity = new TextEncoder().encode(delta.worldIdentity);
  const layout = offsets(identity.byteLength, delta.tileIndex.length);
  const buffer = new ArrayBuffer(layout.totalBytes);
  const view = new DataView(buffer);
  view.setUint32(0, SERIALIZED_MAGIC, true);
  view.setUint16(4, delta.formatVersion, true);
  view.setUint16(6, SPARSE_SEMANTIC_DELTA_HEADER_BYTES, true);
  view.setBigInt64(8, BigInt(delta.key.chunkX), true);
  view.setBigInt64(16, BigInt(delta.key.chunkY), true);
  view.setBigUint64(24, BigInt(delta.revision), true);
  view.setUint32(32, identity.byteLength, true);
  view.setUint16(36, delta.tileIndex.length, true);
  view.setUint16(38, SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY, true);
  new Uint8Array(buffer, layout.identity, identity.byteLength).set(identity);
  for (let index = 0; index < delta.tileIndex.length; index += 1) {
    view.setUint16(layout.tileIndex + index * Uint16Array.BYTES_PER_ELEMENT, delta.tileIndex[index], true);
    view.setUint16(layout.macroHeight + index * Uint16Array.BYTES_PER_ELEMENT, delta.macroHeight[index], true);
  }
  new Uint8Array(buffer, layout.fieldMask, delta.fieldMask.length).set(delta.fieldMask);
  new Uint8Array(buffer, layout.substrateClass, delta.substrateClass.length).set(delta.substrateClass);
  new Uint8Array(buffer, layout.biomeWeights, delta.biomeWeights.length).set(delta.biomeWeights);
  new Uint8Array(buffer, layout.vegetationDensity, delta.vegetationDensity.length).set(delta.vegetationDensity);
  new Uint8Array(buffer, layout.vegetationProfile, delta.vegetationProfile.length).set(delta.vegetationProfile);
  return buffer;
}
function deserializeSparseSemanticDelta(buffer, limits) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < SPARSE_SEMANTIC_DELTA_HEADER_BYTES) {
    throw new TypeError("serialized sparse semantic delta has an invalid byte length");
  }
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== SERIALIZED_MAGIC || view.getUint16(4, true) !== SPARSE_SEMANTIC_DELTA_FORMAT_VERSION || view.getUint16(6, true) !== SPARSE_SEMANTIC_DELTA_HEADER_BYTES || view.getUint16(38, true) !== SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY) {
    throw new TypeError("serialized sparse semantic delta header is invalid or unsupported");
  }
  const identityBytes = view.getUint32(32, true);
  const entryCount = view.getUint16(36, true);
  const layout = offsets(identityBytes, entryCount);
  if (layout.totalBytes !== buffer.byteLength) {
    throw new TypeError("serialized sparse semantic delta byte length does not match its header");
  }
  let worldIdentity;
  try {
    worldIdentity = new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(buffer, layout.identity, identityBytes)
    );
  } catch {
    throw new TypeError("serialized sparse semantic delta world identity is not valid UTF-8");
  }
  const tileIndex = new Uint16Array(entryCount);
  const macroHeight = new Uint16Array(entryCount);
  for (let index = 0; index < entryCount; index += 1) {
    tileIndex[index] = view.getUint16(layout.tileIndex + index * Uint16Array.BYTES_PER_ELEMENT, true);
    macroHeight[index] = view.getUint16(
      layout.macroHeight + index * Uint16Array.BYTES_PER_ELEMENT,
      true
    );
  }
  return createSparseSemanticDelta({
    worldIdentity,
    key: {
      chunkX: safeBigIntNumber2("sparse semantic delta chunk x", view.getBigInt64(8, true)),
      chunkY: safeBigIntNumber2("sparse semantic delta chunk y", view.getBigInt64(16, true))
    },
    revision: safeBigIntNumber2("sparse semantic delta revision", view.getBigUint64(24, true)),
    tileIndex,
    fieldMask: new Uint8Array(buffer, layout.fieldMask, entryCount).slice(),
    macroHeight,
    substrateClass: new Uint8Array(buffer, layout.substrateClass, entryCount).slice(),
    biomeWeights: new Uint8Array(buffer, layout.biomeWeights, entryCount * BIOME_BASIS_COUNT2).slice(),
    vegetationDensity: new Uint8Array(buffer, layout.vegetationDensity, entryCount).slice(),
    vegetationProfile: new Uint8Array(buffer, layout.vegetationProfile, entryCount).slice()
  }, limits);
}

// src/world/SurfaceDeltaStore.ts
var SURFACE_DELTA_TRANSACTION_FORMAT_VERSION = 1;
var MAX_SURFACE_DELTA_TRANSACTION_MUTATIONS = 4096;
var MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL = 1048576;
var SurfaceDeltaConflictError = class extends Error {
  constructor(targetKind, targetId, expectedRevision, actualRevision) {
    super(`${targetKind} delta revision conflict for ${targetId}: expected ${expectedRevision}, received ${actualRevision}`);
    this.targetKind = targetKind;
    this.targetId = targetId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.name = "SurfaceDeltaConflictError";
  }
};
function semanticKeyIdentity(key) {
  return `${key.chunkX}:${key.chunkY}`;
}
function compareSemanticKeys(first, second) {
  return first.chunkX - second.chunkX || first.chunkY - second.chunkY;
}
function assertRevision(name, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
function assertFeatureId(name, featureId) {
  if (typeof featureId !== "string" || featureId.length === 0 || featureId.length > 256 || featureId.trim() !== featureId || /[\u0000-\u001f\u007f]/u.test(featureId)) {
    throw new TypeError(`${name} must be a canonical stable identity`);
  }
}
function assertCanonicalSemanticKey(descriptor, key) {
  if (!key || typeof key !== "object") throw new TypeError("semantic mutation key is required");
  const origin = chunkOrigin(key.chunkX, key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
  if (descriptor.sourceKind === "procedural-infinite") return;
  const chunkCountX = Math.ceil(descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE);
  const chunkCountY = Math.ceil(descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE);
  if (key.chunkX < 0 || key.chunkX >= chunkCountX || key.chunkY < 0 || key.chunkY >= chunkCountY || origin.x < 0 || origin.y < 0) {
    throw new RangeError("semantic mutation must use a canonical in-domain chunk key");
  }
}
function assertSemanticDeltaBounds(descriptor, delta) {
  if (descriptor.sourceKind !== "static") return;
  const origin = chunkOrigin(delta.key.chunkX, delta.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
  const validWidth = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, descriptor.width - origin.x);
  const validHeight = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, descriptor.height - origin.y);
  for (const tileIndex of delta.tileIndex) {
    const localX = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
    const localY = tileIndex - localX * WORLD_SEMANTIC_CHUNK_SIZE;
    if (localX >= validWidth || localY >= validHeight) {
      throw new RangeError("semantic mutation tile lies outside the finite world");
    }
  }
}
function authoredGraphNode(feature) {
  if (feature.kind === "lake") {
    return Object.freeze({ kind: "lake", featureId: feature.featureId, level: feature.level });
  }
  return Object.freeze({
    kind: "river",
    featureId: feature.featureId,
    source: feature.source,
    outlet: feature.outlet,
    sourceLevel: feature.levelProfile[0],
    outletLevel: feature.levelProfile[feature.levelProfile.length - 1]
  });
}
function ownedSemanticPayload(payload) {
  return {
    tileIndex: payload.tileIndex.slice(),
    fieldMask: payload.fieldMask.slice(),
    macroHeight: payload.macroHeight.slice(),
    substrateClass: payload.substrateClass.slice(),
    biomeWeights: payload.biomeWeights.slice(),
    vegetationDensity: payload.vegetationDensity.slice(),
    vegetationProfile: payload.vegetationProfile.slice()
  };
}
function ownedHydrologyFeature(feature) {
  return feature.kind === "river" ? {
    ...feature,
    source: feature.source.kind === "spring" ? Object.freeze({ kind: "spring", sourceId: feature.source.sourceId }) : Object.freeze({ kind: "river", riverId: feature.source.riverId }),
    outlet: feature.outlet.kind === "river" ? Object.freeze({ kind: "river", riverId: feature.outlet.riverId }) : feature.outlet.kind === "lake" ? Object.freeze({ kind: "lake", bodyId: feature.outlet.bodyId }) : Object.freeze({ kind: "ocean", bodyId: feature.outlet.bodyId }),
    controlPoints: feature.controlPoints.slice(),
    widthProfile: feature.widthProfile.slice(),
    levelProfile: feature.levelProfile.slice()
  } : {
    ...feature,
    polygon: feature.polygon.slice()
  };
}
function stringBytes(value) {
  const bytes = value.length * 2;
  if (!Number.isSafeInteger(bytes)) throw new RangeError("surface delta string size exceeds safe integers");
  return bytes;
}
function arraysEqual(first, second) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}
function semanticDeltaContentEqual(first, second) {
  return arraysEqual(first.tileIndex, second.tileIndex) && arraysEqual(first.fieldMask, second.fieldMask) && arraysEqual(first.macroHeight, second.macroHeight) && arraysEqual(first.substrateClass, second.substrateClass) && arraysEqual(first.biomeWeights, second.biomeWeights) && arraysEqual(first.vegetationDensity, second.vegetationDensity) && arraysEqual(first.vegetationProfile, second.vegetationProfile);
}
function hydrologyFeatureContentEqual(first, second) {
  if (first.kind !== second.kind || first.featureId !== second.featureId) return false;
  if (first.kind === "lake" || second.kind === "lake") {
    return first.kind === "lake" && second.kind === "lake" && first.level === second.level && first.profileIndex === second.profileIndex && arraysEqual(first.polygon, second.polygon);
  }
  const sourceEqual = first.source.kind === second.source.kind && (first.source.kind === "spring" && second.source.kind === "spring" ? first.source.sourceId === second.source.sourceId : first.source.kind === "river" && second.source.kind === "river" && first.source.riverId === second.source.riverId);
  const outletEqual = first.outlet.kind === second.outlet.kind && (first.outlet.kind === "river" && second.outlet.kind === "river" ? first.outlet.riverId === second.outlet.riverId : first.outlet.kind !== "river" && second.outlet.kind !== "river" && first.outlet.bodyId === second.outlet.bodyId);
  return sourceEqual && outletEqual && first.dischargeClass === second.dischargeClass && first.profileIndex === second.profileIndex && arraysEqual(first.controlPoints, second.controlPoints) && arraysEqual(first.widthProfile, second.widthProfile) && arraysEqual(first.levelProfile, second.levelProfile);
}
function surfaceDeltaTransactionResidentBytes(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.semanticMutations) || !Array.isArray(input.hydrologyMutations)) {
    throw new TypeError("surface delta transaction is required for byte accounting");
  }
  let bytes = 256 + stringBytes(input.worldIdentity);
  for (const mutation of input.semanticMutations) {
    bytes += 96;
    if (mutation.operation === "upsert") {
      const payload = mutation.payload;
      bytes += payload.tileIndex.byteLength + payload.fieldMask.byteLength + payload.macroHeight.byteLength + payload.substrateClass.byteLength + payload.biomeWeights.byteLength + payload.vegetationDensity.byteLength + payload.vegetationProfile.byteLength;
    }
  }
  for (const mutation of input.hydrologyMutations) {
    bytes += 128 + stringBytes(mutation.featureId);
    if (mutation.operation === "upsert") {
      const feature = mutation.feature;
      if (feature.kind === "river") {
        bytes += stringBytes(feature.source.kind === "spring" ? feature.source.sourceId : feature.source.riverId);
        bytes += stringBytes(feature.outlet.kind === "river" ? feature.outlet.riverId : feature.outlet.bodyId);
        bytes += feature.controlPoints.byteLength + feature.widthProfile.byteLength + feature.levelProfile.byteLength;
      } else bytes += feature.polygon.byteLength;
    }
  }
  if (!Number.isSafeInteger(bytes)) {
    throw new RangeError("surface delta transaction byte accounting exceeds safe integers");
  }
  return bytes;
}
function assertGraphNode(node, expectedId) {
  if (!node || typeof node !== "object" || node.featureId !== expectedId) {
    throw new TypeError("base hydrology feature index returned a mismatched feature identity");
  }
  assertFeatureId("base hydrology feature", node.featureId);
  if (node.kind === "lake") {
    if (!Number.isInteger(node.level) || node.level < 0 || node.level > 65535) {
      throw new RangeError("base hydrology lake level must be a uint16 value");
    }
    return;
  }
  if (node.kind !== "river" || !Number.isInteger(node.sourceLevel) || node.sourceLevel < 0 || node.sourceLevel > 65535 || !Number.isInteger(node.outletLevel) || node.outletLevel < 0 || node.outletLevel > 65535 || node.outletLevel > node.sourceLevel) {
    throw new RangeError("base hydrology river levels or kind are invalid");
  }
  if (!node.source || typeof node.source !== "object" || !node.outlet || typeof node.outlet !== "object") {
    throw new TypeError("base hydrology river source and outlet are required");
  }
  if (node.source.kind === "spring") assertFeatureId("base hydrology spring", node.source.sourceId);
  else if (node.source.kind === "river") assertFeatureId("base hydrology source river", node.source.riverId);
  else throw new TypeError("base hydrology river source kind is invalid");
  if (node.outlet.kind === "ocean") {
    if (node.outlet.bodyId !== "ocean") throw new Error("base hydrology ocean outlet must use ocean");
  } else if (node.outlet.kind === "lake") assertFeatureId("base hydrology outlet lake", node.outlet.bodyId);
  else if (node.outlet.kind === "river") assertFeatureId("base hydrology outlet river", node.outlet.riverId);
  else throw new TypeError("base hydrology river outlet kind is invalid");
}
function assertCanonicalReferences(featureId, references) {
  if (!Array.isArray(references)) {
    throw new TypeError("base hydrology reverse references must be an array");
  }
  let previous;
  for (const reference of references) {
    assertFeatureId("base hydrology reverse reference", reference);
    if (previous !== void 0 && previous >= reference) {
      throw new Error("base hydrology reverse references must use unique ascending identities");
    }
    previous = reference;
  }
  if (references.includes(featureId)) {
    throw new Error("base hydrology feature cannot reverse-reference itself");
  }
}
var SurfaceDeltaSnapshot = class {
  constructor(worldIdentity, effectiveRevision, state) {
    this.worldIdentity = worldIdentity;
    this.effectiveRevision = effectiveRevision;
    this.state = state;
    this.semanticStates = Object.freeze([...state.semanticByKey.values()].sort((first, second) => compareSemanticKeys(first.key, second.key)));
    this.hydrologyDeltas = Object.freeze([...state.hydrologyById.values()].sort((first, second) => first.featureId < second.featureId ? -1 : first.featureId > second.featureId ? 1 : 0));
    Object.freeze(this);
  }
  getSemanticDelta(chunkX, chunkY) {
    chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    return this.state.semanticByKey.get(semanticKeyIdentity({ chunkX, chunkY }))?.delta;
  }
  getSemanticRevision(chunkX, chunkY) {
    chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    return this.state.semanticByKey.get(semanticKeyIdentity({ chunkX, chunkY }))?.revision ?? 0;
  }
  getHydrologyDelta(featureId) {
    assertFeatureId("hydrology snapshot feature", featureId);
    return this.state.hydrologyById.get(featureId);
  }
  getHydrologyRevision(featureId) {
    return this.getHydrologyDelta(featureId)?.revision ?? 0;
  }
};
var MemorySurfaceDeltaStore = class {
  constructor(descriptor, baseHydrology) {
    assertWorldDescriptorV2(descriptor);
    if (!baseHydrology || typeof baseHydrology.resolveFeature !== "function" || typeof baseHydrology.referencesTo !== "function") {
      throw new TypeError("surface delta store requires a valid base hydrology feature index");
    }
    this.descriptor = descriptor;
    this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    this.baseHydrology = baseHydrology;
    this.current = new SurfaceDeltaSnapshot(this.worldIdentity, 0, {
      semanticByKey: /* @__PURE__ */ new Map(),
      hydrologyById: /* @__PURE__ */ new Map()
    });
  }
  snapshot() {
    return this.current;
  }
  preview(input) {
    try {
      return Promise.resolve(this.prepareCommit(input));
    } catch (reason) {
      return Promise.reject(reason);
    }
  }
  commit(input) {
    try {
      const prepared = this.prepareCommit(input);
      this.publishPreparedCommit(prepared);
      return Promise.resolve(prepared.commit);
    } catch (reason) {
      return Promise.reject(reason);
    }
  }
  flush() {
    return Promise.resolve();
  }
  prepareCommit(input, ownsInput = false) {
    this.assertTransaction(input);
    if (this.current.effectiveRevision >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("surface delta revision space is exhausted");
    }
    const revision = this.current.effectiveRevision + 1;
    const semanticByKey = /* @__PURE__ */ new Map();
    for (const state of this.current.semanticStates) semanticByKey.set(semanticKeyIdentity(state.key), state);
    const hydrologyById = /* @__PURE__ */ new Map();
    for (const delta of this.current.hydrologyDeltas) hydrologyById.set(delta.featureId, delta);
    const semanticMutations = [...input.semanticMutations].sort((first, second) => compareSemanticKeys(first.key, second.key));
    const hydrologyMutations = [...input.hydrologyMutations].sort((first, second) => first.featureId < second.featureId ? -1 : first.featureId > second.featureId ? 1 : 0);
    const semanticChanges = semanticMutations.map((mutation) => this.applySemanticMutation(
      semanticByKey,
      mutation,
      revision,
      ownsInput
    ));
    const hydrologyChanges = hydrologyMutations.map((mutation) => this.applyHydrologyMutation(
      hydrologyById,
      mutation,
      revision,
      ownsInput
    ));
    this.assertEffectiveHydrologyGraph(
      hydrologyById,
      hydrologyMutations.map((mutation) => mutation.featureId)
    );
    const next = new SurfaceDeltaSnapshot(this.worldIdentity, revision, {
      semanticByKey,
      hydrologyById
    });
    const commit = Object.freeze({
      formatVersion: SURFACE_DELTA_TRANSACTION_FORMAT_VERSION,
      worldIdentity: this.worldIdentity,
      revision,
      transactionId: BigInt(revision),
      semanticChanges: Object.freeze(semanticChanges),
      hydrologyChanges: Object.freeze(hydrologyChanges)
    });
    return Object.freeze({ before: this.current, commit, snapshot: next });
  }
  publishPreparedCommit(prepared) {
    if (prepared.before !== this.current || prepared.snapshot.effectiveRevision !== this.current.effectiveRevision + 1 || prepared.commit.revision !== prepared.snapshot.effectiveRevision || prepared.commit.worldIdentity !== this.worldIdentity || prepared.snapshot.worldIdentity !== this.worldIdentity) {
      throw new Error("prepared surface delta commit no longer follows the current snapshot");
    }
    this.current = prepared.snapshot;
  }
  installSnapshot(effectiveRevision, semanticStates, hydrologyDeltas) {
    assertRevision("surface delta snapshot revision", effectiveRevision);
    const semanticByKey = /* @__PURE__ */ new Map();
    const hydrologyById = /* @__PURE__ */ new Map();
    let maximumRevision = 0;
    for (const state of semanticStates) {
      if (!state || typeof state !== "object") {
        throw new TypeError("persisted surface semantic state is invalid");
      }
      assertCanonicalSemanticKey(this.descriptor, state.key);
      if (!Number.isSafeInteger(state.revision) || state.revision <= 0 || state.revision > effectiveRevision) {
        throw new RangeError("persisted surface semantic revision is invalid");
      }
      const identity = semanticKeyIdentity(state.key);
      if (semanticByKey.has(identity)) {
        throw new Error("persisted surface snapshot contains duplicate semantic keys");
      }
      if (state.delta) {
        const delta = createSparseSemanticDelta(state.delta, semanticCatalogLimits(this.descriptor));
        if (delta.worldIdentity !== this.worldIdentity || delta.key.chunkX !== state.key.chunkX || delta.key.chunkY !== state.key.chunkY || delta.revision !== state.revision) {
          throw new Error("persisted sparse semantic delta does not match its state record");
        }
        assertSemanticDeltaBounds(this.descriptor, delta);
        semanticByKey.set(identity, Object.freeze({
          key: delta.key,
          revision: state.revision,
          delta
        }));
      } else {
        semanticByKey.set(identity, Object.freeze({
          key: Object.freeze({ chunkX: state.key.chunkX, chunkY: state.key.chunkY }),
          revision: state.revision
        }));
      }
      maximumRevision = Math.max(maximumRevision, state.revision);
    }
    for (const input of hydrologyDeltas) {
      const delta = createHydrologyFeatureDelta(input);
      if (delta.worldIdentity !== this.worldIdentity || delta.revision > effectiveRevision) {
        throw new Error("persisted hydrology delta does not match its snapshot");
      }
      if (hydrologyById.has(delta.featureId)) {
        throw new Error("persisted surface snapshot contains duplicate hydrology features");
      }
      hydrologyById.set(delta.featureId, delta);
      maximumRevision = Math.max(maximumRevision, delta.revision);
    }
    if (maximumRevision !== effectiveRevision) {
      throw new Error("persisted surface snapshot revision has no matching committed mutation");
    }
    this.assertEffectiveHydrologyGraph(hydrologyById, [...hydrologyById.keys()]);
    this.current = new SurfaceDeltaSnapshot(this.worldIdentity, effectiveRevision, {
      semanticByKey,
      hydrologyById
    });
  }
  assertTransaction(input) {
    if (!input || typeof input !== "object" || input.worldIdentity !== this.worldIdentity) {
      throw new TypeError("surface delta transaction world identity is invalid");
    }
    if (!Array.isArray(input.semanticMutations) || !Array.isArray(input.hydrologyMutations)) {
      throw new TypeError("surface delta transaction mutation lists are required");
    }
    const mutationCount = input.semanticMutations.length + input.hydrologyMutations.length;
    if (mutationCount <= 0 || mutationCount > MAX_SURFACE_DELTA_TRANSACTION_MUTATIONS) {
      throw new RangeError("surface delta transaction mutation count is outside its fixed budget");
    }
    const semanticKeys = /* @__PURE__ */ new Set();
    for (const mutation of input.semanticMutations) {
      if (!mutation || typeof mutation !== "object" || mutation.operation !== "upsert" && mutation.operation !== "delete") {
        throw new TypeError("surface semantic mutation operation is invalid");
      }
      assertCanonicalSemanticKey(this.descriptor, mutation.key);
      assertRevision("surface semantic expected revision", mutation.expectedRevision);
      const identity = semanticKeyIdentity(mutation.key);
      if (semanticKeys.has(identity)) throw new Error("surface delta transaction contains duplicate semantic chunks");
      semanticKeys.add(identity);
    }
    const featureIds = /* @__PURE__ */ new Set();
    for (const mutation of input.hydrologyMutations) {
      if (!mutation || typeof mutation !== "object" || mutation.operation !== "upsert" && mutation.operation !== "delete") {
        throw new TypeError("surface hydrology mutation operation is invalid");
      }
      assertFeatureId("surface hydrology mutation", mutation.featureId);
      if (mutation.featureKind !== "river" && mutation.featureKind !== "lake") {
        throw new TypeError("surface hydrology mutation kind is invalid");
      }
      assertRevision("surface hydrology expected revision", mutation.expectedRevision);
      if (featureIds.has(mutation.featureId)) {
        throw new Error("surface delta transaction contains duplicate hydrology features");
      }
      featureIds.add(mutation.featureId);
    }
  }
  snapshotTransactionInput(input) {
    this.assertTransaction(input);
    const semanticMutations = input.semanticMutations.map((mutation) => Object.freeze(
      mutation.operation === "upsert" ? {
        operation: mutation.operation,
        key: Object.freeze({ chunkX: mutation.key.chunkX, chunkY: mutation.key.chunkY }),
        expectedRevision: mutation.expectedRevision,
        payload: Object.freeze(ownedSemanticPayload(mutation.payload))
      } : {
        operation: mutation.operation,
        key: Object.freeze({ chunkX: mutation.key.chunkX, chunkY: mutation.key.chunkY }),
        expectedRevision: mutation.expectedRevision
      }
    ));
    const hydrologyMutations = input.hydrologyMutations.map((mutation) => Object.freeze(
      mutation.operation === "upsert" ? {
        operation: mutation.operation,
        featureId: mutation.featureId,
        featureKind: mutation.featureKind,
        expectedRevision: mutation.expectedRevision,
        feature: Object.freeze(ownedHydrologyFeature(mutation.feature))
      } : {
        operation: mutation.operation,
        featureId: mutation.featureId,
        featureKind: mutation.featureKind,
        expectedRevision: mutation.expectedRevision
      }
    ));
    const snapshot = Object.freeze({
      worldIdentity: input.worldIdentity,
      semanticMutations: Object.freeze(semanticMutations),
      hydrologyMutations: Object.freeze(hydrologyMutations)
    });
    surfaceDeltaTransactionResidentBytes(snapshot);
    return snapshot;
  }
  applySemanticMutation(semanticByKey, mutation, revision, ownsInput) {
    const identity = semanticKeyIdentity(mutation.key);
    const current = semanticByKey.get(identity);
    const actualRevision = current?.revision ?? 0;
    if (actualRevision !== mutation.expectedRevision) {
      throw new SurfaceDeltaConflictError("semantic", identity, mutation.expectedRevision, actualRevision);
    }
    const key = Object.freeze({ chunkX: mutation.key.chunkX, chunkY: mutation.key.chunkY });
    if (mutation.operation === "delete") {
      if (!current?.delta) throw new Error("cannot delete an absent semantic delta");
      const state = Object.freeze({ key, revision });
      semanticByKey.set(identity, state);
      return Object.freeze({
        operation: "delete",
        key,
        expectedRevision: mutation.expectedRevision,
        revision
      });
    }
    if (!mutation.payload || typeof mutation.payload !== "object") {
      throw new TypeError("semantic upsert requires a complete sparse delta payload");
    }
    const delta = createSparseSemanticDelta({
      ...ownsInput ? mutation.payload : ownedSemanticPayload(mutation.payload),
      worldIdentity: this.worldIdentity,
      key,
      revision
    }, semanticCatalogLimits(this.descriptor));
    assertSemanticDeltaBounds(this.descriptor, delta);
    if (current?.delta && semanticDeltaContentEqual(current.delta, delta)) {
      throw new Error("semantic upsert does not change authoritative content");
    }
    semanticByKey.set(identity, Object.freeze({ key, revision, delta }));
    return Object.freeze({ operation: "upsert", expectedRevision: mutation.expectedRevision, delta });
  }
  applyHydrologyMutation(hydrologyById, mutation, revision, ownsInput) {
    const currentDelta = hydrologyById.get(mutation.featureId);
    const actualRevision = currentDelta?.revision ?? 0;
    if (actualRevision !== mutation.expectedRevision) {
      throw new SurfaceDeltaConflictError(
        "hydrology",
        mutation.featureId,
        mutation.expectedRevision,
        actualRevision
      );
    }
    const currentFeature = this.resolveEffectiveHydrologyFeature(mutation.featureId, hydrologyById);
    if (mutation.operation === "delete") {
      if (!currentFeature) throw new Error("cannot delete an absent hydrology feature");
      if (currentFeature.kind !== mutation.featureKind) {
        throw new Error("hydrology delete kind does not match the effective feature");
      }
    } else {
      if (!mutation.feature || mutation.feature.featureId !== mutation.featureId || mutation.feature.kind !== mutation.featureKind) {
        throw new Error("hydrology upsert identity or kind does not match its complete feature");
      }
      if (currentFeature && currentFeature.kind !== mutation.featureKind) {
        throw new Error("hydrology feature kind cannot change under a stable identity");
      }
    }
    const delta = createHydrologyFeatureDelta(mutation.operation === "upsert" ? {
      worldIdentity: this.worldIdentity,
      revision,
      featureId: mutation.featureId,
      featureKind: mutation.featureKind,
      operation: "upsert",
      feature: ownsInput ? mutation.feature : ownedHydrologyFeature(mutation.feature)
    } : {
      worldIdentity: this.worldIdentity,
      revision,
      featureId: mutation.featureId,
      featureKind: mutation.featureKind,
      operation: "delete"
    });
    if (currentDelta?.operation === "upsert" && delta.operation === "upsert" && hydrologyFeatureContentEqual(currentDelta.feature, delta.feature)) {
      throw new Error("hydrology upsert does not change authoritative content");
    }
    hydrologyById.set(mutation.featureId, delta);
    return Object.freeze({ expectedRevision: mutation.expectedRevision, delta });
  }
  resolveEffectiveHydrologyFeature(featureId, hydrologyById) {
    const delta = hydrologyById.get(featureId);
    if (delta) return delta.operation === "upsert" ? authoredGraphNode(delta.feature) : void 0;
    const base = this.baseHydrology.resolveFeature(featureId);
    if (base) assertGraphNode(base, featureId);
    return base;
  }
  assertEffectiveHydrologyGraph(hydrologyById, changedFeatureIds) {
    const ids = /* @__PURE__ */ new Set();
    for (const delta of hydrologyById.values()) {
      if (delta.operation === "upsert") ids.add(delta.featureId);
    }
    for (const changedFeatureId of changedFeatureIds) {
      const references = this.baseHydrology.referencesTo(changedFeatureId);
      assertCanonicalReferences(changedFeatureId, references);
      for (const featureId of references) ids.add(featureId);
      if (this.resolveEffectiveHydrologyFeature(changedFeatureId, hydrologyById)) {
        ids.add(changedFeatureId);
      }
    }
    const orderedIds = [...ids].sort();
    for (const featureId of orderedIds) {
      const node = this.resolveEffectiveHydrologyFeature(featureId, hydrologyById);
      if (node) this.assertHydrologyConnections(node, hydrologyById);
    }
    for (const featureId of orderedIds) {
      const node = this.resolveEffectiveHydrologyFeature(featureId, hydrologyById);
      if (node?.kind === "river") this.assertHydrologyOutletAcyclic(featureId, hydrologyById);
    }
  }
  assertHydrologyConnections(node, hydrologyById) {
    if (node.kind === "lake") return;
    if (node.source.kind === "river") {
      const source = this.resolveEffectiveHydrologyFeature(node.source.riverId, hydrologyById);
      if (!source || source.kind !== "river") {
        throw new Error(`hydrology river ${node.featureId} has a missing river source`);
      }
      if (source.outlet.kind !== "river" || source.outlet.riverId !== node.featureId) {
        throw new Error(`hydrology river ${node.featureId} source does not outlet to it`);
      }
      if (source.outletLevel < node.sourceLevel) {
        throw new Error(`hydrology river ${node.featureId} rises above its source river`);
      }
    }
    if (node.outlet.kind === "ocean") {
      if (node.outletLevel < this.descriptor.seaLevel) {
        throw new Error(`hydrology river ${node.featureId} reaches ocean below sea level`);
      }
      return;
    }
    const outletId = node.outlet.kind === "lake" ? node.outlet.bodyId : node.outlet.riverId;
    const outlet = this.resolveEffectiveHydrologyFeature(outletId, hydrologyById);
    if (!outlet || outlet.kind !== node.outlet.kind) {
      throw new Error(`hydrology river ${node.featureId} has a missing or mismatched outlet`);
    }
    const outletLevel = outlet.kind === "lake" ? outlet.level : outlet.sourceLevel;
    if (node.outletLevel < outletLevel) {
      throw new Error(`hydrology river ${node.featureId} rises at its outlet`);
    }
  }
  assertHydrologyOutletAcyclic(startId, hydrologyById) {
    const visited = /* @__PURE__ */ new Set();
    let featureId = startId;
    for (let count = 0; count < MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL; count += 1) {
      if (visited.has(featureId)) throw new Error("effective hydrology outlet graph contains a cycle");
      visited.add(featureId);
      const node = this.resolveEffectiveHydrologyFeature(featureId, hydrologyById);
      if (!node || node.kind !== "river" || node.outlet.kind !== "river") return;
      featureId = node.outlet.riverId;
    }
    throw new RangeError("effective hydrology graph exceeds its fixed traversal budget");
  }
};

// src/world/IndexedDbSurfaceDeltaStore.ts
var INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION = 1;
var DEFAULT_SURFACE_DELTA_DATABASE_NAME = "three-hex-map-surface-deltas-v2";
var SURFACE_DELTA_DATABASE_VERSION = 1;
var META_STORE2 = "surface-meta";
var SEMANTIC_STORE = "surface-semantic";
var HYDROLOGY_STORE = "surface-hydrology";
function semanticRecordKey(worldIdentity, chunkX, chunkY) {
  return JSON.stringify([worldIdentity, chunkX, chunkY]);
}
function hydrologyRecordKey(worldIdentity, featureId) {
  return JSON.stringify([worldIdentity, featureId]);
}
function requestResult3(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(
      request.error ?? new Error("surface delta IndexedDB request failed")
    ), { once: true });
  });
}
function transactionComplete3(transaction) {
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
function asError(reason) {
  return reason instanceof Error ? reason : new Error(String(reason));
}
function assertStoredRevision(name, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
function indexedDbSurfaceDeltaCommitBytes(descriptor, input) {
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
      bytes += mutation.feature.polygon.byteLength;
    }
  }
  if (!Number.isSafeInteger(bytes)) {
    throw new RangeError("durable surface delta transaction bytes exceed safe integers");
  }
  return bytes;
}
var SurfaceDeltaSessionConflictError = class extends Error {
  constructor(expectedRevision, actualRevision) {
    super(`durable surface delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.name = "SurfaceDeltaSessionConflictError";
  }
};
var SurfaceDeltaCommitBackpressureError = class extends Error {
  constructor(requestedBytes, pendingBytes, maximumBytes) {
    super("surface delta commit exceeds the pending durable-write byte budget");
    this.requestedBytes = requestedBytes;
    this.pendingBytes = pendingBytes;
    this.maximumBytes = maximumBytes;
    this.name = "SurfaceDeltaCommitBackpressureError";
  }
};
var SurfaceDeltaSaveBarrierError = class extends Error {
  constructor(errors) {
    super(`surface delta save barrier observed ${errors.length} failed commits`);
    this.errors = errors;
    this.name = "SurfaceDeltaSaveBarrierError";
  }
};
var IndexedDbSurfaceDeltaStore = class _IndexedDbSurfaceDeltaStore extends MemorySurfaceDeltaStore {
  constructor(options) {
    super(options.descriptor, options.baseHydrology);
    this.tail = Promise.resolve();
    this.barrierFailures = [];
    this.nextSequence = 1;
    this.lastSubmittedSequence = 0;
    this.pendingCommits = 0;
    this.pendingCommitBytes = 0;
    this.closing = false;
    this.closed = false;
    this.databaseName = options.databaseName ?? DEFAULT_SURFACE_DELTA_DATABASE_NAME;
    this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
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
  static async open(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("IndexedDB surface delta store options are required");
    }
    const store = new _IndexedDbSurfaceDeltaStore(options);
    try {
      await store.hydrate();
      return store;
    } catch (reason) {
      try {
        (await store.databasePromise)?.close();
      } catch {
      }
      store.closed = true;
      throw reason;
    }
  }
  commit(input) {
    if (this.closing || this.closed) {
      return Promise.reject(new Error("IndexedDbSurfaceDeltaStore has been closed"));
    }
    let snapshot;
    let bytes;
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
    this.tail = operation.then(() => void 0, () => void 0);
    void operation.then(() => {
      this.pendingCommits -= 1;
      this.pendingCommitBytes -= bytes;
    }, (reason) => {
      this.pendingCommits -= 1;
      this.pendingCommitBytes -= bytes;
      this.barrierFailures.push({ sequence, reason: asError(reason) });
    });
    return operation;
  }
  preview(input) {
    if (this.closing || this.closed) {
      return Promise.reject(new Error("IndexedDbSurfaceDeltaStore has been closed"));
    }
    let snapshot;
    try {
      snapshot = this.snapshotTransactionInput(input);
    } catch (reason) {
      return Promise.reject(asError(reason));
    }
    return this.tail.then(() => this.prepareCommit(snapshot, true));
  }
  async flush() {
    const targetSequence = this.lastSubmittedSequence;
    const barrier = this.tail;
    await barrier;
    const observed = this.barrierFailures.filter((failure) => failure.sequence <= targetSequence);
    if (observed.length === 0) return;
    for (let index = this.barrierFailures.length - 1; index >= 0; index -= 1) {
      if (this.barrierFailures[index].sequence <= targetSequence) {
        this.barrierFailures.splice(index, 1);
      }
    }
    if (observed.length === 1) throw observed[0].reason;
    throw new SurfaceDeltaSaveBarrierError(Object.freeze(observed.map((failure) => failure.reason)));
  }
  get stats() {
    return Object.freeze({
      effectiveRevision: this.current.effectiveRevision,
      persistedRevision: this.current.effectiveRevision,
      pendingCommits: this.pendingCommits,
      pendingCommitBytes: this.pendingCommitBytes,
      maximumPendingCommitBytes: this.maxPendingCommitBytes
    });
  }
  async close() {
    if (this.closed) return;
    this.closing = true;
    let failure;
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
    if (failure !== void 0) throw failure;
  }
  async persistCommit(input) {
    const prepared = this.prepareCommit(input, true);
    const database = await this.openDatabase();
    const transaction = database.transaction(
      [META_STORE2, SEMANTIC_STORE, HYDROLOGY_STORE],
      "readwrite"
    );
    const completion = transactionComplete3(transaction);
    try {
      const metaStore = transaction.objectStore(META_STORE2);
      const semanticStore = transaction.objectStore(SEMANTIC_STORE);
      const hydrologyStore = transaction.objectStore(HYDROLOGY_STORE);
      const currentMeta = await requestResult3(
        metaStore.get(this.worldIdentity)
      );
      const actualRevision = this.validateMeta(currentMeta);
      const expectedRevision = this.current.effectiveRevision;
      if (actualRevision !== expectedRevision) {
        throw new SurfaceDeltaSessionConflictError(expectedRevision, actualRevision);
      }
      const limits = semanticCatalogLimits(this.descriptor);
      for (const change of prepared.commit.semanticChanges) {
        const key = change.operation === "upsert" ? change.delta.key : change.key;
        const revision = change.operation === "upsert" ? change.delta.revision : change.revision;
        const record = {
          key: semanticRecordKey(this.worldIdentity, key.chunkX, key.chunkY),
          formatVersion: INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION,
          worldIdentity: this.worldIdentity,
          chunkX: key.chunkX,
          chunkY: key.chunkY,
          revision,
          ...change.operation === "upsert" ? { payload: serializeSparseSemanticDelta(change.delta, limits) } : {}
        };
        semanticStore.put(record);
      }
      for (const change of prepared.commit.hydrologyChanges) {
        const delta = change.delta;
        const record = {
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
      });
      await completion;
    } catch (reason) {
      try {
        transaction.abort();
      } catch {
      }
      await completion.catch(() => void 0);
      throw reason;
    }
    this.publishPreparedCommit(prepared);
    return prepared.commit;
  }
  async hydrate() {
    const database = await this.openDatabase();
    const transaction = database.transaction(
      [META_STORE2, SEMANTIC_STORE, HYDROLOGY_STORE],
      "readonly"
    );
    const completion = transactionComplete3(transaction);
    const metaRequest = transaction.objectStore(META_STORE2).get(this.worldIdentity);
    const semanticRequest = transaction.objectStore(SEMANTIC_STORE).index("worldIdentity").getAll(this.worldIdentity);
    const hydrologyRequest = transaction.objectStore(HYDROLOGY_STORE).index("worldIdentity").getAll(this.worldIdentity);
    const [meta, semanticRecords, hydrologyRecords] = await Promise.all([
      requestResult3(metaRequest),
      requestResult3(semanticRequest),
      requestResult3(hydrologyRequest)
    ]);
    await completion;
    const effectiveRevision = this.validateMeta(meta);
    if (!meta) {
      if (semanticRecords.length !== 0 || hydrologyRecords.length !== 0) {
        throw new Error("surface delta database contains records without an atomic meta revision");
      }
      return;
    }
    const semanticStates = semanticRecords.map((record) => this.loadSemanticRecord(
      record,
      effectiveRevision
    ));
    const hydrologyDeltas = hydrologyRecords.map((record) => this.loadHydrologyRecord(
      record,
      effectiveRevision
    ));
    this.installSnapshot(effectiveRevision, semanticStates, hydrologyDeltas);
  }
  validateMeta(record) {
    if (!record) return 0;
    if (!record || typeof record !== "object" || record.key !== this.worldIdentity || record.worldIdentity !== this.worldIdentity || record.formatVersion !== INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION) {
      throw new TypeError("surface delta IndexedDB meta record is invalid or incompatible");
    }
    assertStoredRevision("surface delta IndexedDB meta revision", record.effectiveRevision);
    if (record.effectiveRevision === 0) {
      throw new RangeError("surface delta IndexedDB must not persist an empty revision zero meta record");
    }
    return record.effectiveRevision;
  }
  loadSemanticRecord(record, effectiveRevision) {
    if (!record || typeof record !== "object" || record.formatVersion !== INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION || record.worldIdentity !== this.worldIdentity || record.key !== semanticRecordKey(this.worldIdentity, record.chunkX, record.chunkY)) {
      throw new TypeError("surface semantic IndexedDB record is invalid or incompatible");
    }
    assertStoredRevision("surface semantic IndexedDB revision", record.revision);
    if (record.revision <= 0 || record.revision > effectiveRevision) {
      throw new RangeError("surface semantic IndexedDB revision is outside its snapshot");
    }
    const key = Object.freeze({ chunkX: record.chunkX, chunkY: record.chunkY });
    if (record.payload === void 0) return Object.freeze({ key, revision: record.revision });
    if (!(record.payload instanceof ArrayBuffer)) {
      throw new TypeError("surface semantic IndexedDB payload must be a binary delta");
    }
    const delta = deserializeSparseSemanticDelta(
      record.payload,
      semanticCatalogLimits(this.descriptor)
    );
    if (delta.worldIdentity !== this.worldIdentity || delta.key.chunkX !== record.chunkX || delta.key.chunkY !== record.chunkY || delta.revision !== record.revision) {
      throw new Error("surface semantic IndexedDB payload does not match its record key");
    }
    return Object.freeze({ key: delta.key, revision: record.revision, delta });
  }
  loadHydrologyRecord(record, effectiveRevision) {
    if (!record || typeof record !== "object" || record.formatVersion !== INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION || record.worldIdentity !== this.worldIdentity || record.key !== hydrologyRecordKey(this.worldIdentity, record.featureId) || !(record.payload instanceof ArrayBuffer)) {
      throw new TypeError("surface hydrology IndexedDB record is invalid or incompatible");
    }
    assertStoredRevision("surface hydrology IndexedDB revision", record.revision);
    if (record.revision <= 0 || record.revision > effectiveRevision) {
      throw new RangeError("surface hydrology IndexedDB revision is outside its snapshot");
    }
    const delta = deserializeHydrologyFeatureDelta(record.payload);
    if (delta.worldIdentity !== this.worldIdentity || delta.featureId !== record.featureId || delta.revision !== record.revision) {
      throw new Error("surface hydrology IndexedDB payload does not match its record key");
    }
    return delta;
  }
  openDatabase() {
    if (this.databasePromise) return this.databasePromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is unavailable for durable surface deltas"));
    }
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, SURFACE_DELTA_DATABASE_VERSION);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("opening surface delta IndexedDB timed out"));
      }, this.openTimeoutMs);
      const finish = (callback, value) => {
        if (settled) {
          value.close();
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };
      const fail = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(asError(reason));
      };
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(META_STORE2)) {
          database.createObjectStore(META_STORE2, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(SEMANTIC_STORE)) {
          database.createObjectStore(SEMANTIC_STORE, { keyPath: "key" }).createIndex("worldIdentity", "worldIdentity", { unique: false });
        }
        if (!database.objectStoreNames.contains(HYDROLOGY_STORE)) {
          database.createObjectStore(HYDROLOGY_STORE, { keyPath: "key" }).createIndex("worldIdentity", "worldIdentity", { unique: false });
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
};

// src/persistence/CheckpointCoordinator.ts
var CHECKPOINT_JOURNAL_FORMAT_VERSION = 1;
var CheckpointConflictError = class extends Error {
  constructor(expectedRevision, actualRevision) {
    super(`checkpoint journal conflict: expected revision ${expectedRevision}, received ${actualRevision}`);
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.name = "CheckpointConflictError";
  }
};
var CheckpointRecoveryError = class extends Error {
  constructor() {
    super(...arguments);
    this.name = "CheckpointRecoveryError";
  }
};
function abortError(message) {
  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
function cloneToken(value) {
  if (value === void 0 || value === null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function cloneJournal(journal) {
  return {
    ...journal,
    participants: journal.participants.map((record) => ({
      ...record,
      ...record.token === void 0 ? {} : { token: cloneToken(record.token) }
    }))
  };
}
function errorMessage(reason) {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}
function assertSafeVersion(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
}
function assertCheckpointJournal(value, worldId) {
  if (!value || typeof value !== "object") throw new TypeError("checkpoint journal must be an object");
  const journal = value;
  if (journal.formatVersion !== CHECKPOINT_JOURNAL_FORMAT_VERSION) {
    throw new TypeError(`unsupported checkpoint journal format ${String(journal.formatVersion)}`);
  }
  if (typeof journal.worldId !== "string" || journal.worldId.trim().length === 0 || worldId !== void 0 && journal.worldId !== worldId) {
    throw new TypeError("checkpoint journal worldId is invalid");
  }
  assertSafeVersion("checkpoint generation", journal.generation);
  assertSafeVersion("checkpoint baseGeneration", journal.baseGeneration);
  assertSafeVersion("checkpoint revision", journal.revision);
  if (journal.baseGeneration > journal.generation) {
    throw new TypeError("checkpoint baseGeneration cannot exceed generation");
  }
  if (typeof journal.sessionId !== "string" || journal.sessionId.trim().length === 0 || !["preparing", "committing", "committed", "aborted"].includes(journal.phase) || !Number.isFinite(journal.createdAt) || !Number.isFinite(journal.updatedAt) || !Array.isArray(journal.participants)) {
    throw new TypeError("checkpoint journal metadata is invalid");
  }
  const ids = /* @__PURE__ */ new Set();
  for (const participant of journal.participants) {
    if (!participant || typeof participant.id !== "string" || participant.id.trim().length === 0 || ids.has(participant.id) || typeof participant.required !== "boolean" || !["pending", "prepared", "committed", "skipped"].includes(participant.state)) {
      throw new TypeError("checkpoint participant record is invalid");
    }
    assertSafeVersion("checkpoint participant version", participant.version);
    if (journal.phase !== "aborted" && participant.required && participant.state === "skipped") {
      throw new TypeError("a required checkpoint participant cannot be skipped");
    }
    ids.add(participant.id);
  }
  if ((journal.phase === "preparing" || journal.phase === "aborted") && journal.participants.some((participant) => participant.state === "committed")) {
    throw new TypeError(`${journal.phase} checkpoint cannot contain committed participants`);
  }
  if (journal.phase === "committing" && journal.participants.some((participant) => participant.state === "pending")) {
    throw new TypeError("a committing checkpoint cannot contain pending participants");
  }
  if (journal.phase === "committed" && journal.participants.some((participant) => participant.state !== "committed" && participant.state !== "skipped")) {
    throw new TypeError("a committed checkpoint must have terminal participant states");
  }
}
var MemoryCheckpointJournalStore = class {
  constructor() {
    this.journals = /* @__PURE__ */ new Map();
    this.disposed = false;
  }
  load(worldId) {
    if (this.disposed) return Promise.reject(new Error("CheckpointJournalStore has been disposed"));
    const journal = this.journals.get(worldId);
    return Promise.resolve(journal ? cloneJournal(journal) : void 0);
  }
  compareAndSet(worldId, expectedRevision, journal) {
    if (this.disposed) return Promise.reject(new Error("CheckpointJournalStore has been disposed"));
    assertCheckpointJournal(journal, worldId);
    const actualRevision = this.journals.get(worldId)?.revision ?? 0;
    if (actualRevision !== expectedRevision) {
      return Promise.reject(new CheckpointConflictError(expectedRevision, actualRevision));
    }
    if (journal.revision !== expectedRevision + 1) {
      return Promise.reject(new RangeError("checkpoint journal revision must advance exactly once"));
    }
    this.journals.set(worldId, cloneJournal(journal));
    return Promise.resolve();
  }
  dispose() {
    this.disposed = true;
  }
};
var JOURNAL_DATABASE_VERSION = 1;
var JOURNAL_OBJECT_STORE = "checkpoints";
function requestResult4(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}
function transactionComplete4(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}
var IndexedDbCheckpointJournalStore = class {
  constructor(options = {}) {
    this.disposed = false;
    this.databaseName = options.databaseName ?? "three-hex-map-checkpoints-v1";
    this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
    if (!this.databaseName.trim()) throw new TypeError("checkpoint databaseName must be a non-empty string");
    if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
      throw new RangeError("checkpoint openTimeoutMs must be positive and finite");
    }
  }
  async load(worldId) {
    if (this.disposed) throw new Error("CheckpointJournalStore has been disposed");
    const database = await this.open();
    const transaction = database.transaction(JOURNAL_OBJECT_STORE, "readonly");
    const journal = await requestResult4(transaction.objectStore(JOURNAL_OBJECT_STORE).get(worldId));
    await transactionComplete4(transaction);
    if (!journal) return void 0;
    assertCheckpointJournal(journal, worldId);
    return cloneJournal(journal);
  }
  async compareAndSet(worldId, expectedRevision, journal) {
    if (this.disposed) throw new Error("CheckpointJournalStore has been disposed");
    assertCheckpointJournal(journal, worldId);
    if (journal.revision !== expectedRevision + 1) {
      throw new RangeError("checkpoint journal revision must advance exactly once");
    }
    const database = await this.open();
    const transaction = database.transaction(JOURNAL_OBJECT_STORE, "readwrite");
    const completion = transactionComplete4(transaction);
    try {
      const store = transaction.objectStore(JOURNAL_OBJECT_STORE);
      const current = await requestResult4(store.get(worldId));
      const actualRevision = current?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        throw new CheckpointConflictError(expectedRevision, actualRevision);
      }
      store.put(cloneJournal(journal));
      await completion;
    } catch (reason) {
      try {
        transaction.abort();
      } catch {
      }
      await completion.catch(() => void 0);
      throw reason;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    void this.databasePromise?.then((database) => database.close(), () => void 0);
  }
  open() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
    this.databasePromise ?? (this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, JOURNAL_DATABASE_VERSION);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Opening the checkpoint journal timed out"));
      }, this.openTimeoutMs);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(JOURNAL_OBJECT_STORE)) {
          request.result.createObjectStore(JOURNAL_OBJECT_STORE, { keyPath: "worldId" });
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
    }));
    return this.databasePromise;
  }
};
function randomSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
var CheckpointCoordinator = class {
  constructor(options) {
    this.participantById = /* @__PURE__ */ new Map();
    this.operation = Promise.resolve();
    this.disposed = false;
    this.running = false;
    this.completedCheckpoints = 0;
    this.recoveredCheckpoints = 0;
    this.abortedCheckpoints = 0;
    this.failedOperations = 0;
    this.latestGeneration = 0;
    this.latestCommittedGeneration = 0;
    if (!options?.worldId?.trim()) throw new TypeError("checkpoint worldId must be a non-empty string");
    if (!Array.isArray(options.participants) || options.participants.length === 0) {
      throw new TypeError("checkpoint participants must be a non-empty array");
    }
    this.worldId = options.worldId;
    this.participants = [...options.participants];
    this.journal = options.journal;
    this.timeoutMs = options.operationTimeoutMs ?? 1e4;
    this.now = options.now ?? Date.now;
    this.sessionId = options.sessionId ?? randomSessionId();
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError("checkpoint operationTimeoutMs must be positive and finite");
    }
    for (const participant of this.participants) {
      if (!participant?.id?.trim() || this.participantById.has(participant.id)) {
        throw new TypeError("checkpoint participant ids must be unique non-empty strings");
      }
      assertSafeVersion("checkpoint participant version", participant.version);
      this.participantById.set(participant.id, participant);
    }
  }
  checkpoint(signal) {
    return this.enqueue(() => this.createCheckpoint(signal));
  }
  recover(signal) {
    return this.enqueue(() => this.recoverLatest(signal));
  }
  get settled() {
    return this.operation;
  }
  get stats() {
    return {
      worldId: this.worldId,
      sessionId: this.sessionId,
      running: this.running,
      completedCheckpoints: this.completedCheckpoints,
      recoveredCheckpoints: this.recoveredCheckpoints,
      abortedCheckpoints: this.abortedCheckpoints,
      failedOperations: this.failedOperations,
      latestGeneration: this.latestGeneration,
      latestCommittedGeneration: this.latestCommittedGeneration
    };
  }
  dispose(disposeJournal = true) {
    if (this.disposed) return;
    this.disposed = true;
    this.activeController?.abort(abortError("CheckpointCoordinator was disposed"));
    if (disposeJournal) void this.operation.finally(() => this.journal.dispose());
  }
  enqueue(task) {
    if (this.disposed) return Promise.reject(new Error("CheckpointCoordinator has been disposed"));
    const result = this.operation.then(task, task);
    this.operation = result.then(() => void 0, () => void 0);
    return result;
  }
  async createCheckpoint(signal) {
    const existing = await this.recoverLatest(signal);
    const baseGeneration = existing?.phase === "committed" ? existing.generation : existing?.baseGeneration ?? 0;
    const previousRevision = existing?.revision ?? 0;
    const timestamp = this.now();
    let journal = {
      formatVersion: CHECKPOINT_JOURNAL_FORMAT_VERSION,
      worldId: this.worldId,
      generation: (existing?.generation ?? 0) + 1,
      baseGeneration,
      revision: previousRevision + 1,
      sessionId: this.sessionId,
      phase: "preparing",
      createdAt: timestamp,
      updatedAt: timestamp,
      participants: this.participants.map((participant) => ({
        id: participant.id,
        version: participant.version,
        required: participant.required ?? true,
        state: "pending"
      }))
    };
    await this.journal.compareAndSet(this.worldId, previousRevision, journal);
    this.latestGeneration = journal.generation;
    journal = await this.resume(journal, signal, true);
    if (journal.phase === "committed") this.completedCheckpoints += 1;
    return journal;
  }
  async recoverLatest(signal) {
    let journal = await this.journal.load(this.worldId);
    if (!journal) return void 0;
    assertCheckpointJournal(journal, this.worldId);
    this.latestGeneration = Math.max(this.latestGeneration, journal.generation);
    this.latestCommittedGeneration = Math.max(
      this.latestCommittedGeneration,
      journal.phase === "committed" ? journal.generation : journal.baseGeneration
    );
    if (journal.phase === "committed") return journal;
    if (journal.phase === "aborted") return this.cleanupAborted(journal, signal);
    if (journal.phase === "preparing") {
      const requiredPending = journal.participants.some((record) => record.state === "pending" && record.required);
      if (requiredPending) {
        journal = await this.persist({ ...journal, phase: "aborted" });
        this.abortedCheckpoints += 1;
        return this.cleanupAborted(journal, signal);
      }
      let changed = false;
      for (const record of journal.participants) {
        if (record.state !== "pending") continue;
        record.state = "skipped";
        record.error = "CheckpointRecoveryError: optional participant did not finish preparing";
        changed = true;
      }
      if (changed) journal = await this.persist(journal);
    }
    const recoveredGeneration = journal.generation;
    journal = await this.resume(journal, signal, false);
    if (journal.phase === "committed") {
      this.recoveredCheckpoints += 1;
      this.latestCommittedGeneration = Math.max(this.latestCommittedGeneration, recoveredGeneration);
    }
    return journal;
  }
  async resume(initial, externalSignal, mayPrepare) {
    this.running = true;
    const controller = new AbortController();
    this.activeController = controller;
    const abort = () => controller.abort(externalSignal?.reason ?? abortError("Checkpoint was aborted"));
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener("abort", abort, { once: true });
    const contextBase = {
      worldId: this.worldId,
      generation: initial.generation,
      startedAt: this.now()
    };
    let journal = initial;
    try {
      if (journal.phase === "preparing") {
        if (!mayPrepare && journal.participants.some((record) => record.state === "pending")) {
          throw new CheckpointRecoveryError("an incomplete prepare phase cannot be reconstructed after restart");
        }
        for (let index = 0; index < journal.participants.length; index += 1) {
          const record = journal.participants[index];
          if (record.state !== "pending") continue;
          const participant = this.requireParticipant(record.id);
          try {
            const token = await this.runParticipant(
              controller,
              contextBase,
              (context) => participant.prepare(context)
            );
            record.token = cloneToken(token);
            record.version = participant.version;
            record.state = "prepared";
            delete record.error;
          } catch (reason) {
            if (record.required) {
              try {
                journal = await this.persist({ ...journal, phase: "aborted" });
                this.abortedCheckpoints += 1;
              } catch {
              }
              throw reason;
            }
            record.state = "skipped";
            record.error = errorMessage(reason);
          }
          try {
            journal = await this.persist(journal);
          } catch (persistReason) {
            let preparedTokenIsDurable;
            try {
              const durable = await this.journal.load(this.worldId);
              const durableRecord = durable?.participants.find((candidate) => candidate.id === record.id);
              preparedTokenIsDurable = Boolean(
                durable && durable.sessionId === journal.sessionId && durable.generation === journal.generation && durable.revision > journal.revision && durableRecord && (durableRecord.state === "prepared" || durableRecord.state === "committed")
              );
            } catch {
              preparedTokenIsDurable = void 0;
            }
            if (record.state === "prepared" && participant.rollback && preparedTokenIsDurable === false) {
              try {
                await this.runParticipant(
                  controller,
                  contextBase,
                  (context) => participant.rollback(
                    context,
                    cloneToken(record.token),
                    record.version
                  )
                );
              } catch (rollbackReason) {
                throw new CheckpointRecoveryError(
                  `failed to persist prepared participant "${record.id}" (${errorMessage(persistReason)}); rollback also failed (${errorMessage(rollbackReason)})`
                );
              }
            }
            throw persistReason;
          }
        }
        journal = await this.persist({ ...journal, phase: "committing" });
      }
      if (journal.phase === "committing") {
        for (let index = 0; index < journal.participants.length; index += 1) {
          let record = journal.participants[index];
          if (record.state === "committed" || record.state === "skipped") continue;
          const participant = this.participantById.get(record.id);
          if (!participant) {
            if (record.required) {
              throw new CheckpointRecoveryError(`checkpoint participant "${record.id}" is unavailable`);
            }
            record.state = "skipped";
            record.error = `CheckpointRecoveryError: optional participant "${record.id}" is unavailable`;
            journal = await this.persist(journal);
            continue;
          }
          if (record.version !== participant.version) {
            if (record.version > participant.version || !participant.migrate) {
              throw new CheckpointRecoveryError(
                `participant "${record.id}" checkpoint version ${record.version} cannot migrate to ${participant.version}`
              );
            }
            record.token = cloneToken(await this.runParticipant(
              controller,
              contextBase,
              (context) => participant.migrate(record.token, record.version, context)
            ));
            record.version = participant.version;
            journal = await this.persist(journal);
            record = journal.participants[index];
          }
          await this.runParticipant(
            controller,
            contextBase,
            (context) => participant.commit(context, cloneToken(record.token))
          );
          record.state = "committed";
          journal = await this.persist(journal);
        }
        journal = await this.persist({ ...journal, phase: "committed" });
        this.latestCommittedGeneration = Math.max(this.latestCommittedGeneration, journal.generation);
      }
      return journal;
    } catch (reason) {
      this.failedOperations += 1;
      throw reason;
    } finally {
      externalSignal?.removeEventListener("abort", abort);
      if (this.activeController === controller) this.activeController = void 0;
      this.running = false;
    }
  }
  async cleanupAborted(initial, externalSignal) {
    this.running = true;
    const controller = new AbortController();
    this.activeController = controller;
    const abort = () => controller.abort(externalSignal?.reason ?? abortError("Checkpoint cleanup was aborted"));
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener("abort", abort, { once: true });
    const contextBase = {
      worldId: this.worldId,
      generation: initial.generation,
      startedAt: this.now()
    };
    let journal = initial;
    try {
      for (let index = 0; index < journal.participants.length; index += 1) {
        const record = journal.participants[index];
        if (record.state === "skipped") continue;
        if (record.state === "pending") {
          record.state = "skipped";
          record.error = "CheckpointRecoveryError: participant prepare did not complete";
          journal = await this.persist(journal);
          continue;
        }
        if (record.state !== "prepared") continue;
        const participant = this.participantById.get(record.id);
        if (participant?.rollback) {
          await this.runParticipant(
            controller,
            contextBase,
            (context) => participant.rollback(context, cloneToken(record.token), record.version)
          );
        }
        record.state = "skipped";
        if (!participant) {
          record.error = `CheckpointRecoveryError: participant "${record.id}" is unavailable for rollback`;
        } else {
          delete record.error;
        }
        delete record.token;
        journal = await this.persist(journal);
      }
      return journal;
    } catch (reason) {
      this.failedOperations += 1;
      throw reason;
    } finally {
      externalSignal?.removeEventListener("abort", abort);
      if (this.activeController === controller) this.activeController = void 0;
      this.running = false;
    }
  }
  requireParticipant(id) {
    const participant = this.participantById.get(id);
    if (!participant) throw new CheckpointRecoveryError(`checkpoint participant "${id}" is unavailable`);
    return participant;
  }
  async persist(journal) {
    const next = {
      ...cloneJournal(journal),
      revision: journal.revision + 1,
      updatedAt: this.now()
    };
    await this.journal.compareAndSet(this.worldId, journal.revision, next);
    return next;
  }
  runParticipant(parent, contextBase, operation) {
    const controller = new AbortController();
    const abort = () => controller.abort(parent.signal.reason ?? abortError("Checkpoint was aborted"));
    if (parent.signal.aborted) abort();
    else parent.signal.addEventListener("abort", abort, { once: true });
    const context = { ...contextBase, signal: controller.signal };
    if (controller.signal.aborted) {
      parent.signal.removeEventListener("abort", abort);
      return Promise.reject(controller.signal.reason ?? abortError("Checkpoint was aborted"));
    }
    let task;
    try {
      task = Promise.resolve(operation(context));
    } catch (reason) {
      task = Promise.reject(reason);
    }
    return this.withTimeout(task, controller).finally(() => {
      parent.signal.removeEventListener("abort", abort);
    });
  }
  withTimeout(task, controller) {
    if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", aborted);
        callback(value);
      };
      const aborted = () => finish(reject, controller.signal.reason ?? abortError("Checkpoint was aborted"));
      timer = setTimeout(() => {
        const error = new Error(`checkpoint participant operation timed out after ${this.timeoutMs}ms`);
        error.name = "TimeoutError";
        controller.abort(error);
        finish(reject, error);
      }, this.timeoutMs);
      controller.signal.addEventListener("abort", aborted, { once: true });
      void task.then((value) => finish(resolve, value), (reason) => finish(reject, reason));
    });
  }
};
function createFlushCheckpointParticipant(id, flush, options = {}) {
  return {
    id,
    version: options.version ?? 1,
    required: options.required,
    prepare: (context) => ({ generation: context.generation }),
    commit: (context) => flush(context)
  };
}

// src/persistence/GenerationCheckpointCoordinator.ts
var GENERATION_CHECKPOINT_FORMAT_VERSION = 1;
function cloneValue(value) {
  if (value === void 0 || value === null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function errorMessage2(reason) {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}
function abortError2(message) {
  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
function stableSnapshotValue(value, context = { ancestors: /* @__PURE__ */ new WeakSet() }) {
  if (value === void 0) return ["undefined"];
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
      return ["set", [...value].map((entry) => stableSnapshotValue(entry, context))];
    }
    if (Array.isArray(value)) return value.map((entry) => stableSnapshotValue(entry, context));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      const name = value.constructor?.name || Object.prototype.toString.call(value);
      throw new TypeError(`checkpoint snapshot contains unsupported ${name} object`);
    }
    const object = value;
    return Object.keys(object).sort().map((key) => [key, stableSnapshotValue(object[key], context)]);
  } finally {
    context.ancestors.delete(value);
  }
}
function legacyStableSnapshotValue(value) {
  if (value === void 0) return ["undefined"];
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
    const object = value;
    return Object.keys(object).sort().map((key) => [key, legacyStableSnapshotValue(object[key])]);
  }
  throw new TypeError(`checkpoint snapshot contains unsupported ${typeof value} value`);
}
function checksumStableValue(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    const value2 = text.charCodeAt(index);
    hash ^= value2 & 255;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= value2 >>> 8;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function checksumCheckpointSnapshot(snapshot) {
  return checksumStableValue(stableSnapshotValue(snapshot));
}
function legacyChecksumCheckpointSnapshot(snapshot) {
  return checksumStableValue(legacyStableSnapshotValue(snapshot));
}
function cloneParticipantRecord(record) {
  return { ...record };
}
function cloneGeneration(generation) {
  return {
    generation: generation.generation,
    saveId: generation.saveId,
    descriptor: cloneValue(generation.descriptor),
    committedAt: generation.committedAt,
    participants: generation.participants.map(cloneParticipantRecord)
  };
}
function cloneManifest(manifest) {
  return {
    ...cloneGeneration(manifest),
    formatVersion: manifest.formatVersion,
    worldId: manifest.worldId,
    revision: manifest.revision,
    ...manifest.previous ? { previous: cloneGeneration(manifest.previous) } : {}
  };
}
function cloneStage(record) {
  return { ...record, snapshot: cloneValue(record.snapshot) };
}
function retainedStageKeys(manifest) {
  const retained = /* @__PURE__ */ new Set();
  for (const generation of [manifest, manifest?.previous]) {
    for (const record of generation?.participants ?? []) {
      if (record.state === "staged" && record.stageKey) retained.add(record.stageKey);
    }
  }
  return retained;
}
function assertManifestStage(stage, manifest, record, allowLegacyChecksum = false) {
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
  if (!stage || stage.key !== record.stageKey || stage.worldId !== manifest.worldId || stage.generation !== manifest.generation || stage.saveId !== manifest.saveId || stage.participantId !== record.id || stage.participantVersion !== record.version || stage.checksum !== record.checksum || !checksumMatches) {
    throw new CheckpointRecoveryError(`checkpoint stage for "${record.id}" is missing or corrupt`);
  }
}
function assertParticipantRecords(records) {
  if (!Array.isArray(records)) throw new TypeError("checkpoint manifest participants must be an array");
  const ids = /* @__PURE__ */ new Set();
  for (const record of records) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim() || ids.has(record.id) || !Number.isSafeInteger(record.version) || record.version < 0 || typeof record.required !== "boolean" || !["staged", "skipped"].includes(record.state) || record.state === "staged" && (typeof record.stageKey !== "string" || typeof record.checksum !== "string") || record.state === "skipped" && record.required) {
      throw new TypeError("checkpoint manifest participant record is invalid");
    }
    ids.add(record.id);
  }
}
function assertGeneration(value) {
  if (!value || typeof value !== "object") throw new TypeError("checkpoint generation must be an object");
  const generation = value;
  if (!Number.isSafeInteger(generation.generation) || generation.generation <= 0 || typeof generation.saveId !== "string" || !generation.saveId.trim() || !Number.isFinite(generation.committedAt)) {
    throw new TypeError("checkpoint generation metadata is invalid");
  }
  assertWorldDescriptor(generation.descriptor);
  assertParticipantRecords(generation.participants);
}
function assertGenerationCheckpointManifest(value, worldId) {
  assertGeneration(value);
  const manifest = value;
  if (manifest.formatVersion !== GENERATION_CHECKPOINT_FORMAT_VERSION || typeof manifest.worldId !== "string" || !manifest.worldId.trim() || worldId !== void 0 && manifest.worldId !== worldId || !Number.isSafeInteger(manifest.revision) || manifest.revision <= 0) {
    throw new TypeError("checkpoint manifest metadata is invalid");
  }
  if (manifest.previous) {
    assertGeneration(manifest.previous);
    if (manifest.previous.generation >= manifest.generation) {
      throw new TypeError("previous checkpoint generation must precede the active generation");
    }
  }
}
var MemoryGenerationCheckpointStore = class {
  constructor() {
    this.manifests = /* @__PURE__ */ new Map();
    this.stages = /* @__PURE__ */ new Map();
    this.disposed = false;
  }
  loadManifest(worldId) {
    this.assertActive();
    const manifest = this.manifests.get(worldId);
    return Promise.resolve(manifest ? cloneManifest(manifest) : void 0);
  }
  putStage(record) {
    this.assertActive();
    if (this.stages.has(record.key)) return Promise.reject(new Error("checkpoint stage key already exists"));
    this.stages.set(record.key, cloneStage(record));
    return Promise.resolve();
  }
  loadStage(key) {
    this.assertActive();
    const record = this.stages.get(key);
    return Promise.resolve(record ? cloneStage(record) : void 0);
  }
  compareAndSetManifest(worldId, expectedRevision, manifest) {
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
        assertManifestStage(this.stages.get(record.stageKey), manifest, record);
      }
    }
    this.manifests.set(worldId, cloneManifest(manifest));
    return Promise.resolve();
  }
  listStages(worldId) {
    this.assertActive();
    return Promise.resolve([...this.stages.values()].filter((record) => record.worldId === worldId).map(cloneStage));
  }
  deleteStages(keys) {
    this.assertActive();
    for (const key of keys) this.stages.delete(key);
    return Promise.resolve();
  }
  collectGarbage(worldId, cutoffCreatedAt) {
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
  dispose() {
    this.disposed = true;
  }
  assertActive() {
    if (this.disposed) throw new Error("GenerationCheckpointStore has been disposed");
  }
};
var MANIFEST_STORE = "manifests";
var STAGING_STORE = "staging";
var GENERATION_DATABASE_VERSION = 1;
function requestResult5(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}
function transactionComplete5(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}
var IndexedDbGenerationCheckpointStore = class {
  constructor(options = {}) {
    this.disposed = false;
    this.databaseName = options.databaseName ?? "three-hex-map-generation-checkpoints-v1";
    this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
    if (!this.databaseName.trim()) throw new TypeError("checkpoint databaseName must be a non-empty string");
    if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
      throw new RangeError("checkpoint openTimeoutMs must be positive and finite");
    }
  }
  async loadManifest(worldId) {
    this.assertActive();
    const database = await this.open();
    const transaction = database.transaction(MANIFEST_STORE, "readonly");
    const manifest = await requestResult5(transaction.objectStore(MANIFEST_STORE).get(worldId));
    await transactionComplete5(transaction);
    if (!manifest) return void 0;
    assertGenerationCheckpointManifest(manifest, worldId);
    return cloneManifest(manifest);
  }
  async putStage(record) {
    this.assertActive();
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readwrite");
    transaction.objectStore(STAGING_STORE).add(cloneStage(record));
    await transactionComplete5(transaction);
  }
  async loadStage(key) {
    this.assertActive();
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readonly");
    const record = await requestResult5(transaction.objectStore(STAGING_STORE).get(key));
    await transactionComplete5(transaction);
    return record ? cloneStage(record) : void 0;
  }
  async compareAndSetManifest(worldId, expectedRevision, manifest) {
    this.assertActive();
    assertGenerationCheckpointManifest(manifest, worldId);
    if (manifest.revision !== expectedRevision + 1) {
      throw new RangeError("checkpoint manifest revision must advance exactly once");
    }
    const database = await this.open();
    const transaction = database.transaction([MANIFEST_STORE, STAGING_STORE], "readwrite");
    const completion = transactionComplete5(transaction);
    try {
      const store = transaction.objectStore(MANIFEST_STORE);
      const staging = transaction.objectStore(STAGING_STORE);
      const current = await requestResult5(store.get(worldId));
      const actualRevision = current?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        throw new CheckpointConflictError(expectedRevision, actualRevision);
      }
      for (const record of manifest.participants) {
        if (record.state !== "staged") continue;
        const stage = await requestResult5(
          staging.get(record.stageKey)
        );
        assertManifestStage(stage, manifest, record);
      }
      store.put(cloneManifest(manifest));
      await completion;
    } catch (reason) {
      try {
        transaction.abort();
      } catch {
      }
      await completion.catch(() => void 0);
      throw reason;
    }
  }
  async listStages(worldId) {
    this.assertActive();
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readonly");
    const records = await requestResult5(
      transaction.objectStore(STAGING_STORE).index("worldId").getAll(worldId)
    );
    await transactionComplete5(transaction);
    return records.map(cloneStage);
  }
  async deleteStages(keys) {
    this.assertActive();
    if (keys.length === 0) return;
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readwrite");
    const store = transaction.objectStore(STAGING_STORE);
    for (const key of keys) store.delete(key);
    await transactionComplete5(transaction);
  }
  async collectGarbage(worldId, cutoffCreatedAt) {
    this.assertActive();
    if (!Number.isFinite(cutoffCreatedAt)) throw new RangeError("checkpoint garbage-collection cutoff must be finite");
    const database = await this.open();
    const transaction = database.transaction([MANIFEST_STORE, STAGING_STORE], "readwrite");
    const completion = transactionComplete5(transaction);
    try {
      const manifestStore = transaction.objectStore(MANIFEST_STORE);
      const staging = transaction.objectStore(STAGING_STORE);
      const manifest = await requestResult5(
        manifestStore.get(worldId)
      );
      if (manifest) assertGenerationCheckpointManifest(manifest, worldId);
      const retained = retainedStageKeys(manifest);
      const stages = await requestResult5(
        staging.index("worldId").getAll(worldId)
      );
      let reclaimed = 0;
      for (const stage of stages) {
        if (retained.has(stage.key) || stage.createdAt > cutoffCreatedAt) continue;
        staging.delete(stage.key);
        reclaimed += 1;
      }
      await completion;
      return reclaimed;
    } catch (reason) {
      try {
        transaction.abort();
      } catch {
      }
      await completion.catch(() => void 0);
      throw reason;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    void this.databasePromise?.then((database) => database.close(), () => void 0);
  }
  assertActive() {
    if (this.disposed) throw new Error("GenerationCheckpointStore has been disposed");
  }
  open() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
    this.databasePromise ?? (this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, GENERATION_DATABASE_VERSION);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Opening the generation checkpoint database timed out"));
      }, this.openTimeoutMs);
      const finish = (callback, value) => {
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
    }));
    return this.databasePromise;
  }
};
function randomSaveId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
var GenerationCheckpointCoordinator = class {
  constructor(options) {
    this.participantById = /* @__PURE__ */ new Map();
    this.operation = Promise.resolve();
    this.disposed = false;
    this.running = false;
    this.completedCheckpoints = 0;
    this.recoveredCheckpoints = 0;
    this.migratedCheckpoints = 0;
    this.failedOperations = 0;
    this.reclaimedStages = 0;
    this.latestGeneration = 0;
    if (!options?.worldId?.trim()) throw new TypeError("checkpoint worldId must be a non-empty string");
    assertWorldDescriptor(options.descriptor);
    if (!Array.isArray(options.participants) || options.participants.length === 0) {
      throw new TypeError("checkpoint participants must be a non-empty array");
    }
    this.worldId = options.worldId;
    this.descriptor = cloneValue(options.descriptor);
    this.participants = [...options.participants];
    this.store = options.store;
    this.timeoutMs = options.operationTimeoutMs ?? 1e4;
    this.orphanGraceMs = options.orphanGraceMs ?? 5 * 6e4;
    this.now = options.now ?? Date.now;
    this.createSaveId = options.createSaveId ?? randomSaveId;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError("checkpoint operationTimeoutMs must be positive and finite");
    }
    if (!Number.isFinite(this.orphanGraceMs) || this.orphanGraceMs < 0) {
      throw new RangeError("checkpoint orphanGraceMs must be non-negative and finite");
    }
    for (const participant of this.participants) {
      if (!participant?.id?.trim() || this.participantById.has(participant.id) || !Number.isSafeInteger(participant.version) || participant.version < 0 || typeof participant.capture !== "function" || typeof participant.restore !== "function") {
        throw new TypeError("generation checkpoint participants are invalid or duplicated");
      }
      this.participantById.set(participant.id, participant);
    }
  }
  checkpoint(signal) {
    return this.enqueue(() => this.createCheckpoint(signal));
  }
  recover(signal) {
    return this.enqueue(() => this.recoverLatest(signal));
  }
  collectGarbage(signal) {
    return this.enqueue(async () => {
      if (signal?.aborted) throw signal.reason ?? abortError2("Checkpoint garbage collection was aborted");
      return this.collectUnreferencedStages(signal);
    });
  }
  get settled() {
    return this.operation;
  }
  get stats() {
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
  dispose(disposeStore = true) {
    if (this.disposed) return;
    this.disposed = true;
    this.activeController?.abort(abortError2("GenerationCheckpointCoordinator was disposed"));
    if (disposeStore) void this.operation.finally(() => this.store.dispose());
  }
  enqueue(task) {
    if (this.disposed) return Promise.reject(new Error("GenerationCheckpointCoordinator has been disposed"));
    const result = this.operation.then(task, task);
    this.operation = result.then(() => void 0, () => void 0);
    return result;
  }
  async createCheckpoint(signal) {
    const existing = await this.store.loadManifest(this.worldId);
    if (existing) {
      assertGenerationCheckpointManifest(existing, this.worldId);
      this.assertDescriptor(existing.descriptor);
    }
    const generation = (existing?.generation ?? 0) + 1;
    const saveId = this.createSaveId();
    if (!saveId.trim()) throw new TypeError("checkpoint saveId must be a non-empty string");
    const controller = this.startOperation(signal);
    const context = {
      worldId: this.worldId,
      generation,
      saveId,
      descriptor: cloneValue(this.descriptor),
      signal: controller.signal,
      startedAt: this.now()
    };
    const stagedKeys = [];
    let publishStarted = false;
    try {
      const captures = await Promise.all(this.participants.map(async (participant) => {
        try {
          const snapshot = await this.runParticipant(controller, () => participant.capture(context));
          const copy = cloneValue(snapshot);
          return { participant, snapshot: copy, checksum: checksumCheckpointSnapshot(copy) };
        } catch (reason) {
          if (participant.required ?? true) throw reason;
          return { participant, error: errorMessage2(reason) };
        }
      }));
      const records = [];
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
        const stage = {
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
        if (!verified || verified.checksum !== capture.checksum || checksumCheckpointSnapshot(verified.snapshot) !== capture.checksum) {
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
      const manifest = {
        formatVersion: GENERATION_CHECKPOINT_FORMAT_VERSION,
        worldId: this.worldId,
        revision: (existing?.revision ?? 0) + 1,
        generation,
        saveId,
        descriptor: cloneValue(this.descriptor),
        committedAt,
        participants: records,
        ...existing ? { previous: cloneGeneration(existing) } : {}
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
        await this.store.deleteStages(stagedKeys).catch(() => void 0);
      } else {
        const published = await this.store.loadManifest(this.worldId).catch(() => void 0);
        if (published?.saveId !== saveId) {
          await this.store.deleteStages(stagedKeys).catch(() => void 0);
        }
      }
      throw reason;
    } finally {
      this.finishOperation(controller, signal);
    }
  }
  async recoverLatest(signal) {
    const manifest = await this.store.loadManifest(this.worldId);
    if (!manifest) {
      await this.collectUnreferencedStages(signal);
      return void 0;
    }
    assertGenerationCheckpointManifest(manifest, this.worldId);
    this.assertDescriptor(manifest.descriptor);
    this.latestGeneration = manifest.generation;
    const controller = this.startOperation(signal);
    let migrated = false;
    try {
      const restores = [];
      for (const record of manifest.participants) {
        if (record.state === "skipped") continue;
        const participant = this.participantById.get(record.id);
        if (!participant) {
          if (record.required) throw new CheckpointRecoveryError(`checkpoint participant "${record.id}" is unavailable`);
          continue;
        }
        const stage = await this.store.loadStage(record.stageKey);
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
            () => participant.migrate(cloneValue(snapshot), record.version, {
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
        if ((participant.required ?? true) && !manifest.participants.some((record) => record.id === participant.id && record.state === "staged")) {
          throw new CheckpointRecoveryError(`required checkpoint participant "${participant.id}" is missing`);
        }
      }
      const context = {
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
  async collectUnreferencedStages(signal) {
    if (signal?.aborted) throw signal.reason ?? abortError2("Checkpoint garbage collection was aborted");
    if (!this.store.collectGarbage) return 0;
    const cutoff = this.now() - this.orphanGraceMs;
    const reclaimed = await this.store.collectGarbage(this.worldId, cutoff);
    this.reclaimedStages += reclaimed;
    return reclaimed;
  }
  assertDescriptor(descriptor) {
    if (serializeWorldDescriptor(descriptor) !== serializeWorldDescriptor(this.descriptor)) {
      throw new CheckpointRecoveryError("checkpoint world descriptor does not match the requested world");
    }
  }
  startOperation(signal) {
    this.running = true;
    const controller = new AbortController();
    this.activeController = controller;
    const abort = () => controller.abort(signal?.reason ?? abortError2("Checkpoint operation was aborted"));
    controller.externalAbort = abort;
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    return controller;
  }
  finishOperation(controller, signal) {
    const abort = controller.externalAbort;
    if (abort) signal?.removeEventListener("abort", abort);
    if (this.activeController === controller) this.activeController = void 0;
    this.running = false;
  }
  async runParticipant(controller, operation) {
    if (controller.signal.aborted) throw controller.signal.reason ?? abortError2("Checkpoint operation was aborted");
    let task;
    try {
      task = Promise.resolve(operation());
    } catch (reason) {
      task = Promise.reject(reason);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", aborted);
        callback(value);
      };
      const aborted = () => finish(reject, controller.signal.reason ?? abortError2("Checkpoint operation was aborted"));
      const timer = setTimeout(() => {
        const error = new Error(`checkpoint participant operation timed out after ${this.timeoutMs}ms`);
        error.name = "TimeoutError";
        controller.abort(error);
        finish(reject, error);
      }, this.timeoutMs);
      controller.signal.addEventListener("abort", aborted, { once: true });
      void task.then((value) => finish(resolve, value), (reason) => finish(reject, reason));
    });
  }
};

// src/persistence/FoundationCheckpointParticipants.ts
function createSimulationGenerationParticipant(runtime) {
  if (!runtime || typeof runtime.createCheckpointSnapshot !== "function" || typeof runtime.restoreCheckpointSnapshot !== "function") {
    throw new TypeError("simulation runtime does not support generation checkpoints");
  }
  return {
    id: "simulation",
    version: 1,
    required: true,
    capture: () => runtime.createCheckpointSnapshot(),
    restore: (_context, snapshot) => runtime.restoreCheckpointSnapshot(snapshot)
  };
}
function createWorldDeltaGenerationParticipant(source, options = {}) {
  if (!source || typeof source.createDeltaCheckpointSnapshot !== "function" || typeof source.restoreDeltaCheckpointSnapshot !== "function") {
    throw new TypeError("world source does not support generation checkpoints");
  }
  return {
    id: "terrain-deltas",
    version: 1,
    required: true,
    capture: () => source.createDeltaCheckpointSnapshot(),
    restore: async (_context, snapshot) => {
      await source.restoreDeltaCheckpointSnapshot(snapshot);
      await options.afterRestore?.(snapshot);
    }
  };
}
export {
  CHECKPOINT_JOURNAL_FORMAT_VERSION,
  CheckpointConflictError,
  CheckpointCoordinator,
  CheckpointRecoveryError,
  GENERATION_CHECKPOINT_FORMAT_VERSION,
  GenerationCheckpointCoordinator,
  INDEXED_DB_SURFACE_DELTA_FORMAT_VERSION,
  IndexedDbCheckpointJournalStore,
  IndexedDbGenerationCheckpointStore,
  IndexedDbSurfaceDeltaStore,
  IndexedDbWorldChunkCache,
  IndexedDbWorldDeltaStore,
  MemoryCheckpointJournalStore,
  MemoryGenerationCheckpointStore,
  MemoryWorldDeltaStore,
  SurfaceDeltaCommitBackpressureError,
  SurfaceDeltaSaveBarrierError,
  SurfaceDeltaSessionConflictError,
  WORLD_DELTA_FORMAT_VERSION,
  WorldDeltaConflictError,
  assertCheckpointJournal,
  assertGenerationCheckpointManifest,
  checksumCheckpointSnapshot,
  clearWorldChunkCache,
  createFlushCheckpointParticipant,
  createSimulationGenerationParticipant,
  createWorldChunkCacheKey,
  createWorldDeltaGenerationParticipant,
  indexedDbSurfaceDeltaCommitBytes,
  normalizeWorldChunkDelta
};
//# sourceMappingURL=persistence.mjs.map
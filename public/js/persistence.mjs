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
var WORLD_GENERATOR_VERSION = 17;

// src/world/WorldStyleProfile.ts
var DEFAULT_WORLD_WATER_STYLE = Object.freeze({
  oceanScale: 1.4,
  oceanLevel: 0.46,
  riverSourceCellSize: 16,
  riverSourcesPerCell: 4,
  riverLength: 24,
  riverWarpScale: 0.08,
  riverWarpAmplitude: 3.75,
  riverBaseRadius: 1.75,
  riverHighFlowRadius: 4,
  riverHighFlowThreshold: 24
});
var RIVER_COURSE_STEP = 8;
var waterRange = (min, max, step) => Object.freeze({ min, max, step });
var WORLD_WATER_STYLE_RANGES = Object.freeze({
  oceanScale: waterRange(0.7, 2.8, 0.05),
  oceanLevel: waterRange(0.32, 0.6, 5e-3),
  riverSourceCellSize: waterRange(8, 32, 1),
  riverSourcesPerCell: waterRange(1, 8, 1),
  riverLength: waterRange(0, 96, RIVER_COURSE_STEP),
  riverWarpScale: waterRange(0.02, 0.12, 1e-3),
  riverWarpAmplitude: waterRange(0, 3.9, 0.05),
  // Disjoint intervals keep every slider combination valid: tributary < main river.
  riverBaseRadius: waterRange(0.5, 2.75, 0.05),
  riverHighFlowRadius: waterRange(3, 6, 0.05),
  riverHighFlowThreshold: waterRange(2, 48, 1)
});
var field = (salt, openScale, toroidalScale, octaves, minimumToroidalCells) => Object.freeze({
  salt,
  openScale,
  toroidalScale,
  octaves,
  minimumToroidalCells
});
var oceanField = (scale) => field(
  374761393,
  35e-4 * scale,
  6e-3 * scale,
  3,
  Math.max(1, Math.round(2 * scale))
);
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
    // This field intentionally stays an order of magnitude broader than
    // terrain detail. It owns continent-scale coastlines, not local relief.
    ocean: oceanField(DEFAULT_WORLD_WATER_STYLE.oceanScale),
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
    boundedEdgeFalloff: 0.58,
    boundedCenterOceanLift: 0.18
  }),
  terrain: Object.freeze({
    seaLevel: 0.43,
    oceanLevel: DEFAULT_WORLD_WATER_STYLE.oceanLevel,
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
  rivers: Object.freeze({
    pageSize: 128,
    maximumCachedPages: 16,
    courseStep: RIVER_COURSE_STEP,
    courseWarpScale: DEFAULT_WORLD_WATER_STYLE.riverWarpScale,
    courseWarpAmplitude: DEFAULT_WORLD_WATER_STYLE.riverWarpAmplitude,
    courseWarpOctaves: 2,
    courseWarpSalt: 461845907,
    sourceCellSize: DEFAULT_WORLD_WATER_STYLE.riverSourceCellSize,
    sourcesPerCell: DEFAULT_WORLD_WATER_STYLE.riverSourcesPerCell,
    sourceSpawnChance: 1,
    sourceMinimumElevation: 0.46,
    sourceMaximumElevation: 0.82,
    sourceElevationTransition: 0.04,
    sourceMinimumMoisture: 0.2,
    sourceMoistureFloor: 0.7,
    minimumCourseLength: 3,
    maximumCourseLength: 72,
    upstreamExtensionSteps: DEFAULT_WORLD_WATER_STYLE.riverLength / RIVER_COURSE_STEP,
    baseCourseRadius: DEFAULT_WORLD_WATER_STYLE.riverBaseRadius,
    highFlowCourseRadius: DEFAULT_WORLD_WATER_STYLE.riverHighFlowRadius,
    highFlowThreshold: DEFAULT_WORLD_WATER_STYLE.riverHighFlowThreshold,
    mouthWideningDistance: 24,
    mouthWidthMultiplier: 1.6,
    potentialOceanWeight: 0.9,
    potentialElevationWeight: 0.08,
    potentialValleyWeight: 0.03,
    potentialMoistureWeight: 0.015,
    potentialJitter: 5e-4,
    sourceSalt: 1013904242,
    flowSalt: 1542469173
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
  if (!profile.fields || !profile.terrain || !profile.relief || !profile.vegetation || !profile.rivers) {
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
    "ocean"
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
    "boundedEdgeFalloff",
    "boundedCenterOceanLift"
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
    "oceanLevel",
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
  if (!Number.isSafeInteger(profile.vegetation.placementSalt)) {
    throw new RangeError("vegetation placement salt must be a safe integer");
  }
  const rivers = profile.rivers;
  for (const name of [
    "pageSize",
    "maximumCachedPages",
    "courseStep",
    "courseWarpOctaves",
    "sourceCellSize",
    "sourcesPerCell",
    "minimumCourseLength",
    "maximumCourseLength",
    "highFlowThreshold"
  ]) {
    if (!Number.isSafeInteger(rivers[name]) || rivers[name] <= 0) {
      throw new RangeError(`rivers.${name} must be a positive safe integer`);
    }
  }
  for (const name of [
    "courseWarpScale",
    "sourceElevationTransition",
    "potentialOceanWeight",
    "potentialElevationWeight",
    "potentialValleyWeight",
    "potentialMoistureWeight",
    "potentialJitter",
    "highFlowCourseRadius",
    "mouthWideningDistance",
    "mouthWidthMultiplier"
  ]) positive(`rivers.${name}`, rivers[name]);
  nonNegative("rivers.courseWarpAmplitude", rivers.courseWarpAmplitude);
  nonNegative("rivers.baseCourseRadius", rivers.baseCourseRadius);
  if (!(rivers.minimumCourseLength < rivers.maximumCourseLength)) {
    throw new RangeError("river course length range must be ordered");
  }
  if (!Number.isSafeInteger(rivers.upstreamExtensionSteps) || rivers.upstreamExtensionSteps < 0 || rivers.upstreamExtensionSteps >= rivers.maximumCourseLength) {
    throw new RangeError("river upstream extension must be a non-negative integer below the course limit");
  }
  if (rivers.mouthWidthMultiplier < 1) {
    throw new RangeError("river mouth width multiplier must be at least one");
  }
  for (const name of [
    "sourceSpawnChance",
    "sourceMinimumElevation",
    "sourceMaximumElevation",
    "sourceMinimumMoisture",
    "sourceMoistureFloor"
  ]) unitInterval(`rivers.${name}`, rivers[name]);
  if (!(rivers.sourceMinimumElevation + rivers.sourceElevationTransition < rivers.sourceMaximumElevation - rivers.sourceElevationTransition)) {
    throw new RangeError("river source elevation range must contain both transition bands");
  }
  if (!(rivers.courseWarpAmplitude < rivers.courseStep / 2)) {
    throw new RangeError("river course warp amplitude must stay below half the course step");
  }
  if (!(rivers.baseCourseRadius < rivers.highFlowCourseRadius) || rivers.highFlowThreshold <= 1) {
    throw new RangeError("river flow width thresholds must be ordered");
  }
  if (!Number.isSafeInteger(rivers.courseStep * rivers.maximumCourseLength)) {
    throw new RangeError("river maximum world reach must be a safe integer");
  }
  if (!Number.isSafeInteger(rivers.courseWarpSalt) || !Number.isSafeInteger(rivers.sourceSalt) || !Number.isSafeInteger(rivers.flowSalt)) {
    throw new RangeError("river salts must be safe integers");
  }
}
assertWorldStyleProfile(WORLD_STYLE_PROFILE);
function assertWorldWaterGenerationStyle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("world water generation style must be an object");
  }
  const style = value;
  for (const name of Object.keys(WORLD_WATER_STYLE_RANGES)) {
    const number = finite(`waterStyle.${name}`, style[name]);
    const { min, max, step } = WORLD_WATER_STYLE_RANGES[name];
    if (number < min || number > max) {
      throw new RangeError(`waterStyle.${name} must be between ${min} and ${max}`);
    }
    if (step >= 1 && (!Number.isSafeInteger(number) || (number - min) % step !== 0)) {
      throw new RangeError(`waterStyle.${name} must be an integer in increments of ${step} from ${min}`);
    }
  }
}
function serializeWorldWaterGenerationStyle(value) {
  assertWorldWaterGenerationStyle(value);
  return JSON.stringify([
    value.oceanScale,
    value.oceanLevel,
    value.riverSourceCellSize,
    value.riverSourcesPerCell,
    value.riverLength,
    value.riverWarpScale,
    value.riverWarpAmplitude,
    value.riverBaseRadius,
    value.riverHighFlowRadius,
    value.riverHighFlowThreshold
  ]);
}
assertWorldWaterGenerationStyle(DEFAULT_WORLD_WATER_STYLE);

// src/world/LandformSampler.ts
var LANDFORM_SEA_LEVEL = WORLD_STYLE_PROFILE.terrain.seaLevel;

// src/world/WorldWaterSampler.ts
var AXIAL_NEIGHBORS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: -1, y: 1 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 1, y: -1 })
]);

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
var WORLD_DESCRIPTOR_FORMAT_VERSION = 3;
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
  assertWorldWaterGenerationStyle(descriptor.waterStyle);
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
    descriptor.height ?? null,
    serializeWorldWaterGenerationStyle(descriptor.waterStyle)
  ]);
}

// src/world/WorldChunkCacheContract.ts
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

// src/world/WorldChunkCache.ts
var DEFAULT_DATABASE_NAME = "three-hex-map-world-cache-v1";
var DATABASE_VERSION = 1;
var CHUNK_STORE = "chunks";
var META_STORE = "meta";
var USAGE_KEY = "usage";
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

// src/world/WorldDeltaContract.ts
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
function assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY) {
  if (typeof worldId !== "string" || worldId.trim().length === 0) {
    throw new TypeError("worldId must be a non-empty string");
  }
  if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
    throw new RangeError("world delta chunk coordinates must be safe integers");
  }
}
function assertWorldDeltaChunkSize(chunkSize) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("world delta chunkSize must be a positive safe integer");
  }
}
function worldDeltaTileBelongsToChunk(x, y, chunkX, chunkY, chunkSize) {
  return Math.floor(x / chunkSize) === chunkX && Math.floor(y / chunkSize) === chunkY;
}
function normalizeWorldChunkDelta(value, worldId, chunkX, chunkY, options) {
  assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
  assertWorldDeltaChunkSize(options.chunkSize);
  const candidate = value;
  if (!candidate || candidate.version !== WORLD_DELTA_FORMAT_VERSION && candidate.version !== LEGACY_WORLD_DELTA_FORMAT_VERSION || candidate.worldId !== worldId || candidate.chunkX !== chunkX || candidate.chunkY !== chunkY || candidate.version === WORLD_DELTA_FORMAT_VERSION && candidate.chunkSize !== options.chunkSize || !Number.isSafeInteger(candidate.revision) || candidate.revision < 1 || !Array.isArray(candidate.entries) || candidate.entries.some((entry) => !entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y) || !worldDeltaTileBelongsToChunk(entry.x, entry.y, chunkX, chunkY, options.chunkSize) || !entry.override || typeof entry.override !== "object" || Array.isArray(entry.override))) {
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

// src/world/WorldDeltaStore.ts
function chunkKey(worldId, chunkX, chunkY) {
  return JSON.stringify([worldId, chunkX, chunkY]);
}
function assertChanges(changes, chunkX, chunkY, options) {
  assertWorldDeltaChunkSize(options.chunkSize);
  if (!Array.isArray(changes)) throw new TypeError("world delta changes must be an array");
  if (options.expectedRevision !== void 0 && (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)) {
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
function mergeChunkDelta(current, worldId, chunkX, chunkY, changes, options) {
  assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
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
    if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
    assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
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
    if (this.disposed) return;
    this.disposed = true;
    this.chunks.clear();
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
      super.dispose();
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
    if (this.disposed) return;
    this.disposed = true;
    this.journals.clear();
  }
};
var JOURNAL_DATABASE_VERSION = 1;
var JOURNAL_OBJECT_STORE = "checkpoints";
function requestResult3(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}
function transactionComplete3(transaction) {
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
    const journal = await requestResult3(transaction.objectStore(JOURNAL_OBJECT_STORE).get(worldId));
    await transactionComplete3(transaction);
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
    const completion = transactionComplete3(transaction);
    try {
      const store = transaction.objectStore(JOURNAL_OBJECT_STORE);
      const current = await requestResult3(store.get(worldId));
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
    if (this.disposed) return;
    this.disposed = true;
    this.manifests.clear();
    this.stages.clear();
  }
  assertActive() {
    if (this.disposed) throw new Error("GenerationCheckpointStore has been disposed");
  }
};
var MANIFEST_STORE = "manifests";
var STAGING_STORE = "staging";
var GENERATION_DATABASE_VERSION = 1;
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
    const manifest = await requestResult4(transaction.objectStore(MANIFEST_STORE).get(worldId));
    await transactionComplete4(transaction);
    if (!manifest) return void 0;
    assertGenerationCheckpointManifest(manifest, worldId);
    return cloneManifest(manifest);
  }
  async putStage(record) {
    this.assertActive();
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readwrite");
    transaction.objectStore(STAGING_STORE).add(cloneStage(record));
    await transactionComplete4(transaction);
  }
  async loadStage(key) {
    this.assertActive();
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readonly");
    const record = await requestResult4(transaction.objectStore(STAGING_STORE).get(key));
    await transactionComplete4(transaction);
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
    const completion = transactionComplete4(transaction);
    try {
      const store = transaction.objectStore(MANIFEST_STORE);
      const staging = transaction.objectStore(STAGING_STORE);
      const current = await requestResult4(store.get(worldId));
      const actualRevision = current?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        throw new CheckpointConflictError(expectedRevision, actualRevision);
      }
      for (const record of manifest.participants) {
        if (record.state !== "staged") continue;
        const stage = await requestResult4(
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
    const records = await requestResult4(
      transaction.objectStore(STAGING_STORE).index("worldId").getAll(worldId)
    );
    await transactionComplete4(transaction);
    return records.map(cloneStage);
  }
  async deleteStages(keys) {
    this.assertActive();
    if (keys.length === 0) return;
    const database = await this.open();
    const transaction = database.transaction(STAGING_STORE, "readwrite");
    const store = transaction.objectStore(STAGING_STORE);
    for (const key of keys) store.delete(key);
    await transactionComplete4(transaction);
  }
  async collectGarbage(worldId, cutoffCreatedAt) {
    this.assertActive();
    if (!Number.isFinite(cutoffCreatedAt)) throw new RangeError("checkpoint garbage-collection cutoff must be finite");
    const database = await this.open();
    const transaction = database.transaction([MANIFEST_STORE, STAGING_STORE], "readwrite");
    const completion = transactionComplete4(transaction);
    try {
      const manifestStore = transaction.objectStore(MANIFEST_STORE);
      const staging = transaction.objectStore(STAGING_STORE);
      const manifest = await requestResult4(
        manifestStore.get(worldId)
      );
      if (manifest) assertGenerationCheckpointManifest(manifest, worldId);
      const retained = retainedStageKeys(manifest);
      const stages = await requestResult4(
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
  IndexedDbCheckpointJournalStore,
  IndexedDbGenerationCheckpointStore,
  IndexedDbWorldChunkCache,
  IndexedDbWorldDeltaStore,
  MemoryCheckpointJournalStore,
  MemoryGenerationCheckpointStore,
  MemoryWorldDeltaStore,
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
  normalizeWorldChunkDelta
};
//# sourceMappingURL=persistence.mjs.map
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
  pageLayers: 128
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
  if (profile.renderChunkSize !== 16 || profile.samplesPerTileInterval !== 4 || profile.gutterTexels !== 1 || profile.influenceRadiusTiles !== 2 || profile.textureLayerSize !== 66 || profile.pageLayers !== 128) {
    throw new RangeError("surface compile profile does not match the frozen profile v1");
  }
}
assertSurfaceCompileProfile(SURFACE_COMPILE_PROFILE);

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
function semanticTileIndex(localX, localY) {
  if (!Number.isInteger(localX) || localX < 0 || localX >= WORLD_SEMANTIC_CHUNK_SIZE || !Number.isInteger(localY) || localY < 0 || localY >= WORLD_SEMANTIC_CHUNK_SIZE) {
    throw new RangeError("semantic tile coordinate is outside its chunk");
  }
  return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
}
function assertCatalogLimits(limits) {
  if (!Number.isInteger(limits.substrateCount) || limits.substrateCount <= 0 || limits.substrateCount > 256 || !Number.isInteger(limits.vegetationProfileCount) || limits.vegetationProfileCount <= 0 || limits.vegetationProfileCount > 256) {
    throw new RangeError("semantic chunk catalog limits must be integers between 1 and 256");
  }
}
function assertLocalBounds(bounds) {
  if (!bounds || !Number.isInteger(bounds.minX) || !Number.isInteger(bounds.minY) || !Number.isInteger(bounds.maxXExclusive) || !Number.isInteger(bounds.maxYExclusive) || bounds.minX < 0 || bounds.minY < 0 || bounds.maxXExclusive > WORLD_SEMANTIC_CHUNK_SIZE || bounds.maxYExclusive > WORLD_SEMANTIC_CHUNK_SIZE || bounds.minX >= bounds.maxXExclusive || bounds.minY >= bounds.maxYExclusive) {
    throw new RangeError("semantic chunk valid bounds are invalid");
  }
}
function tileIsValid(index, bounds) {
  const localX = Math.floor(index / WORLD_SEMANTIC_CHUNK_SIZE);
  const localY = index - localX * WORLD_SEMANTIC_CHUNK_SIZE;
  return localX >= bounds.minX && localX < bounds.maxXExclusive && localY >= bounds.minY && localY < bounds.maxYExclusive;
}
function assertBaseSemanticChunk(chunk, limits) {
  if (!chunk || typeof chunk !== "object" || chunk.formatVersion !== WORLD_CHUNK_FORMAT_VERSION_V2) {
    throw new TypeError("base semantic chunk format version is unsupported");
  }
  assertCatalogLimits(limits);
  if (!chunk.key || !Number.isSafeInteger(chunk.key.chunkX) || !Number.isSafeInteger(chunk.key.chunkY)) {
    throw new RangeError("base semantic chunk key must use safe integers");
  }
  chunkOrigin(chunk.key.chunkX, chunk.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
  if (!Number.isSafeInteger(chunk.revision) || chunk.revision < 0) {
    throw new RangeError("base semantic chunk revision must be a non-negative safe integer");
  }
  assertLocalBounds(chunk.validBounds);
  if (!(chunk.substrateClass instanceof Uint8Array) || chunk.substrateClass.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT || !(chunk.macroHeight instanceof Uint16Array) || chunk.macroHeight.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT || !(chunk.biomeWeights instanceof Uint8Array) || chunk.biomeWeights.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT * BIOME_BASIS_COUNT || !(chunk.climate instanceof Uint8Array) || chunk.climate.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNEL_COUNT || !(chunk.vegetationDensity instanceof Uint8Array) || chunk.vegetationDensity.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT || !(chunk.vegetationProfile instanceof Uint8Array) || chunk.vegetationProfile.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT) {
    throw new TypeError("base semantic chunk arrays do not match the frozen layout");
  }
  for (let tileIndex = 0; tileIndex < BASE_SEMANTIC_CHUNK_TILE_COUNT; tileIndex += 1) {
    const valid = tileIsValid(tileIndex, chunk.validBounds);
    const biomeOffset = tileIndex * BIOME_BASIS_COUNT;
    const climateOffset = tileIndex * CLIMATE_CHANNEL_COUNT;
    if (!valid) {
      if (chunk.substrateClass[tileIndex] !== 0 || chunk.macroHeight[tileIndex] !== 0 || chunk.vegetationDensity[tileIndex] !== 0 || chunk.vegetationProfile[tileIndex] !== 0 || chunk.biomeWeights[biomeOffset] !== 0 || chunk.biomeWeights[biomeOffset + 1] !== 0 || chunk.biomeWeights[biomeOffset + 2] !== 0 || chunk.biomeWeights[biomeOffset + 3] !== 0 || chunk.climate[climateOffset] !== 0 || chunk.climate[climateOffset + 1] !== 0) {
        throw new Error("base semantic chunk contains non-zero data outside valid bounds");
      }
      continue;
    }
    if (chunk.substrateClass[tileIndex] >= limits.substrateCount) {
      throw new RangeError("base semantic chunk substrate index exceeds its catalog");
    }
    if (chunk.vegetationProfile[tileIndex] >= limits.vegetationProfileCount) {
      throw new RangeError("base semantic chunk vegetation profile exceeds its catalog");
    }
    const weightSum = chunk.biomeWeights[biomeOffset] + chunk.biomeWeights[biomeOffset + 1] + chunk.biomeWeights[biomeOffset + 2] + chunk.biomeWeights[biomeOffset + 3];
    if (weightSum !== 255) {
      throw new RangeError("base semantic chunk biome weights must sum to 255");
    }
  }
}
function createBaseSemanticChunk(input, limits) {
  if (!input || typeof input !== "object") throw new TypeError("base semantic chunk input is required");
  const bounds = input.validBounds ?? FULL_LOCAL_BOUNDS;
  const chunk = Object.freeze({
    formatVersion: WORLD_CHUNK_FORMAT_VERSION_V2,
    key: Object.freeze({ chunkX: input.key.chunkX, chunkY: input.key.chunkY }),
    revision: input.revision,
    validBounds: Object.freeze({
      minX: bounds.minX,
      minY: bounds.minY,
      maxXExclusive: bounds.maxXExclusive,
      maxYExclusive: bounds.maxYExclusive
    }),
    substrateClass: input.substrateClass,
    macroHeight: input.macroHeight,
    biomeWeights: input.biomeWeights,
    climate: input.climate,
    vegetationDensity: input.vegetationDensity,
    vegetationProfile: input.vegetationProfile
  });
  assertBaseSemanticChunk(chunk, limits);
  return chunk;
}

// src/world/SemanticCatalogsV2.ts
var CORE_SUBSTRATE_ENTRIES = Object.freeze(["soil", "sand", "rock"]);
var CORE_VEGETATION_PROFILE_ENTRIES = Object.freeze([
  "tropical-palm-mix",
  "temperate-oak-mix",
  "boreal-pine-mix",
  "alpine-scrub-mix"
]);
var CORE_WORLD_SEMANTICS_V2 = Object.freeze({
  seaLevel: 28180,
  substrateCatalog: Object.freeze({
    id: "core/substrate-v1",
    contentHash: "sha256:26c47bb7a026006adb6752e18242a954e9c127fc282b13c98e087030e77aff4e",
    entryCount: CORE_SUBSTRATE_ENTRIES.length
  }),
  biomeBasis: Object.freeze([
    Object.freeze({
      id: "temperate",
      contentHash: "sha256:59c7239eff9fb5f96d39d6acecf201748d5f0582a1b8882806f6c681e9e50668"
    }),
    Object.freeze({
      id: "dry",
      contentHash: "sha256:1c9fdbff28acbfc7950eab9e0823710a42b7a23bd5088ecd648165d84e09f65c"
    }),
    Object.freeze({
      id: "cold",
      contentHash: "sha256:13e616d6a945fd47356aa67c7da81dc27adc935ad88496e1d07ac4a66761d3e5"
    }),
    Object.freeze({
      id: "alpine",
      contentHash: "sha256:ef636273bfe43421e259e6067c48752f85e80c264ea971d963c93e9e6f1723c4"
    })
  ]),
  vegetationCatalog: Object.freeze({
    id: "core/vegetation-v1",
    contentHash: "sha256:d930afdbc24859f54d002bc060ef3075efcb906f975ac10032e699e087677a51",
    entryCount: CORE_VEGETATION_PROFILE_ENTRIES.length
  })
});

// src/helpers/neighbors.ts
var NEIGHBOR_DIRECTIONS = ["NE", "N", "NW", "SW", "S", "SE"];
function getNeighborCoords(x, y, direction) {
  const odd = x % 2 !== 0;
  switch (direction) {
    case "NE":
      return { x: x + 1, y: odd ? y - 1 : y };
    case "N":
      return { x, y: y - 1 };
    case "NW":
      return { x: x - 1, y: odd ? y - 1 : y };
    case "SW":
      return { x: x - 1, y: odd ? y : y + 1 };
    case "S":
      return { x, y: y + 1 };
    case "SE":
      return { x: x + 1, y: odd ? y : y + 1 };
  }
}
function getNeighbors(x, y) {
  return NEIGHBOR_DIRECTIONS.map((direction) => ({ direction, ...getNeighborCoords(x, y, direction) }));
}

// src/world/noise.ts
var UINT32_MAX = 4294967295;
function seedToUint32(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function randomGridValue(seed, x, y) {
  let hash = seed ^ Math.imul(x, 521288629) ^ Math.imul(y, 1597334677);
  hash = Math.imul(hash ^ hash >>> 15, 739982445);
  hash = Math.imul(hash ^ hash >>> 12, 695872825);
  return ((hash ^ hash >>> 15) >>> 0) / UINT32_MAX;
}
var smooth = (value) => value * value * (3 - 2 * value);
var lerp = (from, to, amount) => from + (to - from) * amount;
function positiveModulo(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function valueNoise2D(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const top = lerp(randomGridValue(seed, x0, y0), randomGridValue(seed, x0 + 1, y0), tx);
  const bottom = lerp(randomGridValue(seed, x0, y0 + 1), randomGridValue(seed, x0 + 1, y0 + 1), tx);
  return lerp(top, bottom, ty);
}
function fractalNoise2D(seed, x, y, octaves) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(seed + Math.imul(octave, 2654435769) >>> 0, x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / normalization;
}
function periodicValueNoise2D(seed, x, y, periodX, periodY) {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const sample = (gx, gy) => randomGridValue(
    seed,
    positiveModulo(gx, px),
    positiveModulo(gy, py)
  );
  const top = lerp(sample(x0, y0), sample(x0 + 1, y0), tx);
  const bottom = lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx);
  return lerp(top, bottom, ty);
}
function periodicFractalNoise2D(seed, normalizedX, normalizedY, cellsX, cellsY, octaves) {
  const baseCellsX = Math.max(1, Math.round(cellsX));
  const baseCellsY = Math.max(1, Math.round(cellsY));
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const periodX = baseCellsX * frequency;
    const periodY = baseCellsY * frequency;
    total += periodicValueNoise2D(
      seed + Math.imul(octave, 2654435769) >>> 0,
      normalizedX * periodX,
      normalizedY * periodY,
      periodX,
      periodY
    ) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / normalization;
}
function randomAt(seed, x, y, salt) {
  return randomGridValue((seed ^ salt) >>> 0, x, y);
}

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
var clamp01 = (value) => Math.max(0, Math.min(1, value));
var smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
function assertDimension(name, value) {
  if (!Number.isInteger(value) || value < 2) {
    throw new RangeError(`landform ${name} must be an integer >= 2`);
  }
}
function resolveDomain(domain) {
  const resolved = domain ?? { topology: "infinite" };
  if (resolved.topology !== "infinite") {
    assertDimension("width", resolved.width);
    assertDimension("height", resolved.height);
  }
  return { ...resolved };
}
function composeLandformSample(continent, detail, ridgeNoise, valleyNoise, roughness, moistureNoise, temperatureNoise, forestPatch, lakePatch, latitude, edgeFalloff, profile) {
  const fields = profile.fields;
  const landMask = smoothstep(fields.landMaskStart, fields.landMaskEnd, continent);
  const ridge = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), fields.ridgeExponent) * landMask;
  const valley = Math.pow(1 - Math.abs(valleyNoise * 2 - 1), fields.valleyExponent) * smoothstep(fields.valleyMaskStart, fields.valleyMaskEnd, continent);
  const elevation = continent * fields.continentWeight + detail * fields.detailWeight + ridge * fields.ridgeWeight - valley * fields.valleyWeight + fields.elevationBias - edgeFalloff;
  const moisture = clamp01(moistureNoise * fields.moistureNoiseWeight + valley * fields.moistureValleyWeight - ridge * fields.moistureRidgeWeight);
  const temperature = clamp01(latitude === void 0 ? fields.temperatureNoiseMinimum + temperatureNoise * fields.temperatureNoiseWeight - Math.max(0, elevation - fields.temperatureElevationStart) * fields.temperatureElevationWeight : 1 - latitude * fields.temperatureLatitudeWeight - Math.max(0, elevation - fields.temperatureElevationStart) * fields.temperatureElevationWeight + (temperatureNoise - 0.5) * fields.temperatureLatitudeNoiseWeight);
  return {
    elevation,
    continentalness: continent,
    ridge,
    valley,
    roughness: clamp01(roughness),
    moisture,
    temperature,
    forestPatch: clamp01(forestPatch),
    lakePatch: clamp01(lakePatch)
  };
}
function sampleOpenLandform(seed, x, y, domain, profile) {
  const fields = profile.fields;
  const open = (field2, sampleX, sampleY) => fractalNoise2D(seed ^ field2.salt, sampleX * field2.openScale, sampleY * field2.openScale, field2.octaves);
  const warpX = (open(fields.warpX, x, y) - 0.5) * fields.openWarpAmplitude;
  const warpY = (open(fields.warpY, x, y) - 0.5) * fields.openWarpAmplitude;
  const wx = x + warpX;
  const wy = y + warpY;
  const continent = open(fields.continent, wx, wy);
  const detail = open(fields.detail, wx, wy);
  const ridgeNoise = open(fields.ridge, wx, wy);
  const valleyNoise = open(fields.valley, wx, wy);
  const rough = open(fields.roughness, wx, wy);
  const moisture = open(fields.moisture, wx, wy);
  const temperature = open(fields.temperature, wx, wy);
  const forestPatch = open(fields.forestPatch, wx, wy);
  const lakePatch = open(fields.lakePatch, wx, wy);
  if (domain.topology === "infinite") {
    return composeLandformSample(
      continent,
      detail,
      ridgeNoise,
      valleyNoise,
      rough,
      moisture,
      temperature,
      forestPatch,
      lakePatch,
      void 0,
      0,
      profile
    );
  }
  const nx = x / (domain.width - 1) * 2 - 1;
  const ny = y / (domain.height - 1) * 2 - 1;
  const edge = Math.max(Math.abs(nx), Math.abs(ny));
  return composeLandformSample(
    continent,
    detail,
    ridgeNoise,
    valleyNoise,
    rough,
    moisture,
    temperature,
    forestPatch,
    lakePatch,
    Math.abs(ny),
    Math.pow(edge, fields.boundedEdgePower) * fields.boundedEdgeFalloff,
    profile
  );
}
function sampleToroidalLandform(seed, x, y, domain, profile) {
  const fields = profile.fields;
  const nx = x / domain.width;
  const ny = y / domain.height;
  const periodic = (field2, u, v) => periodicFractalNoise2D(
    seed ^ field2.salt,
    u,
    v,
    Math.max(field2.minimumToroidalCells, Math.round(domain.width * field2.toroidalScale)),
    Math.max(field2.minimumToroidalCells, Math.round(domain.height * field2.toroidalScale)),
    field2.octaves
  );
  const warpX = (periodic(fields.warpX, nx, ny) - 0.5) * fields.toroidalWarpAmplitude;
  const warpY = (periodic(fields.warpY, nx, ny) - 0.5) * fields.toroidalWarpAmplitude;
  const wx = nx + warpX;
  const wy = ny + warpY;
  const continent = periodic(fields.continent, wx, wy);
  const detail = periodic(fields.detail, wx, wy);
  const ridgeNoise = periodic(fields.ridge, wx, wy);
  const valleyNoise = periodic(fields.valley, wx, wy);
  const rough = periodic(fields.roughness, wx, wy);
  const moisture = periodic(fields.moisture, wx, wy);
  const temperature = periodic(fields.temperature, wx, wy);
  const forestPatch = periodic(fields.forestPatch, wx, wy);
  const lakePatch = periodic(fields.lakePatch, wx, wy);
  const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
  return composeLandformSample(
    continent,
    detail,
    ridgeNoise,
    valleyNoise,
    rough,
    moisture,
    temperature,
    forestPatch,
    lakePatch,
    latitude,
    0,
    profile
  );
}
function createLandformSamplerForProfile(options, profile) {
  if (!options || typeof options !== "object") throw new TypeError("landform sampler options are required");
  if (typeof options.seed !== "string" && typeof options.seed !== "number") {
    throw new TypeError("landform seed must be a string or number");
  }
  if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
    throw new RangeError("numeric landform seed must be finite");
  }
  assertWorldStyleProfile(profile);
  const numericSeed = seedToUint32(options.seed);
  const domain = resolveDomain(options.domain);
  return {
    numericSeed,
    domain,
    sample(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new RangeError("landform coordinates must be finite numbers");
      }
      return domain.topology === "toroidal" ? sampleToroidalLandform(numericSeed, x, y, domain, profile) : sampleOpenLandform(numericSeed, x, y, domain, profile);
    }
  };
}

// src/world/DeterministicHash.ts
var UINT32_RANGE = 4294967296;
function mixUint32(hash, word) {
  let mixed = (hash ^ word) >>> 0;
  mixed = Math.imul(mixed ^ mixed >>> 16, 2146121005);
  mixed = Math.imul(mixed ^ mixed >>> 15, 2221713035);
  return (mixed ^ mixed >>> 16) >>> 0;
}
function safeIntegerWords(value) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("deterministic coordinate hash requires safe integers");
  }
  const magnitude = Math.abs(value);
  const high = Math.floor(magnitude / UINT32_RANGE);
  const low = magnitude - high * UINT32_RANGE;
  return [low >>> 0, high >>> 0, value < 0 ? 1 : 0];
}
function hashSafeIntegerCoordinates(seed, x, y, salt = 0) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    throw new RangeError("deterministic coordinate hash seed must be a uint32");
  }
  if (!Number.isInteger(salt) || salt < 0 || salt > 4294967295) {
    throw new RangeError("deterministic coordinate hash salt must be a uint32");
  }
  const xWords = safeIntegerWords(x);
  const yWords = safeIntegerWords(y);
  let hash = mixUint32((seed ^ 2654435769) >>> 0, salt >>> 0);
  hash = mixUint32(hash, xWords[0]);
  hash = mixUint32(hash, xWords[1]);
  hash = mixUint32(hash, xWords[2]);
  hash = mixUint32(hash, yWords[0]);
  hash = mixUint32(hash, yWords[1]);
  return mixUint32(hash, yWords[2]);
}

// src/world/SemanticLandformSampler.ts
var UINT32_MAX2 = 4294967295;
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
var smooth2 = (value) => value * value * (3 - 2 * value);
var lerp2 = (from, to, amount) => from + (to - from) * amount;
var positiveModulo2 = (value, modulus) => (value % modulus + modulus) % modulus;
function assertSafeCoordinates(x, y) {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("semantic landform coordinates must be safe integers");
  }
}
function resolveDomain2(domain) {
  if (!domain || domain.topology === "infinite") return Object.freeze({ topology: "infinite" });
  if (domain.topology === "bounded") {
    throw new TypeError("v2 procedural semantic generation does not support a bounded domain");
  }
  if (!Number.isSafeInteger(domain.width) || !Number.isSafeInteger(domain.height) || domain.width < 32 || domain.height < 32 || domain.width % 32 !== 0 || domain.height % 32 !== 0) {
    throw new RangeError("semantic toroidal dimensions must be safe integer multiples of 32");
  }
  return Object.freeze({ topology: "toroidal", width: domain.width, height: domain.height });
}
function axisPosition(coordinate, offset, cellShift) {
  const cellSize = 2 ** cellShift;
  let local = coordinate % cellSize;
  let cell = (coordinate - local) / cellSize;
  if (local < 0) {
    local += cellSize;
    cell -= 1;
  }
  local += offset;
  const crossedCells = Math.floor(local / cellSize);
  cell += crossedCells;
  local -= crossedCells * cellSize;
  if (!Number.isSafeInteger(cell)) {
    throw new RangeError("semantic noise cell escaped the safe-integer domain");
  }
  return { cell, fraction: smooth2(local / cellSize) };
}
function safeValueNoise2D(seed, x, y, offsetX, offsetY, cellShift, wrapWidth, wrapHeight) {
  const xAxis = axisPosition(x, offsetX, cellShift);
  const yAxis = axisPosition(y, offsetY, cellShift);
  const cellSize = 2 ** cellShift;
  const periodX = wrapWidth === void 0 ? void 0 : wrapWidth / cellSize;
  const periodY = wrapHeight === void 0 ? void 0 : wrapHeight / cellSize;
  if (periodX !== void 0 && !Number.isSafeInteger(periodX) || periodY !== void 0 && !Number.isSafeInteger(periodY)) {
    throw new Error("semantic toroidal noise period is not aligned to its cell size");
  }
  const randomCell = (cellX, cellY) => hashSafeIntegerCoordinates(
    seed,
    periodX === void 0 ? cellX : positiveModulo2(cellX, periodX),
    periodY === void 0 ? cellY : positiveModulo2(cellY, periodY)
  ) / UINT32_MAX2;
  const top = lerp2(
    randomCell(xAxis.cell, yAxis.cell),
    randomCell(xAxis.cell + 1, yAxis.cell),
    xAxis.fraction
  );
  const bottom = lerp2(
    randomCell(xAxis.cell, yAxis.cell + 1),
    randomCell(xAxis.cell + 1, yAxis.cell + 1),
    xAxis.fraction
  );
  return lerp2(top, bottom, yAxis.fraction);
}
function safeFractalNoise2D(seed, x, y, offsetX, offsetY, field2, baseCellShift, wrapWidth, wrapHeight) {
  if (baseCellShift - field2.octaves + 1 < 1) {
    throw new Error("semantic noise requires a minimum two-tile cell at its highest octave");
  }
  let amplitude = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < field2.octaves; octave += 1) {
    total += safeValueNoise2D(
      seed + Math.imul(octave, 2654435769) >>> 0,
      x,
      y,
      offsetX,
      offsetY,
      baseCellShift - octave,
      wrapWidth,
      wrapHeight
    ) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
  }
  return total / normalization;
}
function sampleSemanticLandform(seed, x, y, domain, profile) {
  const fields = profile.fields;
  const wrapWidth = domain.topology === "toroidal" ? domain.width : void 0;
  const wrapHeight = domain.topology === "toroidal" ? domain.height : void 0;
  const sampleX = wrapWidth === void 0 ? x : positiveModulo2(x, wrapWidth);
  const sampleY = wrapHeight === void 0 ? y : positiveModulo2(y, wrapHeight);
  const field2 = (spec, shift, offsetX = 0, offsetY = 0) => safeFractalNoise2D(
    (seed ^ spec.salt) >>> 0,
    sampleX,
    sampleY,
    offsetX,
    offsetY,
    spec,
    shift,
    wrapWidth,
    wrapHeight
  );
  const maximumWarpX = domain.topology === "toroidal" ? Math.min(fields.openWarpAmplitude, fields.toroidalWarpAmplitude * domain.width) : fields.openWarpAmplitude;
  const maximumWarpY = domain.topology === "toroidal" ? Math.min(fields.openWarpAmplitude, fields.toroidalWarpAmplitude * domain.height) : fields.openWarpAmplitude;
  const warpX = (field2(fields.warpX, SEMANTIC_NOISE_BASE_CELL_SHIFTS.warpX) - 0.5) * maximumWarpX;
  const warpY = (field2(fields.warpY, SEMANTIC_NOISE_BASE_CELL_SHIFTS.warpY) - 0.5) * maximumWarpY;
  const sample = (spec, shift) => field2(spec, shift, warpX, warpY);
  const continent = sample(fields.continent, SEMANTIC_NOISE_BASE_CELL_SHIFTS.continent);
  const detail = sample(fields.detail, SEMANTIC_NOISE_BASE_CELL_SHIFTS.detail);
  const ridge = sample(fields.ridge, SEMANTIC_NOISE_BASE_CELL_SHIFTS.ridge);
  const valley = sample(fields.valley, SEMANTIC_NOISE_BASE_CELL_SHIFTS.valley);
  const roughness = sample(fields.roughness, SEMANTIC_NOISE_BASE_CELL_SHIFTS.roughness);
  const moisture = sample(fields.moisture, SEMANTIC_NOISE_BASE_CELL_SHIFTS.moisture);
  const temperature = sample(fields.temperature, SEMANTIC_NOISE_BASE_CELL_SHIFTS.temperature);
  const forestPatch = sample(fields.forestPatch, SEMANTIC_NOISE_BASE_CELL_SHIFTS.forestPatch);
  const lakePatch = sample(fields.lakePatch, SEMANTIC_NOISE_BASE_CELL_SHIFTS.lakePatch);
  const latitude = domain.topology === "toroidal" ? 0.5 + 0.5 * Math.cos(sampleY / domain.height * Math.PI * 2) : void 0;
  return composeLandformSample(
    continent,
    detail,
    ridge,
    valley,
    roughness,
    moisture,
    temperature,
    forestPatch,
    lakePatch,
    latitude,
    0,
    profile
  );
}
function createSemanticLandformSamplerForProfile(options, profile) {
  if (!options || typeof options !== "object") {
    throw new TypeError("semantic landform sampler options are required");
  }
  if (typeof options.seed !== "string" && typeof options.seed !== "number") {
    throw new TypeError("semantic landform seed must be a string or number");
  }
  if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
    throw new RangeError("numeric semantic landform seed must be finite");
  }
  assertWorldStyleProfile(profile);
  const numericSeed = seedToUint32(options.seed);
  const domain = resolveDomain2(options.domain);
  return Object.freeze({
    numericSeed,
    domain,
    sample(x, y) {
      assertSafeCoordinates(x, y);
      return sampleSemanticLandform(numericSeed, x, y, domain, profile);
    }
  });
}

// src/world/WorldSurfaceResolver.ts
var isWater = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
var clamp012 = (value) => Math.max(0, Math.min(1, value));
var smoothstep2 = (edge0, edge1, value) => {
  const t = clamp012((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
var modulo = (value, period) => (value % period + period) % period;
function assertTileCoordinates(x, y) {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("world surface coordinates must be safe integers");
  }
}
function normalizeCoordinates(domain, x, y) {
  assertTileCoordinates(x, y);
  if (domain.topology === "infinite") return { x, y };
  if (domain.topology === "toroidal") {
    return { x: modulo(x, domain.width), y: modulo(y, domain.height) };
  }
  return x >= 0 && x < domain.width && y >= 0 && y < domain.height ? { x, y } : void 0;
}
function classifyTerrain(sample, profile) {
  const terrain = profile.terrain;
  if (sample.elevation < terrain.seaLevel) return "sea" /* sea */;
  if (sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge || sample.elevation > terrain.mountainPeakElevation) return "mountain" /* mountain */;
  if (sample.temperature < terrain.snowTemperature) return "snow" /* snow */;
  if (sample.temperature < terrain.tundraTemperature) return "tundra" /* tundra */;
  if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return "sand" /* sand */;
  return "land" /* land */;
}
function generatedRelief(sample, profile) {
  const relief = profile.relief;
  if (sample.elevation < profile.terrain.seaLevel) return relief.shoreline;
  const landElevation = Math.max(0, sample.elevation - profile.terrain.seaLevel);
  const plain = relief.plainMinimum + landElevation * relief.plainElevationScale + sample.roughness * relief.plainRoughnessScale - sample.valley * relief.valleyDepth;
  const hill = smoothstep2(relief.hillElevationStart, relief.hillElevationEnd, sample.elevation) * relief.hillScale;
  const mountainT = Math.max(
    0,
    (sample.elevation - relief.mountainElevationStart) / relief.mountainElevationSpan
  );
  const mountain = Math.pow(mountainT, relief.mountainPower) * relief.mountainScale + sample.ridge * clamp012(mountainT) * relief.mountainRidgeScale;
  return Math.max(
    relief.shoreline,
    Math.min(relief.mountainMaximum, plain + hill + mountain)
  );
}
function biomeWeightsFor(type, sample, profile, includeSubmergedGround = false) {
  if (isWater(type) && !includeSubmergedGround) {
    return Object.freeze({ temperate: 0, dry: 0, cold: 0, alpine: 0 });
  }
  const materialTerrain = isWater(type) ? "land" /* land */ : type;
  const terrain = profile.terrain;
  const transition = terrain.climateTransition;
  const cold = 1 - smoothstep2(
    terrain.snowTemperature - transition,
    terrain.tundraTemperature + transition,
    sample.temperature
  );
  const dry = smoothstep2(
    terrain.sandTemperature - transition,
    terrain.sandTemperature + transition,
    sample.temperature
  ) * (1 - smoothstep2(
    terrain.sandMoisture - transition,
    terrain.sandMoisture + transition,
    sample.moisture
  ));
  const alpine = clamp012(Math.max(
    materialTerrain === "mountain" /* mountain */ ? 0.7 : 0,
    smoothstep2(
      terrain.mountainElevation - transition,
      terrain.mountainPeakElevation,
      sample.elevation
    ) * (0.45 + sample.ridge * 0.55)
  ));
  const temperate = Math.max(0.02, (1 - cold) * (1 - dry) * (1 - alpine));
  const sum = temperate + dry + cold + alpine;
  return Object.freeze({
    temperate: temperate / sum,
    dry: dry / sum,
    cold: cold / sum,
    alpine: alpine / sum
  });
}
function deriveSemanticBiomeWeights(sample, profile = WORLD_STYLE_PROFILE) {
  return biomeWeightsFor(sample.baseTerrain, sample.landform, profile, true);
}
function biomeFor(type, weights) {
  if (type === "sea" /* sea */ || type === "coastal" /* coastal */) return type === "coastal" /* coastal */ ? "coast" : "ocean";
  const weighted = [
    ["temperate", weights.temperate],
    ["dry", weights.dry],
    ["cold", weights.cold],
    ["alpine", weights.alpine]
  ];
  return weighted.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}
function vegetationDensityFor(type, sample, profile) {
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
  const vegetation = profile.vegetation;
  const moisture = smoothstep2(vegetation.moistureStart, vegetation.moistureFull, sample.moisture);
  const cold = smoothstep2(
    vegetation.temperatureMinimum - vegetation.temperatureTransition,
    vegetation.temperatureMinimum + vegetation.temperatureTransition,
    sample.temperature
  );
  const heat = 1 - smoothstep2(
    vegetation.temperatureMaximum - vegetation.temperatureTransition,
    vegetation.temperatureMaximum + vegetation.temperatureTransition,
    sample.temperature
  );
  const patch = vegetation.patchMinimum + (1 - vegetation.patchMinimum) * smoothstep2(vegetation.patchStart, vegetation.patchFull, sample.forestPatch);
  const slope = clamp012(1 - sample.ridge * vegetation.ridgePenalty - sample.roughness * vegetation.roughnessPenalty);
  return Math.min(
    vegetation.maximumDensity,
    moisture * cold * heat * patch * slope * vegetation.densityScale
  );
}
function lakePotentialFor(type, sample, profile) {
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
  const lakes = profile.lakes;
  const elevation = smoothstep2(lakes.minimumElevation, lakes.minimumElevation + 0.035, sample.elevation) * (1 - smoothstep2(lakes.maximumElevation - 0.05, lakes.maximumElevation, sample.elevation));
  const moisture = smoothstep2(lakes.minimumMoisture, lakes.fullMoisture, sample.moisture);
  const valley = smoothstep2(lakes.valleyStart, lakes.valleyFull, sample.valley);
  const patch = smoothstep2(lakes.patchStart, lakes.patchFull, sample.lakePatch);
  return clamp012(elevation * moisture * valley * patch);
}
function vegetationKindFor(sample, profile) {
  return sample.temperature > profile.vegetation.palmTemperature ? "palm" : sample.temperature < profile.vegetation.piniaTemperature ? "pinia" : "oak";
}
function sampleSurface(sampler, profile, x, y) {
  const landform = Object.freeze({ ...sampler.sample(x, y) });
  const baseTerrain = classifyTerrain(landform, profile);
  const biomeWeights = biomeWeightsFor(baseTerrain, landform, profile);
  const biome = biomeFor(baseTerrain, biomeWeights);
  const vegetationDensity = vegetationDensityFor(baseTerrain, landform, profile);
  const lakePotential = lakePotentialFor(baseTerrain, landform, profile);
  return Object.freeze({
    baseTerrain,
    relief: generatedRelief(landform, profile),
    biome,
    biomeWeights,
    vegetationDensity,
    vegetationKind: vegetationDensity > 0 ? vegetationKindFor(landform, profile) : void 0,
    lakePotential,
    landform
  });
}
function resolveTile(numericSeed, profile, x, y, sampleAt) {
  const sample = sampleAt(x, y);
  if (!sample) throw new RangeError("world surface coordinate is outside the generated domain");
  let type = sample.baseTerrain;
  if (type === "sea" /* sea */) {
    const touchesLand = getNeighbors(x, y).some((neighbor) => {
      const adjacent = sampleAt(neighbor.x, neighbor.y);
      return adjacent !== void 0 && adjacent.baseTerrain !== "sea" /* sea */;
    });
    if (touchesLand) type = "coastal" /* coastal */;
  }
  const tile = { type };
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return Object.freeze(tile);
  const modifiers = [];
  const lakes = profile.lakes;
  const isLakeCandidate = (candidate, tileX, tileY) => Boolean(candidate && candidate.lakePotential >= lakes.minimumPotential && randomAt(numericSeed, tileX, tileY, lakes.placementSalt) < candidate.lakePotential * lakes.placementScale);
  const lakeCandidate = isLakeCandidate(sample, x, y);
  const lakeNeighbors = lakeCandidate ? getNeighbors(x, y).reduce((count, neighbor) => {
    const adjacent = sampleAt(neighbor.x, neighbor.y);
    return count + (isLakeCandidate(adjacent, neighbor.x, neighbor.y) ? 1 : 0);
  }, 0) : 0;
  const lake = lakeCandidate && lakeNeighbors >= lakes.minimumNeighbors;
  if (lake) {
    modifiers.push("lake");
  } else {
    if (sample.landform.elevation > profile.terrain.hillElevation) modifiers.push("hill");
    const forest = sample.vegetationDensity + (randomAt(numericSeed, x, y, profile.vegetation.placementSalt) - 0.5) * profile.vegetation.placementJitter >= profile.vegetation.placementThreshold;
    if (forest) {
      modifiers.push("wood");
      tile.treeModel = `Assets/models/${sample.vegetationKind ?? "oak"}`;
    }
  }
  if (modifiers.length > 0) {
    tile.modifiers = modifiers;
    Object.freeze(modifiers);
  }
  return Object.freeze(tile);
}
var FrozenWorldSurfaceResolver = class {
  constructor(options, samplerFactory = createLandformSamplerForProfile) {
    if (!options || typeof options !== "object") throw new TypeError("world surface resolver options are required");
    this.seed = String(options.seed);
    this.profile = options.profile ?? WORLD_STYLE_PROFILE;
    this.sampler = samplerFactory({ seed: options.seed, domain: options.domain }, this.profile);
    this.domain = Object.freeze({ ...this.sampler.domain });
  }
  sampleGenerated(x, y) {
    const point = normalizeCoordinates(this.domain, x, y);
    if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
    return sampleSurface(this.sampler, this.profile, point.x, point.y);
  }
  resolveGeneratedTile(x, y) {
    const point = normalizeCoordinates(this.domain, x, y);
    if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
    return resolveTile(
      this.sampler.numericSeed,
      this.profile,
      point.x,
      point.y,
      (sampleX, sampleY) => {
        const normalized = normalizeCoordinates(this.domain, sampleX, sampleY);
        return normalized ? sampleSurface(this.sampler, this.profile, normalized.x, normalized.y) : void 0;
      }
    );
  }
  createWindow() {
    return new WorldSurfaceResolverWindow(this, this.sampler.numericSeed);
  }
};
var WorldSurfaceResolverWindow = class {
  constructor(resolver, numericSeed) {
    this.resolver = resolver;
    this.numericSeed = numericSeed;
    this.samples = /* @__PURE__ */ new Map();
    this.tiles = /* @__PURE__ */ new Map();
  }
  sampleGenerated(x, y) {
    const point = normalizeCoordinates(this.resolver.domain, x, y);
    if (!point) return void 0;
    const key = `${point.x},${point.y}`;
    let sample = this.samples.get(key);
    if (!sample) {
      sample = this.resolver.sampleGenerated(point.x, point.y);
      this.samples.set(key, sample);
    }
    return sample;
  }
  resolveGeneratedTile(x, y) {
    const point = normalizeCoordinates(this.resolver.domain, x, y);
    if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
    const key = `${point.x},${point.y}`;
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = resolveTile(
        this.numericSeed,
        this.resolver.profile,
        point.x,
        point.y,
        (sampleX, sampleY) => this.sampleGenerated(sampleX, sampleY)
      );
      this.tiles.set(key, tile);
    }
    return tile;
  }
  clear() {
    this.samples.clear();
    this.tiles.clear();
  }
};
function createSemanticWorldSurfaceResolver(options) {
  return new FrozenWorldSurfaceResolver(options, createSemanticLandformSamplerForProfile);
}

// src/world/generateBaseSemanticChunk.ts
var clamp013 = (value) => Math.max(0, Math.min(1, value));
function quantizeUnitToUint16(value) {
  return Math.floor(clamp013(value) * 65535 + 0.5);
}
function quantizeUnitToUint8(value) {
  return Math.floor(clamp013(value) * 255 + 0.5);
}
function quantizeBiomeWeights(weights) {
  const values = [weights.temperate, weights.dry, weights.cold, weights.alpine];
  const sum = values.reduce((total, value) => total + Math.max(0, value), 0);
  if (!Number.isFinite(sum) || sum <= 0) throw new Error("semantic biome weights are not normalizable");
  const scaled = values.map((value) => Math.max(0, value) / sum * 255);
  const quantized = scaled.map(Math.floor);
  const remainderUnits = 255 - quantized.reduce((total, value) => total + value, 0);
  const order = scaled.map((value, index) => ({ index, fraction: value - quantized[index] })).sort((first, second) => second.fraction - first.fraction || first.index - second.index);
  for (let index = 0; index < remainderUnits; index += 1) quantized[order[index].index] += 1;
  const quantizedSum = quantized.reduce((total, value) => total + value, 0);
  if (quantizedSum !== 255) throw new Error("semantic biome weight quantization did not conserve 255");
  return [quantized[0], quantized[1], quantized[2], quantized[3]];
}
function substrateFor(sample) {
  const landform = sample.landform;
  if (sample.baseTerrain === "mountain" /* mountain */ || landform.ridge >= WORLD_STYLE_PROFILE.terrain.mountainRidge && landform.roughness >= 0.55) {
    return 2 /* Rock */;
  }
  if (landform.temperature >= WORLD_STYLE_PROFILE.terrain.sandTemperature && landform.moisture < WORLD_STYLE_PROFILE.terrain.sandMoisture) {
    return 1 /* Sand */;
  }
  return 0 /* Soil */;
}
function vegetationProfileFor(sample) {
  if (sample.baseTerrain === "mountain" /* mountain */ || sample.landform.elevation >= WORLD_STYLE_PROFILE.terrain.mountainElevation) {
    return 3 /* Alpine */;
  }
  if (sample.landform.temperature > WORLD_STYLE_PROFILE.vegetation.palmTemperature) {
    return 0 /* Tropical */;
  }
  if (sample.landform.temperature < WORLD_STYLE_PROFILE.vegetation.piniaTemperature) {
    return 2 /* Boreal */;
  }
  return 1 /* Temperate */;
}
function assertCoreDescriptor(descriptor) {
  assertWorldDescriptorV2(descriptor);
  if (descriptor.sourceKind === "static") {
    throw new TypeError("procedural semantic generation cannot consume a static descriptor");
  }
  if (descriptor.seaLevel !== quantizeUnitToUint16(WORLD_STYLE_PROFILE.terrain.seaLevel) || descriptor.substrateCatalog.id !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.id || descriptor.substrateCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.contentHash || descriptor.substrateCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.entryCount || descriptor.vegetationCatalog.id !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.id || descriptor.vegetationCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.contentHash || descriptor.vegetationCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.entryCount || descriptor.biomeBasis.some((basis, index) => basis.id !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].id || basis.contentHash !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].contentHash)) {
    throw new TypeError("procedural semantic generator does not support the descriptor catalogs or sea level");
  }
}
function generateWithResolver(descriptor, resolver, chunkX, chunkY) {
  const origin = chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
  if (descriptor.sourceKind === "procedural-toroidal") {
    const chunksX = descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
    const chunksY = descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
    if (chunkX < 0 || chunkX >= chunksX || chunkY < 0 || chunkY >= chunksY) {
      throw new RangeError("toroidal semantic chunk key must be canonical and inside the world");
    }
  }
  const substrateClass = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
  const climate = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2);
  const vegetationDensity = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  const vegetationProfile = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
    for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
      const tileIndex = semanticTileIndex(localX, localY);
      const sample = resolver.sampleGenerated(origin.x + localX, origin.y + localY);
      substrateClass[tileIndex] = substrateFor(sample);
      macroHeight[tileIndex] = quantizeUnitToUint16(sample.landform.elevation);
      biomeWeights.set(quantizeBiomeWeights(deriveSemanticBiomeWeights(sample)), tileIndex * 4);
      climate[tileIndex * 2] = quantizeUnitToUint8(sample.landform.temperature);
      climate[tileIndex * 2 + 1] = quantizeUnitToUint8(sample.landform.moisture);
      vegetationDensity[tileIndex] = quantizeUnitToUint8(sample.vegetationDensity);
      vegetationProfile[tileIndex] = vegetationProfileFor(sample);
    }
  }
  return createBaseSemanticChunk({
    key: { chunkX, chunkY },
    revision: 0,
    substrateClass,
    macroHeight,
    biomeWeights,
    climate,
    vegetationDensity,
    vegetationProfile
  }, {
    substrateCount: descriptor.substrateCatalog.entryCount,
    vegetationProfileCount: descriptor.vegetationCatalog.entryCount
  });
}
function createBaseSemanticChunkGenerator(descriptor) {
  assertCoreDescriptor(descriptor);
  const resolver = createSemanticWorldSurfaceResolver({
    seed: descriptor.seed,
    domain: descriptor.sourceKind === "procedural-toroidal" ? { topology: "toroidal", width: descriptor.width, height: descriptor.height } : { topology: "infinite" }
  });
  return Object.freeze({
    descriptor,
    identity: serializeWorldDescriptorV2(descriptor),
    generate(chunkX, chunkY) {
      return generateWithResolver(descriptor, resolver, chunkX, chunkY);
    }
  });
}

// src/world/SurfaceWorkerProtocol.ts
var SURFACE_WORKER_PROTOCOL_VERSION = 3;
function assertGenerateSemanticChunkWorkerRequest(value) {
  if (!value || typeof value !== "object") throw new TypeError("surface worker request must be an object");
  const request = value;
  if (request.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION || request.generatorVersion !== WORLD_GENERATOR_VERSION_V2 || !Number.isSafeInteger(request.requestId) || request.requestId <= 0 || request.type !== "generateSemanticChunk") {
    throw new TypeError("surface worker request envelope is invalid or unsupported");
  }
  const descriptor = request.descriptor;
  assertWorldDescriptorV2(descriptor);
  if (descriptor.sourceKind === "static") {
    throw new TypeError("generateSemanticChunk requires a procedural world descriptor");
  }
  if (!request.key || !Number.isSafeInteger(request.key.chunkX) || !Number.isSafeInteger(request.key.chunkY)) {
    throw new RangeError("surface worker semantic chunk key must use safe integers");
  }
  chunkOrigin(request.key.chunkX, request.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
}
function semanticChunkTransferables(chunk) {
  const buffers = [
    chunk.substrateClass.buffer,
    chunk.macroHeight.buffer,
    chunk.biomeWeights.buffer,
    chunk.climate.buffer,
    chunk.vegetationDensity.buffer,
    chunk.vegetationProfile.buffer
  ];
  const unique = /* @__PURE__ */ new Set();
  for (const buffer of buffers) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw new TypeError("surface worker semantic arrays must own transferable ArrayBuffers");
    }
    unique.add(buffer);
  }
  return [...unique];
}
function serializeSurfaceWorkerError(reason) {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  return Object.freeze({
    name: error.name,
    message: error.message,
    ...error.stack ? { stack: error.stack } : {}
  });
}

// src/world/surface.worker.ts
var scope = globalThis;
var semanticGenerator;
function generatorFor(request) {
  const identity = serializeWorldDescriptorV2(request.descriptor);
  if (!semanticGenerator || semanticGenerator.identity !== identity) {
    semanticGenerator = createBaseSemanticChunkGenerator(request.descriptor);
  }
  return semanticGenerator;
}
function recoverRequestId(value) {
  if (!value || typeof value !== "object") return null;
  const requestId = value.requestId;
  return Number.isSafeInteger(requestId) && requestId > 0 ? requestId : null;
}
function recoverRequestType(value) {
  if (!value || typeof value !== "object") return null;
  return value.type === "generateSemanticChunk" ? "generateSemanticChunk" : null;
}
scope.addEventListener("message", (event) => {
  try {
    assertGenerateSemanticChunkWorkerRequest(event.data);
    const request = event.data;
    const chunk = generatorFor(request).generate(request.key.chunkX, request.key.chunkY);
    scope.postMessage({
      protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
      generatorVersion: WORLD_GENERATOR_VERSION_V2,
      requestId: request.requestId,
      type: "generateSemanticChunkResult",
      chunk
    }, semanticChunkTransferables(chunk));
  } catch (reason) {
    scope.postMessage({
      protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
      generatorVersion: WORLD_GENERATOR_VERSION_V2,
      requestId: recoverRequestId(event.data),
      type: "surfaceWorkerError",
      requestType: recoverRequestType(event.data),
      error: serializeSurfaceWorkerError(reason)
    });
  }
});
//# sourceMappingURL=surface.worker.mjs.map
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
function surfaceInfluenceRadiusWorld(hexSize) {
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("surface influence radius requires a positive finite hex size");
  }
  return SURFACE_COMPILE_PROFILE.influenceRadiusTiles * hexSize;
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
function assertCoreWorldSemanticsV2(semantics) {
  if (!semantics || typeof semantics !== "object" || semantics.seaLevel !== CORE_WORLD_SEMANTICS_V2.seaLevel || semantics.substrateCatalog.id !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.id || semantics.substrateCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.contentHash || semantics.substrateCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.entryCount || semantics.vegetationCatalog.id !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.id || semantics.vegetationCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.contentHash || semantics.vegetationCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.entryCount || !Array.isArray(semantics.biomeBasis) || semantics.biomeBasis.length !== 4 || semantics.biomeBasis.some((basis, index) => basis.id !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].id || basis.contentHash !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].contentHash)) {
    throw new TypeError("world semantics do not match the frozen core v2 catalogs or sea level");
  }
}

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
  assertCoreWorldSemanticsV2(descriptor);
  if (descriptor.seaLevel !== quantizeUnitToUint16(WORLD_STYLE_PROFILE.terrain.seaLevel)) {
    throw new TypeError("procedural semantic generator sea level does not match its style profile");
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
    },
    sampleMacroHeight(tileX, tileY) {
      return quantizeUnitToUint16(resolver.sampleGenerated(tileX, tileY).landform.elevation);
    }
  });
}

// src/world/CoordinatePairMap.ts
var CoordinatePairMap = class {
  constructor() {
    this.columns = /* @__PURE__ */ new Map();
    this.entryCount = 0;
  }
  get size() {
    return this.entryCount;
  }
  get(x, y) {
    return this.columns.get(x)?.get(y);
  }
  has(x, y) {
    return this.columns.get(x)?.has(y) ?? false;
  }
  set(x, y, value) {
    let column = this.columns.get(x);
    if (!column) {
      column = /* @__PURE__ */ new Map();
      this.columns.set(x, column);
    }
    if (!column.has(y)) this.entryCount += 1;
    column.set(y, value);
    return this;
  }
  delete(x, y) {
    const column = this.columns.get(x);
    if (!column || !column.delete(y)) return false;
    this.entryCount -= 1;
    if (column.size === 0) this.columns.delete(x);
    return true;
  }
  clear() {
    this.columns.clear();
    this.entryCount = 0;
  }
  *values() {
    for (const column of this.columns.values()) yield* column.values();
  }
  *entries() {
    for (const [x, column] of this.columns) {
      for (const [y, value] of column) yield [x, y, value];
    }
  }
};

// src/helpers/topology.ts
function positiveModulo3(value, modulus) {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
    throw new RangeError("positiveModulo requires a finite value and a positive finite modulus");
  }
  return (value % modulus + modulus) % modulus;
}

// src/world/InfiniteDrainageBasins.ts
var INFINITE_DRAINAGE_BASIN_SPAN_TILES = 512;
var INFINITE_DRAINAGE_SITE_JITTER_STEP_TILES = 8;
var INFINITE_DRAINAGE_SITE_JITTER_STEPS = 8;
var INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS = 1;
var INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS = 2;
var SITE_X_SALT = 1757159915;
var SITE_Y_SALT = 48610963;
var JITTER_RANGE = INFINITE_DRAINAGE_SITE_JITTER_STEPS * 2 + 1;
function assertSafeCoordinate(name, value) {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}
function checkedCellOrigin(cell) {
  assertSafeCoordinate("drainage basin cell", cell);
  const origin = cell * INFINITE_DRAINAGE_BASIN_SPAN_TILES;
  if (!Number.isSafeInteger(origin)) {
    throw new RangeError("drainage basin cell origin exceeds the safe tile range");
  }
  return origin;
}
function compareInfiniteDrainageBasinKeys(first, second) {
  return first.cellX - second.cellX || first.cellY - second.cellY;
}
function columnStagger(column) {
  return positiveModulo3(column, 2) === 0 ? 0.5 : 0;
}
function infiniteDrainageSiteDistanceSquared(site, tileX, tileY) {
  const deltaX = site.tileX - tileX;
  const deltaY = site.tileY - tileY + columnStagger(site.tileX) - columnStagger(tileX);
  const worldX = 1.5 * deltaX;
  const worldZ = Math.sqrt(3) * deltaY;
  return worldX * worldX + worldZ * worldZ;
}
var InfiniteDrainageBasinResolver = class {
  constructor(seed) {
    if (typeof seed !== "string" && typeof seed !== "number") {
      throw new TypeError("infinite drainage basin seed must be a string or number");
    }
    if (typeof seed === "number" && !Number.isFinite(seed)) {
      throw new RangeError("numeric infinite drainage basin seed must be finite");
    }
    this.seed = String(seed);
    this.numericSeed = seedToUint32(seed);
  }
  siteAt(cellX, cellY) {
    const originX = checkedCellOrigin(cellX);
    const originY = checkedCellOrigin(cellY);
    const center = INFINITE_DRAINAGE_BASIN_SPAN_TILES / 2;
    const jitterX = (hashSafeIntegerCoordinates(this.numericSeed, cellX, cellY, SITE_X_SALT) % JITTER_RANGE - INFINITE_DRAINAGE_SITE_JITTER_STEPS) * INFINITE_DRAINAGE_SITE_JITTER_STEP_TILES;
    const jitterY = (hashSafeIntegerCoordinates(this.numericSeed, cellX, cellY, SITE_Y_SALT) % JITTER_RANGE - INFINITE_DRAINAGE_SITE_JITTER_STEPS) * INFINITE_DRAINAGE_SITE_JITTER_STEP_TILES;
    const tileX = originX + center + jitterX;
    const tileY = originY + center + jitterY;
    if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
      throw new RangeError("infinite drainage basin site exceeds the safe tile range");
    }
    return Object.freeze({ cellX, cellY, tileX, tileY });
  }
  candidateSites(tileX, tileY) {
    assertSafeCoordinate("infinite drainage tile x", tileX);
    assertSafeCoordinate("infinite drainage tile y", tileY);
    const homeCellX = Math.floor(tileX / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
    const homeCellY = Math.floor(tileY / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
    const sites = [];
    for (let cellX = homeCellX - INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS; cellX <= homeCellX + INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS; cellX += 1) {
      for (let cellY = homeCellY - INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS; cellY <= homeCellY + INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS; cellY += 1) {
        sites.push(this.siteAt(cellX, cellY));
      }
    }
    return Object.freeze(sites);
  }
  resolve(tileX, tileY) {
    const sites = this.candidateSites(tileX, tileY);
    let best = sites[0];
    let bestDistance = infiniteDrainageSiteDistanceSquared(best, tileX, tileY);
    for (let index = 1; index < sites.length; index += 1) {
      const candidate = sites[index];
      const distance = infiniteDrainageSiteDistanceSquared(candidate, tileX, tileY);
      if (distance < bestDistance || distance === bestDistance && compareInfiniteDrainageBasinKeys(candidate, best) < 0) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }
  // A 128x128 region lies wholly inside one aligned 512x512 basin cell. Its
  // possible owning sites are one cell away; enumerating each site's complete
  // Voronoi support extends the terrain dependency window to a fixed radius
  // of two cells, independent of loaded neighbors or request order.
  dependencyBoundsForRegion(regionX, regionY) {
    assertSafeCoordinate("hydrology region x", regionX);
    assertSafeCoordinate("hydrology region y", regionY);
    const regionOriginX = regionX * HYDROLOGY_REGION_SIZE;
    const regionOriginY = regionY * HYDROLOGY_REGION_SIZE;
    if (!Number.isSafeInteger(regionOriginX) || !Number.isSafeInteger(regionOriginY)) {
      throw new RangeError("hydrology region origin exceeds the safe tile range");
    }
    const homeCellX = Math.floor(regionOriginX / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
    const homeCellY = Math.floor(regionOriginY / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
    const minimumCellX = homeCellX - INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS;
    const minimumCellY = homeCellY - INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS;
    const maximumCellX = homeCellX + INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS + 1;
    const maximumCellY = homeCellY + INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS + 1;
    return Object.freeze({
      minX: checkedCellOrigin(minimumCellX),
      minY: checkedCellOrigin(minimumCellY),
      maxXExclusive: checkedCellOrigin(maximumCellX),
      maxYExclusive: checkedCellOrigin(maximumCellY)
    });
  }
};
function assertInfiniteDrainagePartitionContract() {
  if (INFINITE_DRAINAGE_BASIN_SPAN_TILES % HYDROLOGY_REGION_SIZE !== 0) {
    throw new Error("infinite drainage basins must align to complete hydrology regions");
  }
  const maximumOwnAxis = INFINITE_DRAINAGE_BASIN_SPAN_TILES * 0.625;
  const maximumOwnDistanceSquared = (1.5 * maximumOwnAxis) ** 2 + (Math.sqrt(3) * (maximumOwnAxis + 0.5)) ** 2;
  const minimumRemoteAxis = INFINITE_DRAINAGE_BASIN_SPAN_TILES * 1.375;
  const minimumRemoteDistance = Math.min(
    1.5 * minimumRemoteAxis,
    Math.sqrt(3) * (minimumRemoteAxis - 0.5)
  );
  if (maximumOwnDistanceSquared >= minimumRemoteDistance ** 2) {
    throw new Error("infinite drainage site jitter does not prove a finite candidate neighborhood");
  }
}
assertInfiniteDrainagePartitionContract();

// src/world/HydrologyIdentity.ts
var OCEAN_BODY_ID = "ocean";

// src/world/HydrologyRegion.ts
var HYDROLOGY_REGION_REVISION = 0;
var HYDROLOGY_POINT_QUANTIZATION = 64;
var HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE = -HYDROLOGY_POINT_QUANTIZATION / 2;
var MAX_HYDROLOGY_REGION_PORTS = 1024;
var MAX_HYDROLOGY_REGION_RIVERS = 1024;
var MAX_HYDROLOGY_REGION_LAKES = 256;
var MAX_HYDROLOGY_REGION_MOUTHS = 512;
var MAX_HYDROLOGY_REGION_BODIES = 1024;
var MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS = 64;
var HYDROLOGY_BOUNDARY_MIN_X = 1;
var HYDROLOGY_BOUNDARY_MAX_X = 2;
var HYDROLOGY_BOUNDARY_MIN_Y = 4;
var HYDROLOGY_BOUNDARY_MAX_Y = 8;
var OCEAN_HYDROLOGY_PROFILE = 0;
var LAKE_HYDROLOGY_PROFILE = 1;
var RIVER_HYDROLOGY_PROFILE = 2;
var ALL_BOUNDARY_BITS = HYDROLOGY_BOUNDARY_MIN_X | HYDROLOGY_BOUNDARY_MAX_X | HYDROLOGY_BOUNDARY_MIN_Y | HYDROLOGY_BOUNDARY_MAX_Y;
var MAX_STABLE_ID_LENGTH = 256;
var MAX_WORLD_IDENTITY_LENGTH = 16384;
function assertStableId(name, value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_STABLE_ID_LENGTH || !/^[\x21-\x7e]+$/.test(value)) {
    throw new TypeError(`${name} must be a bounded printable ASCII identity`);
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
function assertPoint(name, point) {
  if (!(point instanceof Int16Array) || point.length !== 2) {
    throw new TypeError(`${name} must contain one quantized xy pair`);
  }
}
function hydrologyRegionMaximumQuantizedCoordinate(validSize) {
  if (!Number.isInteger(validSize) || validSize <= 0 || validSize > HYDROLOGY_REGION_SIZE) {
    throw new RangeError("hydrology region valid size is invalid");
  }
  return validSize * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2;
}
function assertEndpoint(name, endpoint) {
  if (!endpoint || typeof endpoint !== "object") throw new TypeError(`${name} is required`);
  if (endpoint.kind === "node") assertStableId(`${name} node`, endpoint.nodeId);
  else if (endpoint.kind === "port") assertStableId(`${name} connection`, endpoint.connectionId);
  else if (endpoint.kind === "body") assertStableId(`${name} body`, endpoint.bodyId);
  else throw new TypeError(`${name} kind is invalid`);
}
function assertCanonicalOrder(name, values, identity) {
  let previous;
  for (const value of values) {
    const current = identity(value);
    if (previous !== void 0 && previous >= current) {
      throw new Error(`${name} must use unique canonical identity order`);
    }
    previous = current;
  }
}
function compareIdentity(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}
function endpointIdentity(endpoint) {
  if (endpoint.kind === "node") return `node:${endpoint.nodeId}`;
  if (endpoint.kind === "port") return `port:${endpoint.connectionId}`;
  return `body:${endpoint.bodyId}`;
}
function cloneEndpoint(endpoint) {
  if (endpoint.kind === "node") return Object.freeze({ kind: "node", nodeId: endpoint.nodeId });
  if (endpoint.kind === "port") {
    return Object.freeze({ kind: "port", connectionId: endpoint.connectionId });
  }
  return Object.freeze({ kind: "body", bodyId: endpoint.bodyId });
}
function assertPort(port, bounds) {
  if (!port || typeof port !== "object") throw new TypeError("hydrology port must be an object");
  assertStableId("hydrology connection", port.connectionId);
  assertStableId("hydrology port river", port.riverId);
  assertStableId("hydrology port segment", port.segmentId);
  if (port.endpoint !== "entry" && port.endpoint !== "exit") {
    throw new TypeError("hydrology port endpoint kind is invalid");
  }
  if (!Number.isInteger(port.boundaryMask) || port.boundaryMask <= 0 || (port.boundaryMask & ~ALL_BOUNDARY_BITS) !== 0 || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_X) !== 0 && (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_X) !== 0 || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_Y) !== 0 && (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_Y) !== 0) {
    throw new RangeError("hydrology port boundary mask is invalid");
  }
  assertPoint("hydrology port point", port.point);
  const minimum = HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE;
  const maximumX = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxXExclusive);
  const maximumY = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxYExclusive);
  if (port.point[0] < minimum || port.point[0] > maximumX || port.point[1] < minimum || port.point[1] > maximumY || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_X) !== 0 && port.point[0] !== minimum || (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_X) !== 0 && port.point[0] !== maximumX || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_Y) !== 0 && port.point[1] !== minimum || (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_Y) !== 0 && port.point[1] !== maximumY) {
    throw new RangeError("hydrology port point does not lie on its declared boundary");
  }
  if (!Number.isSafeInteger(port.canonicalTileX * 2) || !Number.isSafeInteger(port.canonicalTileY * 2)) {
    throw new RangeError("hydrology port canonical point must use safe half-tile coordinates");
  }
  if (!(port.flowDirection instanceof Int8Array) || port.flowDirection.length !== 2 || port.flowDirection[0] < -1 || port.flowDirection[0] > 1 || port.flowDirection[1] < -1 || port.flowDirection[1] > 1 || port.flowDirection[0] === 0 && port.flowDirection[1] === 0) {
    throw new RangeError("hydrology port flow direction must be a non-zero canonical step");
  }
  assertUint8("hydrology port width class", port.widthClass);
  assertUint16("hydrology port level", port.level);
  assertUint8("hydrology port discharge class", port.dischargeClass);
  if (port.widthClass === 0) throw new RangeError("hydrology port width class must be positive");
}
function assertRiver(segment, bounds) {
  if (!segment || typeof segment !== "object") throw new TypeError("river segment must be an object");
  assertStableId("river identity", segment.riverId);
  assertStableId("river segment identity", segment.segmentId);
  if (!(segment.controlPoints instanceof Int16Array) || segment.controlPoints.length < 4 || segment.controlPoints.length % 2 !== 0 || segment.controlPoints.length / 2 > MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS) {
    throw new TypeError("river control points violate the bounded quantized layout");
  }
  const pointCount = segment.controlPoints.length / 2;
  if (!(segment.widthProfile instanceof Uint8Array) || segment.widthProfile.length !== pointCount || !(segment.levelProfile instanceof Uint16Array) || segment.levelProfile.length !== pointCount) {
    throw new TypeError("river profiles must match its control point count");
  }
  const minimum = HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE;
  const maximumX = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxXExclusive);
  const maximumY = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxYExclusive);
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const x = segment.controlPoints[pointIndex * 2];
    const y = segment.controlPoints[pointIndex * 2 + 1];
    if (x < minimum || x > maximumX || y < minimum || y > maximumY || segment.widthProfile[pointIndex] === 0) {
      throw new RangeError("river geometry lies outside valid bounds or has zero width");
    }
    if (pointIndex > 0 && (segment.widthProfile[pointIndex] < segment.widthProfile[pointIndex - 1] || segment.levelProfile[pointIndex] > segment.levelProfile[pointIndex - 1])) {
      throw new Error("river width cannot shrink and level cannot rise downstream");
    }
  }
  assertUint8("river discharge class", segment.dischargeClass);
  assertEndpoint("river entry", segment.entry);
  assertEndpoint("river exit", segment.exit);
  if (segment.entry.kind === "body") throw new Error("river entry cannot originate in a terminal body");
  if (endpointIdentity(segment.entry) === endpointIdentity(segment.exit)) {
    throw new Error("river segment endpoints must be distinct");
  }
}
function assertLake(lake, bounds) {
  if (!lake || typeof lake !== "object") throw new TypeError("lake feature must be an object");
  assertStableId("lake feature identity", lake.featureId);
  assertStableId("lake body identity", lake.bodyId);
  assertPoint("lake center", lake.center);
  assertUint16("lake radius", lake.radius);
  assertUint16("lake level", lake.level);
  assertUint8("lake profile", lake.profileIndex);
  if (lake.radius === 0) throw new RangeError("lake radius must be positive");
  const minimum = HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE;
  const maximumX = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxXExclusive);
  const maximumY = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxYExclusive);
  if (lake.center[0] + lake.radius < minimum || lake.center[0] - lake.radius > maximumX || lake.center[1] + lake.radius < minimum || lake.center[1] - lake.radius > maximumY) {
    throw new RangeError("lake feature does not intersect its region");
  }
}
function assertMouth(mouth, bounds) {
  if (!mouth || typeof mouth !== "object") throw new TypeError("river mouth must be an object");
  assertStableId("river mouth identity", mouth.mouthId);
  assertStableId("river mouth river", mouth.riverId);
  assertStableId("river mouth segment", mouth.segmentId);
  assertStableId("river mouth target body", mouth.targetBodyId);
  assertPoint("river mouth point", mouth.point);
  const minimum = HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE;
  const maximumX = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxXExclusive);
  const maximumY = hydrologyRegionMaximumQuantizedCoordinate(bounds.maxYExclusive);
  if (mouth.point[0] < minimum || mouth.point[0] > maximumX || mouth.point[1] < minimum || mouth.point[1] > maximumY) {
    throw new RangeError("river mouth lies outside its region");
  }
  assertUint8("river mouth width class", mouth.widthClass);
  assertUint8("river mouth discharge class", mouth.dischargeClass);
  if (mouth.widthClass === 0) throw new RangeError("river mouth width class must be positive");
}
function assertBody(body) {
  if (!body || typeof body !== "object") throw new TypeError("hydrology body reference must be an object");
  assertStableId("hydrology body identity", body.bodyId);
  if (body.kind !== "ocean" && body.kind !== "lake" && body.kind !== "river") {
    throw new TypeError("hydrology body kind is invalid");
  }
  assertUint8("hydrology body profile", body.profileIndex);
  if (body.kind === "ocean") {
    if (body.bodyId !== OCEAN_BODY_ID || body.profileIndex !== OCEAN_HYDROLOGY_PROFILE) {
      throw new Error("ocean body must use its reserved identity and profile");
    }
  } else if (body.bodyId === OCEAN_BODY_ID) {
    throw new Error("non-ocean body cannot use the reserved ocean identity");
  }
}
function assertHydrologyRegion(region) {
  if (!region || typeof region !== "object" || region.formatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
    throw new TypeError("hydrology region format version is unsupported");
  }
  if (typeof region.worldIdentity !== "string" || region.worldIdentity.length === 0 || region.worldIdentity.length > MAX_WORLD_IDENTITY_LENGTH) {
    throw new TypeError("hydrology region world identity is invalid");
  }
  if (region.topology !== "finite" && region.topology !== "toroidal" && region.topology !== "infinite") {
    throw new TypeError("hydrology region topology is invalid");
  }
  if (!region.key || !Number.isSafeInteger(region.key.regionX) || !Number.isSafeInteger(region.key.regionY) || region.topology !== "infinite" && (region.key.regionX < 0 || region.key.regionY < 0)) {
    throw new RangeError("hydrology region key is invalid for its topology");
  }
  chunkOrigin(region.key.regionX, region.key.regionY, HYDROLOGY_REGION_SIZE);
  if (!Number.isSafeInteger(region.revision) || region.revision < 0) {
    throw new RangeError("hydrology region revision must be a non-negative safe integer");
  }
  const bounds = region.validBounds;
  if (!bounds || bounds.minX !== 0 || bounds.minY !== 0 || !Number.isInteger(bounds.maxXExclusive) || !Number.isInteger(bounds.maxYExclusive) || bounds.maxXExclusive <= 0 || bounds.maxXExclusive > HYDROLOGY_REGION_SIZE || bounds.maxYExclusive <= 0 || bounds.maxYExclusive > HYDROLOGY_REGION_SIZE) {
    throw new RangeError("hydrology region valid bounds are invalid");
  }
  if (!Array.isArray(region.boundaryPorts) || region.boundaryPorts.length > MAX_HYDROLOGY_REGION_PORTS || !Array.isArray(region.rivers) || region.rivers.length > MAX_HYDROLOGY_REGION_RIVERS || !Array.isArray(region.lakes) || region.lakes.length > MAX_HYDROLOGY_REGION_LAKES || !Array.isArray(region.mouths) || region.mouths.length > MAX_HYDROLOGY_REGION_MOUTHS || !Array.isArray(region.bodies) || region.bodies.length > MAX_HYDROLOGY_REGION_BODIES) {
    throw new RangeError("hydrology region feature counts exceed the frozen budgets");
  }
  for (const port of region.boundaryPorts) assertPort(port, bounds);
  for (const river of region.rivers) assertRiver(river, bounds);
  for (const lake of region.lakes) assertLake(lake, bounds);
  for (const mouth of region.mouths) assertMouth(mouth, bounds);
  for (const body of region.bodies) assertBody(body);
  assertCanonicalOrder("hydrology ports", region.boundaryPorts, (port) => `${port.connectionId}:${port.endpoint}`);
  assertCanonicalOrder("river segments", region.rivers, (river) => river.segmentId);
  assertCanonicalOrder("lake features", region.lakes, (lake) => lake.featureId);
  assertCanonicalOrder("river mouths", region.mouths, (mouth) => mouth.mouthId);
  assertCanonicalOrder("hydrology bodies", region.bodies, (body) => body.bodyId);
  const bodies = new Map(region.bodies.map((body) => [body.bodyId, body]));
  const rivers = new Map(region.rivers.map((river) => [river.segmentId, river]));
  const portsBySegmentEndpoint = /* @__PURE__ */ new Set();
  for (const port of region.boundaryPorts) {
    const segment = rivers.get(port.segmentId);
    if (!segment || segment.riverId !== port.riverId || bodies.get(port.riverId)?.kind !== "river") {
      throw new Error("hydrology port references an unknown river segment or body");
    }
    const endpoint = port.endpoint === "entry" ? segment.entry : segment.exit;
    if (endpoint.kind !== "port" || endpoint.connectionId !== port.connectionId) {
      throw new Error("hydrology port does not match its river endpoint");
    }
    const pointOffset = port.endpoint === "entry" ? 0 : segment.controlPoints.length - 2;
    const profileIndex = port.endpoint === "entry" ? 0 : segment.widthProfile.length - 1;
    const segmentDirectionX = Math.sign(
      segment.controlPoints[segment.controlPoints.length - 2] - segment.controlPoints[0]
    );
    const segmentDirectionY = Math.sign(
      segment.controlPoints[segment.controlPoints.length - 1] - segment.controlPoints[1]
    );
    if (port.point[0] !== segment.controlPoints[pointOffset] || port.point[1] !== segment.controlPoints[pointOffset + 1] || port.flowDirection[0] !== segmentDirectionX || port.flowDirection[1] !== segmentDirectionY || port.widthClass !== segment.widthProfile[profileIndex] || port.level !== segment.levelProfile[profileIndex] || port.dischargeClass !== segment.dischargeClass) {
      throw new Error("hydrology port geometry or flow class does not match its segment");
    }
    const endpointKey = `${port.segmentId}:${port.endpoint}`;
    if (portsBySegmentEndpoint.has(endpointKey)) {
      throw new Error("river segment endpoint has duplicate boundary ports");
    }
    portsBySegmentEndpoint.add(endpointKey);
  }
  for (const segment of region.rivers) {
    if (bodies.get(segment.riverId)?.kind !== "river") {
      throw new Error("river segment has no matching river body");
    }
    for (const [kind, endpoint] of [["entry", segment.entry], ["exit", segment.exit]]) {
      if (endpoint.kind === "port" && !portsBySegmentEndpoint.has(`${segment.segmentId}:${kind}`)) {
        throw new Error("river boundary endpoint has no matching port");
      }
      if (endpoint.kind === "body" && !bodies.has(endpoint.bodyId)) {
        throw new Error("river terminal endpoint references an unknown body");
      }
    }
  }
  for (const lake of region.lakes) {
    const body = bodies.get(lake.bodyId);
    if (body?.kind !== "lake" || body.profileIndex !== lake.profileIndex) {
      throw new Error("lake feature has no matching lake body");
    }
  }
  const mouthBySegment = /* @__PURE__ */ new Set();
  for (const mouth of region.mouths) {
    const segment = rivers.get(mouth.segmentId);
    if (!segment || segment.riverId !== mouth.riverId || segment.exit.kind !== "body" || segment.exit.bodyId !== mouth.targetBodyId || bodies.get(mouth.riverId)?.kind !== "river" || bodies.get(mouth.targetBodyId)?.kind !== "ocean" && bodies.get(mouth.targetBodyId)?.kind !== "lake" || mouth.point[0] !== segment.controlPoints[segment.controlPoints.length - 2] || mouth.point[1] !== segment.controlPoints[segment.controlPoints.length - 1] || mouth.widthClass !== segment.widthProfile[segment.widthProfile.length - 1] || mouth.dischargeClass !== segment.dischargeClass || mouthBySegment.has(mouth.segmentId)) {
      throw new Error("river mouth does not match one terminal river segment");
    }
    mouthBySegment.add(mouth.segmentId);
  }
  for (const segment of region.rivers) {
    if (segment.exit.kind === "body" && !mouthBySegment.has(segment.segmentId)) {
      throw new Error("terminal river segment has no mouth feature");
    }
  }
}
function clonePort(port) {
  return Object.freeze({ ...port });
}
function cloneRiver(river) {
  return Object.freeze({ ...river, entry: cloneEndpoint(river.entry), exit: cloneEndpoint(river.exit) });
}
function createHydrologyRegion(input) {
  if (!input || typeof input !== "object") throw new TypeError("hydrology region input is required");
  const boundaryPorts = input.boundaryPorts.map(clonePort).sort((first, second) => compareIdentity(
    `${first.connectionId}:${first.endpoint}`,
    `${second.connectionId}:${second.endpoint}`
  ));
  const rivers = input.rivers.map(cloneRiver).sort((first, second) => compareIdentity(first.segmentId, second.segmentId));
  const lakes = input.lakes.map((lake) => Object.freeze({ ...lake })).sort((first, second) => compareIdentity(first.featureId, second.featureId));
  const mouths = input.mouths.map((mouth) => Object.freeze({ ...mouth })).sort((first, second) => compareIdentity(first.mouthId, second.mouthId));
  const bodies = input.bodies.map((body) => Object.freeze({ ...body })).sort((first, second) => compareIdentity(first.bodyId, second.bodyId));
  const region = Object.freeze({
    formatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
    worldIdentity: input.worldIdentity,
    topology: input.topology,
    key: Object.freeze({ regionX: input.key.regionX, regionY: input.key.regionY }),
    revision: input.revision,
    validBounds: Object.freeze({
      minX: 0,
      minY: 0,
      maxXExclusive: input.validBounds.maxXExclusive,
      maxYExclusive: input.validBounds.maxYExclusive
    }),
    boundaryPorts: Object.freeze(boundaryPorts),
    rivers: Object.freeze(rivers),
    lakes: Object.freeze(lakes),
    mouths: Object.freeze(mouths),
    bodies: Object.freeze(bodies)
  });
  assertHydrologyRegion(region);
  return region;
}

// src/world/HydrologyRegionAssembler.ts
var CLIP_EPSILON = 1e-9;
function clipAxis(start, delta, minimum, maximum, interval) {
  if (delta === 0) return start >= minimum && start <= maximum;
  let first = (minimum - start) / delta;
  let second = (maximum - start) / delta;
  if (first > second) [first, second] = [second, first];
  interval.minimum = Math.max(interval.minimum, first);
  interval.maximum = Math.min(interval.maximum, second);
  return interval.maximum - interval.minimum > CLIP_EPSILON;
}
function clipLineToRegion(startX, startY, endX, endY, minimumX, minimumY, maximumX, maximumY) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const interval = { minimum: 0, maximum: 1 };
  if (!clipAxis(startX, deltaX, minimumX, maximumX, interval) || !clipAxis(startY, deltaY, minimumY, maximumY, interval)) return void 0;
  const startT = Math.max(0, interval.minimum);
  const endT = Math.min(1, interval.maximum);
  if (endT - startT <= CLIP_EPSILON) return void 0;
  return {
    startX: startX + deltaX * startT,
    startY: startY + deltaY * startT,
    endX: startX + deltaX * endT,
    endY: startY + deltaY * endT,
    startT,
    endT
  };
}
function quantizeLocal(value, origin) {
  const quantized = Math.round((value - origin) * HYDROLOGY_POINT_QUANTIZATION);
  if (quantized < -32768 || quantized > 32767) {
    throw new RangeError("hydrology local coordinate exceeds its int16 format");
  }
  return quantized;
}
function interpolateUint16(first, second, amount) {
  return Math.max(0, Math.min(65535, Math.round(first + (second - first) * amount)));
}
function boundaryMask(localX, localY, maximumX, maximumY) {
  let mask = 0;
  if (localX === HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE) mask |= HYDROLOGY_BOUNDARY_MIN_X;
  if (localX === maximumX) mask |= HYDROLOGY_BOUNDARY_MAX_X;
  if (localY === HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE) mask |= HYDROLOGY_BOUNDARY_MIN_Y;
  if (localY === maximumY) mask |= HYDROLOGY_BOUNDARY_MAX_Y;
  if (mask === 0) throw new Error("clipped hydrology endpoint is not on a region boundary");
  return mask;
}
function widthClass(dischargeClass) {
  return Math.min(255, dischargeClass + 1);
}
var HydrologyRegionAssembler = class {
  constructor(options) {
    this.rivers = [];
    this.ports = [];
    this.lakes = [];
    this.mouths = [];
    this.bodies = /* @__PURE__ */ new Map();
    this.segmentIds = /* @__PURE__ */ new Set();
    this.options = options;
    this.origin = chunkOrigin(options.key.regionX, options.key.regionY, HYDROLOGY_REGION_SIZE);
  }
  addOceanReference() {
    this.addBody({ bodyId: "ocean", kind: "ocean", profileIndex: OCEAN_HYDROLOGY_PROFILE });
  }
  addDrainageEdge(edge) {
    const minimumX = this.origin.x - 0.5;
    const minimumY = this.origin.y - 0.5;
    const endX = this.origin.x + this.options.validWidth - 0.5;
    const endY = this.origin.y + this.options.validHeight - 0.5;
    const clipped = clipLineToRegion(
      edge.sourceX,
      edge.sourceY,
      edge.parentX,
      edge.parentY,
      minimumX,
      minimumY,
      endX,
      endY
    );
    if (!clipped) return false;
    const localStartX = quantizeLocal(clipped.startX, this.origin.x);
    const localStartY = quantizeLocal(clipped.startY, this.origin.y);
    const localEndX = quantizeLocal(clipped.endX, this.origin.x);
    const localEndY = quantizeLocal(clipped.endY, this.origin.y);
    const canonicalEdgeId = `edge:${edge.sourceNodeId}>${edge.parentNodeId}`;
    const segmentId = `segment:${canonicalEdgeId}@${this.options.key.regionX}:${this.options.key.regionY}:${localStartX},${localStartY}>${localEndX},${localEndY}`;
    if (this.segmentIds.has(segmentId)) throw new Error("hydrology region produced a duplicate segment identity");
    this.segmentIds.add(segmentId);
    const riverId = `river:${edge.terminalNodeId}`;
    const edgeWidthClass = widthClass(edge.dischargeClass);
    const startLevel = interpolateUint16(edge.sourceLevel, edge.parentLevel, clipped.startT);
    const endLevel = interpolateUint16(edge.sourceLevel, edge.parentLevel, clipped.endT);
    const directionX = Math.sign(edge.parentX - edge.sourceX);
    const directionY = Math.sign(edge.parentY - edge.sourceY);
    let entry = { kind: "node", nodeId: edge.sourceNodeId };
    let exit = edge.parentTerminal ? { kind: "body", bodyId: edge.parentTerminal.bodyId } : { kind: "node", nodeId: edge.parentNodeId };
    if (clipped.startT > CLIP_EPSILON) {
      const canonical = this.options.canonicalizePort(clipped.startX, clipped.startY);
      const connectionId = `connection:${canonicalEdgeId}@${canonical.tileX}:${canonical.tileY}`;
      entry = { kind: "port", connectionId };
      this.ports.push({
        connectionId,
        riverId,
        segmentId,
        endpoint: "entry",
        boundaryMask: boundaryMask(
          localStartX,
          localStartY,
          hydrologyRegionMaximumQuantizedCoordinate(this.options.validWidth),
          hydrologyRegionMaximumQuantizedCoordinate(this.options.validHeight)
        ),
        point: new Int16Array([localStartX, localStartY]),
        canonicalTileX: canonical.tileX,
        canonicalTileY: canonical.tileY,
        flowDirection: new Int8Array([directionX, directionY]),
        widthClass: edgeWidthClass,
        level: startLevel,
        dischargeClass: edge.dischargeClass
      });
    }
    if (clipped.endT < 1 - CLIP_EPSILON) {
      const canonical = this.options.canonicalizePort(clipped.endX, clipped.endY);
      const connectionId = `connection:${canonicalEdgeId}@${canonical.tileX}:${canonical.tileY}`;
      exit = { kind: "port", connectionId };
      this.ports.push({
        connectionId,
        riverId,
        segmentId,
        endpoint: "exit",
        boundaryMask: boundaryMask(
          localEndX,
          localEndY,
          hydrologyRegionMaximumQuantizedCoordinate(this.options.validWidth),
          hydrologyRegionMaximumQuantizedCoordinate(this.options.validHeight)
        ),
        point: new Int16Array([localEndX, localEndY]),
        canonicalTileX: canonical.tileX,
        canonicalTileY: canonical.tileY,
        flowDirection: new Int8Array([directionX, directionY]),
        widthClass: edgeWidthClass,
        level: endLevel,
        dischargeClass: edge.dischargeClass
      });
    }
    this.rivers.push({
      riverId,
      segmentId,
      controlPoints: new Int16Array([localStartX, localStartY, localEndX, localEndY]),
      widthProfile: new Uint8Array([edgeWidthClass, edgeWidthClass]),
      levelProfile: new Uint16Array([startLevel, endLevel]),
      dischargeClass: edge.dischargeClass,
      entry,
      exit
    });
    this.addBody({ bodyId: riverId, kind: "river", profileIndex: RIVER_HYDROLOGY_PROFILE });
    if (exit.kind === "body") {
      if (!edge.parentTerminal || edge.parentTerminal.bodyId !== exit.bodyId) {
        throw new Error("terminal drainage edge lost its target body during clipping");
      }
      this.addBody({
        bodyId: exit.bodyId,
        kind: edge.parentTerminal.kind,
        profileIndex: edge.parentTerminal.kind === "ocean" ? OCEAN_HYDROLOGY_PROFILE : LAKE_HYDROLOGY_PROFILE
      });
      this.mouths.push({
        mouthId: `mouth:${canonicalEdgeId}`,
        riverId,
        segmentId,
        targetBodyId: exit.bodyId,
        point: new Int16Array([localEndX, localEndY]),
        widthClass: edgeWidthClass,
        dischargeClass: edge.dischargeClass
      });
    }
    return true;
  }
  addLakeSlice(lake) {
    const minimumX = this.origin.x - 0.5;
    const minimumY = this.origin.y - 0.5;
    const endX = this.origin.x + this.options.validWidth - 0.5;
    const endY = this.origin.y + this.options.validHeight - 0.5;
    if (lake.centerX + lake.radiusTiles < minimumX || lake.centerX - lake.radiusTiles > endX || lake.centerY + lake.radiusTiles < minimumY || lake.centerY - lake.radiusTiles > endY) return false;
    const localCenterX = quantizeLocal(lake.centerX, this.origin.x);
    const localCenterY = quantizeLocal(lake.centerY, this.origin.y);
    const radius = lake.radiusTiles * HYDROLOGY_POINT_QUANTIZATION;
    this.lakes.push({
      featureId: `lake-slice:${lake.bodyId}@${this.options.key.regionX}:${this.options.key.regionY}:${localCenterX},${localCenterY}`,
      bodyId: lake.bodyId,
      center: new Int16Array([localCenterX, localCenterY]),
      radius,
      level: lake.level,
      profileIndex: LAKE_HYDROLOGY_PROFILE
    });
    this.addBody({ bodyId: lake.bodyId, kind: "lake", profileIndex: LAKE_HYDROLOGY_PROFILE });
    return true;
  }
  finish() {
    return createHydrologyRegion({
      worldIdentity: this.options.worldIdentity,
      topology: this.options.topology,
      key: this.options.key,
      revision: HYDROLOGY_REGION_REVISION,
      validBounds: {
        minX: 0,
        minY: 0,
        maxXExclusive: this.options.validWidth,
        maxYExclusive: this.options.validHeight
      },
      boundaryPorts: this.ports,
      rivers: this.rivers,
      lakes: this.lakes,
      mouths: this.mouths,
      bodies: [...this.bodies.values()]
    });
  }
  addBody(body) {
    const existing = this.bodies.get(body.bodyId);
    if (existing && (existing.kind !== body.kind || existing.profileIndex !== body.profileIndex)) {
      throw new Error("hydrology body identity resolved to conflicting kinds or profiles");
    }
    if (!existing) this.bodies.set(body.bodyId, Object.freeze(body));
  }
};
function canonicalHydrologyPoint(tileX, tileY) {
  const roundedX = Math.round(tileX * 2) / 2;
  const roundedY = Math.round(tileY * 2) / 2;
  if (Math.abs(tileX - roundedX) > CLIP_EPSILON || Math.abs(tileY - roundedY) > CLIP_EPSILON || !Number.isSafeInteger(roundedX * 2) || !Number.isSafeInteger(roundedY * 2)) {
    throw new Error("hydrology boundary crossing is not a half-tile logical coordinate");
  }
  return Object.freeze({ tileX: roundedX, tileY: roundedY });
}

// src/world/MacroDrainageTree.ts
var MACRO_DRAINAGE_TERMINAL = -1;
var MACRO_DRAINAGE_INVALID = -2;
var MACRO_DRAINAGE_INVALID_RANK = 4294967295;
var UNREACHED_SPILL_HEIGHT = 65536;
var MAX_NODE_COUNT = 2147483647;
var NEIGHBOR_X = [-1, -1, -1, 0, 0, 1, 1, 1];
var NEIGHBOR_Y = [-1, 0, 1, -1, 1, -1, 0, 1];
function deriveMacroDrainageTerminalWaterLevels(tree, raster) {
  const length = tree.downstream.length;
  if (!(raster.groundHeight instanceof Uint16Array) || raster.groundHeight.length !== length || !(raster.ocean instanceof Uint8Array) || raster.ocean.length !== length || !Number.isInteger(raster.seaLevel) || raster.seaLevel < 0 || raster.seaLevel > 65535) {
    throw new TypeError("macro drainage terminal levels require matching raster arrays");
  }
  const levels = new Uint16Array(length);
  levels.fill(65535);
  const resolved = new Uint8Array(length);
  for (const terminal of tree.terminalIndices) {
    if (raster.ocean[terminal] !== 0) {
      levels[terminal] = raster.seaLevel;
      resolved[terminal] = 1;
    }
  }
  for (let index = 0; index < length; index += 1) {
    const parent = tree.downstream[index];
    if (parent < 0 || raster.ocean[parent] !== 0 || tree.downstream[parent] !== MACRO_DRAINAGE_TERMINAL) continue;
    levels[parent] = Math.min(levels[parent], tree.spillLevel[index]);
    resolved[parent] = 1;
  }
  for (const terminal of tree.terminalIndices) {
    if (resolved[terminal] === 0) levels[terminal] = raster.groundHeight[terminal];
    if (levels[terminal] < raster.groundHeight[terminal]) {
      throw new Error("macro drainage terminal water level falls below its ground");
    }
  }
  return levels;
}
var DrainageMinHeap = class {
  constructor() {
    this.indices = [];
    this.priorities = [];
  }
  get size() {
    return this.indices.length;
  }
  push(index, priority) {
    let cursor = this.indices.length;
    this.indices.push(index);
    this.priorities.push(priority);
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if (!this.less(priority, index, this.priorities[parent], this.indices[parent])) break;
      this.indices[cursor] = this.indices[parent];
      this.priorities[cursor] = this.priorities[parent];
      cursor = parent;
    }
    this.indices[cursor] = index;
    this.priorities[cursor] = priority;
  }
  pop() {
    const length = this.indices.length;
    if (length === 0) return void 0;
    const rootIndex = this.indices[0];
    const rootPriority = this.priorities[0];
    const lastIndex = this.indices.pop();
    const lastPriority = this.priorities.pop();
    if (length > 1) {
      let cursor = 0;
      const remaining = length - 1;
      while (true) {
        const left = cursor * 2 + 1;
        if (left >= remaining) break;
        const right = left + 1;
        let child = left;
        if (right < remaining && this.less(
          this.priorities[right],
          this.indices[right],
          this.priorities[left],
          this.indices[left]
        )) child = right;
        if (!this.less(
          this.priorities[child],
          this.indices[child],
          lastPriority,
          lastIndex
        )) break;
        this.indices[cursor] = this.indices[child];
        this.priorities[cursor] = this.priorities[child];
        cursor = child;
      }
      this.indices[cursor] = lastIndex;
      this.priorities[cursor] = lastPriority;
    }
    return [rootIndex, rootPriority];
  }
  less(firstPriority, firstIndex, secondPriority, secondIndex) {
    return firstPriority < secondPriority || firstPriority === secondPriority && firstIndex < secondIndex;
  }
};
function macroDrainageIndex(x, y, height) {
  return x * height + y;
}
function assertRaster(raster, topology) {
  if (!Number.isInteger(raster.width) || raster.width <= 0 || !Number.isInteger(raster.height) || raster.height <= 0) {
    throw new RangeError("macro drainage raster dimensions must be positive integers");
  }
  const length = raster.width * raster.height;
  if (!Number.isSafeInteger(length) || length > MAX_NODE_COUNT) {
    throw new RangeError("macro drainage raster exceeds the supported node count");
  }
  if (!(raster.valid instanceof Uint8Array) || raster.valid.length !== length || !(raster.groundHeight instanceof Uint16Array) || raster.groundHeight.length !== length || !(raster.ocean instanceof Uint8Array) || raster.ocean.length !== length) {
    throw new TypeError("macro drainage raster arrays do not match its dimensions");
  }
  if (!Number.isInteger(raster.seaLevel) || raster.seaLevel < 0 || raster.seaLevel > 65535) {
    throw new RangeError("macro drainage sea level must be a uint16 value");
  }
  let validCount = 0;
  for (let index = 0; index < length; index += 1) {
    if (raster.valid[index] > 1 || raster.ocean[index] > 1) {
      throw new TypeError("macro drainage masks must contain only zero or one");
    }
    if (raster.valid[index] === 0 && raster.ocean[index] !== 0) {
      throw new TypeError("macro drainage ocean nodes must be valid");
    }
    if (raster.ocean[index] !== 0 && raster.groundHeight[index] > raster.seaLevel) {
      throw new RangeError("macro drainage ocean ground cannot exceed sea level");
    }
    if (raster.valid[index] !== 0) validCount += 1;
  }
  if (validCount === 0) throw new RangeError("macro drainage raster must contain a valid node");
  assertConnected(raster, validCount, topology);
  return validCount;
}
function forEachNeighbor(index, width, height, topology, visit) {
  const x = Math.floor(index / height);
  const y = index - x * height;
  for (let direction = 0; direction < NEIGHBOR_X.length; direction += 1) {
    let neighborX = x + NEIGHBOR_X[direction];
    let neighborY = y + NEIGHBOR_Y[direction];
    if (topology === "toroidal") {
      neighborX = (neighborX + width) % width;
      neighborY = (neighborY + height) % height;
    } else if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) {
      continue;
    }
    visit(macroDrainageIndex(neighborX, neighborY, height));
  }
}
function areNeighbors(first, second, width, height, topology) {
  const firstX = Math.floor(first / height);
  const firstY = first - firstX * height;
  const secondX = Math.floor(second / height);
  const secondY = second - secondX * height;
  let distanceX = Math.abs(firstX - secondX);
  let distanceY = Math.abs(firstY - secondY);
  if (topology === "toroidal") {
    distanceX = Math.min(distanceX, width - distanceX);
    distanceY = Math.min(distanceY, height - distanceY);
  }
  return distanceX <= 1 && distanceY <= 1 && (distanceX !== 0 || distanceY !== 0);
}
function assertConnected(raster, validCount, topology) {
  const first = raster.valid.findIndex((value) => value !== 0);
  const visited = new Uint8Array(raster.valid.length);
  const queue = new Int32Array(validCount);
  let read = 0;
  let written = 1;
  queue[0] = first;
  visited[first] = 1;
  while (read < written) {
    const index = queue[read++];
    forEachNeighbor(index, raster.width, raster.height, topology, (neighbor) => {
      if (raster.valid[neighbor] === 0 || visited[neighbor] !== 0) return;
      visited[neighbor] = 1;
      queue[written++] = neighbor;
    });
  }
  if (written !== validCount) {
    throw new Error("macro drainage basin mask must be connected");
  }
}
function betterParent(candidate, current, spillLevel, drainageRank) {
  if (current < 0) return true;
  return spillLevel[candidate] < spillLevel[current] || spillLevel[candidate] === spillLevel[current] && (drainageRank[candidate] < drainageRank[current] || drainageRank[candidate] === drainageRank[current] && candidate < current);
}
function buildMacroDrainageTreeForTopology(raster, topology) {
  const validNodeCount = assertRaster(raster, topology);
  const length = raster.valid.length;
  const downstream = new Int32Array(length);
  downstream.fill(MACRO_DRAINAGE_INVALID);
  const drainageRank = new Uint32Array(length);
  drainageRank.fill(MACRO_DRAINAGE_INVALID_RANK);
  const spillLevel = new Uint16Array(length);
  const discharge = new Uint32Array(length);
  const bestSpill = new Uint32Array(length);
  bestSpill.fill(UNREACHED_SPILL_HEIGHT);
  const settled = new Uint8Array(length);
  const terminalIndices = [];
  for (let index = 0; index < length; index += 1) {
    if (raster.valid[index] !== 0) discharge[index] = 1;
    if (raster.ocean[index] === 0) continue;
    terminalIndices.push(index);
  }
  const terminalKind = terminalIndices.length > 0 ? "ocean" : "lake";
  if (terminalIndices.length === 0) {
    let terminal = -1;
    for (let index = 0; index < length; index += 1) {
      if (raster.valid[index] === 0) continue;
      if (terminal < 0 || raster.groundHeight[index] < raster.groundHeight[terminal]) terminal = index;
    }
    terminalIndices.push(terminal);
  }
  for (const terminal of terminalIndices) {
    settled[terminal] = 1;
    downstream[terminal] = MACRO_DRAINAGE_TERMINAL;
    drainageRank[terminal] = 0;
    const level = terminalKind === "ocean" ? raster.seaLevel : raster.groundHeight[terminal];
    spillLevel[terminal] = level;
    bestSpill[terminal] = level;
  }
  const heap = new DrainageMinHeap();
  const relaxFrom = (parent) => {
    forEachNeighbor(parent, raster.width, raster.height, topology, (neighbor) => {
      if (raster.valid[neighbor] === 0 || settled[neighbor] !== 0) return;
      const candidateSpill = Math.max(raster.groundHeight[neighbor], spillLevel[parent]);
      if (candidateSpill < bestSpill[neighbor]) {
        bestSpill[neighbor] = candidateSpill;
        downstream[neighbor] = parent;
        heap.push(neighbor, candidateSpill);
      } else if (candidateSpill === bestSpill[neighbor] && betterParent(parent, downstream[neighbor], spillLevel, drainageRank)) {
        downstream[neighbor] = parent;
      }
    });
  };
  for (const terminal of terminalIndices) relaxFrom(terminal);
  const settlementOrder = [];
  while (heap.size > 0) {
    const entry = heap.pop();
    const [index, priority] = entry;
    if (settled[index] !== 0 || bestSpill[index] !== priority) continue;
    const parent = downstream[index];
    if (parent < 0 || settled[parent] === 0) {
      throw new Error("macro drainage priority queue selected an unsettled parent");
    }
    settled[index] = 1;
    spillLevel[index] = priority;
    drainageRank[index] = settlementOrder.length + 1;
    settlementOrder.push(index);
    relaxFrom(index);
  }
  if (settlementOrder.length + terminalIndices.length !== validNodeCount) {
    throw new Error("macro drainage tree did not reach every valid node");
  }
  for (let order = settlementOrder.length - 1; order >= 0; order -= 1) {
    const index = settlementOrder[order];
    const parent = downstream[index];
    discharge[parent] = Math.min(4294967295, discharge[parent] + discharge[index]);
  }
  const tree = Object.freeze({
    width: raster.width,
    height: raster.height,
    terminalKind,
    terminalIndices: Uint32Array.from(terminalIndices),
    downstream,
    drainageRank,
    spillLevel,
    discharge,
    validNodeCount,
    maxDrainageRank: settlementOrder.length
  });
  assertMacroDrainageTree(tree, raster.valid, topology);
  return tree;
}
function buildMacroDrainageTree(raster) {
  return buildMacroDrainageTreeForTopology(raster, "bounded");
}
function buildToroidalMacroDrainageTree(raster) {
  if (raster.width < 3 || raster.height < 3) {
    throw new RangeError("toroidal macro drainage raster dimensions must each be at least three");
  }
  return buildMacroDrainageTreeForTopology(raster, "toroidal");
}
function assertMacroDrainageTree(tree, valid, topology = "bounded") {
  if (!tree || typeof tree !== "object" || !Number.isInteger(tree.width) || tree.width <= 0 || !Number.isInteger(tree.height) || tree.height <= 0 || tree.terminalKind !== "ocean" && tree.terminalKind !== "lake" || topology !== "bounded" && topology !== "toroidal") {
    throw new TypeError("macro drainage tree shape or topology is invalid");
  }
  const length = tree.width * tree.height;
  if (!(valid instanceof Uint8Array) || valid.length !== length || !(tree.terminalIndices instanceof Uint32Array) || !(tree.downstream instanceof Int32Array) || tree.downstream.length !== length || !(tree.drainageRank instanceof Uint32Array) || tree.drainageRank.length !== length || !(tree.spillLevel instanceof Uint16Array) || tree.spillLevel.length !== length || !(tree.discharge instanceof Uint32Array) || tree.discharge.length !== length) {
    throw new TypeError("macro drainage tree arrays do not match its dimensions");
  }
  if (!Number.isSafeInteger(tree.validNodeCount) || tree.validNodeCount <= 0 || tree.validNodeCount > length || !Number.isSafeInteger(tree.maxDrainageRank) || tree.maxDrainageRank < 0 || tree.maxDrainageRank >= tree.validNodeCount || tree.terminalIndices.length !== tree.validNodeCount - tree.maxDrainageRank || tree.terminalIndices.length === 0) {
    throw new RangeError("macro drainage tree summary is outside its supported bounds");
  }
  const terminalMask = new Uint8Array(length);
  for (const terminal of tree.terminalIndices) {
    if (terminal >= length || valid[terminal] === 0 || terminalMask[terminal] !== 0) {
      throw new Error("macro drainage terminal list contains an invalid or duplicate node");
    }
    terminalMask[terminal] = 1;
  }
  const nodeAtRank = new Uint32Array(tree.maxDrainageRank + 1);
  const rankSeen = new Uint8Array(tree.maxDrainageRank + 1);
  let validCount = 0;
  let observedMaxRank = 0;
  for (let index = 0; index < length; index += 1) {
    if (valid[index] > 1) throw new TypeError("macro drainage valid mask must contain only zero or one");
    if (valid[index] === 0) {
      if (tree.downstream[index] !== MACRO_DRAINAGE_INVALID || tree.drainageRank[index] !== MACRO_DRAINAGE_INVALID_RANK || tree.discharge[index] !== 0 || terminalMask[index] !== 0) {
        throw new Error("macro drainage tree populated an invalid node");
      }
      continue;
    }
    validCount += 1;
    observedMaxRank = Math.max(observedMaxRank, tree.drainageRank[index]);
    const parent = tree.downstream[index];
    if (parent === MACRO_DRAINAGE_TERMINAL) {
      if (tree.drainageRank[index] !== 0 || terminalMask[index] === 0) {
        throw new Error("macro drainage terminal must be listed exactly once with rank zero");
      }
      continue;
    }
    const rank = tree.drainageRank[index];
    if (terminalMask[index] !== 0 || rank === 0 || rank > tree.maxDrainageRank || rankSeen[rank] !== 0) {
      throw new Error("macro drainage non-terminal ranks must form one canonical order");
    }
    rankSeen[rank] = 1;
    nodeAtRank[rank] = index;
    if (parent < 0 || parent >= length || valid[parent] === 0 || !areNeighbors(index, parent, tree.width, tree.height, topology)) {
      throw new Error("macro drainage node has an invalid downstream parent");
    }
    if (tree.drainageRank[parent] >= tree.drainageRank[index]) {
      throw new Error("macro drainage rank must strictly decrease downstream");
    }
    if (tree.spillLevel[parent] > tree.spillLevel[index]) {
      throw new Error("macro drainage spill level cannot rise downstream");
    }
    if (tree.discharge[parent] < tree.discharge[index]) {
      throw new Error("macro drainage discharge cannot decrease at a merge");
    }
  }
  if (validCount !== tree.validNodeCount || observedMaxRank !== tree.maxDrainageRank) {
    throw new Error("macro drainage tree summary does not match its arrays");
  }
  const expectedDischarge = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    if (valid[index] !== 0) expectedDischarge[index] = 1;
  }
  for (let rank = tree.maxDrainageRank; rank > 0; rank -= 1) {
    if (rankSeen[rank] === 0) throw new Error("macro drainage rank order contains a gap");
    const index = nodeAtRank[rank];
    const parent = tree.downstream[index];
    expectedDischarge[parent] = Math.min(4294967295, expectedDischarge[parent] + expectedDischarge[index]);
  }
  for (let index = 0; index < length; index += 1) {
    if (tree.discharge[index] !== expectedDischarge[index]) {
      throw new Error("macro drainage discharge does not match the canonical accumulation");
    }
  }
}

// src/world/MacroDrainageGraph.ts
var MACRO_DRAINAGE_NODE_STEP_TILES = 8;
var MAX_MACRO_DRAINAGE_GRAPH_NODES = 1048576;
function abortError() {
  if (typeof DOMException !== "undefined") return new DOMException("macro drainage graph build was aborted", "AbortError");
  const error = new Error("macro drainage graph build was aborted");
  error.name = "AbortError";
  return error;
}
function macroDrainageDischargeClass(discharge) {
  return Math.min(255, Math.floor(Math.log2(Math.max(1, discharge))));
}
function treeFor(raster, topology) {
  return topology === "toroidal" ? buildToroidalMacroDrainageTree(raster) : buildMacroDrainageTree(raster);
}
function assignMacroDrainageTerminalNodes(tree) {
  const terminalNode = new Uint32Array(tree.downstream.length);
  terminalNode.fill(4294967295);
  for (const terminal of tree.terminalIndices) terminalNode[terminal] = terminal;
  const nodeAtRank = new Uint32Array(tree.maxDrainageRank + 1);
  for (let index = 0; index < tree.drainageRank.length; index += 1) {
    const rank = tree.drainageRank[index];
    if (rank > 0 && rank <= tree.maxDrainageRank) nodeAtRank[rank] = index;
  }
  for (let rank = 1; rank <= tree.maxDrainageRank; rank += 1) {
    const index = nodeAtRank[rank];
    const parent = tree.downstream[index];
    if (parent < 0 || terminalNode[parent] === 4294967295) {
      throw new Error("macro drainage terminal assignment encountered an unresolved parent");
    }
    terminalNode[index] = terminalNode[parent];
  }
  return terminalNode;
}
function macroDrainageNodeTile(graph, index) {
  if (!Number.isInteger(index) || index < 0 || index >= graph.width * graph.height) {
    throw new RangeError("macro drainage node index is invalid");
  }
  const nodeX = Math.floor(index / graph.height);
  const nodeY = index - nodeX * graph.height;
  return Object.freeze({
    x: Math.min(graph.worldWidth - 1, nodeX * MACRO_DRAINAGE_NODE_STEP_TILES + 4),
    y: Math.min(graph.worldHeight - 1, nodeY * MACRO_DRAINAGE_NODE_STEP_TILES + 4)
  });
}
function macroDrainageNodeId(graph, index) {
  const tile = macroDrainageNodeTile(graph, index);
  return macroDrainageTileNodeId(tile.x, tile.y);
}
function macroDrainageTileNodeId(tileX, tileY) {
  if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
    throw new RangeError("macro drainage node tile must use safe integer coordinates");
  }
  return `node:${tileX}:${tileY}`;
}
function macroDrainageTerminalBodyId(graph, index) {
  if (!Number.isInteger(index) || index < 0 || index >= graph.terminalNode.length) {
    throw new RangeError("macro drainage terminal body node is invalid");
  }
  const terminal = graph.terminalNode[index];
  return graph.ocean[terminal] !== 0 ? OCEAN_BODY_ID : `lake:${macroDrainageNodeId(graph, terminal)}`;
}
function assertMacroDrainageGraph(graph) {
  if (!graph || typeof graph !== "object" || graph.revision !== 0 || typeof graph.worldIdentity !== "string" || graph.worldIdentity.length === 0 || graph.topology !== "finite" && graph.topology !== "toroidal" || !Number.isSafeInteger(graph.worldWidth) || graph.worldWidth <= 0 || !Number.isSafeInteger(graph.worldHeight) || graph.worldHeight <= 0 || graph.nodeStepTiles !== MACRO_DRAINAGE_NODE_STEP_TILES || graph.width !== Math.ceil(graph.worldWidth / MACRO_DRAINAGE_NODE_STEP_TILES) || graph.height !== Math.ceil(graph.worldHeight / MACRO_DRAINAGE_NODE_STEP_TILES)) {
    throw new TypeError("macro drainage graph dimensions, identity or topology are invalid");
  }
  const length = graph.width * graph.height;
  if (length > MAX_MACRO_DRAINAGE_GRAPH_NODES || !(graph.groundHeight instanceof Uint16Array) || graph.groundHeight.length !== length || !(graph.ocean instanceof Uint8Array) || graph.ocean.length !== length || !(graph.dischargeClass instanceof Uint8Array) || graph.dischargeClass.length !== length || !(graph.terminalNode instanceof Uint32Array) || graph.terminalNode.length !== length || !Number.isInteger(graph.seaLevel) || graph.seaLevel < 0 || graph.seaLevel > 65535) {
    throw new RangeError("macro drainage graph arrays or sea level exceed the frozen contract");
  }
  const valid = new Uint8Array(length);
  valid.fill(1);
  assertMacroDrainageTree(graph, valid, graph.topology === "toroidal" ? "toroidal" : "bounded");
  if (graph.validNodeCount !== length) {
    throw new Error("complete macro drainage graph must populate every node");
  }
  const expectedTerminalNode = assignMacroDrainageTerminalNodes(graph);
  let oceanCount = 0;
  for (let index = 0; index < length; index += 1) {
    if (graph.ocean[index] > 1) throw new TypeError("macro drainage ocean mask must contain only zero or one");
    if (graph.ocean[index] !== 0) {
      oceanCount += 1;
      if (graph.groundHeight[index] > graph.seaLevel || graph.downstream[index] !== MACRO_DRAINAGE_TERMINAL) {
        throw new Error("macro drainage ocean nodes must be valid sea-level terminals");
      }
    }
    const terminal = graph.terminalNode[index];
    if (terminal >= length || graph.downstream[terminal] !== MACRO_DRAINAGE_TERMINAL || terminal !== expectedTerminalNode[index] || graph.dischargeClass[index] !== macroDrainageDischargeClass(graph.discharge[index])) {
      throw new Error("macro drainage graph terminal or discharge class is invalid");
    }
  }
  if (oceanCount > 0 && (graph.terminalKind !== "ocean" || graph.terminalIndices.length !== oceanCount) || oceanCount === 0 && (graph.terminalKind !== "lake" || graph.terminalIndices.length !== 1)) {
    throw new Error("macro drainage terminal kind does not match its ocean mask");
  }
  if (graph.topology === "toroidal" && (graph.worldWidth % WORLD_SEMANTIC_CHUNK_SIZE !== 0 || graph.worldHeight % WORLD_SEMANTIC_CHUNK_SIZE !== 0)) {
    throw new Error("toroidal macro drainage graph is not semantic-chunk aligned");
  }
}
function sampleMacroNodesFromChunk(chunk, key, worldWidth, worldHeight, nodeWidth, nodeHeight, seaLevel, groundHeight, ocean) {
  for (let localNodeX = 0; localNodeX < 4; localNodeX += 1) {
    const nodeX = key.chunkX * 4 + localNodeX;
    if (nodeX >= nodeWidth) break;
    const tileX = Math.min(worldWidth - 1, nodeX * MACRO_DRAINAGE_NODE_STEP_TILES + 4);
    const localX = tileX - key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    for (let localNodeY = 0; localNodeY < 4; localNodeY += 1) {
      const nodeY = key.chunkY * 4 + localNodeY;
      if (nodeY >= nodeHeight) break;
      const tileY = Math.min(worldHeight - 1, nodeY * MACRO_DRAINAGE_NODE_STEP_TILES + 4);
      const localY = tileY - key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
      const sourceIndex = semanticTileIndex(localX, localY);
      const targetIndex = macroDrainageIndex(nodeX, nodeY, nodeHeight);
      const value = chunk.macroHeight[sourceIndex];
      groundHeight[targetIndex] = value;
      ocean[targetIndex] = value < seaLevel ? 1 : 0;
    }
  }
}
async function buildMacroDrainageGraph(source, options = {}) {
  if (!source.bounds || source.bounds.topology !== "finite" && source.bounds.topology !== "toroidal") {
    throw new TypeError("complete macro drainage graph requires a finite or toroidal semantic source");
  }
  const maximumConcurrentChunkLoads = options.maximumConcurrentChunkLoads ?? 8;
  if (!Number.isInteger(maximumConcurrentChunkLoads) || maximumConcurrentChunkLoads <= 0 || maximumConcurrentChunkLoads > 32) {
    throw new RangeError("macro drainage chunk concurrency must be an integer between 1 and 32");
  }
  if (options.signal?.aborted) throw abortError();
  const width = Math.ceil(source.bounds.width / MACRO_DRAINAGE_NODE_STEP_TILES);
  const height = Math.ceil(source.bounds.height / MACRO_DRAINAGE_NODE_STEP_TILES);
  const length = width * height;
  if (!Number.isSafeInteger(length) || length > MAX_MACRO_DRAINAGE_GRAPH_NODES) {
    throw new RangeError("macro drainage graph exceeds the frozen node budget");
  }
  const groundHeight = new Uint16Array(length);
  const ocean = new Uint8Array(length);
  const valid = new Uint8Array(length);
  valid.fill(1);
  const chunkCountX = Math.ceil(source.bounds.width / WORLD_SEMANTIC_CHUNK_SIZE);
  const chunkCountY = Math.ceil(source.bounds.height / WORLD_SEMANTIC_CHUNK_SIZE);
  const keys = [];
  for (let chunkX = 0; chunkX < chunkCountX; chunkX += 1) {
    for (let chunkY = 0; chunkY < chunkCountY; chunkY += 1) keys.push({ chunkX, chunkY });
  }
  const sampleChunk = async (key) => {
    if (options.signal?.aborted) throw abortError();
    const chunk = await source.loadChunk(key.chunkX, key.chunkY, {
      signal: options.signal,
      lane: "background",
      priority: key.chunkX * chunkCountY + key.chunkY
    });
    try {
      sampleMacroNodesFromChunk(
        chunk,
        key,
        source.bounds.width,
        source.bounds.height,
        width,
        height,
        source.descriptor.seaLevel,
        groundHeight,
        ocean
      );
    } finally {
      source.releaseChunk(chunk);
    }
  };
  for (let start = 0; start < keys.length; start += maximumConcurrentChunkLoads) {
    await Promise.all(keys.slice(start, start + maximumConcurrentChunkLoads).map(sampleChunk));
  }
  const raster = {
    width,
    height,
    valid,
    groundHeight,
    ocean,
    seaLevel: source.descriptor.seaLevel
  };
  const tree = treeFor(raster, source.bounds.topology);
  const dischargeClass = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    dischargeClass[index] = macroDrainageDischargeClass(tree.discharge[index]);
  }
  const graph = Object.freeze({
    revision: 0,
    worldIdentity: source.worldIdentity,
    topology: source.bounds.topology,
    worldWidth: source.bounds.width,
    worldHeight: source.bounds.height,
    nodeStepTiles: MACRO_DRAINAGE_NODE_STEP_TILES,
    width,
    height,
    seaLevel: source.descriptor.seaLevel,
    groundHeight,
    ocean,
    downstream: tree.downstream,
    drainageRank: tree.drainageRank,
    spillLevel: tree.spillLevel,
    discharge: tree.discharge,
    dischargeClass,
    terminalNode: assignMacroDrainageTerminalNodes(tree),
    terminalKind: tree.terminalKind,
    terminalIndices: tree.terminalIndices,
    validNodeCount: tree.validNodeCount,
    maxDrainageRank: tree.maxDrainageRank
  });
  assertMacroDrainageGraph(graph);
  return graph;
}

// src/world/MacroDrainageHydrologySource.ts
var MIN_RIVER_DISCHARGE = 8;
var MIN_LAKE_RADIUS_TILES = 4;
var MAX_LAKE_RADIUS_TILES = 16;
var MACRO_NODE_CENTER_OFFSET = MACRO_DRAINAGE_NODE_STEP_TILES / 2;
function positiveModulo4(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function wrappedNodeStep(from, to, count) {
  let step = to - from;
  if (step > 1) step -= count;
  else if (step < -1) step += count;
  if (step < -1 || step > 1) throw new Error("toroidal drainage edge is not a neighboring node step");
  return step;
}
function nodeAxisRange(minimum, maximum, count, toroidal) {
  const minimumNode = Math.ceil(
    (minimum - MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET) / MACRO_DRAINAGE_NODE_STEP_TILES
  );
  const maximumNode = Math.floor(
    (maximum + MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET) / MACRO_DRAINAGE_NODE_STEP_TILES
  );
  return toroidal ? [minimumNode, maximumNode] : [Math.max(0, minimumNode), Math.min(count - 1, maximumNode)];
}
var MacroDrainageHydrologySource = class {
  constructor(graph) {
    assertMacroDrainageGraph(graph);
    this.graph = graph;
    this.regionCountX = Math.ceil(graph.worldWidth / HYDROLOGY_REGION_SIZE);
    this.regionCountY = Math.ceil(graph.worldHeight / HYDROLOGY_REGION_SIZE);
    this.terminalWaterLevel = deriveMacroDrainageTerminalWaterLevels(graph, graph);
  }
  resolveRegion(regionX, regionY) {
    if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return void 0;
    if (this.graph.topology === "finite") {
      return regionX >= 0 && regionX < this.regionCountX && regionY >= 0 && regionY < this.regionCountY ? Object.freeze({ regionX, regionY }) : void 0;
    }
    return Object.freeze({
      regionX: positiveModulo4(regionX, this.regionCountX),
      regionY: positiveModulo4(regionY, this.regionCountY)
    });
  }
  buildRegion(regionX, regionY) {
    const key = this.resolveRegion(regionX, regionY);
    if (!key || key.regionX !== regionX || key.regionY !== regionY) {
      throw new RangeError("hydrology region build requires a canonical in-domain key");
    }
    const origin = chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
    const validWidth = Math.min(HYDROLOGY_REGION_SIZE, this.graph.worldWidth - origin.x);
    const validHeight = Math.min(HYDROLOGY_REGION_SIZE, this.graph.worldHeight - origin.y);
    const endX = origin.x + validWidth;
    const endY = origin.y + validHeight;
    const toroidal = this.graph.topology === "toroidal";
    const assembler = new HydrologyRegionAssembler({
      worldIdentity: this.graph.worldIdentity,
      topology: this.graph.topology,
      key,
      validWidth,
      validHeight,
      canonicalizePort: (tileX, tileY) => {
        const canonical = canonicalHydrologyPoint(tileX, tileY);
        return toroidal ? Object.freeze({
          tileX: positiveModulo4(canonical.tileX, this.graph.worldWidth),
          tileY: positiveModulo4(canonical.tileY, this.graph.worldHeight)
        }) : canonical;
      }
    });
    const [minimumNodeX, maximumNodeX] = nodeAxisRange(origin.x, endX, this.graph.width, toroidal);
    const [minimumNodeY, maximumNodeY] = nodeAxisRange(origin.y, endY, this.graph.height, toroidal);
    for (let unwrappedNodeX = minimumNodeX; unwrappedNodeX <= maximumNodeX; unwrappedNodeX += 1) {
      const nodeX = toroidal ? positiveModulo4(unwrappedNodeX, this.graph.width) : unwrappedNodeX;
      for (let unwrappedNodeY = minimumNodeY; unwrappedNodeY <= maximumNodeY; unwrappedNodeY += 1) {
        const nodeY = toroidal ? positiveModulo4(unwrappedNodeY, this.graph.height) : unwrappedNodeY;
        const sourceIndex = macroDrainageIndex(nodeX, nodeY, this.graph.height);
        const sourceTile = macroDrainageNodeTile(this.graph, sourceIndex);
        const physicalSourceX = toroidal ? unwrappedNodeX * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : sourceTile.x;
        const physicalSourceY = toroidal ? unwrappedNodeY * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : sourceTile.y;
        if (physicalSourceX >= origin.x && physicalSourceX < endX && physicalSourceY >= origin.y && physicalSourceY < endY && this.graph.ocean[sourceIndex] !== 0) assembler.addOceanReference();
        const parentIndex = this.graph.downstream[sourceIndex];
        if (parentIndex === MACRO_DRAINAGE_TERMINAL || this.graph.ocean[sourceIndex] !== 0 || this.graph.discharge[sourceIndex] < MIN_RIVER_DISCHARGE) continue;
        const parentX = Math.floor(parentIndex / this.graph.height);
        const parentY = parentIndex - parentX * this.graph.height;
        const parentTile = macroDrainageNodeTile(this.graph, parentIndex);
        const physicalParentX = toroidal ? (unwrappedNodeX + wrappedNodeStep(nodeX, parentX, this.graph.width)) * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : parentTile.x;
        const physicalParentY = toroidal ? (unwrappedNodeY + wrappedNodeStep(nodeY, parentY, this.graph.height)) * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : parentTile.y;
        const parentTerminal = this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL;
        assembler.addDrainageEdge({
          sourceNodeId: macroDrainageNodeId(this.graph, sourceIndex),
          parentNodeId: macroDrainageNodeId(this.graph, parentIndex),
          terminalNodeId: macroDrainageNodeId(this.graph, this.graph.terminalNode[sourceIndex]),
          sourceX: physicalSourceX,
          sourceY: physicalSourceY,
          parentX: physicalParentX,
          parentY: physicalParentY,
          sourceLevel: this.graph.spillLevel[sourceIndex],
          parentLevel: parentTerminal ? this.terminalWaterLevel[parentIndex] : this.graph.spillLevel[parentIndex],
          dischargeClass: this.graph.dischargeClass[sourceIndex],
          ...parentTerminal ? {
            parentTerminal: {
              bodyId: macroDrainageTerminalBodyId(this.graph, sourceIndex),
              kind: this.graph.ocean[parentIndex] !== 0 ? "ocean" : "lake"
            }
          } : {}
        });
      }
    }
    this.addLakeSlices(assembler);
    return assembler.finish();
  }
  addLakeSlices(assembler) {
    if (this.graph.terminalKind !== "lake") return;
    const toroidal = this.graph.topology === "toroidal";
    for (const terminal of this.graph.terminalIndices) {
      const center = macroDrainageNodeTile(this.graph, terminal);
      const radiusTiles = Math.min(
        MAX_LAKE_RADIUS_TILES,
        MIN_LAKE_RADIUS_TILES + this.graph.dischargeClass[terminal]
      );
      const shiftsX = toroidal ? [-this.graph.worldWidth, 0, this.graph.worldWidth] : [0];
      const shiftsY = toroidal ? [-this.graph.worldHeight, 0, this.graph.worldHeight] : [0];
      for (const shiftX of shiftsX) {
        for (const shiftY of shiftsY) {
          assembler.addLakeSlice({
            bodyId: macroDrainageTerminalBodyId(this.graph, terminal),
            centerX: center.x + shiftX,
            centerY: center.y + shiftY,
            radiusTiles,
            level: this.terminalWaterLevel[terminal]
          });
        }
      }
    }
  }
};

// src/world/InfiniteHydrologyRegionSource.ts
var DEFAULT_INFINITE_HYDROLOGY_RESIDENT_BASINS = 16;
var MIN_INFINITE_HYDROLOGY_RESIDENT_BASINS = 9;
var BASIN_CELL_MACRO_NODES = 512 / MACRO_DRAINAGE_NODE_STEP_TILES;
var BASIN_SUPPORT_CELL_RADIUS = 1;
var BASIN_OWNER_SITE_RADIUS = 2;
var BASIN_SUPPORT_NODE_SPAN = BASIN_CELL_MACRO_NODES * (BASIN_SUPPORT_CELL_RADIUS * 2 + 1);
var UNASSIGNED_OWNER = 255;
var MACRO_NODE_CENTER_OFFSET2 = MACRO_DRAINAGE_NODE_STEP_TILES / 2;
function checkedCellNodeOrigin(cell) {
  if (!Number.isSafeInteger(cell)) throw new RangeError("infinite drainage basin cell must be a safe integer");
  const node = cell * BASIN_CELL_MACRO_NODES;
  if (!Number.isSafeInteger(node)) throw new RangeError("infinite drainage node origin exceeds safe integers");
  return node;
}
function checkedNodeTile(node) {
  const tile = node * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET2;
  if (!Number.isSafeInteger(tile)) throw new RangeError("infinite drainage node tile exceeds safe integers");
  return tile;
}
function sameSite(first, second) {
  return first.cellX === second.cellX && first.cellY === second.cellY;
}
function nearestSite(sites, tileX, tileY) {
  let best = sites[0];
  let bestDistance = infiniteDrainageSiteDistanceSquared(best, tileX, tileY);
  for (let index = 1; index < sites.length; index += 1) {
    const candidate = sites[index];
    const distance = infiniteDrainageSiteDistanceSquared(candidate, tileX, tileY);
    if (distance < bestDistance || distance === bestDistance && compareInfiniteDrainageBasinKeys(candidate, best) < 0) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
function nodeAxisRange2(minimumTile, maximumTile) {
  return [
    Math.ceil(
      (minimumTile - MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET2) / MACRO_DRAINAGE_NODE_STEP_TILES
    ),
    Math.floor(
      (maximumTile + MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET2) / MACRO_DRAINAGE_NODE_STEP_TILES
    )
  ];
}
function basinBytes(graph) {
  return graph.valid.byteLength + graph.ocean.byteLength + graph.tree.terminalIndices.byteLength + graph.tree.downstream.byteLength + graph.tree.drainageRank.byteLength + graph.tree.spillLevel.byteLength + graph.tree.discharge.byteLength + graph.terminalNode.byteLength + graph.terminalWaterLevel.byteLength;
}
var InfiniteHydrologyRegionSource = class {
  constructor(options) {
    this.basinCache = new CoordinatePairMap();
    this.cacheClock = 0;
    this.cacheBytes = 0;
    this.basinBuilds = 0;
    this.basinCacheHits = 0;
    if (!options || typeof options !== "object" || !options.descriptor || options.descriptor.sourceKind !== "procedural-infinite") {
      throw new TypeError("infinite hydrology source requires an infinite world descriptor");
    }
    this.maximumResidentBasins = options.maximumResidentBasins ?? DEFAULT_INFINITE_HYDROLOGY_RESIDENT_BASINS;
    if (!Number.isInteger(this.maximumResidentBasins) || this.maximumResidentBasins < MIN_INFINITE_HYDROLOGY_RESIDENT_BASINS || this.maximumResidentBasins > 64) {
      throw new RangeError("infinite hydrology basin cache must contain between 9 and 64 basins");
    }
    this.descriptor = options.descriptor;
    this.generator = createBaseSemanticChunkGenerator(options.descriptor);
    this.worldIdentity = this.generator.identity;
    this.basinResolver = new InfiniteDrainageBasinResolver(options.descriptor.seed);
  }
  resolveRegion(regionX, regionY) {
    if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return void 0;
    try {
      chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
      return Object.freeze({ regionX, regionY });
    } catch {
      return void 0;
    }
  }
  buildRegion(regionX, regionY) {
    const key = this.resolveRegion(regionX, regionY);
    if (!key) throw new RangeError("infinite hydrology region key exceeds safe logical coordinates");
    const origin = chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
    const endX = origin.x + HYDROLOGY_REGION_SIZE;
    const endY = origin.y + HYDROLOGY_REGION_SIZE;
    const assembler = new HydrologyRegionAssembler({
      worldIdentity: this.worldIdentity,
      topology: "infinite",
      key,
      validWidth: HYDROLOGY_REGION_SIZE,
      validHeight: HYDROLOGY_REGION_SIZE,
      canonicalizePort: canonicalHydrologyPoint
    });
    const candidates = this.basinResolver.candidateSites(origin.x, origin.y);
    for (const candidate of candidates) {
      this.addBasinFeatures(this.basinFor(candidate.cellX, candidate.cellY), origin.x, origin.y, assembler);
    }
    return assembler.finish();
  }
  get stats() {
    return Object.freeze({
      residentBasins: this.basinCache.size,
      residentBytes: this.cacheBytes,
      basinBuilds: this.basinBuilds,
      basinCacheHits: this.basinCacheHits
    });
  }
  clearCache() {
    this.basinCache.clear();
    this.cacheBytes = 0;
  }
  basinFor(cellX, cellY) {
    const cached = this.basinCache.get(cellX, cellY);
    if (cached) {
      this.basinCacheHits += 1;
      this.touch(cached);
      return cached;
    }
    const built = this.buildBasin(cellX, cellY);
    this.touch(built);
    this.basinCache.set(cellX, cellY, built);
    this.cacheBytes += built.bytes;
    this.basinBuilds += 1;
    while (this.basinCache.size > this.maximumResidentBasins) this.evictOldestBasin();
    return built;
  }
  buildBasin(cellX, cellY) {
    const target = this.basinResolver.siteAt(cellX, cellY);
    const sites = [];
    for (let siteCellX = cellX - BASIN_OWNER_SITE_RADIUS; siteCellX <= cellX + BASIN_OWNER_SITE_RADIUS; siteCellX += 1) {
      for (let siteCellY = cellY - BASIN_OWNER_SITE_RADIUS; siteCellY <= cellY + BASIN_OWNER_SITE_RADIUS; siteCellY += 1) {
        sites.push(this.basinResolver.siteAt(siteCellX, siteCellY));
      }
    }
    const windowOriginNodeX = checkedCellNodeOrigin(cellX - BASIN_SUPPORT_CELL_RADIUS);
    const windowOriginNodeY = checkedCellNodeOrigin(cellY - BASIN_SUPPORT_CELL_RADIUS);
    const ownership = new Uint8Array(BASIN_SUPPORT_NODE_SPAN * BASIN_SUPPORT_NODE_SPAN);
    ownership.fill(UNASSIGNED_OWNER);
    let minimumX = BASIN_SUPPORT_NODE_SPAN;
    let minimumY = BASIN_SUPPORT_NODE_SPAN;
    let maximumX = -1;
    let maximumY = -1;
    for (let localX = 0; localX < BASIN_SUPPORT_NODE_SPAN; localX += 1) {
      const tileX = checkedNodeTile(windowOriginNodeX + localX);
      for (let localY = 0; localY < BASIN_SUPPORT_NODE_SPAN; localY += 1) {
        const tileY = checkedNodeTile(windowOriginNodeY + localY);
        if (!sameSite(nearestSite(sites, tileX, tileY), target)) continue;
        ownership[macroDrainageIndex(localX, localY, BASIN_SUPPORT_NODE_SPAN)] = 1;
        minimumX = Math.min(minimumX, localX);
        minimumY = Math.min(minimumY, localY);
        maximumX = Math.max(maximumX, localX);
        maximumY = Math.max(maximumY, localY);
        if (localX === 0 || localX === BASIN_SUPPORT_NODE_SPAN - 1 || localY === 0 || localY === BASIN_SUPPORT_NODE_SPAN - 1) {
          throw new Error("infinite drainage basin escaped its proven three-cell support window");
        }
      }
    }
    if (maximumX < minimumX || maximumY < minimumY) {
      throw new Error("infinite drainage basin contains no macro nodes");
    }
    const width = maximumX - minimumX + 1;
    const height = maximumY - minimumY + 1;
    const length = width * height;
    const valid = new Uint8Array(length);
    const groundHeight = new Uint16Array(length);
    const ocean = new Uint8Array(length);
    const originNodeX = windowOriginNodeX + minimumX;
    const originNodeY = windowOriginNodeY + minimumY;
    for (let localX = 0; localX < width; localX += 1) {
      const tileX = checkedNodeTile(originNodeX + localX);
      for (let localY = 0; localY < height; localY += 1) {
        const ownershipIndex = macroDrainageIndex(
          minimumX + localX,
          minimumY + localY,
          BASIN_SUPPORT_NODE_SPAN
        );
        if (ownership[ownershipIndex] === UNASSIGNED_OWNER) continue;
        const index = macroDrainageIndex(localX, localY, height);
        const tileY = checkedNodeTile(originNodeY + localY);
        valid[index] = 1;
        groundHeight[index] = this.generator.sampleMacroHeight(tileX, tileY);
        ocean[index] = groundHeight[index] < this.descriptor.seaLevel ? 1 : 0;
      }
    }
    const raster = {
      width,
      height,
      valid,
      groundHeight,
      ocean,
      seaLevel: this.descriptor.seaLevel
    };
    const tree = buildMacroDrainageTree(raster);
    const partial = {
      cellX,
      cellY,
      originNodeX,
      originNodeY,
      width,
      height,
      valid,
      ocean,
      tree,
      terminalNode: assignMacroDrainageTerminalNodes(tree),
      terminalWaterLevel: deriveMacroDrainageTerminalWaterLevels(tree, raster)
    };
    return {
      ...partial,
      bytes: basinBytes(partial),
      lastUsed: 0
    };
  }
  addBasinFeatures(basin, regionOriginX, regionOriginY, assembler) {
    const [minimumNodeX, maximumNodeX] = nodeAxisRange2(
      regionOriginX,
      regionOriginX + HYDROLOGY_REGION_SIZE
    );
    const [minimumNodeY, maximumNodeY] = nodeAxisRange2(
      regionOriginY,
      regionOriginY + HYDROLOGY_REGION_SIZE
    );
    for (let nodeX = minimumNodeX; nodeX <= maximumNodeX; nodeX += 1) {
      const localX = nodeX - basin.originNodeX;
      if (localX < 0 || localX >= basin.width) continue;
      const sourceTileX = checkedNodeTile(nodeX);
      for (let nodeY = minimumNodeY; nodeY <= maximumNodeY; nodeY += 1) {
        const localY = nodeY - basin.originNodeY;
        if (localY < 0 || localY >= basin.height) continue;
        const sourceIndex = macroDrainageIndex(localX, localY, basin.height);
        if (basin.valid[sourceIndex] === 0) continue;
        const sourceTileY = checkedNodeTile(nodeY);
        if (sourceTileX >= regionOriginX && sourceTileX < regionOriginX + HYDROLOGY_REGION_SIZE && sourceTileY >= regionOriginY && sourceTileY < regionOriginY + HYDROLOGY_REGION_SIZE && basin.ocean[sourceIndex] !== 0) assembler.addOceanReference();
        const parentIndex = basin.tree.downstream[sourceIndex];
        if (parentIndex === MACRO_DRAINAGE_TERMINAL || basin.ocean[sourceIndex] !== 0 || basin.tree.discharge[sourceIndex] < MIN_RIVER_DISCHARGE) continue;
        const parentLocalX = Math.floor(parentIndex / basin.height);
        const parentLocalY = parentIndex - parentLocalX * basin.height;
        const parentNodeX = basin.originNodeX + parentLocalX;
        const parentNodeY = basin.originNodeY + parentLocalY;
        const parentTileX = checkedNodeTile(parentNodeX);
        const parentTileY = checkedNodeTile(parentNodeY);
        const terminalIndex = basin.terminalNode[sourceIndex];
        const terminalLocalX = Math.floor(terminalIndex / basin.height);
        const terminalLocalY = terminalIndex - terminalLocalX * basin.height;
        const terminalNodeId = macroDrainageTileNodeId(
          checkedNodeTile(basin.originNodeX + terminalLocalX),
          checkedNodeTile(basin.originNodeY + terminalLocalY)
        );
        const parentTerminal = basin.tree.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL;
        assembler.addDrainageEdge({
          sourceNodeId: macroDrainageTileNodeId(sourceTileX, sourceTileY),
          parentNodeId: macroDrainageTileNodeId(parentTileX, parentTileY),
          terminalNodeId,
          sourceX: sourceTileX,
          sourceY: sourceTileY,
          parentX: parentTileX,
          parentY: parentTileY,
          sourceLevel: basin.tree.spillLevel[sourceIndex],
          parentLevel: parentTerminal ? basin.terminalWaterLevel[parentIndex] : basin.tree.spillLevel[parentIndex],
          dischargeClass: macroDrainageDischargeClass(basin.tree.discharge[sourceIndex]),
          ...parentTerminal ? {
            parentTerminal: {
              bodyId: basin.tree.terminalKind === "ocean" ? OCEAN_BODY_ID : `lake:${terminalNodeId}`,
              kind: basin.tree.terminalKind
            }
          } : {}
        });
      }
    }
    if (basin.tree.terminalKind !== "lake") return;
    for (const terminal of basin.tree.terminalIndices) {
      const localX = Math.floor(terminal / basin.height);
      const localY = terminal - localX * basin.height;
      const terminalNodeId = macroDrainageTileNodeId(
        checkedNodeTile(basin.originNodeX + localX),
        checkedNodeTile(basin.originNodeY + localY)
      );
      assembler.addLakeSlice({
        bodyId: `lake:${terminalNodeId}`,
        centerX: checkedNodeTile(basin.originNodeX + localX),
        centerY: checkedNodeTile(basin.originNodeY + localY),
        radiusTiles: Math.min(
          MAX_LAKE_RADIUS_TILES,
          MIN_LAKE_RADIUS_TILES + macroDrainageDischargeClass(basin.tree.discharge[terminal])
        ),
        level: basin.terminalWaterLevel[terminal]
      });
    }
  }
  touch(basin) {
    if (this.cacheClock >= Number.MAX_SAFE_INTEGER) {
      const entries = [...this.basinCache.values()].sort((first, second) => first.lastUsed - second.lastUsed);
      for (let index = 0; index < entries.length; index += 1) entries[index].lastUsed = index + 1;
      this.cacheClock = entries.length;
    }
    basin.lastUsed = ++this.cacheClock;
  }
  evictOldestBasin() {
    let oldest;
    for (const basin of this.basinCache.values()) {
      if (!oldest || basin.lastUsed < oldest.lastUsed) oldest = basin;
    }
    if (!oldest) throw new Error("infinite hydrology basin cache eviction found no entry");
    this.basinCache.delete(oldest.cellX, oldest.cellY);
    this.cacheBytes -= oldest.bytes;
  }
};

// src/world/ProceduralHydrologyRegionGenerator.ts
function positiveModulo5(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function abortError2() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("local semantic generation was aborted", "AbortError");
  }
  const error = new Error("local semantic generation was aborted");
  error.name = "AbortError";
  return error;
}
function semanticChunkPayloadBytes(chunk) {
  return chunk.substrateClass.byteLength + chunk.macroHeight.byteLength + chunk.biomeWeights.byteLength + chunk.climate.byteLength + chunk.vegetationDensity.byteLength + chunk.vegetationProfile.byteLength;
}
var GeneratorToroidalSemanticSource = class {
  constructor(descriptor, generator) {
    this.leases = /* @__PURE__ */ new Set();
    this.residentBytes = 0;
    this.disposed = false;
    this.descriptor = descriptor;
    this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    if (generator.identity !== this.worldIdentity) {
      throw new TypeError("toroidal hydrology semantic generator identity does not match its descriptor");
    }
    this.generator = generator;
    this.bounds = Object.freeze({
      width: descriptor.width,
      height: descriptor.height,
      topology: "toroidal"
    });
  }
  resolveChunk(chunkX, chunkY) {
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return void 0;
    return Object.freeze({
      chunkX: positiveModulo5(chunkX, this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE),
      chunkY: positiveModulo5(chunkY, this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE)
    });
  }
  chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
    const first = this.resolveChunk(chunkX, chunkY);
    const second = this.resolveChunk(centerChunkX, centerChunkY);
    if (!first || !second) return Number.POSITIVE_INFINITY;
    const countX = this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
    const countY = this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
    const distanceX = Math.min(
      Math.abs(first.chunkX - second.chunkX),
      countX - Math.abs(first.chunkX - second.chunkX)
    );
    const distanceY = Math.min(
      Math.abs(first.chunkY - second.chunkY),
      countY - Math.abs(first.chunkY - second.chunkY)
    );
    return Math.hypot(distanceX, distanceY);
  }
  loadChunk(chunkX, chunkY, request = {}) {
    if (this.disposed) return Promise.reject(new Error("local toroidal semantic source has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError2());
    const key = this.resolveChunk(chunkX, chunkY);
    if (!key || key.chunkX !== chunkX || key.chunkY !== chunkY) {
      return Promise.reject(new RangeError("local toroidal semantic request requires a canonical chunk key"));
    }
    try {
      const chunk = this.generator.generate(chunkX, chunkY);
      this.leases.add(chunk);
      this.residentBytes += semanticChunkPayloadBytes(chunk);
      return Promise.resolve(chunk);
    } catch (reason) {
      return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
  }
  releaseChunk(chunk) {
    if (!this.leases.delete(chunk)) {
      throw new Error("local toroidal semantic release does not match an active lease");
    }
    this.residentBytes -= semanticChunkPayloadBytes(chunk);
  }
  hasChunk(chunkX, chunkY) {
    for (const chunk of this.leases) {
      if (chunk.key.chunkX === chunkX && chunk.key.chunkY === chunkY) return true;
    }
    return false;
  }
  get stats() {
    return Object.freeze({
      residentChunks: this.leases.size,
      residentBytes: this.residentBytes,
      leasedChunks: this.leases.size,
      inFlightChunks: 0,
      cacheHits: 0,
      cacheMisses: 0,
      workers: 0,
      busyWorkers: 0,
      queuedWorkerTasks: 0
    });
  }
  dispose() {
    if (this.leases.size !== 0) {
      throw new Error("local toroidal semantic source cannot dispose active leases");
    }
    this.disposed = true;
  }
};
var InfiniteProceduralHydrologyRegionGenerator = class {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.identity = serializeWorldDescriptorV2(descriptor);
    this.source = new InfiniteHydrologyRegionSource({ descriptor });
  }
  generate(regionX, regionY) {
    try {
      return Promise.resolve(this.source.buildRegion(regionX, regionY));
    } catch (reason) {
      return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
  }
};
var ToroidalProceduralHydrologyRegionGenerator = class {
  constructor(descriptor, semanticGenerator) {
    this.descriptor = descriptor;
    this.identity = serializeWorldDescriptorV2(descriptor);
    const semanticSource = new GeneratorToroidalSemanticSource(descriptor, semanticGenerator);
    this.source = buildMacroDrainageGraph(semanticSource).then((graph) => new MacroDrainageHydrologySource(graph)).finally(() => semanticSource.dispose());
  }
  async generate(regionX, regionY) {
    return (await this.source).buildRegion(regionX, regionY);
  }
};
function createProceduralHydrologyRegionGenerator(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("procedural hydrology generator options are required");
  }
  assertWorldDescriptorV2(options.descriptor);
  if (options.descriptor.sourceKind === "procedural-infinite") {
    return new InfiniteProceduralHydrologyRegionGenerator(options.descriptor);
  }
  return new ToroidalProceduralHydrologyRegionGenerator(
    options.descriptor,
    createBaseSemanticChunkGenerator(options.descriptor)
  );
}

// src/world/HalfFloat.ts
var FLOAT32 = new Float32Array(1);
var UINT32 = new Uint32Array(FLOAT32.buffer);
var HALF_FLOAT_POSITIVE_INFINITY = 31744;
var HALF_FLOAT_CANONICAL_NAN = 32256;
var HALF_FLOAT_MAX_FINITE = 65504;
function roundToNearestEven(value, remainder, halfway) {
  return remainder > halfway || remainder === halfway && (value & 1) !== 0 ? value + 1 : value;
}
function float32ToFloat16Bits(value) {
  FLOAT32[0] = value;
  const bits = UINT32[0];
  const sign = bits >>> 16 & 32768;
  const exponent = bits >>> 23 & 255;
  const mantissa = bits & 8388607;
  if (exponent === 255) {
    return mantissa === 0 ? sign | HALF_FLOAT_POSITIVE_INFINITY : sign | HALF_FLOAT_CANONICAL_NAN;
  }
  let halfExponent = exponent - 127 + 15;
  if (halfExponent >= 31) return sign | HALF_FLOAT_POSITIVE_INFINITY;
  if (halfExponent <= 0) {
    if (halfExponent < -10) return sign;
    const significand = mantissa | 8388608;
    const shift = 14 - halfExponent;
    let halfMantissa2 = significand >>> shift;
    const remainderMask = 2 ** shift - 1;
    halfMantissa2 = roundToNearestEven(
      halfMantissa2,
      significand & remainderMask,
      2 ** (shift - 1)
    );
    return sign | halfMantissa2;
  }
  let halfMantissa = mantissa >>> 13;
  halfMantissa = roundToNearestEven(halfMantissa, mantissa & 8191, 4096);
  if (halfMantissa === 1024) {
    halfMantissa = 0;
    halfExponent += 1;
    if (halfExponent >= 31) return sign | HALF_FLOAT_POSITIVE_INFINITY;
  }
  return sign | halfExponent << 10 | halfMantissa;
}
function float16BitsToFloat32(bits) {
  if (!Number.isInteger(bits) || bits < 0 || bits > 65535) {
    throw new RangeError("binary16 bits must be a uint16 value");
  }
  const sign = (bits & 32768) !== 0 ? -1 : 1;
  const exponent = bits >>> 10 & 31;
  const mantissa = bits & 1023;
  if (exponent === 31) return mantissa === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  if (exponent === 0) {
    if (mantissa === 0) return sign < 0 ? -0 : 0;
    return sign * 2 ** -14 * (mantissa / 1024);
  }
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}
function finiteFloat16Bits(name, value) {
  if (!Number.isFinite(value) || Math.abs(value) > HALF_FLOAT_MAX_FINITE) {
    throw new RangeError(`${name} must be finite and representable as binary16`);
  }
  const bits = float32ToFloat16Bits(value);
  if (!Number.isFinite(float16BitsToFloat32(bits))) {
    throw new RangeError(`${name} rounded outside finite binary16`);
  }
  return bits;
}

// src/world/CompiledSurfaceField.ts
var SURFACE_COMPILER_REVISION = 1;
var COMPILED_SURFACE_FIELD_FORMAT_VERSION = 1;
var COMPILED_SURFACE_TEXEL_COUNT = SURFACE_COMPILE_PROFILE.textureLayerSize * SURFACE_COMPILE_PROFILE.textureLayerSize;
var SURFACE_WATER_KIND_NONE = 0;
var SURFACE_WATER_KIND_OCEAN = 1;
var SURFACE_WATER_KIND_LAKE = 2;
var SURFACE_WATER_KIND_RIVER = 3;
function assertArrayLayout(field2) {
  const length = COMPILED_SURFACE_TEXEL_COUNT;
  if (!(field2.groundHeight instanceof Uint16Array) || field2.groundHeight.length !== length || !(field2.materialWeights instanceof Uint8Array) || field2.materialWeights.length !== length * 4 || !(field2.waterLevel instanceof Uint16Array) || field2.waterLevel.length !== length || !(field2.waterDepth instanceof Uint16Array) || field2.waterDepth.length !== length || !(field2.shorelineDistance instanceof Uint16Array) || field2.shorelineDistance.length !== length || !(field2.flow instanceof Int8Array) || field2.flow.length !== length * 2 || !(field2.waterCoverage instanceof Uint8Array) || field2.waterCoverage.length !== length || !(field2.waterKind instanceof Uint8Array) || field2.waterKind.length !== length || !(field2.waterProfile instanceof Uint8Array) || field2.waterProfile.length !== length || !(field2.waterBodyIndex instanceof Uint8Array) || field2.waterBodyIndex.length !== length) {
    throw new TypeError("compiled surface field arrays do not match the frozen profile layout");
  }
}
function surfaceFieldTexelIndex(texelX, texelY) {
  const gutter = SURFACE_COMPILE_PROFILE.gutterTexels;
  const maximum = SURFACE_COMPILE_PROFILE.textureLayerSize - gutter - 1;
  if (!Number.isInteger(texelX) || texelX < -gutter || texelX > maximum || !Number.isInteger(texelY) || texelY < -gutter || texelY > maximum) {
    throw new RangeError("surface field texel coordinate is outside its physical layer");
  }
  return (texelX + gutter) * SURFACE_COMPILE_PROFILE.textureLayerSize + texelY + gutter;
}
function assertCompiledSurfaceField(field2) {
  if (!field2 || typeof field2 !== "object" || field2.formatVersion !== COMPILED_SURFACE_FIELD_FORMAT_VERSION || field2.compilerRevision !== SURFACE_COMPILER_REVISION) {
    throw new TypeError("compiled surface field format or compiler revision is unsupported");
  }
  assertArrayLayout(field2);
  for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
    const materialOffset = index * 4;
    const materialSum = field2.materialWeights[materialOffset] + field2.materialWeights[materialOffset + 1] + field2.materialWeights[materialOffset + 2] + field2.materialWeights[materialOffset + 3];
    if (materialSum !== 255) {
      throw new RangeError("compiled surface material weights must sum to 255");
    }
    const groundHeight = float16BitsToFloat32(field2.groundHeight[index]);
    const waterLevel = float16BitsToFloat32(field2.waterLevel[index]);
    const waterDepth = float16BitsToFloat32(field2.waterDepth[index]);
    const shorelineDistance = float16BitsToFloat32(field2.shorelineDistance[index]);
    if (!Number.isFinite(groundHeight) || !Number.isFinite(waterLevel) || !Number.isFinite(waterDepth) || !Number.isFinite(shorelineDistance)) {
      throw new RangeError("compiled surface binary16 fields must be finite");
    }
    const flowOffset = index * 2;
    if (field2.flow[flowOffset] === -128 || field2.flow[flowOffset + 1] === -128) {
      throw new RangeError("compiled surface SNORM flow cannot use the asymmetric -128 code");
    }
    if (field2.waterCoverage[index] === 0) {
      if (field2.waterKind[index] !== SURFACE_WATER_KIND_NONE || field2.waterProfile[index] !== 0 || field2.waterBodyIndex[index] !== 0 || field2.waterLevel[index] !== 0 || field2.waterDepth[index] !== 0 || field2.flow[flowOffset] !== 0 || field2.flow[flowOffset + 1] !== 0) {
        throw new Error("dry surface texels must use canonical zero water payload");
      }
      continue;
    }
    if (field2.waterKind[index] < SURFACE_WATER_KIND_OCEAN || field2.waterKind[index] > SURFACE_WATER_KIND_RIVER || field2.waterBodyIndex[index] === 0) {
      throw new RangeError("wet surface texels require a valid water kind and body palette index");
    }
    if (waterDepth < 0 || field2.waterCoverage[index] >= 128 && waterLevel < groundHeight) {
      throw new Error("wet-majority surface texels cannot contain negative depth or water below ground");
    }
    if (field2.waterDepth[index] !== finiteFloat16Bits(
      "compiled surface water depth",
      Math.max(0, waterLevel - groundHeight)
    )) {
      throw new Error("compiled surface water depth must equal its quantized level minus ground");
    }
    if (field2.waterKind[index] === SURFACE_WATER_KIND_RIVER && field2.flow[flowOffset] === 0 && field2.flow[flowOffset + 1] === 0) {
      throw new Error("river surface texels require a non-zero flow direction");
    }
  }
  if (compiledSurfaceFieldResidentBytes(field2) !== SURFACE_FIELD_CPU_BYTES) {
    throw new Error("compiled surface field byte size drifted from its compile profile");
  }
}
function createCompiledSurfaceField(input) {
  if (!input || typeof input !== "object") throw new TypeError("compiled surface field input is required");
  const field2 = Object.freeze({
    formatVersion: COMPILED_SURFACE_FIELD_FORMAT_VERSION,
    compilerRevision: SURFACE_COMPILER_REVISION,
    groundHeight: input.groundHeight,
    materialWeights: input.materialWeights,
    waterLevel: input.waterLevel,
    waterDepth: input.waterDepth,
    shorelineDistance: input.shorelineDistance,
    flow: input.flow,
    waterCoverage: input.waterCoverage,
    waterKind: input.waterKind,
    waterProfile: input.waterProfile,
    waterBodyIndex: input.waterBodyIndex
  });
  assertCompiledSurfaceField(field2);
  return field2;
}
function compiledSurfaceFieldResidentBytes(field2) {
  return field2.groundHeight.byteLength + field2.materialWeights.byteLength + field2.waterLevel.byteLength + field2.waterDepth.byteLength + field2.shorelineDistance.byteLength + field2.flow.byteLength + field2.waterCoverage.byteLength + field2.waterKind.byteLength + field2.waterProfile.byteLength + field2.waterBodyIndex.byteLength;
}
function compiledSurfaceFieldTransferables(field2) {
  assertCompiledSurfaceField(field2);
  const buffers = [
    field2.groundHeight.buffer,
    field2.materialWeights.buffer,
    field2.waterLevel.buffer,
    field2.waterDepth.buffer,
    field2.shorelineDistance.buffer,
    field2.flow.buffer,
    field2.waterCoverage.buffer,
    field2.waterKind.buffer,
    field2.waterProfile.buffer,
    field2.waterBodyIndex.buffer
  ];
  if (buffers.some((buffer) => !(buffer instanceof ArrayBuffer))) {
    throw new TypeError("compiled surface field transfer requires owned ArrayBuffer payloads");
  }
  if (new Set(buffers).size !== buffers.length) {
    throw new Error("compiled surface field arrays must own distinct transferable buffers");
  }
  return Object.freeze(buffers);
}
if (SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL !== 18 || SURFACE_FIELD_CPU_BYTES !== COMPILED_SURFACE_TEXEL_COUNT * 18) {
  throw new Error("compiled surface field constants do not match the frozen logical layout");
}

// src/world/SurfaceDependencyKey.ts
var SURFACE_DEPENDENCY_KEY_FORMAT_VERSION = 1;
var MAX_SURFACE_DEPENDENCY_SEMANTIC_CHUNKS = 4;
var MAX_SURFACE_DEPENDENCY_HYDROLOGY_REGIONS = 4;
var MAX_SURFACE_DEPENDENCY_HYDROLOGY_FEATURES = 1024;
function assertRevision(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
function assertFeatureId(featureId) {
  if (typeof featureId !== "string" || featureId.length === 0 || featureId.length > 256 || featureId.trim() !== featureId || /[\u0000-\u001f\u007f]/u.test(featureId)) {
    throw new TypeError("surface dependency hydrology feature ID is invalid");
  }
}
function assertMetrics(metrics) {
  if (!metrics || typeof metrics !== "object" || !Number.isFinite(metrics.hexSize) || metrics.hexSize <= 0 || !Number.isFinite(metrics.heightScale) || metrics.heightScale <= 0) {
    throw new RangeError("surface compile metrics must use positive finite scales");
  }
}
function assertCoordinateOrder(name, values, chunkSize, maximum, coordinate) {
  if (!Array.isArray(values) || values.length === 0 || values.length > maximum) {
    throw new RangeError(`${name} dependency count is outside its fixed budget`);
  }
  let previous;
  for (const value of values) {
    if (!value || typeof value !== "object") {
      throw new TypeError(`${name} dependency is invalid`);
    }
    const currentCoordinate = coordinate(value);
    chunkOrigin(currentCoordinate.x, currentCoordinate.y, chunkSize);
    if (previous) {
      const previousCoordinate = coordinate(previous);
      if (previousCoordinate.x > currentCoordinate.x || previousCoordinate.x === currentCoordinate.x && previousCoordinate.y >= currentCoordinate.y) {
        throw new Error(`${name} dependencies must use unique ascending keys`);
      }
    }
    previous = value;
  }
}
function assertSurfaceRequestToken(token) {
  if (!token || typeof token !== "object") throw new TypeError("surface request token is required");
  assertRevision("surface request session epoch", token.sessionEpoch);
  assertRevision("surface request render chunk generation", token.renderChunkGeneration);
}
function assertSurfaceDependencyKey(key) {
  if (!key || typeof key !== "object" || key.formatVersion !== SURFACE_DEPENDENCY_KEY_FORMAT_VERSION || key.compilerRevision !== SURFACE_COMPILER_REVISION || key.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION || typeof key.worldIdentity !== "string" || key.worldIdentity.length === 0 || key.worldIdentity.length > 16384) {
    throw new TypeError("surface dependency key identity or format is invalid");
  }
  chunkOrigin(key.renderKey.chunkX, key.renderKey.chunkY, SURFACE_COMPILE_PROFILE.renderChunkSize);
  assertMetrics(key.metrics);
  assertCoordinateOrder(
    "surface semantic",
    key.semantic,
    WORLD_SEMANTIC_CHUNK_SIZE,
    MAX_SURFACE_DEPENDENCY_SEMANTIC_CHUNKS,
    (dependency) => ({ x: dependency.key.chunkX, y: dependency.key.chunkY })
  );
  for (const dependency of key.semantic) {
    assertRevision("surface semantic base revision", dependency.baseRevision);
    assertRevision("surface semantic delta revision", dependency.deltaRevision);
  }
  assertCoordinateOrder(
    "surface hydrology region",
    key.hydrologyRegions,
    HYDROLOGY_REGION_SIZE,
    MAX_SURFACE_DEPENDENCY_HYDROLOGY_REGIONS,
    (dependency) => ({ x: dependency.key.regionX, y: dependency.key.regionY })
  );
  for (const dependency of key.hydrologyRegions) {
    assertRevision("surface hydrology base revision", dependency.baseRevision);
  }
  if (!Array.isArray(key.hydrologyFeatures) || key.hydrologyFeatures.length > MAX_SURFACE_DEPENDENCY_HYDROLOGY_FEATURES) {
    throw new RangeError("surface hydrology feature dependency count exceeds its fixed budget");
  }
  let previousFeatureId;
  for (const dependency of key.hydrologyFeatures) {
    if (!dependency || typeof dependency !== "object") {
      throw new TypeError("surface hydrology feature dependency is invalid");
    }
    assertFeatureId(dependency.featureId);
    if (dependency.featureKind !== "river" && dependency.featureKind !== "lake") {
      throw new TypeError("surface hydrology feature dependency kind is invalid");
    }
    assertRevision("surface hydrology feature revision", dependency.revision);
    if (dependency.revision === 0) {
      throw new RangeError("surface hydrology feature dependency must refer to a delta revision");
    }
    if (previousFeatureId !== void 0 && previousFeatureId >= dependency.featureId) {
      throw new Error("surface hydrology feature dependencies must use unique ascending identities");
    }
    previousFeatureId = dependency.featureId;
  }
}
function createSurfaceDependencyKey(input) {
  if (!input || typeof input !== "object") throw new TypeError("surface dependency key input is required");
  const key = Object.freeze({
    formatVersion: SURFACE_DEPENDENCY_KEY_FORMAT_VERSION,
    worldIdentity: input.worldIdentity,
    renderKey: Object.freeze({ chunkX: input.renderKey.chunkX, chunkY: input.renderKey.chunkY }),
    compilerRevision: SURFACE_COMPILER_REVISION,
    compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
    metrics: Object.freeze({ hexSize: input.metrics.hexSize, heightScale: input.metrics.heightScale }),
    semantic: Object.freeze(input.semantic.map((dependency) => Object.freeze({
      key: Object.freeze({ chunkX: dependency.key.chunkX, chunkY: dependency.key.chunkY }),
      baseRevision: dependency.baseRevision,
      deltaRevision: dependency.deltaRevision
    }))),
    hydrologyRegions: Object.freeze(input.hydrologyRegions.map((dependency) => Object.freeze({
      key: Object.freeze({
        regionX: dependency.key.regionX,
        regionY: dependency.key.regionY
      }),
      baseRevision: dependency.baseRevision
    }))),
    hydrologyFeatures: Object.freeze(input.hydrologyFeatures.map((dependency) => Object.freeze({
      featureId: dependency.featureId,
      featureKind: dependency.featureKind,
      revision: dependency.revision
    })))
  });
  assertSurfaceDependencyKey(key);
  return key;
}

// src/world/SparseSemanticDelta.ts
var SEMANTIC_DELTA_FIELD_HEIGHT = 1 << 0;
var SEMANTIC_DELTA_FIELD_SUBSTRATE = 1 << 1;
var SEMANTIC_DELTA_FIELD_BIOME = 1 << 2;
var SEMANTIC_DELTA_FIELD_VEGETATION = 1 << 3;
var SEMANTIC_DELTA_ALL_FIELDS = SEMANTIC_DELTA_FIELD_HEIGHT | SEMANTIC_DELTA_FIELD_SUBSTRATE | SEMANTIC_DELTA_FIELD_BIOME | SEMANTIC_DELTA_FIELD_VEGETATION;

// src/world/HydrologyFeatureDelta.ts
var HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION = 1;
var MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS = 256;
var MAX_AUTHORED_LAKE_POLYGON_POINTS = 256;
var MAX_AUTHORED_HYDROLOGY_ID_LENGTH = 256;
var MAX_HYDROLOGY_FEATURE_WORLD_IDENTITY_LENGTH = 16384;
function assertStableId2(name, value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_AUTHORED_HYDROLOGY_ID_LENGTH || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${name} must be a canonical stable identity`);
  }
}
function assertUint82(name, value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be a uint8 value`);
  }
}
function assertUint162(name, value) {
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
function assertAuthoredRiverFeature(feature) {
  if (!feature || typeof feature !== "object" || feature.kind !== "river") {
    throw new TypeError("authored river feature is invalid");
  }
  assertStableId2("authored river feature", feature.featureId);
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
  if (feature.source.kind === "spring") assertStableId2("authored river spring", feature.source.sourceId);
  else if (feature.source.kind === "river") {
    assertStableId2("authored river source river", feature.source.riverId);
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
    assertStableId2("authored river outlet lake", feature.outlet.bodyId);
    if (feature.outlet.bodyId === OCEAN_BODY_ID) {
      throw new Error("authored lake outlet cannot use the reserved ocean body identity");
    }
  } else if (feature.outlet.kind === "river") {
    assertStableId2("authored river outlet river", feature.outlet.riverId);
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
  assertUint82("authored river discharge class", feature.dischargeClass);
  assertUint82("authored river profile", feature.profileIndex);
}
function assertAuthoredLakeFeature(feature) {
  if (!feature || typeof feature !== "object" || feature.kind !== "lake") {
    throw new TypeError("authored lake feature is invalid");
  }
  assertStableId2("authored lake feature", feature.featureId);
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
  assertUint162("authored lake level", feature.level);
  assertUint82("authored lake profile", feature.profileIndex);
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
  assertStableId2("hydrology delta feature", delta.featureId);
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

// src/world/TransferableEffectiveWindow.ts
var TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION = 1;
var EFFECTIVE_WINDOW_TILE_SIZE = SURFACE_COMPILE_PROFILE.renderChunkSize + SURFACE_COMPILE_PROFILE.influenceRadiusTiles * 2;
var EFFECTIVE_WINDOW_TILE_COUNT = EFFECTIVE_WINDOW_TILE_SIZE * EFFECTIVE_WINDOW_TILE_SIZE;
function assertTransferableWorldDomain(domain) {
  if (!domain || typeof domain !== "object") {
    throw new TypeError("transferable effective window domain is required");
  }
  if (domain.topology === "infinite") {
    if ("width" in domain || "height" in domain) {
      throw new TypeError("infinite transferable domain cannot carry finite bounds");
    }
    return;
  }
  if (domain.topology !== "finite" && domain.topology !== "toroidal" || !Number.isSafeInteger(domain.width) || domain.width <= 0 || !Number.isSafeInteger(domain.height) || domain.height <= 0) {
    throw new TypeError("bounded transferable domain is invalid");
  }
}
function assertTransferableEffectiveWindow(window) {
  if (!window || typeof window !== "object" || window.formatVersion !== TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION || window.worldIdentity !== window.dependencyKey.worldIdentity || window.renderKey.chunkX !== window.dependencyKey.renderKey.chunkX || window.renderKey.chunkY !== window.dependencyKey.renderKey.chunkY || !Number.isSafeInteger(window.effectiveRevision) || window.effectiveRevision < 0 || !Number.isInteger(window.seaLevel) || window.seaLevel < 0 || window.seaLevel > 65535) {
    throw new TypeError("transferable effective window identity, key or revision is invalid");
  }
  assertTransferableWorldDomain(window.domain);
  assertSurfaceDependencyKey(window.dependencyKey);
  const expectedOrigin = chunkOrigin(
    window.renderKey.chunkX,
    window.renderKey.chunkY,
    SURFACE_COMPILE_PROFILE.renderChunkSize
  );
  if (window.originTileX !== expectedOrigin.x - SURFACE_COMPILE_PROFILE.influenceRadiusTiles || window.originTileY !== expectedOrigin.y - SURFACE_COMPILE_PROFILE.influenceRadiusTiles) {
    throw new Error("transferable effective window origin does not match its render key and halo");
  }
  const length = EFFECTIVE_WINDOW_TILE_COUNT;
  if (!(window.valid instanceof Uint8Array) || window.valid.length !== length || !(window.substrateClass instanceof Uint8Array) || window.substrateClass.length !== length || !(window.macroHeight instanceof Uint16Array) || window.macroHeight.length !== length || !(window.biomeWeights instanceof Uint8Array) || window.biomeWeights.length !== length * 4 || !(window.climate instanceof Uint8Array) || window.climate.length !== length * 2 || !(window.vegetationDensity instanceof Uint8Array) || window.vegetationDensity.length !== length || !(window.vegetationProfile instanceof Uint8Array) || window.vegetationProfile.length !== length) {
    throw new TypeError("transferable effective semantic arrays do not match the fixed 20x20 layout");
  }
  for (let index = 0; index < length; index += 1) {
    if (window.valid[index] > 1) throw new RangeError("effective window valid mask must be binary");
    if (window.valid[index] === 0) {
      const biomeOffset = index * 4;
      const climateOffset = index * 2;
      if (window.substrateClass[index] !== 0 || window.macroHeight[index] !== 0 || window.biomeWeights[biomeOffset] !== 0 || window.biomeWeights[biomeOffset + 1] !== 0 || window.biomeWeights[biomeOffset + 2] !== 0 || window.biomeWeights[biomeOffset + 3] !== 0 || window.climate[climateOffset] !== 0 || window.climate[climateOffset + 1] !== 0 || window.vegetationDensity[index] !== 0 || window.vegetationProfile[index] !== 0) {
        throw new Error("invalid effective window tiles must use canonical zero semantic payload");
      }
    }
  }
  if (!Array.isArray(window.hydrologyRegions) || !Array.isArray(window.authoredHydrology)) {
    throw new TypeError("transferable effective hydrology lists are required");
  }
  const featureDependencyById = new Map(window.dependencyKey.hydrologyFeatures.map((dependency) => [dependency.featureId, dependency]));
  let previousRegion;
  for (let regionIndex = 0; regionIndex < window.hydrologyRegions.length; regionIndex += 1) {
    const region = window.hydrologyRegions[regionIndex];
    if (region.topology !== window.domain.topology) {
      throw new TypeError("effective window hydrology topology does not match its world domain");
    }
    if (previousRegion && (previousRegion.key.regionX > region.key.regionX || previousRegion.key.regionX === region.key.regionX && previousRegion.key.regionY >= region.key.regionY)) {
      throw new Error("effective window hydrology regions must use unique ascending keys");
    }
    const dependency = window.dependencyKey.hydrologyRegions[regionIndex];
    if (!dependency || dependency.key.regionX !== region.key.regionX || dependency.key.regionY !== region.key.regionY || dependency.baseRevision !== region.baseRevision) {
      throw new Error("effective window hydrology region does not match its dependency key");
    }
    assertHydrologyRegion({
      formatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
      worldIdentity: window.worldIdentity,
      topology: region.topology,
      key: region.key,
      revision: region.baseRevision,
      validBounds: region.validBounds,
      boundaryPorts: region.boundaryPorts,
      rivers: region.rivers,
      lakes: region.lakes,
      mouths: region.mouths,
      bodies: region.bodies
    });
    let previousSuppressedId;
    for (const featureId of region.suppressedBaseFeatureIds) {
      if (previousSuppressedId !== void 0 && previousSuppressedId >= featureId) {
        throw new Error("effective window suppressed feature IDs must be unique ascending identities");
      }
      if (!featureDependencyById.has(featureId)) {
        throw new Error("effective window suppressed feature is missing from its dependency key");
      }
      previousSuppressedId = featureId;
    }
    previousRegion = region;
  }
  if (window.hydrologyRegions.length !== window.dependencyKey.hydrologyRegions.length) {
    throw new Error("effective window hydrology region dependency count is inconsistent");
  }
  let previousFeatureId;
  for (const delta of window.authoredHydrology) {
    assertHydrologyFeatureDelta(delta);
    if (delta.operation !== "upsert" || delta.worldIdentity !== window.worldIdentity || delta.revision > window.effectiveRevision || previousFeatureId !== void 0 && previousFeatureId >= delta.featureId) {
      throw new Error("effective window authored hydrology is invalid or unordered");
    }
    const dependency = featureDependencyById.get(delta.featureId);
    if (!dependency || dependency.featureKind !== delta.featureKind || dependency.revision !== delta.revision) {
      throw new Error("effective window authored feature does not match its dependency key");
    }
    previousFeatureId = delta.featureId;
  }
  for (const dependency of window.dependencyKey.semantic) {
    if (dependency.baseRevision > window.effectiveRevision || dependency.deltaRevision > window.effectiveRevision) {
      throw new RangeError("effective window semantic dependency is newer than its snapshot");
    }
  }
  for (const dependency of window.dependencyKey.hydrologyFeatures) {
    if (dependency.revision > window.effectiveRevision) {
      throw new RangeError("effective window hydrology dependency is newer than its snapshot");
    }
  }
}

// src/world/SurfaceWorkerProtocol.ts
var SURFACE_WORKER_PROTOCOL_VERSION = 3;
function assertWorkerRequestEnvelope(value, expectedType) {
  if (!value || typeof value !== "object") throw new TypeError("surface worker request must be an object");
  const request = value;
  if (request.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION || request.generatorVersion !== WORLD_GENERATOR_VERSION_V2 || !Number.isSafeInteger(request.requestId) || request.requestId <= 0 || request.type !== expectedType) {
    throw new TypeError("surface worker request envelope is invalid or unsupported");
  }
}
function assertProceduralDescriptor(descriptor, taskType) {
  assertWorldDescriptorV2(descriptor);
  if (descriptor.sourceKind === "static") {
    throw new TypeError(`${taskType} requires a procedural world descriptor`);
  }
}
function assertGenerateSemanticChunkWorkerRequest(value) {
  assertWorkerRequestEnvelope(value, "generateSemanticChunk");
  const request = value;
  assertProceduralDescriptor(request.descriptor, "generateSemanticChunk");
  if (!request.key || !Number.isSafeInteger(request.key.chunkX) || !Number.isSafeInteger(request.key.chunkY)) {
    throw new RangeError("surface worker semantic chunk key must use safe integers");
  }
  chunkOrigin(request.key.chunkX, request.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
}
function assertGenerateHydrologyRegionWorkerRequest(value) {
  assertWorkerRequestEnvelope(value, "generateHydrologyRegion");
  const request = value;
  assertProceduralDescriptor(request.descriptor, "generateHydrologyRegion");
  if (!request.key || !Number.isSafeInteger(request.key.regionX) || !Number.isSafeInteger(request.key.regionY)) {
    throw new RangeError("surface worker hydrology region key must use safe integers");
  }
  chunkOrigin(request.key.regionX, request.key.regionY, HYDROLOGY_REGION_SIZE);
  if (request.descriptor.sourceKind === "procedural-toroidal") {
    const regionCountX = Math.ceil(request.descriptor.width / HYDROLOGY_REGION_SIZE);
    const regionCountY = Math.ceil(request.descriptor.height / HYDROLOGY_REGION_SIZE);
    if (request.key.regionX < 0 || request.key.regionX >= regionCountX || request.key.regionY < 0 || request.key.regionY >= regionCountY) {
      throw new RangeError("surface worker toroidal hydrology key must be canonical and in-domain");
    }
  }
}
function assertCompileSurfaceChunkWorkerRequest(value) {
  assertWorkerRequestEnvelope(value, "compileSurfaceChunk");
  const request = value;
  assertSurfaceRequestToken(request.requestToken);
  assertTransferableEffectiveWindow(request.effectiveWindow);
}
function transferableBuffer(buffer, name) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError(`surface worker ${name} must own a transferable ArrayBuffer`);
  }
  return buffer;
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
    unique.add(transferableBuffer(buffer, "semantic array"));
  }
  return [...unique];
}
function hydrologyRegionTransferables(region) {
  const unique = /* @__PURE__ */ new Set();
  const add = (buffer) => {
    unique.add(transferableBuffer(buffer, "hydrology array"));
  };
  for (const port of region.boundaryPorts) {
    add(port.point.buffer);
    add(port.flowDirection.buffer);
  }
  for (const river of region.rivers) {
    add(river.controlPoints.buffer);
    add(river.widthProfile.buffer);
    add(river.levelProfile.buffer);
  }
  for (const lake of region.lakes) add(lake.center.buffer);
  for (const mouth of region.mouths) add(mouth.point.buffer);
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

// src/world/CompiledSurfaceSampler.ts
function createCompiledSurfaceSample() {
  return {
    groundHeight: 0,
    waterLevel: 0,
    waterDepth: 0,
    shorelineDistance: 0,
    waterCoverage: 0,
    waterKind: 0,
    waterProfile: 0,
    waterBodyIndex: 0,
    materialWeights: new Float32Array(4),
    flow: new Float32Array(2)
  };
}
function assertOutput(output) {
  if (!output || typeof output !== "object" || !(output.materialWeights instanceof Float32Array) || output.materialWeights.length !== 4 || !(output.flow instanceof Float32Array) || output.flow.length !== 2) {
    throw new TypeError("compiled surface sample output has an invalid fixed layout");
  }
}
function assertCoordinate(localU, localV) {
  const minimum = -0.5;
  const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
  if (!Number.isFinite(localU) || !Number.isFinite(localV) || localU < minimum || localU > maximum || localV < minimum || localV > maximum) {
    throw new RangeError("compiled surface sample coordinate is outside the render chunk core");
  }
}
function binary16At(values, localU, localV) {
  assertCoordinate(localU, localV);
  const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const gutter = SURFACE_COMPILE_PROFILE.gutterTexels;
  const physicalX = (localU + 0.5) * samplesPerTile - 0.5 + gutter;
  const physicalY = (localV + 0.5) * samplesPerTile - 0.5 + gutter;
  const firstX = Math.floor(physicalX);
  const firstY = Math.floor(physicalY);
  const amountX = physicalX - firstX;
  const amountY = physicalY - firstY;
  const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
  const firstIndex = firstX * size + firstY;
  const secondIndex = (firstX + 1) * size + firstY;
  return float16BitsToFloat32(values[firstIndex]) * (1 - amountX) * (1 - amountY) + float16BitsToFloat32(values[firstIndex + 1]) * (1 - amountX) * amountY + float16BitsToFloat32(values[secondIndex]) * amountX * (1 - amountY) + float16BitsToFloat32(values[secondIndex + 1]) * amountX * amountY;
}
function binary16Four(values, firstIndex, secondIndex, firstWeight, secondWeight, thirdWeight, fourthWeight) {
  return float16BitsToFloat32(values[firstIndex]) * firstWeight + float16BitsToFloat32(values[firstIndex + 1]) * secondWeight + float16BitsToFloat32(values[secondIndex]) * thirdWeight + float16BitsToFloat32(values[secondIndex + 1]) * fourthWeight;
}
var CompiledSurfaceSampler = class {
  constructor(field2) {
    this.field = field2;
    assertCompiledSurfaceField(field2);
  }
  sampleBilinear(localU, localV, output) {
    assertOutput(output);
    assertCoordinate(localU, localV);
    const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const gutter = SURFACE_COMPILE_PROFILE.gutterTexels;
    const physicalX = (localU + 0.5) * samplesPerTile - 0.5 + gutter;
    const physicalY = (localV + 0.5) * samplesPerTile - 0.5 + gutter;
    const firstX = Math.floor(physicalX);
    const firstY = Math.floor(physicalY);
    const amountX = physicalX - firstX;
    const amountY = physicalY - firstY;
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    const firstIndex = firstX * size + firstY;
    const secondIndex = (firstX + 1) * size + firstY;
    const firstWeight = (1 - amountX) * (1 - amountY);
    const secondWeight = (1 - amountX) * amountY;
    const thirdWeight = amountX * (1 - amountY);
    const fourthWeight = amountX * amountY;
    output.groundHeight = binary16Four(
      this.field.groundHeight,
      firstIndex,
      secondIndex,
      firstWeight,
      secondWeight,
      thirdWeight,
      fourthWeight
    );
    output.shorelineDistance = binary16Four(
      this.field.shorelineDistance,
      firstIndex,
      secondIndex,
      firstWeight,
      secondWeight,
      thirdWeight,
      fourthWeight
    );
    output.waterCoverage = 0;
    output.waterLevel = 0;
    output.waterDepth = 0;
    output.waterKind = 0;
    output.waterProfile = 0;
    output.waterBodyIndex = 0;
    output.materialWeights.fill(0);
    output.flow.fill(0);
    let winningScore = 0;
    let winningIndex = Number.POSITIVE_INFINITY;
    for (let tap = 0; tap < 4; tap += 1) {
      const index = tap === 0 ? firstIndex : tap === 1 ? firstIndex + 1 : tap === 2 ? secondIndex : secondIndex + 1;
      const weight = tap === 0 ? firstWeight : tap === 1 ? secondWeight : tap === 2 ? thirdWeight : fourthWeight;
      const coverage = this.field.waterCoverage[index] / 255;
      output.waterCoverage += coverage * weight;
      const materialOffset = index * 4;
      for (let material = 0; material < 4; material += 1) {
        output.materialWeights[material] += this.field.materialWeights[materialOffset + material] / 255 * weight;
      }
      const score = coverage * weight;
      if (score > winningScore || score === winningScore && score > 0 && index < winningIndex) {
        winningScore = score;
        winningIndex = index;
      }
    }
    if (winningScore === 0) return output;
    const winningBody = this.field.waterBodyIndex[winningIndex];
    output.waterKind = this.field.waterKind[winningIndex];
    output.waterProfile = this.field.waterProfile[winningIndex];
    output.waterBodyIndex = winningBody;
    let waterWeight = 0;
    for (let tap = 0; tap < 4; tap += 1) {
      const index = tap === 0 ? firstIndex : tap === 1 ? firstIndex + 1 : tap === 2 ? secondIndex : secondIndex + 1;
      if (this.field.waterBodyIndex[index] !== winningBody) continue;
      const bilinearWeight = tap === 0 ? firstWeight : tap === 1 ? secondWeight : tap === 2 ? thirdWeight : fourthWeight;
      const weight = bilinearWeight * this.field.waterCoverage[index] / 255;
      if (weight === 0) continue;
      waterWeight += weight;
      output.waterLevel += float16BitsToFloat32(this.field.waterLevel[index]) * weight;
      output.waterDepth += float16BitsToFloat32(this.field.waterDepth[index]) * weight;
      output.flow[0] += this.field.flow[index * 2] / 127 * weight;
      output.flow[1] += this.field.flow[index * 2 + 1] / 127 * weight;
    }
    if (!(waterWeight > 0)) throw new Error("compiled surface winning body has no weighted payload");
    output.waterLevel /= waterWeight;
    output.waterDepth /= waterWeight;
    const flowLength = Math.hypot(output.flow[0], output.flow[1]);
    if (flowLength > 0) {
      output.flow[0] /= flowLength;
      output.flow[1] /= flowLength;
    }
    return output;
  }
  sampleGroundHeight(localU, localV) {
    assertCoordinate(localU, localV);
    const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const gridX = (localU + 0.5) * samplesPerTile;
    const gridY = (localV + 0.5) * samplesPerTile;
    const cellX = Math.min(SURFACE_CORE_TEXELS - 1, Math.floor(gridX));
    const cellY = Math.min(SURFACE_CORE_TEXELS - 1, Math.floor(gridY));
    const amountX = gridX - cellX;
    const amountY = gridY - cellY;
    const step = 1 / samplesPerTile;
    const bottomLeftU = -0.5 + cellX * step;
    const bottomLeftV = -0.5 + cellY * step;
    const bottomLeft = binary16At(this.field.groundHeight, bottomLeftU, bottomLeftV);
    const topRight = binary16At(this.field.groundHeight, bottomLeftU + step, bottomLeftV + step);
    if (amountY <= amountX) {
      const bottomRight = binary16At(this.field.groundHeight, bottomLeftU + step, bottomLeftV);
      return bottomLeft * (1 - amountX) + bottomRight * (amountX - amountY) + topRight * amountY;
    }
    const topLeft = binary16At(this.field.groundHeight, bottomLeftU, bottomLeftV + step);
    return bottomLeft * (1 - amountY) + topLeft * (amountY - amountX) + topRight * amountX;
  }
  sampleSurface(localU, localV, output) {
    this.sampleBilinear(localU, localV, output);
    output.groundHeight = this.sampleGroundHeight(localU, localV);
    return output;
  }
};

// src/world/CompiledWaterGeometry.ts
var COMPILED_WATER_GEOMETRY_FORMAT_VERSION = 1;
var MAX_COMPILED_WATER_COVERAGE_VERTICES = 24576;
var MAX_COMPILED_WATER_COVERAGE_TRIANGLES = 24576;
function fieldVertex(field2, fieldX, fieldY) {
  const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  return {
    key: `g:${fieldX}:${fieldY}`,
    u: (fieldX + 0.5 - SURFACE_COMPILE_PROFILE.gutterTexels) / samplesPerTile - 0.5,
    v: (fieldY + 0.5 - SURFACE_COMPILE_PROFILE.gutterTexels) / samplesPerTile - 0.5,
    fieldX,
    fieldY,
    coverage: field2.waterCoverage[fieldX * SURFACE_COMPILE_PROFILE.textureLayerSize + fieldY]
  };
}
function interpolateVertex(first, second, amount, keyPrefix) {
  if (amount <= 0) return first;
  if (amount >= 1) return second;
  return {
    key: first.key < second.key ? `${keyPrefix}:${first.key}:${second.key}` : `${keyPrefix}:${second.key}:${first.key}`,
    u: first.u + (second.u - first.u) * amount,
    v: first.v + (second.v - first.v) * amount,
    fieldX: first.fieldX + (second.fieldX - first.fieldX) * amount,
    fieldY: first.fieldY + (second.fieldY - first.fieldY) * amount,
    coverage: first.coverage + (second.coverage - first.coverage) * amount
  };
}
function coverageCrossing(first, second) {
  const threshold = SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold;
  return interpolateVertex(
    first,
    second,
    (threshold - first.coverage) / (second.coverage - first.coverage),
    "e"
  );
}
function clippedWetPolygon(vertices) {
  const threshold = SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold;
  const output = [];
  let previous = vertices[vertices.length - 1];
  let previousWet = previous.coverage > threshold;
  for (const current of vertices) {
    const currentWet = current.coverage > threshold;
    if (currentWet !== previousWet) output.push(coverageCrossing(previous, current));
    if (currentWet) output.push(current);
    previous = current;
    previousWet = currentWet;
  }
  return output;
}
function clipCoreBoundary(vertices, axis, limit, keepGreater) {
  if (vertices.length === 0) return vertices;
  const output = [];
  let previous = vertices[vertices.length - 1];
  let previousInside = keepGreater ? previous[axis] >= limit : previous[axis] <= limit;
  for (const current of vertices) {
    const currentInside = keepGreater ? current[axis] >= limit : current[axis] <= limit;
    if (currentInside !== previousInside) {
      const amount = (limit - previous[axis]) / (current[axis] - previous[axis]);
      output.push(interpolateVertex(previous, current, amount, `c:${axis}:${limit}`));
    }
    if (currentInside) output.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return output;
}
function clipToCore(vertices) {
  const minimum = -0.5;
  const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
  return clipCoreBoundary(
    clipCoreBoundary(
      clipCoreBoundary(
        clipCoreBoundary(vertices, "u", minimum, true),
        "u",
        maximum,
        false
      ),
      "v",
      minimum,
      true
    ),
    "v",
    maximum,
    false
  );
}
function outputVertex(output, vertex) {
  const existing = output.vertexByKey.get(vertex.key);
  if (existing !== void 0) return existing;
  const index = output.positions.length / 3;
  const u = Math.fround(vertex.u);
  const v = Math.fround(vertex.v);
  output.positions.push(u, 0, v);
  output.surfaceFieldCoordinates.push(
    Math.fround((u + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels),
    Math.fround((v + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels)
  );
  output.vertexByKey.set(vertex.key, index);
  return index;
}
function addCoverageTriangle(output, first, second, third) {
  const area = (second.u - first.u) * (third.v - first.v) - (second.v - first.v) * (third.u - first.u);
  if (Math.abs(area) <= Number.EPSILON) return;
  const firstIndex = outputVertex(output, first);
  const secondIndex = outputVertex(output, second);
  const thirdIndex = outputVertex(output, third);
  if (area < 0) output.indices.push(firstIndex, secondIndex, thirdIndex);
  else output.indices.push(firstIndex, thirdIndex, secondIndex);
}
function addClippedTriangle(output, first, second, third) {
  const polygon = clipToCore(clippedWetPolygon([first, second, third]));
  for (let index = 1; index < polygon.length - 1; index += 1) {
    addCoverageTriangle(output, polygon[0], polygon[index], polygon[index + 1]);
  }
}
function assertCompiledWaterGeometry(geometry) {
  if (!geometry || typeof geometry !== "object" || geometry.formatVersion !== COMPILED_WATER_GEOMETRY_FORMAT_VERSION || geometry.kind !== "none" && geometry.kind !== "fullPatch" && geometry.kind !== "coverage") {
    throw new TypeError("compiled water geometry format or kind is invalid");
  }
  if (geometry.kind !== "coverage") {
    if ("positions" in geometry || "surfaceFieldCoordinates" in geometry || "indices" in geometry) {
      throw new TypeError("marker water geometry cannot carry chunk-local buffers");
    }
    return;
  }
  if (!(geometry.positions instanceof Float32Array) || geometry.positions.length === 0 || geometry.positions.length % 3 !== 0 || !(geometry.surfaceFieldCoordinates instanceof Float32Array) || geometry.surfaceFieldCoordinates.length !== geometry.positions.length / 3 * 2 || !(geometry.indices instanceof Uint16Array) || geometry.indices.length === 0 || geometry.indices.length % 3 !== 0 || geometry.positions.length / 3 > MAX_COMPILED_WATER_COVERAGE_VERTICES || geometry.indices.length / 3 > MAX_COMPILED_WATER_COVERAGE_TRIANGLES) {
    throw new TypeError("compiled water coverage arrays exceed their fixed layout or budget");
  }
  const vertexCount = geometry.positions.length / 3;
  const minimum = -0.5;
  const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
  const seenCoordinates = /* @__PURE__ */ new Set();
  for (let index = 0; index < vertexCount; index += 1) {
    const u = geometry.positions[index * 3];
    const y = geometry.positions[index * 3 + 1];
    const v = geometry.positions[index * 3 + 2];
    if (!Number.isFinite(u) || y !== 0 || !Number.isFinite(v) || u < minimum || u > maximum || v < minimum || v > maximum) {
      throw new RangeError("compiled water coverage vertex is outside the render chunk core");
    }
    const key = `${u}:${v}`;
    if (seenCoordinates.has(key)) throw new Error("compiled water coverage contains duplicate vertices");
    seenCoordinates.add(key);
    const fieldX = geometry.surfaceFieldCoordinates[index * 2];
    const fieldY = geometry.surfaceFieldCoordinates[index * 2 + 1];
    if (fieldX !== Math.fround((u + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels) || fieldY !== Math.fround((v + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels)) {
      throw new Error("compiled water field coordinate drifted from its texel-center phase");
    }
  }
  const edgeUses = /* @__PURE__ */ new Map();
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const first = geometry.indices[offset];
    const second = geometry.indices[offset + 1];
    const third = geometry.indices[offset + 2];
    if (first >= vertexCount || second >= vertexCount || third >= vertexCount || first === second || second === third || first === third) {
      throw new RangeError("compiled water coverage triangle index is invalid");
    }
    const firstU = geometry.positions[first * 3];
    const firstV = geometry.positions[first * 3 + 2];
    const secondU = geometry.positions[second * 3];
    const secondV = geometry.positions[second * 3 + 2];
    const thirdU = geometry.positions[third * 3];
    const thirdV = geometry.positions[third * 3 + 2];
    const area = (secondU - firstU) * (thirdV - firstV) - (secondV - firstV) * (thirdU - firstU);
    if (!(area < 0)) throw new Error("compiled water coverage triangles must face positive world Y");
    for (const [edgeFirst, edgeSecond] of [
      [first, second],
      [second, third],
      [third, first]
    ]) {
      const key = edgeFirst < edgeSecond ? `${edgeFirst}:${edgeSecond}` : `${edgeSecond}:${edgeFirst}`;
      const uses = (edgeUses.get(key) ?? 0) + 1;
      if (uses > 2) throw new Error("compiled water coverage geometry is non-manifold");
      edgeUses.set(key, uses);
    }
  }
}
function compileWaterGeometry(field2) {
  assertCompiledSurfaceField(field2);
  const gridSize = SURFACE_COMPILE_PROFILE.textureLayerSize;
  const vertices = new Array(gridSize * gridSize);
  let allDry = true;
  let allFull = true;
  for (let gridX = 0; gridX < gridSize; gridX += 1) {
    for (let gridY = 0; gridY < gridSize; gridY += 1) {
      const vertex = fieldVertex(field2, gridX, gridY);
      vertices[gridX * gridSize + gridY] = vertex;
      if (vertex.coverage > SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold) allDry = false;
      if (vertex.coverage < SURFACE_COMPILE_PROFILE.waterFullPatchCoverage) allFull = false;
    }
  }
  if (allDry) return Object.freeze({
    formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
    kind: "none"
  });
  if (allFull) return Object.freeze({
    formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
    kind: "fullPatch"
  });
  const output = {
    positions: [],
    surfaceFieldCoordinates: [],
    indices: [],
    vertexByKey: /* @__PURE__ */ new Map()
  };
  for (let gridX = 0; gridX < gridSize - 1; gridX += 1) {
    for (let gridY = 0; gridY < gridSize - 1; gridY += 1) {
      const bottomLeft = vertices[gridX * gridSize + gridY];
      const topLeft = vertices[gridX * gridSize + gridY + 1];
      const bottomRight = vertices[(gridX + 1) * gridSize + gridY];
      const topRight = vertices[(gridX + 1) * gridSize + gridY + 1];
      addClippedTriangle(output, bottomLeft, topRight, bottomRight);
      addClippedTriangle(output, bottomLeft, topLeft, topRight);
    }
  }
  if (output.indices.length === 0) {
    return Object.freeze({
      formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
      kind: "none"
    });
  }
  const geometry = Object.freeze({
    formatVersion: COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
    kind: "coverage",
    positions: new Float32Array(output.positions),
    surfaceFieldCoordinates: new Float32Array(output.surfaceFieldCoordinates),
    indices: new Uint16Array(output.indices)
  });
  assertCompiledWaterGeometry(geometry);
  return geometry;
}
function compiledWaterGeometryTransferables(geometry) {
  assertCompiledWaterGeometry(geometry);
  if (geometry.kind !== "coverage") return Object.freeze([]);
  const buffers = [
    geometry.positions.buffer,
    geometry.surfaceFieldCoordinates.buffer,
    geometry.indices.buffer
  ];
  if (buffers.some((buffer) => !(buffer instanceof ArrayBuffer)) || new Set(buffers).size !== buffers.length) {
    throw new TypeError("compiled water geometry requires distinct owned transferable buffers");
  }
  return Object.freeze(buffers);
}
if (COMPILED_SURFACE_TEXEL_COUNT !== SURFACE_COMPILE_PROFILE.textureLayerSize ** 2) {
  throw new Error("compiled water geometry and surface field dimensions disagree");
}

// src/world/SurfaceLattice.ts
function surfaceColumnStagger(column) {
  if (!Number.isSafeInteger(column)) {
    throw new RangeError("surface lattice column must be a safe integer");
  }
  return positiveModulo3(column, 2) === 0 ? 0.5 : 0;
}
function surfaceStagger(u) {
  if (!Number.isFinite(u) || !Number.isSafeInteger(Math.floor(u))) {
    throw new RangeError("surface lattice u coordinate must have a safe integer column");
  }
  const column = Math.floor(u);
  const t = u - column;
  const current = surfaceColumnStagger(column);
  return current + (surfaceColumnStagger(column + 1) - current) * t;
}
function surfaceToWorld(u, v, hexSize) {
  if (!Number.isFinite(v)) throw new RangeError("surface lattice v coordinate must be finite");
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("surface lattice hex size must be positive and finite");
  }
  return {
    x: 1.5 * hexSize * u,
    z: Math.sqrt(3) * hexSize * (v + surfaceStagger(u))
  };
}
function worldToSurface(x, z, hexSize) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError("surface lattice world coordinates must be finite");
  }
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("surface lattice hex size must be positive and finite");
  }
  const u = x / (1.5 * hexSize);
  if (!Number.isSafeInteger(Math.floor(u))) {
    throw new RangeError("surface lattice world x exceeds the safe logical range");
  }
  return {
    u,
    v: z / (Math.sqrt(3) * hexSize) - surfaceStagger(u)
  };
}
function surfaceTexelCenterAxis(renderChunkCoordinate, texelIndex) {
  if (!Number.isSafeInteger(renderChunkCoordinate)) {
    throw new RangeError("render chunk coordinate must be a safe integer");
  }
  const maximumTexel = SURFACE_COMPILE_PROFILE.renderChunkSize * SURFACE_COMPILE_PROFILE.samplesPerTileInterval + SURFACE_COMPILE_PROFILE.gutterTexels - 1;
  if (!Number.isInteger(texelIndex) || texelIndex < -SURFACE_COMPILE_PROFILE.gutterTexels || texelIndex > maximumTexel) {
    throw new RangeError("surface texel index is outside the physical layer");
  }
  const chunkOrigin2 = renderChunkCoordinate * SURFACE_COMPILE_PROFILE.renderChunkSize;
  if (!Number.isSafeInteger(chunkOrigin2)) {
    throw new RangeError("render chunk origin exceeds the safe logical range");
  }
  return chunkOrigin2 - 0.5 + (texelIndex + 0.5) / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
}

// src/world/SurfaceVisualProfile.ts
var SURFACE_VISUAL_PROFILE_VERSION = 1;
var SURFACE_VISUAL_PROFILE = Object.freeze({
  version: SURFACE_VISUAL_PROFILE_VERSION,
  groundMaximumDisplacementTiles: 0.025,
  oceanMaximumDisplacementTiles: 0.12,
  lakeMaximumDisplacementTiles: 0.06,
  riverMaximumDisplacementTiles: 0.03
});
function assertSurfaceVisualProfile(profile) {
  if (!profile || typeof profile !== "object" || profile.version !== SURFACE_VISUAL_PROFILE_VERSION || profile.groundMaximumDisplacementTiles !== 0.025 || profile.oceanMaximumDisplacementTiles !== 0.12 || profile.lakeMaximumDisplacementTiles !== 0.06 || profile.riverMaximumDisplacementTiles !== 0.03) {
    throw new RangeError("surface visual profile does not match frozen profile v1");
  }
}
function surfaceGroundMaximumDisplacement(hexSize) {
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("surface visual displacement requires a positive finite hex size");
  }
  return SURFACE_VISUAL_PROFILE.groundMaximumDisplacementTiles * hexSize;
}
function surfaceWaterMaximumDisplacement(waterKind, hexSize) {
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("surface visual displacement requires a positive finite hex size");
  }
  const tiles = waterKind === SURFACE_WATER_KIND_OCEAN ? SURFACE_VISUAL_PROFILE.oceanMaximumDisplacementTiles : waterKind === SURFACE_WATER_KIND_LAKE ? SURFACE_VISUAL_PROFILE.lakeMaximumDisplacementTiles : waterKind === SURFACE_WATER_KIND_RIVER ? SURFACE_VISUAL_PROFILE.riverMaximumDisplacementTiles : void 0;
  if (tiles === void 0) throw new RangeError("surface water displacement requires a wet kind");
  return tiles * hexSize;
}
assertSurfaceVisualProfile(SURFACE_VISUAL_PROFILE);

// src/world/CompiledSurfaceBounds.ts
var COMPILED_SURFACE_BOUNDS_FORMAT_VERSION = 2;
function finiteOrdered(name, minimum, maximum) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new RangeError(`${name} bounds must be finite and ordered`);
  }
}
function assertCompiledSurfaceBounds(bounds) {
  if (!bounds || typeof bounds !== "object" || bounds.formatVersion !== COMPILED_SURFACE_BOUNDS_FORMAT_VERSION || bounds.visualProfileVersion !== SURFACE_VISUAL_PROFILE_VERSION) {
    throw new TypeError("compiled surface bounds format is invalid");
  }
  finiteOrdered("compiled surface X", bounds.minimumX, bounds.maximumX);
  finiteOrdered("compiled surface Z", bounds.minimumZ, bounds.maximumZ);
  finiteOrdered(
    "compiled surface ground height",
    bounds.minimumGroundHeight,
    bounds.maximumGroundHeight
  );
  if (bounds.minimumWaterHeight === null !== (bounds.maximumWaterHeight === null)) {
    throw new TypeError("compiled surface water bounds must be both present or both absent");
  }
  if (bounds.minimumWaterHeight !== null && bounds.maximumWaterHeight !== null) {
    finiteOrdered("compiled surface water height", bounds.minimumWaterHeight, bounds.maximumWaterHeight);
  }
  finiteOrdered("compiled surface base height", bounds.minimumBaseHeight, bounds.maximumBaseHeight);
  const expectedMinimum = bounds.minimumWaterHeight === null ? bounds.minimumGroundHeight : Math.min(bounds.minimumGroundHeight, bounds.minimumWaterHeight);
  const expectedMaximum = bounds.maximumWaterHeight === null ? bounds.maximumGroundHeight : Math.max(bounds.maximumGroundHeight, bounds.maximumWaterHeight);
  if (bounds.minimumBaseHeight !== expectedMinimum || bounds.maximumBaseHeight !== expectedMaximum) {
    throw new Error("compiled surface base height does not enclose its ground and water ranges exactly");
  }
  if (!Number.isFinite(bounds.groundMaximumDisplacement) || bounds.groundMaximumDisplacement < 0 || !Number.isFinite(bounds.waterMaximumDisplacement) || bounds.waterMaximumDisplacement < 0) {
    throw new RangeError("compiled surface visual displacement bounds must be non-negative and finite");
  }
  if (bounds.minimumWaterHeight === null && bounds.waterMaximumDisplacement !== 0) {
    throw new Error("dry compiled surface bounds cannot reserve water displacement");
  }
  const expectedVisualMinimum = bounds.minimumWaterHeight === null ? bounds.minimumGroundHeight - bounds.groundMaximumDisplacement : Math.min(
    bounds.minimumGroundHeight - bounds.groundMaximumDisplacement,
    bounds.minimumWaterHeight - bounds.waterMaximumDisplacement
  );
  const expectedVisualMaximum = bounds.maximumWaterHeight === null ? bounds.maximumGroundHeight + bounds.groundMaximumDisplacement : Math.max(
    bounds.maximumGroundHeight + bounds.groundMaximumDisplacement,
    bounds.maximumWaterHeight + bounds.waterMaximumDisplacement
  );
  if (bounds.minimumVisualHeight !== expectedVisualMinimum || bounds.maximumVisualHeight !== expectedVisualMaximum) {
    throw new Error("compiled surface visual height does not exactly enclose bounded displacement");
  }
}
function compileSurfaceBounds(field2, waterGeometry, hexSize) {
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("compiled surface bounds require a positive finite hex size");
  }
  assertCompiledWaterGeometry(waterGeometry);
  const sampler = new CompiledSurfaceSampler(field2);
  const sample = createCompiledSurfaceSample();
  const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const origin = surfaceToWorld(0, 0, hexSize);
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let minimumGroundHeight = Number.POSITIVE_INFINITY;
  let maximumGroundHeight = Number.NEGATIVE_INFINITY;
  let minimumWaterHeight = Number.POSITIVE_INFINITY;
  let maximumWaterHeight = Number.NEGATIVE_INFINITY;
  let waterMaximumDisplacement = 0;
  const includeWater = (localU, localV) => {
    sampler.sampleBilinear(localU, localV, sample);
    if (!(sample.waterCoverage > 0) || sample.waterBodyIndex === 0) {
      throw new Error("compiled water geometry vertex has no sampleable water payload");
    }
    minimumWaterHeight = Math.min(minimumWaterHeight, sample.waterLevel);
    maximumWaterHeight = Math.max(maximumWaterHeight, sample.waterLevel);
    waterMaximumDisplacement = Math.max(
      waterMaximumDisplacement,
      surfaceWaterMaximumDisplacement(sample.waterKind, hexSize)
    );
  };
  for (let gridX = 0; gridX <= SURFACE_CORE_TEXELS; gridX += 1) {
    const localU = -0.5 + gridX / samplesPerTile;
    for (let gridY = 0; gridY <= SURFACE_CORE_TEXELS; gridY += 1) {
      const localV = -0.5 + gridY / samplesPerTile;
      const world = surfaceToWorld(localU, localV, hexSize);
      minimumX = Math.min(minimumX, world.x - origin.x);
      maximumX = Math.max(maximumX, world.x - origin.x);
      minimumZ = Math.min(minimumZ, world.z - origin.z);
      maximumZ = Math.max(maximumZ, world.z - origin.z);
      const groundHeight = sampler.sampleGroundHeight(localU, localV);
      minimumGroundHeight = Math.min(minimumGroundHeight, groundHeight);
      maximumGroundHeight = Math.max(maximumGroundHeight, groundHeight);
      if (waterGeometry.kind === "fullPatch") includeWater(localU, localV);
    }
  }
  if (waterGeometry.kind === "coverage") {
    for (let index = 0; index < waterGeometry.positions.length / 3; index += 1) {
      includeWater(
        waterGeometry.positions[index * 3],
        waterGeometry.positions[index * 3 + 2]
      );
    }
  }
  const hasWater = waterGeometry.kind !== "none";
  if (hasWater && (!Number.isFinite(minimumWaterHeight) || !Number.isFinite(maximumWaterHeight))) {
    throw new Error("compiled water geometry produced no finite height bounds");
  }
  const waterMinimum = hasWater ? minimumWaterHeight : null;
  const waterMaximum = hasWater ? maximumWaterHeight : null;
  const groundMaximumDisplacement = surfaceGroundMaximumDisplacement(hexSize);
  const minimumBaseHeight = waterMinimum === null ? minimumGroundHeight : Math.min(minimumGroundHeight, waterMinimum);
  const maximumBaseHeight = waterMaximum === null ? maximumGroundHeight : Math.max(maximumGroundHeight, waterMaximum);
  const bounds = Object.freeze({
    formatVersion: COMPILED_SURFACE_BOUNDS_FORMAT_VERSION,
    visualProfileVersion: SURFACE_VISUAL_PROFILE_VERSION,
    minimumX,
    maximumX,
    minimumZ,
    maximumZ,
    minimumGroundHeight,
    maximumGroundHeight,
    minimumWaterHeight: waterMinimum,
    maximumWaterHeight: waterMaximum,
    minimumBaseHeight,
    maximumBaseHeight,
    groundMaximumDisplacement,
    waterMaximumDisplacement,
    minimumVisualHeight: waterMinimum === null ? minimumGroundHeight - groundMaximumDisplacement : Math.min(
      minimumGroundHeight - groundMaximumDisplacement,
      waterMinimum - waterMaximumDisplacement
    ),
    maximumVisualHeight: waterMaximum === null ? maximumGroundHeight + groundMaximumDisplacement : Math.max(
      maximumGroundHeight + groundMaximumDisplacement,
      waterMaximum + waterMaximumDisplacement
    )
  });
  assertCompiledSurfaceBounds(bounds);
  return bounds;
}

// src/world/CompiledVegetationSeeds.ts
var COMPILED_VEGETATION_SEEDS_FORMAT_VERSION = 1;
var VEGETATION_CANDIDATE_COLUMNS_PER_TILE = 4;
var VEGETATION_CANDIDATE_ROWS_PER_TILE = 2;
var VEGETATION_CANDIDATES_PER_TILE = VEGETATION_CANDIDATE_COLUMNS_PER_TILE * VEGETATION_CANDIDATE_ROWS_PER_TILE;
var MAX_COMPILED_VEGETATION_SEEDS = 16 * 16 * VEGETATION_CANDIDATES_PER_TILE;
function assertCompiledVegetationSeeds(seeds) {
  if (!seeds || typeof seeds !== "object" || seeds.formatVersion !== COMPILED_VEGETATION_SEEDS_FORMAT_VERSION || !Number.isInteger(seeds.count) || seeds.count < 0 || seeds.count > MAX_COMPILED_VEGETATION_SEEDS) {
    throw new TypeError("compiled vegetation seed format or count is invalid");
  }
  if (!(seeds.positions instanceof Float32Array) || seeds.positions.length !== seeds.count * 3 || !(seeds.instanceIdentity instanceof Uint16Array) || seeds.instanceIdentity.length !== seeds.count || !(seeds.profileIndex instanceof Uint8Array) || seeds.profileIndex.length !== seeds.count || !(seeds.placementSeed instanceof Uint32Array) || seeds.placementSeed.length !== seeds.count) {
    throw new TypeError("compiled vegetation seed arrays do not match their fixed layout");
  }
  let previousIdentity = -1;
  for (let index = 0; index < seeds.count; index += 1) {
    const identity = seeds.instanceIdentity[index];
    if (identity <= previousIdentity || identity >= MAX_COMPILED_VEGETATION_SEEDS) {
      throw new Error("compiled vegetation identities must be unique and strictly ascending");
    }
    previousIdentity = identity;
    const positionOffset = index * 3;
    if (!Number.isFinite(seeds.positions[positionOffset]) || !Number.isFinite(seeds.positions[positionOffset + 1]) || !Number.isFinite(seeds.positions[positionOffset + 2])) {
      throw new RangeError("compiled vegetation positions must be finite");
    }
  }
}
function createCompiledVegetationSeeds(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("compiled vegetation seed input is required");
  }
  const seeds = Object.freeze({
    formatVersion: COMPILED_VEGETATION_SEEDS_FORMAT_VERSION,
    count: input.instanceIdentity.length,
    positions: input.positions,
    instanceIdentity: input.instanceIdentity,
    profileIndex: input.profileIndex,
    placementSeed: input.placementSeed
  });
  assertCompiledVegetationSeeds(seeds);
  return seeds;
}
function compiledVegetationSeedsTransferables(seeds) {
  assertCompiledVegetationSeeds(seeds);
  const buffers = [
    seeds.positions.buffer,
    seeds.instanceIdentity.buffer,
    seeds.profileIndex.buffer,
    seeds.placementSeed.buffer
  ];
  if (buffers.some((buffer) => !(buffer instanceof ArrayBuffer))) {
    throw new TypeError("compiled vegetation transfer requires owned ArrayBuffer payloads");
  }
  if (new Set(buffers).size !== buffers.length) {
    throw new Error("compiled vegetation arrays must own distinct transferable buffers");
  }
  return Object.freeze(buffers);
}

// src/world/CompiledWaterBodyPalette.ts
var COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION = 1;
var MAX_COMPILED_WATER_BODIES = 255;
function assertBodyId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError("compiled water body ID is invalid");
  }
}
function assertCompiledWaterBodyPalette(palette) {
  if (!palette || typeof palette !== "object" || palette.formatVersion !== COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION || !Array.isArray(palette.entries) || palette.entries.length > MAX_COMPILED_WATER_BODIES) {
    throw new TypeError("compiled water body palette format or entry count is invalid");
  }
  let previousBodyId;
  for (const entry of palette.entries) {
    if (!entry || typeof entry !== "object") throw new TypeError("compiled water body entry is invalid");
    assertBodyId(entry.bodyId);
    if (entry.kind !== "ocean" && entry.kind !== "lake" && entry.kind !== "river") {
      throw new TypeError("compiled water body kind is invalid");
    }
    if (!Number.isInteger(entry.profileIndex) || entry.profileIndex < 0 || entry.profileIndex > 255) {
      throw new RangeError("compiled water body profile must be a uint8 value");
    }
    if (entry.kind === "ocean" && (entry.bodyId !== OCEAN_BODY_ID || entry.profileIndex !== 0)) {
      throw new Error("compiled ocean body must use its canonical identity and profile");
    }
    if (previousBodyId !== void 0 && previousBodyId >= entry.bodyId) {
      throw new Error("compiled water bodies must use unique ascending identities");
    }
    previousBodyId = entry.bodyId;
  }
}
function createCompiledWaterBodyPalette(entries) {
  if (!Array.isArray(entries)) throw new TypeError("compiled water body entries must be an array");
  const palette = Object.freeze({
    formatVersion: COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION,
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry })))
  });
  assertCompiledWaterBodyPalette(palette);
  return palette;
}

// src/world/CompiledSurfaceChunk.ts
var COMPILED_SURFACE_CHUNK_FORMAT_VERSION = 1;
function collectTransferables(chunk) {
  const buffers = [
    ...compiledSurfaceFieldTransferables(chunk.field),
    ...compiledWaterGeometryTransferables(chunk.waterGeometry),
    ...compiledVegetationSeedsTransferables(chunk.vegetationSeeds)
  ];
  if (new Set(buffers).size !== buffers.length) {
    throw new Error("compiled surface chunk component buffers must not alias");
  }
  return Object.freeze(buffers);
}
function typedArraysEqual(first, second) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}
function geometryEquals(first, second) {
  if (first.kind !== second.kind) return false;
  if (first.kind !== "coverage" || second.kind !== "coverage") return true;
  return typedArraysEqual(first.positions, second.positions) && typedArraysEqual(first.surfaceFieldCoordinates, second.surfaceFieldCoordinates) && typedArraysEqual(first.indices, second.indices);
}
function boundsEqual(first, second) {
  return first.formatVersion === second.formatVersion && first.visualProfileVersion === second.visualProfileVersion && first.minimumX === second.minimumX && first.maximumX === second.maximumX && first.minimumZ === second.minimumZ && first.maximumZ === second.maximumZ && first.minimumGroundHeight === second.minimumGroundHeight && first.maximumGroundHeight === second.maximumGroundHeight && first.minimumWaterHeight === second.minimumWaterHeight && first.maximumWaterHeight === second.maximumWaterHeight && first.minimumBaseHeight === second.minimumBaseHeight && first.maximumBaseHeight === second.maximumBaseHeight && first.groundMaximumDisplacement === second.groundMaximumDisplacement && first.waterMaximumDisplacement === second.waterMaximumDisplacement && first.minimumVisualHeight === second.minimumVisualHeight && first.maximumVisualHeight === second.maximumVisualHeight;
}
function waterKindForBody(kind) {
  return kind === "ocean" ? SURFACE_WATER_KIND_OCEAN : kind === "lake" ? SURFACE_WATER_KIND_LAKE : SURFACE_WATER_KIND_RIVER;
}
function assertFieldPaletteRelationship(chunk) {
  const used = new Uint8Array(chunk.waterBodies.entries.length);
  for (let index = 0; index < chunk.field.waterBodyIndex.length; index += 1) {
    const bodyIndex = chunk.field.waterBodyIndex[index];
    if (bodyIndex === 0) continue;
    const body = chunk.waterBodies.entries[bodyIndex - 1];
    if (!body || chunk.field.waterKind[index] !== waterKindForBody(body.kind) || chunk.field.waterProfile[index] !== body.profileIndex) {
      throw new Error("compiled surface field and body palette disagree");
    }
    used[bodyIndex - 1] = 1;
  }
  if (used.some((value) => value === 0)) {
    throw new Error("compiled surface body palette contains an unused entry");
  }
}
function assertVegetationRoots(chunk) {
  const hexSize = chunk.dependencyKey.metrics.hexSize;
  const origin = surfaceToWorld(0, 0, hexSize);
  const sampler = new CompiledSurfaceSampler(chunk.field);
  const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
  for (let index = 0; index < chunk.vegetationSeeds.count; index += 1) {
    const offset = index * 3;
    const logical = worldToSurface(
      chunk.vegetationSeeds.positions[offset] + origin.x,
      chunk.vegetationSeeds.positions[offset + 2] + origin.z,
      hexSize
    );
    if (logical.u < -0.5 || logical.u >= maximum || logical.v < -0.5 || logical.v >= maximum) {
      throw new RangeError("compiled vegetation root is outside its half-open surface core");
    }
    if (chunk.vegetationSeeds.positions[offset + 1] !== Math.fround(sampler.sampleGroundHeight(logical.u, logical.v))) {
      throw new Error("compiled vegetation root height drifted from canonical Ground");
    }
  }
}
function assertCompiledSurfaceChunkLayout(chunk) {
  if (!chunk || typeof chunk !== "object" || chunk.formatVersion !== COMPILED_SURFACE_CHUNK_FORMAT_VERSION) {
    throw new TypeError("compiled surface chunk format is invalid");
  }
  assertSurfaceDependencyKey(chunk.dependencyKey);
  if (!chunk.key || chunk.key.chunkX !== chunk.dependencyKey.renderKey.chunkX || chunk.key.chunkY !== chunk.dependencyKey.renderKey.chunkY) {
    throw new Error("compiled surface chunk key does not match its dependency key");
  }
  assertCompiledSurfaceField(chunk.field);
  assertCompiledWaterBodyPalette(chunk.waterBodies);
  assertCompiledWaterGeometry(chunk.waterGeometry);
  assertCompiledVegetationSeeds(chunk.vegetationSeeds);
  assertCompiledSurfaceBounds(chunk.bounds);
  assertFieldPaletteRelationship(chunk);
  assertVegetationRoots(chunk);
  collectTransferables(chunk);
}
function assertCompiledSurfaceChunk(chunk) {
  assertCompiledSurfaceChunkLayout(chunk);
  const expectedGeometry = compileWaterGeometry(chunk.field);
  if (!geometryEquals(chunk.waterGeometry, expectedGeometry)) {
    throw new Error("compiled surface water geometry does not match its field");
  }
  const expectedBounds = compileSurfaceBounds(
    chunk.field,
    chunk.waterGeometry,
    chunk.dependencyKey.metrics.hexSize
  );
  if (!boundsEqual(chunk.bounds, expectedBounds)) {
    throw new Error("compiled surface bounds do not match its field and geometry");
  }
}
function publishGeometry(geometry) {
  if (geometry.kind === "none") return Object.freeze({
    formatVersion: geometry.formatVersion,
    kind: geometry.kind
  });
  if (geometry.kind === "fullPatch") return Object.freeze({
    formatVersion: geometry.formatVersion,
    kind: geometry.kind
  });
  return Object.freeze({
    formatVersion: geometry.formatVersion,
    kind: geometry.kind,
    positions: geometry.positions,
    surfaceFieldCoordinates: geometry.surfaceFieldCoordinates,
    indices: geometry.indices
  });
}
function createCompiledSurfaceChunk(input) {
  if (!input || typeof input !== "object") throw new TypeError("compiled surface chunk input is required");
  const dependencyKey = createSurfaceDependencyKey(input.dependencyKey);
  const chunk = Object.freeze({
    formatVersion: COMPILED_SURFACE_CHUNK_FORMAT_VERSION,
    key: dependencyKey.renderKey,
    dependencyKey,
    bounds: Object.freeze({ ...input.bounds }),
    field: createCompiledSurfaceField(input.field),
    waterBodies: createCompiledWaterBodyPalette(input.waterBodies.entries),
    waterGeometry: publishGeometry(input.waterGeometry),
    vegetationSeeds: createCompiledVegetationSeeds(input.vegetationSeeds)
  });
  assertCompiledSurfaceChunk(chunk);
  return chunk;
}
function compiledSurfaceChunkTransferables(chunk) {
  assertCompiledSurfaceChunkLayout(chunk);
  return collectTransferables(chunk);
}

// src/world/EffectiveWindowSampler.ts
function windowIndex(window, tileX, tileY) {
  const localX = tileX - window.originTileX;
  const localY = tileY - window.originTileY;
  if (localX < 0 || localX >= EFFECTIVE_WINDOW_TILE_SIZE || localY < 0 || localY >= EFFECTIVE_WINDOW_TILE_SIZE) return -1;
  return localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
}
function sampleEffectiveWindowSemantic(window, u, v, heightScale, output) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(heightScale) || heightScale <= 0) {
    throw new RangeError("effective window sample coordinates or height scale are invalid");
  }
  const tileX = Math.floor(u);
  const tileY = Math.floor(v);
  const fractionX = u - tileX;
  const fractionY = v - tileY;
  let validWeight = 0;
  let macroHeight = 0;
  let biome0 = 0;
  let biome1 = 0;
  let biome2 = 0;
  let biome3 = 0;
  for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
    const weightX = offsetX === 0 ? 1 - fractionX : fractionX;
    for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
      const index = windowIndex(window, tileX + offsetX, tileY + offsetY);
      if (index < 0 || window.valid[index] === 0) continue;
      const weight = weightX * (offsetY === 0 ? 1 - fractionY : fractionY);
      const biomeOffset = index * 4;
      validWeight += weight;
      macroHeight += window.macroHeight[index] * weight;
      biome0 += window.biomeWeights[biomeOffset] * weight;
      biome1 += window.biomeWeights[biomeOffset + 1] * weight;
      biome2 += window.biomeWeights[biomeOffset + 2] * weight;
      biome3 += window.biomeWeights[biomeOffset + 3] * weight;
    }
  }
  if (validWeight <= 0) return false;
  const inverseWeight = 1 / validWeight;
  output.groundHeight = macroHeight * inverseWeight / 65535 * heightScale;
  output.biome0 = biome0 * inverseWeight;
  output.biome1 = biome1 * inverseWeight;
  output.biome2 = biome2 * inverseWeight;
  output.biome3 = biome3 * inverseWeight;
  return true;
}
function sampleVegetationDensity(window, tileX, tileY, fractionX, fractionY) {
  let validWeight = 0;
  let density = 0;
  for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
    const weightX = offsetX === 0 ? 1 - fractionX : fractionX;
    for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
      const index = windowIndex(window, tileX + offsetX, tileY + offsetY);
      if (index < 0 || window.valid[index] === 0) continue;
      const weight = weightX * (offsetY === 0 ? 1 - fractionY : fractionY);
      validWeight += weight;
      density += window.vegetationDensity[index] * weight;
    }
  }
  return validWeight > 0 ? density / validWeight / 255 : void 0;
}
function sampleEffectiveWindowVegetationDensityLocal(window, offsetU, offsetV) {
  if (!Number.isFinite(offsetU) || !Number.isFinite(offsetV)) {
    throw new RangeError("local effective vegetation sample coordinates are invalid");
  }
  const localTileX = Math.floor(offsetU);
  const localTileY = Math.floor(offsetV);
  const tileX = window.originTileX + localTileX;
  const tileY = window.originTileY + localTileY;
  if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
    throw new RangeError("local effective vegetation sample escaped the safe-integer domain");
  }
  return sampleVegetationDensity(
    window,
    tileX,
    tileY,
    offsetU - localTileX,
    offsetV - localTileY
  );
}

// src/world/HydrologyGeometry.ts
var HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES = 0.5;
var HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES = 0.25;
function hydrologyRiverHalfWidthTiles(widthClass2) {
  if (!Number.isInteger(widthClass2) || widthClass2 <= 0 || widthClass2 > 255) {
    throw new RangeError("hydrology river width class must be a positive uint8 value");
  }
  return HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES + widthClass2 * HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES;
}

// src/world/SurfaceContours.ts
var MAX_SURFACE_SCALAR_CONTOUR_SAMPLES = 16384;
function interpolateCrossing(firstU, firstV, firstHeight, secondU, secondV, secondHeight, threshold, hexSize) {
  const amount = (threshold - firstHeight) / (secondHeight - firstHeight);
  return surfaceToWorld(
    firstU + (secondU - firstU) * amount,
    firstV + (secondV - firstV) * amount,
    hexSize
  );
}
function addContourSegments(segments, crossings, bottomLeftInside, centerInside) {
  const present = crossings.flatMap((point, edge) => point ? [{ point, edge }] : []);
  if (present.length === 2) {
    segments.push({ start: present[0].point, end: present[1].point });
    return;
  }
  if (present.length !== 4) return;
  const pairA = bottomLeftInside === centerInside;
  const pairs = pairA ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
  for (const [first, second] of pairs) {
    segments.push({
      start: crossings[first],
      end: crossings[second]
    });
  }
}
function surfaceHeightContours(window, threshold, hexSize) {
  if (!Number.isFinite(threshold)) throw new RangeError("surface contour threshold must be finite");
  const segments = [];
  for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE - 1; localX += 1) {
    const tileX = window.originTileX + localX;
    for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE - 1; localY += 1) {
      const tileY = window.originTileY + localY;
      const bottomLeft = localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
      const topLeft = bottomLeft + 1;
      const bottomRight = bottomLeft + EFFECTIVE_WINDOW_TILE_SIZE;
      const topRight = bottomRight + 1;
      if (window.valid[bottomLeft] === 0 || window.valid[topLeft] === 0 || window.valid[bottomRight] === 0 || window.valid[topRight] === 0) continue;
      const heights = [
        window.macroHeight[bottomLeft],
        window.macroHeight[topLeft],
        window.macroHeight[topRight],
        window.macroHeight[bottomRight]
      ];
      const inside = heights.map((height) => height < threshold);
      if (inside.every((value) => value === inside[0])) continue;
      const crossings = [void 0, void 0, void 0, void 0];
      if (inside[0] !== inside[1]) {
        crossings[0] = interpolateCrossing(
          tileX,
          tileY,
          heights[0],
          tileX,
          tileY + 1,
          heights[1],
          threshold,
          hexSize
        );
      }
      if (inside[1] !== inside[2]) {
        crossings[1] = interpolateCrossing(
          tileX,
          tileY + 1,
          heights[1],
          tileX + 1,
          tileY + 1,
          heights[2],
          threshold,
          hexSize
        );
      }
      if (inside[2] !== inside[3]) {
        crossings[2] = interpolateCrossing(
          tileX + 1,
          tileY + 1,
          heights[2],
          tileX + 1,
          tileY,
          heights[3],
          threshold,
          hexSize
        );
      }
      if (inside[3] !== inside[0]) {
        crossings[3] = interpolateCrossing(
          tileX + 1,
          tileY,
          heights[3],
          tileX,
          tileY,
          heights[0],
          threshold,
          hexSize
        );
      }
      addContourSegments(
        segments,
        crossings,
        inside[0],
        (heights[0] + heights[1] + heights[2] + heights[3]) / 4 < threshold
      );
    }
  }
  return Object.freeze(segments);
}
function surfaceScalarContours(bounds, hexSize, scalar) {
  if (!bounds || typeof bounds !== "object" || !Number.isFinite(bounds.minU) || !Number.isFinite(bounds.minV) || !Number.isFinite(bounds.maxU) || !Number.isFinite(bounds.maxV) || bounds.minU >= bounds.maxU || bounds.minV >= bounds.maxV || !Number.isFinite(hexSize) || hexSize <= 0 || typeof scalar !== "function") {
    throw new RangeError("surface scalar contour input is invalid");
  }
  const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const minimumGridU = Math.floor(bounds.minU * samplesPerTile);
  const minimumGridV = Math.floor(bounds.minV * samplesPerTile);
  const maximumGridU = Math.ceil(bounds.maxU * samplesPerTile);
  const maximumGridV = Math.ceil(bounds.maxV * samplesPerTile);
  const width = maximumGridU - minimumGridU + 1;
  const height = maximumGridV - minimumGridV + 1;
  if (!Number.isSafeInteger(width * height) || width * height > MAX_SURFACE_SCALAR_CONTOUR_SAMPLES) {
    throw new RangeError("surface scalar contour grid exceeds its fixed sample budget");
  }
  const values = new Float64Array(width * height);
  for (let gridU = 0; gridU < width; gridU += 1) {
    const u = (minimumGridU + gridU) / samplesPerTile;
    for (let gridV = 0; gridV < height; gridV += 1) {
      const value = scalar(u, (minimumGridV + gridV) / samplesPerTile);
      if (!Number.isFinite(value)) {
        throw new RangeError("surface scalar contour callback must return finite values");
      }
      values[gridU * height + gridV] = value;
    }
  }
  const crossing = (firstU, firstV, firstValue, secondU, secondV, secondValue) => {
    const amount = -firstValue / (secondValue - firstValue);
    return surfaceToWorld(
      firstU + (secondU - firstU) * amount,
      firstV + (secondV - firstV) * amount,
      hexSize
    );
  };
  const segments = [];
  for (let gridU = 0; gridU < width - 1; gridU += 1) {
    const u = (minimumGridU + gridU) / samplesPerTile;
    for (let gridV = 0; gridV < height - 1; gridV += 1) {
      const v = (minimumGridV + gridV) / samplesPerTile;
      const bottomLeft = gridU * height + gridV;
      const topLeft = bottomLeft + 1;
      const bottomRight = bottomLeft + height;
      const topRight = bottomRight + 1;
      const cell = [
        values[bottomLeft],
        values[topLeft],
        values[topRight],
        values[bottomRight]
      ];
      const inside = cell.map((value) => value < 0);
      if (inside.every((value) => value === inside[0])) continue;
      const step = 1 / samplesPerTile;
      const crossings = [void 0, void 0, void 0, void 0];
      if (inside[0] !== inside[1]) {
        crossings[0] = crossing(u, v, cell[0], u, v + step, cell[1]);
      }
      if (inside[1] !== inside[2]) {
        crossings[1] = crossing(u, v + step, cell[1], u + step, v + step, cell[2]);
      }
      if (inside[2] !== inside[3]) {
        crossings[2] = crossing(u + step, v + step, cell[2], u + step, v, cell[3]);
      }
      if (inside[3] !== inside[0]) {
        crossings[3] = crossing(u + step, v, cell[3], u, v, cell[0]);
      }
      addContourSegments(
        segments,
        crossings,
        inside[0],
        (cell[0] + cell[1] + cell[2] + cell[3]) * 0.25 < 0
      );
    }
  }
  return Object.freeze(segments);
}
function pointSegmentDistance(x, z, segment) {
  const deltaX = segment.end.x - segment.start.x;
  const deltaZ = segment.end.z - segment.start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared <= 0) return Math.hypot(x - segment.start.x, z - segment.start.z);
  const amount = Math.max(0, Math.min(
    1,
    ((x - segment.start.x) * deltaX + (z - segment.start.z) * deltaZ) / lengthSquared
  ));
  return Math.hypot(
    x - (segment.start.x + deltaX * amount),
    z - (segment.start.z + deltaZ * amount)
  );
}
function surfaceAxisToTexel(axis, renderChunkCoordinate) {
  return (axis - renderChunkCoordinate * SURFACE_COMPILE_PROFILE.renderChunkSize + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5;
}
function createSurfaceContourRasterContext(window, hexSize) {
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new RangeError("surface contour raster hex size must be positive and finite");
  }
  const worldX = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const worldZ = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels; texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelX += 1) {
    const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
    const x = 1.5 * hexSize * u;
    const stagger = surfaceStagger(u);
    for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels; texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelY += 1) {
      const v = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
      const index = surfaceFieldTexelIndex(texelX, texelY);
      worldX[index] = x;
      worldZ[index] = Math.sqrt(3) * hexSize * (v + stagger);
    }
  }
  return Object.freeze({
    renderChunkX: window.renderKey.chunkX,
    renderChunkY: window.renderKey.chunkY,
    hexSize,
    worldX,
    worldZ
  });
}
function rasterSurfaceContourDistances(context, contours, saturation) {
  if (!context || typeof context !== "object" || !Number.isSafeInteger(context.renderChunkX) || !Number.isSafeInteger(context.renderChunkY) || !Number.isFinite(context.hexSize) || context.hexSize <= 0 || !(context.worldX instanceof Float64Array) || context.worldX.length !== COMPILED_SURFACE_TEXEL_COUNT || !(context.worldZ instanceof Float64Array) || context.worldZ.length !== COMPILED_SURFACE_TEXEL_COUNT || !Array.isArray(contours) || !Number.isFinite(saturation) || saturation <= 0) {
    throw new RangeError("surface contour raster input is invalid");
  }
  const distances = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  distances.fill(saturation);
  if (contours.length === 0) return distances;
  const hexSize = context.hexSize;
  const surfaceRadiusU = saturation / (1.5 * hexSize);
  const surfaceRadiusV = saturation / (Math.sqrt(3) * hexSize) + 0.5;
  for (const contour of contours) {
    const start = worldToSurface(contour.start.x, contour.start.z, hexSize);
    const end = worldToSurface(contour.end.x, contour.end.z, hexSize);
    const minimumTexelX = Math.max(-SURFACE_COMPILE_PROFILE.gutterTexels, Math.floor(
      surfaceAxisToTexel(Math.min(start.u, end.u) - surfaceRadiusU, context.renderChunkX)
    ));
    const maximumTexelX = Math.min(SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels - 1, Math.ceil(
      surfaceAxisToTexel(Math.max(start.u, end.u) + surfaceRadiusU, context.renderChunkX)
    ));
    const minimumTexelY = Math.max(-SURFACE_COMPILE_PROFILE.gutterTexels, Math.floor(
      surfaceAxisToTexel(Math.min(start.v, end.v) - surfaceRadiusV, context.renderChunkY)
    ));
    const maximumTexelY = Math.min(SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels - 1, Math.ceil(
      surfaceAxisToTexel(Math.max(start.v, end.v) + surfaceRadiusV, context.renderChunkY)
    ));
    for (let texelX = minimumTexelX; texelX <= maximumTexelX; texelX += 1) {
      for (let texelY = minimumTexelY; texelY <= maximumTexelY; texelY += 1) {
        const index = surfaceFieldTexelIndex(texelX, texelY);
        distances[index] = Math.min(distances[index], pointSegmentDistance(
          context.worldX[index],
          context.worldZ[index],
          contour
        ));
      }
    }
  }
  return distances;
}
function surfaceContourDistances(window, contours, hexSize, saturation) {
  return rasterSurfaceContourDistances(
    createSurfaceContourRasterContext(window, hexSize),
    contours,
    saturation
  );
}
function quantizeSurfaceCoverage(signedDistance, antialiasRadius) {
  if (!Number.isFinite(signedDistance) || !Number.isFinite(antialiasRadius) || antialiasRadius <= 0) {
    throw new RangeError("surface coverage distance input is invalid");
  }
  const coverage = Math.max(0, Math.min(1, 0.5 - signedDistance / (antialiasRadius * 2)));
  return Math.floor(coverage * 255 + 0.5);
}

// src/world/compileSemanticSurfaceField.ts
function quantizeMaterialWeights(materialWeights, offset, sample, valid, scratch) {
  if (!valid) {
    materialWeights[offset] = 255;
    return;
  }
  const values = scratch.values;
  values[0] = sample.biome0;
  values[1] = sample.biome1;
  values[2] = sample.biome2;
  values[3] = sample.biome3;
  const sum = values[0] + values[1] + values[2] + values[3];
  if (!Number.isFinite(sum) || sum <= 0) {
    throw new Error("effective semantic biome sample is not normalizable");
  }
  const quantized = scratch.quantized;
  const fractions = scratch.fractions;
  let assigned = 0;
  for (let index = 0; index < 4; index += 1) {
    const scaled = Math.max(0, values[index]) / sum * 255;
    quantized[index] = Math.floor(scaled);
    fractions[index] = scaled - quantized[index];
    assigned += quantized[index];
  }
  for (let unit = assigned; unit < 255; unit += 1) {
    let candidate = 0;
    for (let index = 1; index < 4; index += 1) {
      if (fractions[index] > fractions[candidate]) candidate = index;
    }
    quantized[candidate] += 1;
    fractions[candidate] = -1;
  }
  materialWeights[offset] = quantized[0];
  materialWeights[offset + 1] = quantized[1];
  materialWeights[offset + 2] = quantized[2];
  materialWeights[offset + 3] = quantized[3];
}
function compileSemanticSurfaceField(window) {
  assertTransferableEffectiveWindow(window);
  const groundHeight = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const materialWeights = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT * 4);
  const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const sample = {
    groundHeight: 0,
    biome0: 0,
    biome1: 0,
    biome2: 0,
    biome3: 0
  };
  const materialScratch = {
    values: new Float64Array(4),
    quantized: new Uint8Array(4),
    fractions: new Float64Array(4)
  };
  const saturatedShoreDistance = finiteFloat16Bits(
    "dry surface shoreline saturation",
    surfaceInfluenceRadiusWorld(window.dependencyKey.metrics.hexSize)
  );
  for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels; texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelX += 1) {
    const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
    for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels; texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelY += 1) {
      const v = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
      const index = surfaceFieldTexelIndex(texelX, texelY);
      const sampleIsValid = sampleEffectiveWindowSemantic(
        window,
        u,
        v,
        window.dependencyKey.metrics.heightScale,
        sample
      );
      groundHeight[index] = finiteFloat16Bits(
        "compiled semantic ground height",
        sampleIsValid ? sample.groundHeight : 0
      );
      quantizeMaterialWeights(materialWeights, index * 4, sample, sampleIsValid, materialScratch);
      shorelineDistance[index] = saturatedShoreDistance;
    }
  }
  return createCompiledSurfaceField({
    groundHeight,
    materialWeights,
    waterLevel: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
    waterDepth: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
    shorelineDistance,
    flow: new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2),
    waterCoverage: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
    waterKind: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
    waterProfile: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
    waterBodyIndex: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT)
  });
}

// src/world/compileOceanSurfaceField.ts
function compileOceanSurfaceField(window) {
  assertTransferableEffectiveWindow(window);
  const semantic = compileSemanticSurfaceField(window);
  const groundHeight = semantic.groundHeight.slice();
  const materialWeights = semantic.materialWeights.slice();
  const waterLevel = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const waterDepth = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const flow = new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2);
  const waterCoverage = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
  const waterKind = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
  const waterProfile = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
  const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
  const hexSize = window.dependencyKey.metrics.hexSize;
  const heightScale = window.dependencyKey.metrics.heightScale;
  const seaWorldLevel = window.seaLevel / 65535 * heightScale;
  const seaLevelBits = finiteFloat16Bits("compiled ocean level", seaWorldLevel);
  const quantizedSeaWorldLevel = float16BitsToFloat32(seaLevelBits);
  const saturation = surfaceInfluenceRadiusWorld(hexSize);
  const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize) / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const contours = surfaceHeightContours(window, window.seaLevel, hexSize);
  const contourDistances = surfaceContourDistances(window, contours, hexSize, saturation);
  let hasOceanCoverage = false;
  for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels; texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelX += 1) {
    for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels; texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelY += 1) {
      const index = surfaceFieldTexelIndex(texelX, texelY);
      const ground = float16BitsToFloat32(groundHeight[index]);
      const wet = ground < quantizedSeaWorldLevel;
      const distance = contourDistances[index];
      const signedDistance = wet ? -distance : distance;
      shorelineDistance[index] = finiteFloat16Bits(
        "compiled ocean shoreline distance",
        Math.max(-saturation, Math.min(saturation, signedDistance))
      );
      const rawCoverage = quantizeSurfaceCoverage(signedDistance, antialiasRadius);
      const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
      if (coverage === 0) continue;
      hasOceanCoverage = true;
      waterCoverage[index] = coverage;
      waterKind[index] = SURFACE_WATER_KIND_OCEAN;
      waterBodyIndex[index] = 1;
      waterLevel[index] = seaLevelBits;
      waterDepth[index] = finiteFloat16Bits(
        "compiled ocean depth",
        Math.max(0, quantizedSeaWorldLevel - ground)
      );
    }
  }
  const field2 = createCompiledSurfaceField({
    groundHeight,
    materialWeights,
    waterLevel,
    waterDepth,
    shorelineDistance,
    flow,
    waterCoverage,
    waterKind,
    waterProfile,
    waterBodyIndex
  });
  return Object.freeze({
    field: field2,
    waterBodies: createCompiledWaterBodyPalette(hasOceanCoverage ? [{ bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 }] : [])
  });
}

// src/world/compileLakeSurfaceField.ts
var MAX_SURFACE_PERIODIC_FEATURE_IMAGES = 16;
function compareIdentity2(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}
function surfaceHydrologyBoundsIntersect(first, second) {
  return first.minU <= second.maxU && first.maxU >= second.minU && first.minV <= second.maxV && first.maxV >= second.minV;
}
function translatedBounds(bounds, offsetU, offsetV) {
  return {
    minU: bounds.minU + offsetU,
    minV: bounds.minV + offsetV,
    maxU: bounds.maxU + offsetU,
    maxV: bounds.maxV + offsetV
  };
}
function periodicOffsets(minimum, maximum, queryMinimum, queryMaximum, period) {
  if (period === void 0) return [0];
  const first = Math.ceil((queryMinimum - maximum) / period);
  const last = Math.floor((queryMaximum - minimum) / period);
  const offsets = [];
  for (let image = first; image <= last; image += 1) offsets.push(image * period);
  return offsets;
}
function surfaceHydrologyProjectedOffsets(window, bounds, queryBounds) {
  const periodU = window.domain.topology === "toroidal" ? window.domain.width : void 0;
  const periodV = window.domain.topology === "toroidal" ? window.domain.height : void 0;
  const uOffsets = periodicOffsets(bounds.minU, bounds.maxU, queryBounds.minU, queryBounds.maxU, periodU);
  const vOffsets = periodicOffsets(bounds.minV, bounds.maxV, queryBounds.minV, queryBounds.maxV, periodV);
  if (uOffsets.length * vOffsets.length > MAX_SURFACE_PERIODIC_FEATURE_IMAGES) {
    throw new RangeError("surface hydrology feature exceeds its periodic image budget");
  }
  return Object.freeze(uOffsets.flatMap((u) => vOffsets.map((v) => Object.freeze({ u, v }))));
}
function circleShapes(window, region, lake, queryBounds) {
  const centerU = region.key.regionX * HYDROLOGY_REGION_SIZE + lake.center[0] / HYDROLOGY_POINT_QUANTIZATION;
  const centerV = region.key.regionY * HYDROLOGY_REGION_SIZE + lake.center[1] / HYDROLOGY_POINT_QUANTIZATION;
  const radius = lake.radius / HYDROLOGY_POINT_QUANTIZATION;
  const bounds = {
    minU: centerU - radius,
    minV: centerV - radius,
    maxU: centerU + radius,
    maxV: centerV + radius
  };
  return Object.freeze(surfaceHydrologyProjectedOffsets(window, bounds, queryBounds).map((offset) => Object.freeze({
    shapeKind: "circle",
    bodyId: lake.bodyId,
    stableIdentity: lake.bodyId,
    level: lake.level,
    profileIndex: lake.profileIndex,
    centerU: centerU + offset.u,
    centerV: centerV + offset.v,
    radius,
    bounds: Object.freeze(translatedBounds(bounds, offset.u, offset.v))
  })));
}
function polygonBounds(points) {
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < points.length; index += 2) {
    minU = Math.min(minU, points[index] / HYDROLOGY_POINT_QUANTIZATION);
    minV = Math.min(minV, points[index + 1] / HYDROLOGY_POINT_QUANTIZATION);
    maxU = Math.max(maxU, points[index] / HYDROLOGY_POINT_QUANTIZATION);
    maxV = Math.max(maxV, points[index + 1] / HYDROLOGY_POINT_QUANTIZATION);
  }
  return { minU, minV, maxU, maxV };
}
function polygonShapes(window, lake, queryBounds) {
  const bounds = polygonBounds(lake.polygon);
  return Object.freeze(surfaceHydrologyProjectedOffsets(window, bounds, queryBounds).map((offset) => {
    const points = new Float64Array(lake.polygon.length);
    for (let index = 0; index < points.length; index += 2) {
      points[index] = lake.polygon[index] / HYDROLOGY_POINT_QUANTIZATION + offset.u;
      points[index + 1] = lake.polygon[index + 1] / HYDROLOGY_POINT_QUANTIZATION + offset.v;
    }
    return Object.freeze({
      shapeKind: "polygon",
      bodyId: lake.featureId,
      stableIdentity: lake.featureId,
      level: lake.level,
      profileIndex: lake.profileIndex,
      points,
      bounds: Object.freeze(translatedBounds(bounds, offset.u, offset.v))
    });
  }));
}
function registerBody(bodies, bodyId, profileIndex, level) {
  const existing = bodies.get(bodyId);
  if (existing && (existing.kind !== "lake" || existing.profileIndex !== profileIndex || existing.level !== level)) {
    throw new Error("surface lake body slices disagree on kind, profile or level");
  }
  if (!existing) bodies.set(bodyId, { bodyId, kind: "lake", profileIndex, level });
}
function collectLakeShapes(window, queryBounds) {
  const shapes = [];
  const bodies = /* @__PURE__ */ new Map();
  for (const region of window.hydrologyRegions) {
    const suppressed = new Set(region.suppressedBaseFeatureIds);
    const bodyById = new Map(region.bodies.map((body) => [body.bodyId, body]));
    for (const lake of region.lakes) {
      if (suppressed.has(lake.bodyId)) continue;
      const body = bodyById.get(lake.bodyId);
      if (!body || body.kind !== "lake" || body.profileIndex !== lake.profileIndex) {
        throw new Error("surface lake slice lost its canonical body definition");
      }
      registerBody(bodies, lake.bodyId, lake.profileIndex, lake.level);
      shapes.push(...circleShapes(window, region, lake, queryBounds));
    }
  }
  for (const delta of window.authoredHydrology) {
    if (delta.feature.kind !== "lake") continue;
    registerBody(bodies, delta.feature.featureId, delta.feature.profileIndex, delta.feature.level);
    shapes.push(...polygonShapes(window, delta.feature, queryBounds));
  }
  return Object.freeze({ shapes: Object.freeze(shapes), bodies });
}
function clipSegment(startU, startV, endU, endV, bounds) {
  const deltaU = endU - startU;
  const deltaV = endV - startV;
  let minimum = 0;
  let maximum = 1;
  const tests = [
    [-deltaU, startU - bounds.minU],
    [deltaU, bounds.maxU - startU],
    [-deltaV, startV - bounds.minV],
    [deltaV, bounds.maxV - startV]
  ];
  for (const [direction, distance] of tests) {
    if (direction === 0) {
      if (distance < 0) return void 0;
      continue;
    }
    const amount = distance / direction;
    if (direction < 0) minimum = Math.max(minimum, amount);
    else maximum = Math.min(maximum, amount);
    if (minimum > maximum) return void 0;
  }
  return [minimum, maximum];
}
function addLogicalSegment(output, startU, startV, endU, endV, clipBounds, hexSize) {
  const clipped = clipSegment(startU, startV, endU, endV, clipBounds);
  if (!clipped) return;
  const deltaU = endU - startU;
  const deltaV = endV - startV;
  const amounts = [clipped[0], clipped[1]];
  if (deltaU !== 0) {
    const clippedStartU = startU + deltaU * clipped[0];
    const clippedEndU = startU + deltaU * clipped[1];
    for (let column = Math.floor(Math.min(clippedStartU, clippedEndU)) + 1; column < Math.max(clippedStartU, clippedEndU); column += 1) {
      amounts.push((column - startU) / deltaU);
    }
  }
  amounts.sort((first, second) => first - second);
  for (let index = 0; index < amounts.length - 1; index += 1) {
    const first = amounts[index];
    const second = amounts[index + 1];
    if (second <= first) continue;
    output.push({
      start: surfaceToWorld(startU + deltaU * first, startV + deltaV * first, hexSize),
      end: surfaceToWorld(startU + deltaU * second, startV + deltaV * second, hexSize)
    });
  }
}
function criticalCircleAngles(centerU, centerV, radius, bounds) {
  const full = Math.PI * 2;
  const angles = [0, full];
  const add = (angle) => {
    const normalized = angle < 0 ? angle + full : angle;
    if (normalized > 0 && normalized < full) angles.push(normalized);
  };
  for (const boundary of [bounds.minU, bounds.maxU]) {
    const ratio = (boundary - centerU) / radius;
    if (ratio < -1 || ratio > 1) continue;
    const angle = Math.acos(ratio);
    add(angle);
    add(full - angle);
  }
  for (const boundary of [bounds.minV, bounds.maxV]) {
    const ratio = (boundary - centerV) / radius;
    if (ratio < -1 || ratio > 1) continue;
    const angle = Math.asin(ratio);
    add(angle);
    add(Math.PI - angle);
  }
  angles.sort((first, second) => first - second);
  return Object.freeze(angles.filter((angle, index) => index === 0 || angle - angles[index - 1] > 1e-12));
}
function circleContours(shape, clipBounds, hexSize) {
  const output = [];
  const angles = criticalCircleAngles(shape.centerU, shape.centerV, shape.radius, clipBounds);
  for (let interval = 0; interval < angles.length - 1; interval += 1) {
    const startAngle = angles[interval];
    const endAngle = angles[interval + 1];
    const middle = (startAngle + endAngle) * 0.5;
    const middleU = shape.centerU + Math.cos(middle) * shape.radius;
    const middleV = shape.centerV + Math.sin(middle) * shape.radius;
    if (middleU < clipBounds.minU || middleU > clipBounds.maxU || middleV < clipBounds.minV || middleV > clipBounds.maxV) continue;
    const count = Math.max(1, Math.ceil(
      (endAngle - startAngle) * shape.radius * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
    ));
    let previousU = shape.centerU + Math.cos(startAngle) * shape.radius;
    let previousV = shape.centerV + Math.sin(startAngle) * shape.radius;
    for (let step = 1; step <= count; step += 1) {
      const angle = startAngle + (endAngle - startAngle) * step / count;
      const nextU = shape.centerU + Math.cos(angle) * shape.radius;
      const nextV = shape.centerV + Math.sin(angle) * shape.radius;
      addLogicalSegment(output, previousU, previousV, nextU, nextV, clipBounds, hexSize);
      previousU = nextU;
      previousV = nextV;
    }
  }
  return Object.freeze(output);
}
function polygonContours(shape, clipBounds, hexSize) {
  const output = [];
  const pointCount = shape.points.length / 2;
  for (let index = 0; index < pointCount; index += 1) {
    const next = (index + 1) % pointCount;
    addLogicalSegment(
      output,
      shape.points[index * 2],
      shape.points[index * 2 + 1],
      shape.points[next * 2],
      shape.points[next * 2 + 1],
      clipBounds,
      hexSize
    );
  }
  return Object.freeze(output);
}
function pointOnLogicalSegment(u, v, startU, startV, endU, endV) {
  const cross = (u - startU) * (endV - startV) - (v - startV) * (endU - startU);
  return Math.abs(cross) <= Number.EPSILON * 32 && u >= Math.min(startU, endU) && u <= Math.max(startU, endU) && v >= Math.min(startV, endV) && v <= Math.max(startV, endV);
}
function polygonContains(points, u, v) {
  let inside = false;
  const pointCount = points.length / 2;
  for (let index = 0, previous = pointCount - 1; index < pointCount; previous = index, index += 1) {
    const currentU = points[index * 2];
    const currentV = points[index * 2 + 1];
    const previousU = points[previous * 2];
    const previousV = points[previous * 2 + 1];
    if (pointOnLogicalSegment(u, v, previousU, previousV, currentU, currentV)) return true;
    if (currentV > v !== previousV > v && u < (previousU - currentU) * (v - currentV) / (previousV - currentV) + currentU) {
      inside = !inside;
    }
  }
  return inside;
}
function shapeContains(shape, u, v) {
  if (shape.shapeKind === "circle") {
    return (u - shape.centerU) ** 2 + (v - shape.centerV) ** 2 <= shape.radius ** 2;
  }
  return polygonContains(shape.points, u, v);
}
function surfaceHydrologyQueryBounds(window, saturation) {
  const hexSize = window.dependencyKey.metrics.hexSize;
  const firstU = surfaceTexelCenterAxis(window.renderKey.chunkX, -SURFACE_COMPILE_PROFILE.gutterTexels);
  const lastU = surfaceTexelCenterAxis(
    window.renderKey.chunkX,
    SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels - 1
  );
  const firstV = surfaceTexelCenterAxis(window.renderKey.chunkY, -SURFACE_COMPILE_PROFILE.gutterTexels);
  const lastV = surfaceTexelCenterAxis(
    window.renderKey.chunkY,
    SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels - 1
  );
  return Object.freeze({
    minU: firstU - saturation / (1.5 * hexSize),
    maxU: lastU + saturation / (1.5 * hexSize),
    minV: firstV - saturation / (Math.sqrt(3) * hexSize) - 0.5,
    maxV: lastV + saturation / (Math.sqrt(3) * hexSize) + 0.5
  });
}
function compileLakeSurfaceField(window) {
  assertTransferableEffectiveWindow(window);
  const ocean = compileOceanSurfaceField(window);
  const hexSize = window.dependencyKey.metrics.hexSize;
  const heightScale = window.dependencyKey.metrics.heightScale;
  const saturation = surfaceInfluenceRadiusWorld(hexSize);
  const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize) / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const bounds = surfaceHydrologyQueryBounds(window, saturation);
  const collected = collectLakeShapes(window, bounds);
  if (collected.shapes.length === 0) return ocean;
  const contourContext = createSurfaceContourRasterContext(window, hexSize);
  const groundHeight = ocean.field.groundHeight.slice();
  const materialWeights = ocean.field.materialWeights.slice();
  const waterLevel = ocean.field.waterLevel.slice();
  const waterDepth = ocean.field.waterDepth.slice();
  const shorelineDistance = ocean.field.shorelineDistance.slice();
  const flow = ocean.field.flow.slice();
  const waterCoverage = ocean.field.waterCoverage.slice();
  const waterKind = ocean.field.waterKind.slice();
  const waterProfile = ocean.field.waterProfile.slice();
  const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
  const logicalU = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const logicalV = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const unionDistance = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const winnerPriority = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const winnerBody = new Array(COMPILED_SURFACE_TEXEL_COUNT);
  for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels; texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelX += 1) {
    const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
    for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels; texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelY += 1) {
      const index = surfaceFieldTexelIndex(texelX, texelY);
      logicalU[index] = u;
      logicalV[index] = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
      unionDistance[index] = float16BitsToFloat32(shorelineDistance[index]);
      if (waterCoverage[index] > 0) winnerBody[index] = OCEAN_BODY_ID;
    }
  }
  const thresholdDistances = /* @__PURE__ */ new Map();
  const thresholdLevelBits = /* @__PURE__ */ new Map();
  const distanceForLevel = (level) => {
    const cached = thresholdDistances.get(level);
    if (cached) return cached;
    const levelBits = finiteFloat16Bits("compiled lake level", level / 65535 * heightScale);
    const quantizedLevel = float16BitsToFloat32(levelBits);
    const magnitude = rasterSurfaceContourDistances(
      contourContext,
      surfaceHeightContours(window, level, hexSize),
      saturation
    );
    for (let index = 0; index < magnitude.length; index += 1) {
      if (float16BitsToFloat32(groundHeight[index]) < quantizedLevel) magnitude[index] *= -1;
    }
    thresholdDistances.set(level, magnitude);
    thresholdLevelBits.set(level, levelBits);
    return magnitude;
  };
  for (const shape of collected.shapes) {
    if (!surfaceHydrologyBoundsIntersect(shape.bounds, bounds)) continue;
    const contours = shape.shapeKind === "circle" ? circleContours(shape, bounds, hexSize) : polygonContours(shape, bounds, hexSize);
    const shapeMagnitude = rasterSurfaceContourDistances(contourContext, contours, saturation);
    const heightDistance = distanceForLevel(shape.level);
    const levelBits = thresholdLevelBits.get(shape.level);
    const quantizedLevel = float16BitsToFloat32(levelBits);
    const influenceU = saturation / (1.5 * hexSize);
    const influenceV = saturation / (Math.sqrt(3) * hexSize) + 0.5;
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
      if (logicalU[index] < shape.bounds.minU - influenceU || logicalU[index] > shape.bounds.maxU + influenceU || logicalV[index] < shape.bounds.minV - influenceV || logicalV[index] > shape.bounds.maxV + influenceV) continue;
      const inside = shapeContains(shape, logicalU[index], logicalV[index]);
      const shapeDistance = inside ? -shapeMagnitude[index] : shapeMagnitude[index];
      const signedDistance = Math.max(shapeDistance, heightDistance[index]);
      unionDistance[index] = Math.min(unionDistance[index], signedDistance);
      const wet = signedDistance < 0;
      const rawCoverage = quantizeSurfaceCoverage(signedDistance, antialiasRadius);
      const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
      if (coverage === 0) continue;
      const currentBody = winnerBody[index];
      if (coverage < waterCoverage[index] || coverage === waterCoverage[index] && winnerPriority[index] > 1 || coverage === waterCoverage[index] && winnerPriority[index] === 1 && currentBody !== void 0 && currentBody <= shape.stableIdentity) continue;
      waterCoverage[index] = coverage;
      waterKind[index] = SURFACE_WATER_KIND_LAKE;
      waterProfile[index] = shape.profileIndex;
      waterLevel[index] = levelBits;
      waterDepth[index] = finiteFloat16Bits(
        "compiled lake depth",
        Math.max(0, quantizedLevel - float16BitsToFloat32(groundHeight[index]))
      );
      flow[index * 2] = 0;
      flow[index * 2 + 1] = 0;
      winnerPriority[index] = 1;
      winnerBody[index] = shape.bodyId;
    }
  }
  const usedBodies = /* @__PURE__ */ new Map();
  for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
    const wet = unionDistance[index] < 0;
    const rawCoverage = quantizeSurfaceCoverage(unionDistance[index], antialiasRadius);
    const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
    waterCoverage[index] = coverage;
    shorelineDistance[index] = finiteFloat16Bits(
      "compiled lake union shoreline distance",
      Math.max(-saturation, Math.min(saturation, unionDistance[index]))
    );
    const bodyId = winnerBody[index];
    if (coverage === 0 || bodyId === void 0) {
      waterLevel[index] = 0;
      waterDepth[index] = 0;
      waterKind[index] = 0;
      waterProfile[index] = 0;
      flow[index * 2] = 0;
      flow[index * 2 + 1] = 0;
      winnerBody[index] = void 0;
      continue;
    }
    if (bodyId === OCEAN_BODY_ID) {
      usedBodies.set(bodyId, { bodyId, kind: "ocean", profileIndex: 0 });
    } else {
      const definition = collected.bodies.get(bodyId);
      if (!definition) throw new Error("compiled lake texel lost its body definition");
      usedBodies.set(bodyId, {
        bodyId,
        kind: "lake",
        profileIndex: definition.profileIndex
      });
    }
  }
  const palette = createCompiledWaterBodyPalette([...usedBodies.values()].sort((first, second) => compareIdentity2(first.bodyId, second.bodyId)));
  const paletteIndex = new Map(palette.entries.map((body, index) => [body.bodyId, index + 1]));
  for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
    const bodyId = winnerBody[index];
    if (bodyId !== void 0) {
      const bodyIndex = paletteIndex.get(bodyId);
      if (bodyIndex === void 0) throw new Error("compiled lake palette lost a winning body");
      waterBodyIndex[index] = bodyIndex;
    }
  }
  return Object.freeze({
    field: createCompiledSurfaceField({
      groundHeight,
      materialWeights,
      waterLevel,
      waterDepth,
      shorelineDistance,
      flow,
      waterCoverage,
      waterKind,
      waterProfile,
      waterBodyIndex
    }),
    waterBodies: palette
  });
}

// src/world/compileSurfaceField.ts
function compareIdentity3(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}
function registerBody2(catalog, body) {
  const existing = catalog.get(body.bodyId);
  if (existing && (existing.kind !== body.kind || existing.profileIndex !== body.profileIndex)) {
    throw new Error("surface hydrology body definitions disagree on kind or profile");
  }
  if (!existing) catalog.set(body.bodyId, Object.freeze({ ...body }));
}
function buildBodyCatalog(window, existing) {
  const catalog = /* @__PURE__ */ new Map();
  for (const body of existing.entries) registerBody2(catalog, body);
  registerBody2(catalog, { bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 });
  for (const region of window.hydrologyRegions) {
    const suppressed = new Set(region.suppressedBaseFeatureIds);
    for (const body of region.bodies) {
      if (body.bodyId !== OCEAN_BODY_ID && suppressed.has(body.bodyId)) continue;
      registerBody2(catalog, body);
    }
  }
  for (const delta of window.authoredHydrology) {
    registerBody2(catalog, {
      bodyId: delta.feature.featureId,
      kind: delta.feature.kind,
      profileIndex: delta.feature.profileIndex
    });
  }
  return catalog;
}
function logicalPoints(points, originU, originV) {
  const output = new Float64Array(points.length);
  for (let index = 0; index < points.length; index += 2) {
    output[index] = originU + points[index] / HYDROLOGY_POINT_QUANTIZATION;
    output[index + 1] = originV + points[index + 1] / HYDROLOGY_POINT_QUANTIZATION;
  }
  return output;
}
function riverBounds(points, widthProfile) {
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  let maximumHalfWidth = 0;
  for (let index = 0; index < points.length; index += 2) {
    minU = Math.min(minU, points[index]);
    minV = Math.min(minV, points[index + 1]);
    maxU = Math.max(maxU, points[index]);
    maxV = Math.max(maxV, points[index + 1]);
    maximumHalfWidth = Math.max(
      maximumHalfWidth,
      hydrologyRiverHalfWidthTiles(widthProfile[index / 2])
    );
  }
  return {
    minU: minU - maximumHalfWidth,
    minV: minV - maximumHalfWidth,
    maxU: maxU + maximumHalfWidth,
    maxV: maxV + maximumHalfWidth
  };
}
function clipRiverSegmentAmounts(startU, startV, endU, endV, bounds) {
  const deltaU = endU - startU;
  const deltaV = endV - startV;
  let minimum = 0;
  let maximum = 1;
  const constraints = [
    [-deltaU, startU - bounds.minU],
    [deltaU, bounds.maxU - startU],
    [-deltaV, startV - bounds.minV],
    [deltaV, bounds.maxV - startV]
  ];
  for (const [direction, distance] of constraints) {
    if (direction === 0) {
      if (distance < 0) return void 0;
      continue;
    }
    const amount = distance / direction;
    if (direction < 0) minimum = Math.max(minimum, amount);
    else maximum = Math.min(maximum, amount);
    if (minimum > maximum) return void 0;
  }
  return [minimum, maximum];
}
function buildRiverSpans(points, widthProfile, levelProfile, offsetU, offsetV, hexSize, queryBounds) {
  const pointCount = points.length / 2;
  const segmentLengths = new Float64Array(pointCount - 1);
  const remainingAfterSegment = new Float64Array(pointCount - 1);
  let remaining = 0;
  for (let pointIndex = pointCount - 2; pointIndex >= 0; pointIndex -= 1) {
    const length = Math.hypot(
      points[pointIndex * 2 + 2] - points[pointIndex * 2],
      points[pointIndex * 2 + 3] - points[pointIndex * 2 + 1]
    );
    segmentLengths[pointIndex] = length;
    remainingAfterSegment[pointIndex] = remaining;
    remaining += length;
  }
  const output = [];
  for (let pointIndex = 0; pointIndex < pointCount - 1; pointIndex += 1) {
    const originalStartU = points[pointIndex * 2] + offsetU;
    const originalStartV = points[pointIndex * 2 + 1] + offsetV;
    const originalEndU = points[pointIndex * 2 + 2] + offsetU;
    const originalEndV = points[pointIndex * 2 + 3] + offsetV;
    const deltaU = originalEndU - originalStartU;
    const deltaV = originalEndV - originalStartV;
    const startWidth = hydrologyRiverHalfWidthTiles(widthProfile[pointIndex]);
    const endWidth = hydrologyRiverHalfWidthTiles(widthProfile[pointIndex + 1]);
    const maximumHalfWidth = Math.max(startWidth, endWidth);
    const clipped = clipRiverSegmentAmounts(
      originalStartU,
      originalStartV,
      originalEndU,
      originalEndV,
      {
        minU: queryBounds.minU - maximumHalfWidth,
        minV: queryBounds.minV - maximumHalfWidth,
        maxU: queryBounds.maxU + maximumHalfWidth,
        maxV: queryBounds.maxV + maximumHalfWidth
      }
    );
    if (!clipped || clipped[0] === clipped[1]) continue;
    const amounts = [clipped[0], clipped[1]];
    if (deltaU !== 0) {
      const clippedStartU = originalStartU + deltaU * clipped[0];
      const clippedEndU = originalStartU + deltaU * clipped[1];
      for (let column = Math.floor(Math.min(clippedStartU, clippedEndU)) + 1; column < Math.max(clippedStartU, clippedEndU); column += 1) {
        const amount = (column - originalStartU) / deltaU;
        if (amount > clipped[0] && amount < clipped[1]) amounts.push(amount);
      }
    }
    amounts.sort((first, second) => first - second);
    for (let partIndex = 0; partIndex < amounts.length - 1; partIndex += 1) {
      const first = amounts[partIndex];
      const second = amounts[partIndex + 1];
      const startU = originalStartU + deltaU * first;
      const startV = originalStartV + deltaV * first;
      const endU = originalStartU + deltaU * second;
      const endV = originalStartV + deltaV * second;
      const logicalLength = Math.hypot(endU - startU, endV - startV);
      if (logicalLength <= 0) continue;
      const worldStart = surfaceToWorld(startU, startV, hexSize);
      const worldEnd = surfaceToWorld(endU, endV, hexSize);
      const worldDeltaX = worldEnd.x - worldStart.x;
      const worldDeltaZ = worldEnd.z - worldStart.z;
      const worldLength = Math.hypot(worldDeltaX, worldDeltaZ);
      output.push(Object.freeze({
        startU,
        startV,
        endU,
        endV,
        startHalfWidth: startWidth + (endWidth - startWidth) * first,
        endHalfWidth: startWidth + (endWidth - startWidth) * second,
        startLevel: levelProfile[pointIndex] + (levelProfile[pointIndex + 1] - levelProfile[pointIndex]) * first,
        endLevel: levelProfile[pointIndex] + (levelProfile[pointIndex + 1] - levelProfile[pointIndex]) * second,
        logicalLength,
        remainingLogicalLength: segmentLengths[pointIndex] * (1 - second) + remainingAfterSegment[pointIndex],
        flowX: worldDeltaX / worldLength,
        flowZ: worldDeltaZ / worldLength
      }));
    }
  }
  return Object.freeze(output);
}
function projectedRiverShapes(window, input, queryBounds, hexSize) {
  const bounds = riverBounds(input.points, input.widthProfile);
  return Object.freeze(surfaceHydrologyProjectedOffsets(window, bounds, queryBounds).flatMap((offset) => {
    const spans = buildRiverSpans(
      input.points,
      input.widthProfile,
      input.levelProfile,
      offset.u,
      offset.v,
      hexSize,
      queryBounds
    );
    if (spans.length === 0) return [];
    let minU = Number.POSITIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (const span of spans) {
      const maximumHalfWidth = Math.max(span.startHalfWidth, span.endHalfWidth);
      minU = Math.min(minU, span.startU - maximumHalfWidth, span.endU - maximumHalfWidth);
      minV = Math.min(minV, span.startV - maximumHalfWidth, span.endV - maximumHalfWidth);
      maxU = Math.max(maxU, span.startU + maximumHalfWidth, span.endU + maximumHalfWidth);
      maxV = Math.max(maxV, span.startV + maximumHalfWidth, span.endV + maximumHalfWidth);
    }
    return [Object.freeze({
      bodyId: input.bodyId,
      stableIdentity: input.stableIdentity,
      profileIndex: input.profileIndex,
      dischargeClass: input.dischargeClass,
      mouthTarget: input.mouthTarget,
      bounds: Object.freeze({ minU, minV, maxU, maxV }),
      spans: Object.freeze(spans)
    })];
  }));
}
function mouthTarget(catalog, targetBodyId) {
  if (targetBodyId === void 0) return void 0;
  const target = catalog.get(targetBodyId);
  if (!target || target.kind !== "ocean" && target.kind !== "lake") {
    throw new Error("surface river mouth target is missing or is not terminal water");
  }
  return target;
}
function baseRiverInput(region, river, mouth, catalog) {
  const originU = region.key.regionX * HYDROLOGY_REGION_SIZE;
  const originV = region.key.regionY * HYDROLOGY_REGION_SIZE;
  const body = catalog.get(river.riverId);
  if (!body || body.kind !== "river") {
    throw new Error("surface base river lost its body profile");
  }
  return {
    bodyId: river.riverId,
    stableIdentity: `${river.riverId}:${river.segmentId}`,
    profileIndex: body.profileIndex,
    dischargeClass: river.dischargeClass,
    points: logicalPoints(river.controlPoints, originU, originV),
    widthProfile: river.widthProfile,
    levelProfile: river.levelProfile,
    mouthTarget: mouthTarget(catalog, mouth?.targetBodyId)
  };
}
function authoredRiverInput(river, catalog) {
  const targetBodyId = river.outlet.kind === "ocean" || river.outlet.kind === "lake" ? river.outlet.bodyId : void 0;
  return {
    bodyId: river.featureId,
    stableIdentity: river.featureId,
    profileIndex: river.profileIndex,
    dischargeClass: river.dischargeClass,
    points: logicalPoints(river.controlPoints, 0, 0),
    widthProfile: river.widthProfile,
    levelProfile: river.levelProfile,
    mouthTarget: mouthTarget(catalog, targetBodyId)
  };
}
function collectRiverShapes(window, queryBounds, hexSize, catalog) {
  const shapes = [];
  for (const region of window.hydrologyRegions) {
    const suppressed = new Set(region.suppressedBaseFeatureIds);
    const mouthBySegment = new Map(region.mouths.map((mouth) => [mouth.segmentId, mouth]));
    for (const river of region.rivers) {
      if (suppressed.has(river.riverId)) continue;
      const body = catalog.get(river.riverId);
      if (!body || body.kind !== "river") {
        throw new Error("surface river segment lost its canonical body definition");
      }
      shapes.push(...projectedRiverShapes(
        window,
        baseRiverInput(region, river, mouthBySegment.get(river.segmentId), catalog),
        queryBounds,
        hexSize
      ));
    }
  }
  for (const delta of window.authoredHydrology) {
    if (delta.feature.kind !== "river") continue;
    shapes.push(...projectedRiverShapes(
      window,
      authoredRiverInput(delta.feature, catalog),
      queryBounds,
      hexSize
    ));
  }
  return Object.freeze(shapes);
}
function closestRiver(shape, u, v) {
  let bestEdgeDistance = Number.POSITIVE_INFINITY;
  let best;
  for (const span of shape.spans) {
    const deltaU = span.endU - span.startU;
    const deltaV = span.endV - span.startV;
    const lengthSquared = deltaU * deltaU + deltaV * deltaV;
    const amount = Math.max(0, Math.min(
      1,
      ((u - span.startU) * deltaU + (v - span.startV) * deltaV) / lengthSquared
    ));
    const distance = Math.hypot(
      u - (span.startU + deltaU * amount),
      v - (span.startV + deltaV * amount)
    );
    const halfWidth = span.startHalfWidth + (span.endHalfWidth - span.startHalfWidth) * amount;
    const edgeDistance = distance - halfWidth;
    if (edgeDistance >= bestEdgeDistance) continue;
    bestEdgeDistance = edgeDistance;
    best = {
      edgeDistance,
      halfWidth,
      level: span.startLevel + (span.endLevel - span.startLevel) * amount,
      distanceToEnd: span.logicalLength * (1 - amount) + span.remainingLogicalLength,
      flowX: span.flowX,
      flowZ: span.flowZ
    };
  }
  if (!best) throw new Error("surface river closest-point query found no span");
  return best;
}
function intersectBounds(first, second) {
  const bounds = {
    minU: Math.max(first.minU, second.minU),
    minV: Math.max(first.minV, second.minV),
    maxU: Math.min(first.maxU, second.maxU),
    maxV: Math.min(first.maxV, second.maxV)
  };
  return bounds.minU < bounds.maxU && bounds.minV < bounds.maxV ? bounds : void 0;
}
function signedRiverDistances(window, shape, activeBounds, contourContext, groundHeight, logicalU, logicalV, saturation) {
  const hexSize = window.dependencyKey.metrics.hexSize;
  const heightScale = window.dependencyKey.metrics.heightScale;
  const semanticSample = {
    groundHeight: 0,
    biome0: 0,
    biome1: 0,
    biome2: 0,
    biome3: 0
  };
  const bankContours = surfaceScalarContours(
    activeBounds,
    hexSize,
    (u, v) => closestRiver(shape, u, v).edgeDistance
  );
  const bedContours = surfaceScalarContours(activeBounds, hexSize, (u, v) => {
    const closest = closestRiver(shape, u, v);
    const valid = sampleEffectiveWindowSemantic(window, u, v, heightScale, semanticSample);
    if (!valid) return heightScale;
    return semanticSample.groundHeight - closest.level / 65535 * heightScale;
  });
  const bankMagnitude = rasterSurfaceContourDistances(contourContext, bankContours, saturation);
  const bedMagnitude = rasterSurfaceContourDistances(contourContext, bedContours, saturation);
  const distance = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  distance.fill(saturation);
  const closestOutput = new Array(COMPILED_SURFACE_TEXEL_COUNT);
  const influenceU = saturation / (1.5 * hexSize);
  const influenceV = saturation / (Math.sqrt(3) * hexSize) + 0.5;
  for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
    if (logicalU[index] < shape.bounds.minU - influenceU || logicalU[index] > shape.bounds.maxU + influenceU || logicalV[index] < shape.bounds.minV - influenceV || logicalV[index] > shape.bounds.maxV + influenceV) continue;
    const closest = closestRiver(shape, logicalU[index], logicalV[index]);
    closestOutput[index] = closest;
    const bankDistance = closest.edgeDistance < 0 ? -bankMagnitude[index] : bankMagnitude[index];
    const levelBits = finiteFloat16Bits(
      "compiled river level",
      Math.round(closest.level) / 65535 * heightScale
    );
    const bedWet = float16BitsToFloat32(groundHeight[index]) < float16BitsToFloat32(levelBits);
    const bedDistance = bedWet ? -bedMagnitude[index] : bedMagnitude[index];
    distance[index] = Math.max(bankDistance, bedDistance);
  }
  return Object.freeze({ distance, closest: Object.freeze(closestOutput) });
}
function snorm8(value) {
  return Math.max(-127, Math.min(127, Math.round(value * 127)));
}
function compileSurfaceField(window) {
  assertTransferableEffectiveWindow(window);
  const lakes = compileLakeSurfaceField(window);
  const hexSize = window.dependencyKey.metrics.hexSize;
  const heightScale = window.dependencyKey.metrics.heightScale;
  const saturation = surfaceInfluenceRadiusWorld(hexSize);
  const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize) / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const queryBounds = surfaceHydrologyQueryBounds(window, saturation);
  const bodyCatalog = buildBodyCatalog(window, lakes.waterBodies);
  const shapes = collectRiverShapes(window, queryBounds, hexSize, bodyCatalog);
  if (shapes.length === 0) return lakes;
  const groundHeight = lakes.field.groundHeight.slice();
  const materialWeights = lakes.field.materialWeights.slice();
  const waterLevel = lakes.field.waterLevel.slice();
  const waterDepth = lakes.field.waterDepth.slice();
  const shorelineDistance = lakes.field.shorelineDistance.slice();
  const flow = lakes.field.flow.slice();
  const waterCoverage = lakes.field.waterCoverage.slice();
  const waterKind = lakes.field.waterKind.slice();
  const waterProfile = lakes.field.waterProfile.slice();
  const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
  const logicalU = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const logicalV = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const unionDistance = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
  const winnerPriority = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
  const winnerIdentity = new Array(COMPILED_SURFACE_TEXEL_COUNT);
  const winnerBody = new Array(COMPILED_SURFACE_TEXEL_COUNT);
  for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels; texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelX += 1) {
    const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
    for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels; texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels; texelY += 1) {
      const index = surfaceFieldTexelIndex(texelX, texelY);
      logicalU[index] = u;
      logicalV[index] = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
      unionDistance[index] = float16BitsToFloat32(shorelineDistance[index]);
      if (waterCoverage[index] === 0) continue;
      const entry = lakes.waterBodies.entries[waterBodyIndexFromField(lakes, index) - 1];
      if (!entry) throw new Error("compiled lake field has an invalid body palette reference");
      winnerBody[index] = entry.bodyId;
      winnerIdentity[index] = entry.bodyId;
      winnerPriority[index] = waterKind[index] === SURFACE_WATER_KIND_LAKE ? 1 : 0;
    }
  }
  const contourContext = createSurfaceContourRasterContext(window, hexSize);
  for (const shape of shapes) {
    if (!surfaceHydrologyBoundsIntersect(shape.bounds, queryBounds)) continue;
    const activeBounds = intersectBounds(shape.bounds, queryBounds);
    if (!activeBounds) continue;
    const compiled = signedRiverDistances(
      window,
      shape,
      activeBounds,
      contourContext,
      groundHeight,
      logicalU,
      logicalV,
      saturation
    );
    const priority = 2 + shape.dischargeClass;
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
      const closest = compiled.closest[index];
      if (!closest) continue;
      const signedDistance = compiled.distance[index];
      unionDistance[index] = Math.min(unionDistance[index], signedDistance);
      const wet = signedDistance < 0;
      const rawCoverage = quantizeSurfaceCoverage(signedDistance, antialiasRadius);
      const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
      if (coverage === 0) continue;
      const atMouth = shape.mouthTarget !== void 0 && closest.distanceToEnd <= closest.halfWidth * 0.5;
      const body = atMouth ? shape.mouthTarget : bodyCatalog.get(shape.bodyId);
      if (!body) throw new Error("compiled river candidate lost its body definition");
      const identity = atMouth ? body.bodyId : shape.stableIdentity;
      if (coverage < waterCoverage[index] || coverage === waterCoverage[index] && priority < winnerPriority[index] || coverage === waterCoverage[index] && priority === winnerPriority[index] && winnerIdentity[index] !== void 0 && winnerIdentity[index] <= identity) continue;
      const levelBits = finiteFloat16Bits(
        "compiled river level",
        Math.round(closest.level) / 65535 * heightScale
      );
      const flowX = atMouth ? 0 : snorm8(closest.flowX);
      const flowZ = atMouth ? 0 : snorm8(closest.flowZ);
      if (!atMouth && flowX === 0 && flowZ === 0) {
        throw new Error("compiled river flow quantized to a zero direction");
      }
      waterCoverage[index] = coverage;
      waterKind[index] = body.kind === "river" ? SURFACE_WATER_KIND_RIVER : body.kind === "lake" ? SURFACE_WATER_KIND_LAKE : SURFACE_WATER_KIND_OCEAN;
      waterProfile[index] = body.profileIndex;
      waterLevel[index] = levelBits;
      waterDepth[index] = finiteFloat16Bits(
        "compiled river depth",
        Math.max(0, float16BitsToFloat32(levelBits) - float16BitsToFloat32(groundHeight[index]))
      );
      flow[index * 2] = flowX;
      flow[index * 2 + 1] = flowZ;
      winnerPriority[index] = priority;
      winnerIdentity[index] = identity;
      winnerBody[index] = body.bodyId;
    }
  }
  const usedBodies = /* @__PURE__ */ new Map();
  for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
    const wet = unionDistance[index] < 0;
    const rawCoverage = quantizeSurfaceCoverage(unionDistance[index], antialiasRadius);
    const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
    waterCoverage[index] = coverage;
    shorelineDistance[index] = finiteFloat16Bits(
      "compiled hydrology union shoreline distance",
      Math.max(-saturation, Math.min(saturation, unionDistance[index]))
    );
    const bodyId = winnerBody[index];
    if (coverage === 0 || bodyId === void 0) {
      waterLevel[index] = 0;
      waterDepth[index] = 0;
      waterKind[index] = 0;
      waterProfile[index] = 0;
      flow[index * 2] = 0;
      flow[index * 2 + 1] = 0;
      winnerBody[index] = void 0;
      continue;
    }
    const body = bodyCatalog.get(bodyId);
    if (!body) throw new Error("compiled hydrology texel lost its body definition");
    usedBodies.set(bodyId, body);
  }
  const palette = createCompiledWaterBodyPalette([...usedBodies.values()].sort((first, second) => compareIdentity3(first.bodyId, second.bodyId)));
  const paletteIndex = new Map(palette.entries.map((body, index) => [body.bodyId, index + 1]));
  for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
    const bodyId = winnerBody[index];
    if (bodyId === void 0) continue;
    const bodyIndex = paletteIndex.get(bodyId);
    if (bodyIndex === void 0) throw new Error("compiled hydrology palette lost a winning body");
    waterBodyIndex[index] = bodyIndex;
  }
  return Object.freeze({
    field: createCompiledSurfaceField({
      groundHeight,
      materialWeights,
      waterLevel,
      waterDepth,
      shorelineDistance,
      flow,
      waterCoverage,
      waterKind,
      waterProfile,
      waterBodyIndex
    }),
    waterBodies: palette
  });
}
function waterBodyIndexFromField(compilation, index) {
  const bodyIndex = compilation.field.waterBodyIndex[index];
  if (bodyIndex === 0 || bodyIndex > compilation.waterBodies.entries.length) {
    throw new Error("compiled surface field body index is outside its palette");
  }
  return bodyIndex;
}

// src/world/compileVegetationSeeds.ts
var UINT32_RANGE2 = 4294967296;
var JITTER_X_SALT = 2135587861;
var JITTER_Y_SALT = 2496678331;
var ACCEPTANCE_SALT = 916318735;
var PLACEMENT_SALT = 3518319157;
var VEGETATION_SLOPE_FADE_START = 0.35;
var VEGETATION_MAXIMUM_SLOPE = 0.75;
var VEGETATION_SHORE_FADE_TILES = 1;
var VEGETATION_SLOPE_SAMPLE_STEP = 0.25;
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function smoothstep3(minimum, maximum, value) {
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return amount * amount * (3 - 2 * amount);
}
function candidateHash(worldSeed, tileX, tileY, candidate, salt) {
  return hashSafeIntegerCoordinates(worldSeed, tileX, tileY, salt + candidate >>> 0);
}
function slopeAt(sampler, localU, localV, hexSize) {
  const minimum = -0.5;
  const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
  const minimumU = Math.max(minimum, localU - VEGETATION_SLOPE_SAMPLE_STEP);
  const maximumU = Math.min(maximum, localU + VEGETATION_SLOPE_SAMPLE_STEP);
  const minimumV = Math.max(minimum, localV - VEGETATION_SLOPE_SAMPLE_STEP);
  const maximumV = Math.min(maximum, localV + VEGETATION_SLOPE_SAMPLE_STEP);
  const heightU = sampler.sampleGroundHeight(maximumU, localV) - sampler.sampleGroundHeight(minimumU, localV);
  const heightV = sampler.sampleGroundHeight(localU, maximumV) - sampler.sampleGroundHeight(localU, minimumV);
  const worldUMinimum = surfaceToWorld(minimumU, localV, hexSize);
  const worldUMaximum = surfaceToWorld(maximumU, localV, hexSize);
  const worldVMinimum = surfaceToWorld(localU, minimumV, hexSize);
  const worldVMaximum = surfaceToWorld(localU, maximumV, hexSize);
  const deltaUx = worldUMaximum.x - worldUMinimum.x;
  const deltaUz = worldUMaximum.z - worldUMinimum.z;
  const deltaVz = worldVMaximum.z - worldVMinimum.z;
  if (!(deltaUx > 0) || !(deltaVz > 0)) {
    throw new Error("vegetation slope stencil collapsed at the surface core boundary");
  }
  const gradientZ = heightV / deltaVz;
  const gradientX = (heightU - gradientZ * deltaUz) / deltaUx;
  return Math.hypot(gradientX, gradientZ);
}
function ownerIndex(window, tileX, tileY) {
  const localX = tileX - window.originTileX;
  const localY = tileY - window.originTileY;
  if (localX < 0 || localX >= EFFECTIVE_WINDOW_TILE_SIZE || localY < 0 || localY >= EFFECTIVE_WINDOW_TILE_SIZE) {
    throw new Error("vegetation owner tile escaped the effective window");
  }
  return localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
}
function compileVegetationSeeds(window, field2) {
  assertTransferableEffectiveWindow(window);
  const sampler = new CompiledSurfaceSampler(field2);
  const surfaceSample = createCompiledSurfaceSample();
  const chunkSize = SURFACE_COMPILE_PROFILE.renderChunkSize;
  const origin = chunkOrigin(window.renderKey.chunkX, window.renderKey.chunkY, chunkSize);
  const hexSize = window.dependencyKey.metrics.hexSize;
  const localWorldOrigin = surfaceToWorld(0, 0, hexSize);
  const worldSeed = seedToUint32(window.worldIdentity);
  const positions = new Float32Array(MAX_COMPILED_VEGETATION_SEEDS * 3);
  const instanceIdentity = new Uint16Array(MAX_COMPILED_VEGETATION_SEEDS);
  const profileIndex = new Uint8Array(MAX_COMPILED_VEGETATION_SEEDS);
  const placementSeed = new Uint32Array(MAX_COMPILED_VEGETATION_SEEDS);
  let count = 0;
  for (let localTileX = 0; localTileX < chunkSize; localTileX += 1) {
    const tileX = origin.x + localTileX;
    for (let localTileY = 0; localTileY < chunkSize; localTileY += 1) {
      const tileY = origin.y + localTileY;
      const semanticIndex = ownerIndex(window, tileX, tileY);
      if (window.valid[semanticIndex] === 0) continue;
      const tileIdentity = localTileX * chunkSize + localTileY;
      for (let candidate = 0; candidate < VEGETATION_CANDIDATES_PER_TILE; candidate += 1) {
        const column = candidate % VEGETATION_CANDIDATE_COLUMNS_PER_TILE;
        const row = Math.floor(candidate / VEGETATION_CANDIDATE_COLUMNS_PER_TILE);
        const jitterX = candidateHash(
          worldSeed,
          tileX,
          tileY,
          candidate,
          JITTER_X_SALT
        ) / UINT32_RANGE2;
        const jitterY = candidateHash(
          worldSeed,
          tileX,
          tileY,
          candidate,
          JITTER_Y_SALT
        ) / UINT32_RANGE2;
        const localU = localTileX - 0.5 + (column + jitterX) / VEGETATION_CANDIDATE_COLUMNS_PER_TILE;
        const localV = localTileY - 0.5 + (row + jitterY) / VEGETATION_CANDIDATE_ROWS_PER_TILE;
        const density = sampleEffectiveWindowVegetationDensityLocal(
          window,
          origin.x - window.originTileX + localU,
          origin.y - window.originTileY + localV
        );
        if (density === void 0 || density <= 0) continue;
        sampler.sampleSurface(localU, localV, surfaceSample);
        if (surfaceSample.waterKind === SURFACE_WATER_KIND_RIVER || surfaceSample.shorelineDistance <= 0) continue;
        const shoreFactor = clamp(
          surfaceSample.shorelineDistance / (hexSize * VEGETATION_SHORE_FADE_TILES),
          0,
          1
        );
        const slope = slopeAt(sampler, localU, localV, hexSize);
        const slopeFactor = 1 - smoothstep3(
          VEGETATION_SLOPE_FADE_START,
          VEGETATION_MAXIMUM_SLOPE,
          slope
        );
        const acceptance = density * shoreFactor * slopeFactor;
        const choice = candidateHash(
          worldSeed,
          tileX,
          tileY,
          candidate,
          ACCEPTANCE_SALT
        ) / UINT32_RANGE2;
        if (choice >= acceptance) continue;
        const world = surfaceToWorld(localU, localV, hexSize);
        const offset = count * 3;
        positions[offset] = world.x - localWorldOrigin.x;
        positions[offset + 1] = surfaceSample.groundHeight;
        positions[offset + 2] = world.z - localWorldOrigin.z;
        instanceIdentity[count] = tileIdentity * VEGETATION_CANDIDATES_PER_TILE + candidate;
        profileIndex[count] = window.vegetationProfile[semanticIndex];
        placementSeed[count] = candidateHash(
          worldSeed,
          tileX,
          tileY,
          candidate,
          PLACEMENT_SALT
        );
        count += 1;
      }
    }
  }
  return createCompiledVegetationSeeds({
    positions: positions.slice(0, count * 3),
    instanceIdentity: instanceIdentity.slice(0, count),
    profileIndex: profileIndex.slice(0, count),
    placementSeed: placementSeed.slice(0, count)
  });
}

// src/world/compileSurfaceChunk.ts
function compileSurfaceChunk(window) {
  assertTransferableEffectiveWindow(window);
  const compilation = compileSurfaceField(window);
  const waterGeometry = compileWaterGeometry(compilation.field);
  return createCompiledSurfaceChunk({
    dependencyKey: window.dependencyKey,
    bounds: compileSurfaceBounds(
      compilation.field,
      waterGeometry,
      window.dependencyKey.metrics.hexSize
    ),
    field: compilation.field,
    waterBodies: compilation.waterBodies,
    waterGeometry,
    vegetationSeeds: compileVegetationSeeds(window, compilation.field)
  });
}

// src/world/surface.worker.ts
var scope = globalThis;
var worldContext;
function contextFor(request) {
  const identity = serializeWorldDescriptorV2(request.descriptor);
  if (!worldContext || worldContext.identity !== identity) {
    worldContext = {
      identity,
      semanticGenerator: createBaseSemanticChunkGenerator(request.descriptor)
    };
  }
  return worldContext;
}
function hydrologyGeneratorFor(request) {
  const context = contextFor(request);
  if (!context.hydrologyGenerator) {
    context.hydrologyGenerator = createProceduralHydrologyRegionGenerator({
      descriptor: request.descriptor
    });
  }
  return context.hydrologyGenerator;
}
function recoverRequestId(value) {
  if (!value || typeof value !== "object") return null;
  const requestId = value.requestId;
  return Number.isSafeInteger(requestId) && requestId > 0 ? requestId : null;
}
function recoverRequestType(value) {
  if (!value || typeof value !== "object") return null;
  const type = value.type;
  return type === "generateSemanticChunk" || type === "generateHydrologyRegion" || type === "compileSurfaceChunk" ? type : null;
}
async function handleRequest(value) {
  try {
    if (value?.type === "compileSurfaceChunk") {
      assertCompileSurfaceChunkWorkerRequest(value);
      const chunk = compileSurfaceChunk(value.effectiveWindow);
      scope.postMessage({
        protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        requestId: value.requestId,
        type: "compileSurfaceChunkResult",
        requestToken: value.requestToken,
        chunk
      }, [...compiledSurfaceChunkTransferables(chunk)]);
    } else if (value?.type === "generateHydrologyRegion") {
      assertGenerateHydrologyRegionWorkerRequest(value);
      const region = await hydrologyGeneratorFor(value).generate(value.key.regionX, value.key.regionY);
      scope.postMessage({
        protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        requestId: value.requestId,
        type: "generateHydrologyRegionResult",
        region
      }, hydrologyRegionTransferables(region));
    } else {
      assertGenerateSemanticChunkWorkerRequest(value);
      const chunk = contextFor(value).semanticGenerator.generate(value.key.chunkX, value.key.chunkY);
      scope.postMessage({
        protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        requestId: value.requestId,
        type: "generateSemanticChunkResult",
        chunk
      }, semanticChunkTransferables(chunk));
    }
  } catch (reason) {
    scope.postMessage({
      protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
      generatorVersion: WORLD_GENERATOR_VERSION_V2,
      requestId: recoverRequestId(value),
      type: "surfaceWorkerError",
      requestType: recoverRequestType(value),
      error: serializeSurfaceWorkerError(reason)
    });
  }
}
scope.addEventListener("message", (event) => {
  void handleRequest(event.data);
});
//# sourceMappingURL=surface.worker.mjs.map
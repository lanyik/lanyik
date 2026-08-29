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
  return type === "generateSemanticChunk" || type === "generateHydrologyRegion" ? type : null;
}
async function handleRequest(value) {
  try {
    if (value?.type === "generateHydrologyRegion") {
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
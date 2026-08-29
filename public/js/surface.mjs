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

// src/helpers/topology.ts
function positiveModulo(value, modulus) {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
    throw new RangeError("positiveModulo requires a finite value and a positive finite modulus");
  }
  return (value % modulus + modulus) % modulus;
}
function normalizeMapCoordinates(map, x, y) {
  if (map.infinite) {
    return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
  }
  if (map.w <= 0 || map.h <= 0) return null;
  let normalizedX = x;
  let normalizedY = y;
  if (map.wrapX) normalizedX = positiveModulo(normalizedX, map.w);
  else if (normalizedX < 0 || normalizedX >= map.w) return null;
  if (map.wrapY) normalizedY = positiveModulo(normalizedY, map.h);
  else if (normalizedY < 0 || normalizedY >= map.h) return null;
  return { x: normalizedX, y: normalizedY };
}
function getMapTile(map, x, y) {
  const normalized = normalizeMapCoordinates(map, x, y);
  if (!normalized) return void 0;
  return map.tileAt?.(normalized.x, normalized.y) ?? map.data[normalized.x]?.[normalized.y];
}

// src/world/SurfaceLattice.ts
function surfaceColumnStagger(column) {
  if (!Number.isSafeInteger(column)) {
    throw new RangeError("surface lattice column must be a safe integer");
  }
  return positiveModulo(column, 2) === 0 ? 0.5 : 0;
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
function cloneBasis(identity) {
  return Object.freeze({ id: identity.id, contentHash: identity.contentHash });
}
function cloneCatalog(identity) {
  return Object.freeze({ id: identity.id, contentHash: identity.contentHash, entryCount: identity.entryCount });
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
function canonicalSeed(seed) {
  if (typeof seed !== "string" && typeof seed !== "number") {
    throw new TypeError("procedural world descriptor seed must be a string or number");
  }
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new RangeError("numeric procedural world descriptor seed must be finite");
  }
  return String(seed);
}
function createWorldDescriptorV2(options) {
  if (!options || typeof options !== "object") throw new TypeError("world descriptor v2 options are required");
  assertSemantics(options);
  const [firstBiome, secondBiome, thirdBiome, fourthBiome] = options.biomeBasis;
  const base = {
    descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION_V2,
    generatorVersion: WORLD_GENERATOR_VERSION_V2,
    chunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION_V2,
    hydrologyRegionFormatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
    seaLevel: options.seaLevel,
    substrateCatalog: cloneCatalog(options.substrateCatalog),
    biomeBasis: Object.freeze([
      cloneBasis(firstBiome),
      cloneBasis(secondBiome),
      cloneBasis(thirdBiome),
      cloneBasis(fourthBiome)
    ]),
    vegetationCatalog: cloneCatalog(options.vegetationCatalog)
  };
  let descriptor;
  if (options.sourceKind === "static") {
    assertContentHash("static world sourceContentHash", options.sourceContentHash);
    assertFiniteBounds(options.width, options.height);
    descriptor = {
      ...base,
      sourceKind: "static",
      topology: "finite",
      sourceContentHash: options.sourceContentHash,
      width: options.width,
      height: options.height
    };
  } else if (options.sourceKind === "procedural-infinite") {
    descriptor = {
      ...base,
      sourceKind: "procedural-infinite",
      topology: "infinite",
      seed: canonicalSeed(options.seed)
    };
  } else if (options.sourceKind === "procedural-toroidal") {
    assertFiniteBounds(options.width, options.height);
    if (options.width < WORLD_SEMANTIC_CHUNK_SIZE || options.height < WORLD_SEMANTIC_CHUNK_SIZE || options.width % WORLD_SEMANTIC_CHUNK_SIZE !== 0 || options.height % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
      throw new RangeError("toroidal v2 bounds must be positive multiples of the semantic chunk size");
    }
    descriptor = {
      ...base,
      sourceKind: "procedural-toroidal",
      topology: "toroidal",
      seed: canonicalSeed(options.seed),
      width: options.width,
      height: options.height
    };
  } else {
    throw new TypeError("world descriptor v2 sourceKind is invalid");
  }
  assertWorldDescriptorV2(descriptor);
  return Object.freeze(descriptor);
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
function worldDescriptorsV2Equal(first, second) {
  return serializeWorldDescriptorV2(first) === serializeWorldDescriptorV2(second);
}
if (HYDROLOGY_REGION_SIZE % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
  throw new Error("world descriptor v2 formats are not spatially aligned");
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
function createCoreInfiniteWorldDescriptorV2(seed) {
  return createWorldDescriptorV2({
    ...CORE_WORLD_SEMANTICS_V2,
    sourceKind: "procedural-infinite",
    seed
  });
}
function createCoreToroidalWorldDescriptorV2(seed, width, height) {
  return createWorldDescriptorV2({
    ...CORE_WORLD_SEMANTICS_V2,
    sourceKind: "procedural-toroidal",
    seed,
    width,
    height
  });
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

// src/world/BaseSemanticChunk.ts
var BASE_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE;
var BASE_SEMANTIC_CHUNK_HEADER_BYTES = 40;
var BIOME_BASIS_COUNT = 4;
var CLIMATE_CHANNEL_COUNT = 2;
var SERIALIZED_MAGIC = 843273026;
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
function semanticTileIndex(localX, localY) {
  if (!Number.isInteger(localX) || localX < 0 || localX >= WORLD_SEMANTIC_CHUNK_SIZE || !Number.isInteger(localY) || localY < 0 || localY >= WORLD_SEMANTIC_CHUNK_SIZE) {
    throw new RangeError("semantic tile coordinate is outside its chunk");
  }
  return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
}
function semanticBiomeWeightIndex(tileIndex, basisIndex) {
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT || !Number.isInteger(basisIndex) || basisIndex < 0 || basisIndex >= BIOME_BASIS_COUNT) {
    throw new RangeError("semantic biome weight index is invalid");
  }
  return tileIndex * BIOME_BASIS_COUNT + basisIndex;
}
function semanticClimateIndex(tileIndex, channelIndex) {
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT || !Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= CLIMATE_CHANNEL_COUNT) {
    throw new RangeError("semantic climate index is invalid");
  }
  return tileIndex * CLIMATE_CHANNEL_COUNT + channelIndex;
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
function getBaseSemanticTile(chunk, localX, localY) {
  const tileIndex = semanticTileIndex(localX, localY);
  if (!tileIsValid(tileIndex, chunk.validBounds)) {
    throw new RangeError("semantic tile coordinate is outside the chunk valid bounds");
  }
  const biomeOffset = tileIndex * BIOME_BASIS_COUNT;
  const climateOffset = tileIndex * CLIMATE_CHANNEL_COUNT;
  return Object.freeze({
    substrateClass: chunk.substrateClass[tileIndex],
    macroHeight: chunk.macroHeight[tileIndex],
    biomeWeights: Object.freeze([
      chunk.biomeWeights[biomeOffset],
      chunk.biomeWeights[biomeOffset + 1],
      chunk.biomeWeights[biomeOffset + 2],
      chunk.biomeWeights[biomeOffset + 3]
    ]),
    temperature: chunk.climate[climateOffset],
    moisture: chunk.climate[climateOffset + 1],
    vegetationDensity: chunk.vegetationDensity[tileIndex],
    vegetationProfile: chunk.vegetationProfile[tileIndex]
  });
}
function serializeBaseSemanticChunk(chunk, limits) {
  assertBaseSemanticChunk(chunk, limits);
  const buffer = new ArrayBuffer(BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, SERIALIZED_MAGIC, true);
  view.setUint16(4, chunk.formatVersion, true);
  view.setUint16(6, BASE_SEMANTIC_CHUNK_HEADER_BYTES, true);
  view.setBigInt64(8, BigInt(chunk.key.chunkX), true);
  view.setBigInt64(16, BigInt(chunk.key.chunkY), true);
  view.setBigUint64(24, BigInt(chunk.revision), true);
  view.setUint8(32, chunk.validBounds.minX);
  view.setUint8(33, chunk.validBounds.minY);
  view.setUint8(34, chunk.validBounds.maxXExclusive);
  view.setUint8(35, chunk.validBounds.maxYExclusive);
  view.setUint32(36, BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES, true);
  new Uint8Array(buffer, SUBSTRATE_OFFSET, chunk.substrateClass.length).set(chunk.substrateClass);
  for (let index = 0; index < chunk.macroHeight.length; index += 1) {
    view.setUint16(MACRO_HEIGHT_OFFSET + index * Uint16Array.BYTES_PER_ELEMENT, chunk.macroHeight[index], true);
  }
  new Uint8Array(buffer, BIOME_WEIGHTS_OFFSET, chunk.biomeWeights.length).set(chunk.biomeWeights);
  new Uint8Array(buffer, CLIMATE_OFFSET, chunk.climate.length).set(chunk.climate);
  new Uint8Array(buffer, VEGETATION_DENSITY_OFFSET, chunk.vegetationDensity.length).set(chunk.vegetationDensity);
  new Uint8Array(buffer, VEGETATION_PROFILE_OFFSET, chunk.vegetationProfile.length).set(chunk.vegetationProfile);
  return buffer;
}
function safeBigIntNumber(name, value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || BigInt(number) !== value) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }
  return number;
}
function deserializeBaseSemanticChunk(buffer, limits) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
    throw new TypeError("serialized base semantic chunk has an invalid byte length");
  }
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== SERIALIZED_MAGIC || view.getUint16(4, true) !== WORLD_CHUNK_FORMAT_VERSION_V2 || view.getUint16(6, true) !== BASE_SEMANTIC_CHUNK_HEADER_BYTES || view.getUint32(36, true) !== BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
    throw new TypeError("serialized base semantic chunk header is invalid or unsupported");
  }
  const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  for (let index = 0; index < macroHeight.length; index += 1) {
    macroHeight[index] = view.getUint16(MACRO_HEIGHT_OFFSET + index * Uint16Array.BYTES_PER_ELEMENT, true);
  }
  return createBaseSemanticChunk({
    key: {
      chunkX: safeBigIntNumber("semantic chunk x", view.getBigInt64(8, true)),
      chunkY: safeBigIntNumber("semantic chunk y", view.getBigInt64(16, true))
    },
    revision: safeBigIntNumber("semantic chunk revision", view.getBigUint64(24, true)),
    validBounds: {
      minX: view.getUint8(32),
      minY: view.getUint8(33),
      maxXExclusive: view.getUint8(34),
      maxYExclusive: view.getUint8(35)
    },
    substrateClass: new Uint8Array(buffer, SUBSTRATE_OFFSET, BASE_SEMANTIC_CHUNK_TILE_COUNT).slice(),
    macroHeight,
    biomeWeights: new Uint8Array(
      buffer,
      BIOME_WEIGHTS_OFFSET,
      BASE_SEMANTIC_CHUNK_TILE_COUNT * BIOME_BASIS_COUNT
    ).slice(),
    climate: new Uint8Array(
      buffer,
      CLIMATE_OFFSET,
      BASE_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNEL_COUNT
    ).slice(),
    vegetationDensity: new Uint8Array(
      buffer,
      VEGETATION_DENSITY_OFFSET,
      BASE_SEMANTIC_CHUNK_TILE_COUNT
    ).slice(),
    vegetationProfile: new Uint8Array(
      buffer,
      VEGETATION_PROFILE_OFFSET,
      BASE_SEMANTIC_CHUNK_TILE_COUNT
    ).slice()
  }, limits);
}

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
function positiveModulo2(value, modulus) {
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
    positiveModulo2(gx, px),
    positiveModulo2(gy, py)
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
var positiveModulo3 = (value, modulus) => (value % modulus + modulus) % modulus;
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
    periodX === void 0 ? cellX : positiveModulo3(cellX, periodX),
    periodY === void 0 ? cellY : positiveModulo3(cellY, periodY)
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
  const sampleX = wrapWidth === void 0 ? x : positiveModulo3(x, wrapWidth);
  const sampleY = wrapHeight === void 0 ? y : positiveModulo3(y, wrapHeight);
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
    }
  });
}
function generateBaseSemanticChunk(options) {
  if (!options || typeof options !== "object") throw new TypeError("semantic chunk generation options are required");
  return createBaseSemanticChunkGenerator(options.descriptor).generate(options.chunkX, options.chunkY);
}
function semanticGeneratorIdentity(descriptor) {
  assertCoreDescriptor(descriptor);
  return serializeWorldDescriptorV2(descriptor);
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
function createGenerateSemanticChunkWorkerRequest(requestId, descriptor, key) {
  const request = {
    protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
    generatorVersion: WORLD_GENERATOR_VERSION_V2,
    requestId,
    type: "generateSemanticChunk",
    descriptor,
    key: Object.freeze({ chunkX: key.chunkX, chunkY: key.chunkY })
  };
  assertGenerateSemanticChunkWorkerRequest(request);
  return Object.freeze(request);
}

// src/world/SurfaceWorkerClient.ts
function remoteError(response) {
  if (!response.error || typeof response.error.name !== "string" || typeof response.error.message !== "string") {
    return new Error("surface worker returned an invalid remote error");
  }
  const error = new Error(response.error.message);
  error.name = response.error.name;
  if (typeof response.error.stack === "string") error.stack = response.error.stack;
  return error;
}
function assertResponseEnvelope(value) {
  if (!value || typeof value !== "object") throw new TypeError("surface worker response must be an object");
  const response = value;
  if (response.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION || response.generatorVersion !== WORLD_GENERATOR_VERSION_V2 || !Number.isSafeInteger(response.requestId) || response.requestId <= 0 || response.type !== "generateSemanticChunkResult" && response.type !== "surfaceWorkerError") {
    throw new TypeError("surface worker response envelope is invalid or unsupported");
  }
}
var SurfaceWorkerClient = class {
  constructor(workerUrl, workerOptions = { type: "module" }) {
    this.pending = /* @__PURE__ */ new Map();
    this.nextRequestId = 1;
    this.disposed = false;
    this.handleMessage = (event) => {
      try {
        assertResponseEnvelope(event.data);
        const response = event.data;
        const request = this.pending.get(response.requestId);
        if (!request) throw new Error("surface worker returned an unknown request id");
        if (response.type === "surfaceWorkerError") {
          if (response.requestType !== "generateSemanticChunk") {
            throw new TypeError("surface worker error does not match its pending request type");
          }
          this.pending.delete(response.requestId);
          request.reject(remoteError(response));
          return;
        }
        const chunk = this.publishChunk(response, request);
        this.pending.delete(response.requestId);
        request.resolve(chunk);
      } catch (reason) {
        this.fail(reason instanceof Error ? reason : new Error(String(reason)));
      }
    };
    this.handleWorkerError = (event) => {
      this.fail(event.error instanceof Error ? event.error : new Error(event.message));
    };
    this.handleMessageError = () => {
      this.fail(new Error("surface worker returned an unreadable message"));
    };
    this.worker = new Worker(workerUrl, workerOptions);
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleWorkerError);
    this.worker.addEventListener("messageerror", this.handleMessageError);
  }
  generateSemanticChunk(options) {
    if (this.disposed) return Promise.reject(new Error("SurfaceWorkerClient has been disposed"));
    if (!options || typeof options !== "object") {
      return Promise.reject(new TypeError("semantic chunk worker options are required"));
    }
    if (!Number.isSafeInteger(this.nextRequestId)) {
      return Promise.reject(new RangeError("surface worker request id space is exhausted"));
    }
    const requestId = this.nextRequestId;
    let request;
    try {
      request = createGenerateSemanticChunkWorkerRequest(requestId, options.descriptor, options.key);
    } catch (reason) {
      return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        descriptor: options.descriptor,
        key: Object.freeze({ chunkX: options.key.chunkX, chunkY: options.key.chunkY }),
        resolve,
        reject
      });
      try {
        this.worker.postMessage(request);
      } catch (reason) {
        this.pending.delete(requestId);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.worker.removeEventListener("messageerror", this.handleMessageError);
    this.worker.terminate();
    const error = new Error("surface worker was disposed");
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
  get isDisposed() {
    return this.disposed;
  }
  publishChunk(response, request) {
    if (!response.chunk || response.chunk.key?.chunkX !== request.key.chunkX || response.chunk.key?.chunkY !== request.key.chunkY) {
      throw new TypeError("surface worker returned a semantic chunk for the wrong request");
    }
    return createBaseSemanticChunk({
      key: response.chunk.key,
      revision: response.chunk.revision,
      validBounds: response.chunk.validBounds,
      substrateClass: response.chunk.substrateClass,
      macroHeight: response.chunk.macroHeight,
      biomeWeights: response.chunk.biomeWeights,
      climate: response.chunk.climate,
      vegetationDensity: response.chunk.vegetationDensity,
      vegetationProfile: response.chunk.vegetationProfile
    }, semanticCatalogLimits(request.descriptor));
  }
  fail(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.dispose();
  }
};

// src/runtime/PriorityTaskQueue.ts
var WorkQueueBackpressureError = class extends Error {
  constructor() {
    super(...arguments);
    this.name = "WorkQueueBackpressureError";
  }
};
var LANE_RANK = {
  critical: 0,
  interactive: 1,
  visible: 2,
  prefetch: 3,
  background: 4
};
function cancellationError(message) {
  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
var PriorityTaskQueue = class {
  constructor(options = {}) {
    this.entries = /* @__PURE__ */ new Map();
    this.keyed = /* @__PURE__ */ new Map();
    this.nextId = 1;
    this.sequence = 0;
    this.pendingWeight = 0;
    this.cancelledTasks = 0;
    this.shedTasks = 0;
    this.maxPendingTasks = options.maxPendingTasks ?? Number.MAX_SAFE_INTEGER;
    this.maxPendingWeight = options.maxPendingWeight ?? Number.MAX_SAFE_INTEGER;
    this.starvationMs = options.starvationMs ?? 2e3;
    this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
    if (!Number.isSafeInteger(this.maxPendingTasks) || this.maxPendingTasks <= 0) {
      throw new RangeError("maxPendingTasks must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.maxPendingWeight) || this.maxPendingWeight <= 0) {
      throw new RangeError("maxPendingWeight must be a positive safe integer");
    }
    if (!Number.isFinite(this.starvationMs) || this.starvationMs <= 0) {
      throw new RangeError("starvationMs must be positive and finite");
    }
  }
  enqueue(value, options = {}) {
    const lane = options.lane ?? "visible";
    const priority = options.priority ?? 0;
    const weight = options.weight ?? 1;
    if (!(lane in LANE_RANK)) throw new TypeError(`unknown work lane "${String(lane)}"`);
    if (!Number.isFinite(priority)) throw new RangeError("task priority must be finite");
    if (!Number.isSafeInteger(weight) || weight <= 0) throw new RangeError("task weight must be a positive safe integer");
    if (options.key !== void 0 && options.key.length === 0) throw new TypeError("task key cannot be empty");
    if (options.signal?.aborted) {
      this.notifyCancellation(options.cancelled, cancellationError("Task was aborted before it was queued"));
      return void 0;
    }
    if (weight > this.maxPendingWeight) {
      this.shedTasks += 1;
      this.notifyCancellation(
        options.cancelled,
        new WorkQueueBackpressureError(
          `Task weight ${weight} exceeds the queue limit ${this.maxPendingWeight}`
        )
      );
      return void 0;
    }
    if (options.key !== void 0) {
      const previous = this.keyed.get(options.key);
      if (previous !== void 0) this.remove(previous, cancellationError("Task was replaced"), true);
    }
    const entry = {
      id: this.nextId++,
      key: options.key,
      lane,
      priority,
      weight,
      sequence: this.sequence++,
      enqueuedAt: this.now(),
      value,
      signal: options.signal,
      cancelled: options.cancelled
    };
    if (options.signal) {
      entry.abort = () => this.remove(entry.id, cancellationError("Queued task was aborted"), true);
      options.signal.addEventListener("abort", entry.abort, { once: true });
    }
    this.entries.set(entry.id, entry);
    if (entry.key !== void 0) this.keyed.set(entry.key, entry.id);
    this.pendingWeight += weight;
    this.shedOverflow();
    return this.entries.has(entry.id) ? entry.id : void 0;
  }
  take(predicate) {
    const now = this.now();
    let selected;
    for (const entry of this.entries.values()) {
      if (entry.signal?.aborted) {
        this.remove(entry.id, cancellationError("Queued task was aborted"), true);
        continue;
      }
      if (predicate && !predicate(entry.value)) continue;
      if (!selected || this.compare(entry, selected, now) < 0) selected = entry;
    }
    if (!selected) return void 0;
    this.detach(selected);
    return selected.value;
  }
  cancelKey(key, reason = cancellationError("Queued task was cancelled")) {
    const id = this.keyed.get(key);
    return id === void 0 ? false : this.remove(id, reason, true);
  }
  cancel(id, reason = cancellationError("Queued task was cancelled")) {
    return this.remove(id, reason, true);
  }
  clear(reason = cancellationError("Work queue was cleared")) {
    for (const id of [...this.entries.keys()]) this.remove(id, reason, true);
  }
  get values() {
    return [...this.entries.values()].map((entry) => entry.value);
  }
  get stats() {
    const now = this.now();
    let oldestTaskAgeMs = 0;
    let starvationPromotions = 0;
    for (const entry of this.entries.values()) {
      const age = Math.max(0, now - entry.enqueuedAt);
      oldestTaskAgeMs = Math.max(oldestTaskAgeMs, age);
      starvationPromotions += Math.min(LANE_RANK[entry.lane], Math.floor(age / this.starvationMs));
    }
    return {
      pendingTasks: this.entries.size,
      pendingWeight: this.pendingWeight,
      oldestTaskAgeMs,
      cancelledTasks: this.cancelledTasks,
      shedTasks: this.shedTasks,
      starvationPromotions
    };
  }
  shedOverflow() {
    while (this.entries.size > this.maxPendingTasks || this.pendingWeight > this.maxPendingWeight) {
      let worst;
      for (const entry of this.entries.values()) {
        if (!worst || this.compareForEviction(entry, worst) > 0) worst = entry;
      }
      if (!worst) return;
      this.shedTasks += 1;
      this.remove(
        worst.id,
        new WorkQueueBackpressureError("Queued task was shed by the configured backpressure limit"),
        false
      );
    }
  }
  compare(first, second, now) {
    const firstStarved = this.isStarved(first, now);
    const secondStarved = this.isStarved(second, now);
    if (firstStarved !== secondStarved) return firstStarved ? -1 : 1;
    if (firstStarved) return first.sequence - second.sequence;
    return this.effectiveLane(first, now) - this.effectiveLane(second, now) || first.priority - second.priority || first.sequence - second.sequence;
  }
  // Dispatch aging prevents starvation among admitted work. Admission is a
  // different policy boundary: an old background task must not evict a fresh
  // critical task merely because the tab was suspended long enough for its
  // wall-clock starvation deadline to elapse.
  compareForEviction(first, second) {
    return LANE_RANK[first.lane] - LANE_RANK[second.lane] || first.priority - second.priority || first.sequence - second.sequence;
  }
  isStarved(entry, now) {
    const deadlineWindows = LANE_RANK[entry.lane] + 1;
    return Math.max(0, now - entry.enqueuedAt) >= this.starvationMs * deadlineWindows;
  }
  effectiveLane(entry, now) {
    const promotions = Math.min(LANE_RANK[entry.lane], Math.floor(Math.max(0, now - entry.enqueuedAt) / this.starvationMs));
    return LANE_RANK[entry.lane] - promotions;
  }
  remove(id, reason, countCancellation) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.detach(entry);
    if (countCancellation) this.cancelledTasks += 1;
    this.notifyCancellation(entry.cancelled, reason);
    return true;
  }
  notifyCancellation(observer, reason) {
    try {
      observer?.(reason);
    } catch {
    }
  }
  detach(entry) {
    this.entries.delete(entry.id);
    if (entry.key !== void 0 && this.keyed.get(entry.key) === entry.id) this.keyed.delete(entry.key);
    if (entry.signal && entry.abort) entry.signal.removeEventListener("abort", entry.abort);
    this.pendingWeight = Math.max(0, this.pendingWeight - entry.weight);
  }
};

// src/world/SurfaceWorkerPool.ts
function abortError() {
  if (typeof DOMException !== "undefined") return new DOMException("surface worker task was aborted", "AbortError");
  const error = new Error("surface worker task was aborted");
  error.name = "AbortError";
  return error;
}
function defaultPoolSize(maxWorkers) {
  const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(maxWorkers, hardware - 1));
}
var SurfaceWorkerPool = class {
  constructor(workerUrl, options = {}) {
    this.slots = [];
    this.completed = 0;
    this.workerFailures = 0;
    this.retried = 0;
    this.averageSemanticChunkMs = 0;
    this.disposed = false;
    const maxWorkers = options.maxWorkers ?? 8;
    if (!Number.isInteger(maxWorkers) || maxWorkers <= 0 || maxWorkers > 8) {
      throw new RangeError("surface worker maxWorkers must be an integer between 1 and 8");
    }
    const size = options.size ?? defaultPoolSize(maxWorkers);
    if (!Number.isInteger(size) || size <= 0 || size > maxWorkers) {
      throw new RangeError(`surface worker pool size must be an integer between 1 and ${maxWorkers}`);
    }
    this.maximumWorkerRetries = options.maximumWorkerRetries ?? 1;
    if (!Number.isInteger(this.maximumWorkerRetries) || this.maximumWorkerRetries < 0 || this.maximumWorkerRetries > 2) {
      throw new RangeError("surface worker retry count must be an integer between 0 and 2");
    }
    this.clientFactory = options.clientFactory ?? (() => new SurfaceWorkerClient(workerUrl, options.workerOptions ?? { type: "module" }));
    this.queue = new PriorityTaskQueue({
      maxPendingTasks: options.maxQueuedTasks ?? 512,
      maxPendingWeight: options.maxQueuedWeight ?? 512,
      starvationMs: options.starvationMs,
      now: options.now
    });
    try {
      for (let index = 0; index < size; index += 1) {
        this.slots.push({ client: this.createClient(), busy: false });
      }
    } catch (reason) {
      for (const slot of this.slots) {
        try {
          slot.client.dispose();
        } catch {
        }
      }
      this.slots.length = 0;
      throw reason;
    }
  }
  generateSemanticChunk(options, request = {}) {
    if (this.disposed) return Promise.reject(new Error("SurfaceWorkerPool has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const task = {
        options,
        signal: request.signal,
        resolve,
        reject,
        attempts: 0,
        settled: false
      };
      if (request.signal) {
        task.abort = () => {
          if (task.settled) return;
          if (task.queueId !== void 0 && this.queue.cancel(task.queueId, abortError())) return;
          this.finishTask(task, () => reject(abortError()));
        };
        request.signal.addEventListener("abort", task.abort, { once: true });
      }
      task.queueId = this.queue.enqueue(task, {
        priority: Number.isFinite(request.priority) ? request.priority : 0,
        lane: request.lane ?? "visible",
        weight: request.weight ?? 1,
        cancelled: (reason) => this.finishTask(task, () => reject(reason))
      });
      if (task.queueId === void 0 && !task.settled) {
        this.finishTask(task, () => reject(new WorkQueueBackpressureError("surface worker task was shed")));
      }
      this.dispatch();
    });
  }
  get stats() {
    const queue = this.queue.stats;
    return Object.freeze({
      workers: this.slots.length,
      busyWorkers: this.slots.filter((slot) => slot.busy).length,
      queued: queue.pendingTasks,
      completed: this.completed,
      workerFailures: this.workerFailures,
      retried: this.retried,
      queuedWeight: queue.pendingWeight,
      oldestQueuedMs: queue.oldestTaskAgeMs,
      shedTasks: queue.shedTasks,
      starvationPromotions: queue.starvationPromotions,
      averageSemanticChunkMs: this.averageSemanticChunkMs
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error("surface worker pool was disposed");
    this.queue.clear(error);
    for (const slot of this.slots) {
      if (slot.task) this.finishTask(slot.task, () => slot.task.reject(error));
      try {
        slot.client.dispose();
      } catch {
      }
    }
  }
  dispatch() {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const task = this.queue.take();
      if (!task) return;
      task.queueId = void 0;
      slot.busy = true;
      slot.task = task;
      if (slot.client.isDisposed) {
        try {
          slot.client = this.createClient();
        } catch (reason) {
          const error = reason instanceof Error ? reason : new Error(String(reason));
          this.finishTask(task, () => task.reject(error));
          this.releaseSlot(slot);
          continue;
        }
      }
      this.execute(slot, task);
    }
  }
  execute(slot, task) {
    const started = typeof performance === "undefined" ? Date.now() : performance.now();
    let pending;
    try {
      pending = slot.client.generateSemanticChunk(task.options);
    } catch (reason) {
      pending = Promise.reject(reason);
    }
    void pending.then((chunk) => {
      this.recordDuration(started);
      if (!task.settled) {
        this.completed += 1;
        this.finishTask(task, () => task.resolve(chunk));
      }
      this.releaseSlot(slot);
    }, (reason) => {
      this.recordDuration(started);
      const error = reason instanceof Error ? reason : new Error(String(reason));
      const workerFailed = slot.client.isDisposed && !this.disposed;
      if (workerFailed) this.workerFailures += 1;
      if (!task.settled && workerFailed && task.attempts < this.maximumWorkerRetries) {
        task.attempts += 1;
        this.retried += 1;
        try {
          slot.client = this.createClient();
          this.execute(slot, task);
          return;
        } catch (replacementReason) {
          const replacementError = replacementReason instanceof Error ? replacementReason : new Error(String(replacementReason));
          this.finishTask(task, () => task.reject(replacementError));
          this.releaseSlot(slot);
          return;
        }
      }
      if (!task.settled) this.finishTask(task, () => task.reject(error));
      this.releaseSlot(slot);
    });
  }
  releaseSlot(slot) {
    slot.busy = false;
    slot.task = void 0;
    this.dispatch();
  }
  finishTask(task, settle) {
    if (task.settled) return;
    task.settled = true;
    if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
    settle();
  }
  createClient() {
    const client = this.clientFactory();
    if (!client || typeof client.generateSemanticChunk !== "function" || typeof client.dispose !== "function") {
      throw new TypeError("surface worker client factory returned an invalid client");
    }
    if (client.isDisposed) {
      try {
        client.dispose();
      } catch {
      }
      throw new Error("surface worker client factory returned a disposed client");
    }
    return client;
  }
  recordDuration(started) {
    const finished = typeof performance === "undefined" ? Date.now() : performance.now();
    const duration = Math.max(0, finished - started);
    this.averageSemanticChunkMs = this.averageSemanticChunkMs === 0 ? duration : this.averageSemanticChunkMs + (duration - this.averageSemanticChunkMs) * 0.2;
  }
};

// src/world/compileStaticSemanticChunk.ts
var STATIC_PLAIN_HEIGHT = 32768;
var STATIC_HILL_HEIGHT = 39321;
var STATIC_MOUNTAIN_HEIGHT = 52428;
var STATIC_WOOD_DENSITY = 140;
var ALLOWED_MODIFIERS = /* @__PURE__ */ new Set(["hill", "wood", "lake", "river"]);
var LAND_TYPES = new Set(Object.values(Land));
function assertStaticInputs(map, descriptor) {
  assertWorldDescriptorV2(descriptor);
  assertCoreWorldSemanticsV2(descriptor);
  if (descriptor.sourceKind !== "static" || descriptor.topology !== "finite") {
    throw new TypeError("static semantic compiler requires a static finite descriptor");
  }
  if (!map || typeof map !== "object" || map.infinite || map.wrapX || map.wrapY || map.w !== descriptor.width || map.h !== descriptor.height) {
    throw new TypeError("static MapInfo topology does not match its v2 descriptor");
  }
}
function assertStaticTile(tile, x, y) {
  if (!tile || typeof tile !== "object" || !LAND_TYPES.has(tile.type)) {
    throw new TypeError(`static semantic tile ${x},${y} has an invalid terrain type`);
  }
  if (tile.modifiers !== void 0) {
    if (!Array.isArray(tile.modifiers) || tile.modifiers.some((modifier) => typeof modifier !== "string" || !ALLOWED_MODIFIERS.has(modifier)) || new Set(tile.modifiers).size !== tile.modifiers.length) {
      throw new TypeError(`static semantic tile ${x},${y} has invalid or duplicate modifiers`);
    }
  }
  if (tile.treeModel !== void 0 && typeof tile.treeModel !== "string") {
    throw new TypeError(`static semantic tile ${x},${y} has an invalid tree model identity`);
  }
}
function macroHeightFor(tile, seaLevel) {
  if (tile.type === "sea" /* sea */) return Math.max(0, seaLevel - 4096);
  if (tile.type === "coastal" /* coastal */) return Math.max(0, seaLevel - 1);
  if (tile.type === "mountain" /* mountain */) return STATIC_MOUNTAIN_HEIGHT;
  if (tile.modifiers?.includes("hill")) return STATIC_HILL_HEIGHT;
  return STATIC_PLAIN_HEIGHT;
}
function substrateFor2(tile) {
  if (tile.type === "mountain" /* mountain */) return 2 /* Rock */;
  if (tile.type === "sand" /* sand */ || tile.type === "coastal" /* coastal */ || tile.type === "sea" /* sea */) {
    return 1 /* Sand */;
  }
  return 0 /* Soil */;
}
function vegetationProfileFor2(tile) {
  const model = tile.treeModel?.toLowerCase() ?? "";
  if (tile.type === "mountain" /* mountain */ || tile.type === "snow" /* snow */) return 3 /* Alpine */;
  if (model.includes("palm") || tile.type === "sand" /* sand */) return 0 /* Tropical */;
  if (model.includes("pinia") || model.includes("pine") || tile.type === "tundra" /* tundra */) {
    return 2 /* Boreal */;
  }
  return 1 /* Temperate */;
}
function writeBiomeAndClimate(tile, tileIndex, biomeWeights, climate) {
  const biomeOffset = tileIndex * 4;
  const climateOffset = tileIndex * 2;
  if (tile.type === "mountain" /* mountain */) {
    biomeWeights[biomeOffset + 3] = 255;
    climate[climateOffset] = 72;
    climate[climateOffset + 1] = 96;
  } else if (tile.type === "snow" /* snow */) {
    biomeWeights[biomeOffset + 2] = 180;
    biomeWeights[biomeOffset + 3] = 75;
    climate[climateOffset] = 24;
    climate[climateOffset + 1] = 128;
  } else if (tile.type === "tundra" /* tundra */) {
    biomeWeights[biomeOffset + 2] = 255;
    climate[climateOffset] = 72;
    climate[climateOffset + 1] = 128;
  } else if (tile.type === "sand" /* sand */ || tile.type === "coastal" /* coastal */ || tile.type === "sea" /* sea */) {
    biomeWeights[biomeOffset + 1] = 255;
    climate[climateOffset] = tile.type === "sand" /* sand */ ? 224 : 160;
    climate[climateOffset + 1] = tile.type === "sand" /* sand */ ? 48 : 255;
  } else {
    biomeWeights[biomeOffset] = 255;
    climate[climateOffset] = 152;
    climate[climateOffset + 1] = 152;
  }
}
function compileStaticSemanticChunk(options) {
  if (!options || typeof options !== "object") throw new TypeError("static semantic compile options are required");
  assertStaticInputs(options.map, options.descriptor);
  const origin = chunkOrigin(options.chunkX, options.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
  if (origin.x < 0 || origin.y < 0 || origin.x >= options.descriptor.width || origin.y >= options.descriptor.height) {
    throw new RangeError("static semantic chunk key is outside the finite world");
  }
  const validWidth = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, options.descriptor.width - origin.x);
  const validHeight = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, options.descriptor.height - origin.y);
  const substrateClass = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
  const climate = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2);
  const vegetationDensity = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  const vegetationProfile = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
  for (let localX = 0; localX < validWidth; localX += 1) {
    for (let localY = 0; localY < validHeight; localY += 1) {
      const worldX = origin.x + localX;
      const worldY = origin.y + localY;
      const tile = getMapTile(options.map, worldX, worldY);
      if (!tile) throw new TypeError(`static semantic map is missing tile ${worldX},${worldY}`);
      assertStaticTile(tile, worldX, worldY);
      const tileIndex = semanticTileIndex(localX, localY);
      substrateClass[tileIndex] = substrateFor2(tile);
      macroHeight[tileIndex] = macroHeightFor(tile, options.descriptor.seaLevel);
      writeBiomeAndClimate(tile, tileIndex, biomeWeights, climate);
      vegetationDensity[tileIndex] = tile.modifiers?.includes("wood") ? STATIC_WOOD_DENSITY : 0;
      vegetationProfile[tileIndex] = vegetationProfileFor2(tile);
    }
  }
  return createBaseSemanticChunk({
    key: { chunkX: options.chunkX, chunkY: options.chunkY },
    revision: 0,
    validBounds: {
      minX: 0,
      minY: 0,
      maxXExclusive: validWidth,
      maxYExclusive: validHeight
    },
    substrateClass,
    macroHeight,
    biomeWeights,
    climate,
    vegetationDensity,
    vegetationProfile
  }, semanticCatalogLimits(options.descriptor));
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

// src/world/SemanticWorldSource.ts
var DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES = 32 * 1024 * 1024;
function positiveModulo4(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function abortError2() {
  if (typeof DOMException !== "undefined") return new DOMException("semantic chunk request was aborted", "AbortError");
  const error = new Error("semantic chunk request was aborted");
  error.name = "AbortError";
  return error;
}
function semanticChunkBytes(chunk) {
  return chunk.substrateClass.byteLength + chunk.macroHeight.byteLength + chunk.biomeWeights.byteLength + chunk.climate.byteLength + chunk.vegetationDensity.byteLength + chunk.vegetationProfile.byteLength;
}
function validateChunkKey(chunkX, chunkY) {
  try {
    chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    return true;
  } catch {
    return false;
  }
}
var ProceduralSemanticWorldSourceBase = class {
  constructor(options, expectedKind) {
    this.cache = new CoordinatePairMap();
    this.inFlight = new CoordinatePairMap();
    this.cacheBytes = 0;
    this.cacheClock = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.disposed = false;
    if (!options || typeof options !== "object") throw new TypeError("procedural semantic source options are required");
    assertWorldDescriptorV2(options.descriptor);
    if (options.descriptor.sourceKind !== expectedKind) {
      throw new TypeError(`semantic source requires a ${expectedKind} descriptor`);
    }
    this.descriptor = options.descriptor;
    this.worldIdentity = serializeWorldDescriptorV2(this.descriptor);
    this.bounds = this.descriptor.sourceKind === "procedural-toroidal" ? Object.freeze({ width: this.descriptor.width, height: this.descriptor.height, topology: "toroidal" }) : void 0;
    this.cacheMaxBytes = options.cacheMaxBytes ?? DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES;
    if (!Number.isSafeInteger(this.cacheMaxBytes) || this.cacheMaxBytes < BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
      throw new RangeError("semantic chunk cache must hold at least one serialized chunk");
    }
    if (options.workerPool) {
      if (options.workerUrl !== void 0 || options.workerPoolOptions !== void 0) {
        throw new TypeError("external semantic workerPool cannot be combined with workerUrl or workerPoolOptions");
      }
      this.pool = options.workerPool;
      this.ownsPool = false;
    } else {
      if (!options.workerUrl) throw new TypeError("procedural semantic source requires a surface worker URL");
      this.pool = new SurfaceWorkerPool(options.workerUrl, options.workerPoolOptions);
      this.ownsPool = true;
    }
  }
  resolveChunk(chunkX, chunkY) {
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return void 0;
    if (this.descriptor.sourceKind === "procedural-infinite") {
      return validateChunkKey(chunkX, chunkY) ? { chunkX, chunkY } : void 0;
    }
    const countX = this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
    const countY = this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
    return {
      chunkX: positiveModulo4(chunkX, countX),
      chunkY: positiveModulo4(chunkY, countY)
    };
  }
  chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
    const first = this.resolveChunk(chunkX, chunkY);
    const second = this.resolveChunk(centerChunkX, centerChunkY);
    if (!first || !second) return Number.POSITIVE_INFINITY;
    let dx = Math.abs(first.chunkX - second.chunkX);
    let dy = Math.abs(first.chunkY - second.chunkY);
    if (this.descriptor.sourceKind === "procedural-toroidal") {
      const countX = this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
      const countY = this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
      dx = Math.min(dx, countX - dx);
      dy = Math.min(dy, countY - dy);
    }
    return Math.hypot(dx, dy);
  }
  loadChunk(chunkX, chunkY, request = {}) {
    if (this.disposed) return Promise.reject(new Error("semantic world source has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError2());
    const resolved = this.resolveChunk(chunkX, chunkY);
    if (!resolved || resolved.chunkX !== chunkX || resolved.chunkY !== chunkY) {
      return Promise.reject(new RangeError("semantic chunk request must use a canonical in-domain key"));
    }
    const cached = this.cache.get(chunkX, chunkY);
    if (cached) {
      this.cacheHits += 1;
      cached.references += 1;
      this.touch(cached);
      return Promise.resolve(cached.chunk);
    }
    this.cacheMisses += 1;
    let pending = this.inFlight.get(chunkX, chunkY);
    if (!pending) {
      const controller = new AbortController();
      const created = {
        controller,
        waiters: 0,
        settled: false,
        promise: void 0
      };
      created.promise = this.pool.generateSemanticChunk({
        descriptor: this.descriptor,
        key: resolved
      }, {
        priority: request.priority,
        lane: request.lane,
        weight: request.weight,
        signal: controller.signal
      }).then((chunk) => {
        if (this.disposed) throw new Error("semantic world source was disposed during generation");
        this.insert(chunk);
        return chunk;
      }).finally(() => {
        created.settled = true;
        this.inFlight.delete(chunkX, chunkY);
        if (created.waiters === 0) this.evictUnleased();
      });
      pending = created;
      this.inFlight.set(chunkX, chunkY, pending);
    }
    return this.waitFor(pending, request.signal);
  }
  releaseChunk(chunk) {
    const entry = this.cache.get(chunk.key.chunkX, chunk.key.chunkY);
    if (!entry || entry.chunk !== chunk || entry.references <= 0) {
      throw new Error("semantic chunk release does not match an active source lease");
    }
    entry.references -= 1;
    this.touch(entry);
    this.evictUnleased();
  }
  hasChunk(chunkX, chunkY) {
    return this.cache.has(chunkX, chunkY);
  }
  get stats() {
    const worker = this.pool.stats;
    let leasedChunks = 0;
    for (const entry of this.cache.values()) {
      if (entry.references > 0) leasedChunks += 1;
    }
    return Object.freeze({
      residentChunks: this.cache.size,
      residentBytes: this.cacheBytes,
      leasedChunks,
      inFlightChunks: this.inFlight.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      workers: worker.workers,
      busyWorkers: worker.busyWorkers,
      queuedWorkerTasks: worker.queued
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.inFlight.values()) pending.controller.abort();
    if (this.ownsPool) this.pool.dispose();
    this.cache.clear();
    this.cacheBytes = 0;
  }
  waitFor(pending, signal) {
    pending.waiters += 1;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (settle) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        pending.waiters -= 1;
        if (pending.waiters === 0 && !pending.settled) pending.controller.abort();
        settle();
      };
      const onAbort = () => finish(() => reject(abortError2()));
      signal?.addEventListener("abort", onAbort, { once: true });
      pending.promise.then((chunk) => finish(() => {
        const entry = this.cache.get(chunk.key.chunkX, chunk.key.chunkY);
        if (!entry || entry.chunk !== chunk) {
          reject(new Error("generated semantic chunk was not published to its source cache"));
          return;
        }
        entry.references += 1;
        this.touch(entry);
        this.evictUnleased();
        resolve(chunk);
      }), (reason) => finish(() => reject(reason instanceof Error ? reason : new Error(String(reason)))));
      if (signal?.aborted) onAbort();
    });
  }
  insert(chunk) {
    if (this.cache.has(chunk.key.chunkX, chunk.key.chunkY)) {
      throw new Error("semantic worker produced a duplicate resident chunk");
    }
    const bytes = semanticChunkBytes(chunk);
    const entry = { chunk, bytes, references: 0, lastUsed: 0 };
    this.touch(entry);
    this.cache.set(chunk.key.chunkX, chunk.key.chunkY, entry);
    this.cacheBytes += bytes;
  }
  touch(entry) {
    if (this.cacheClock >= Number.MAX_SAFE_INTEGER) {
      const entries = [...this.cache.values()].sort((first, second) => first.lastUsed - second.lastUsed);
      for (let index = 0; index < entries.length; index += 1) entries[index].lastUsed = index + 1;
      this.cacheClock = entries.length;
    }
    this.cacheClock += 1;
    entry.lastUsed = this.cacheClock;
  }
  evictUnleased() {
    while (this.cacheBytes > this.cacheMaxBytes) {
      let candidate;
      for (const entry of this.cache.values()) {
        if (entry.references === 0 && (!candidate || entry.lastUsed < candidate.lastUsed)) candidate = entry;
      }
      if (!candidate) return;
      this.cache.delete(candidate.chunk.key.chunkX, candidate.chunk.key.chunkY);
      this.cacheBytes -= candidate.bytes;
    }
  }
};
var InfiniteSemanticWorldSource = class extends ProceduralSemanticWorldSourceBase {
  constructor(options) {
    super(options, "procedural-infinite");
  }
};
var ToroidalSemanticWorldSource = class extends ProceduralSemanticWorldSourceBase {
  constructor(options) {
    super(options, "procedural-toroidal");
  }
};
var StaticSemanticWorldSource = class {
  constructor(map, descriptor) {
    this.chunks = new CoordinatePairMap();
    this.residentBytes = 0;
    this.disposed = false;
    assertWorldDescriptorV2(descriptor);
    if (descriptor.sourceKind !== "static") {
      throw new TypeError("StaticSemanticWorldSource requires a static descriptor");
    }
    this.descriptor = descriptor;
    this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    this.bounds = Object.freeze({ width: descriptor.width, height: descriptor.height, topology: "finite" });
    const countX = Math.ceil(descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE);
    const countY = Math.ceil(descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE);
    for (let chunkX = 0; chunkX < countX; chunkX += 1) {
      for (let chunkY = 0; chunkY < countY; chunkY += 1) {
        const chunk = compileStaticSemanticChunk({ map, descriptor, chunkX, chunkY });
        const bytes = semanticChunkBytes(chunk);
        this.chunks.set(chunkX, chunkY, { chunk, bytes, references: 0, lastUsed: 0 });
        this.residentBytes += bytes;
      }
    }
  }
  resolveChunk(chunkX, chunkY) {
    return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY) && this.chunks.has(chunkX, chunkY) ? { chunkX, chunkY } : void 0;
  }
  chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
    const first = this.resolveChunk(chunkX, chunkY);
    const second = this.resolveChunk(centerChunkX, centerChunkY);
    return first && second ? Math.hypot(first.chunkX - second.chunkX, first.chunkY - second.chunkY) : Number.POSITIVE_INFINITY;
  }
  loadChunk(chunkX, chunkY, request = {}) {
    if (this.disposed) return Promise.reject(new Error("static semantic source has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError2());
    const entry = this.chunks.get(chunkX, chunkY);
    if (entry) entry.references += 1;
    return entry ? Promise.resolve(entry.chunk) : Promise.reject(new RangeError("static semantic chunk is outside the finite world"));
  }
  releaseChunk(chunk) {
    const entry = this.chunks.get(chunk.key.chunkX, chunk.key.chunkY);
    if (!entry || entry.chunk !== chunk || entry.references <= 0) {
      throw new Error("static semantic chunk release does not match an active source lease");
    }
    entry.references -= 1;
  }
  hasChunk(chunkX, chunkY) {
    return this.chunks.has(chunkX, chunkY);
  }
  get stats() {
    let leasedChunks = 0;
    for (const entry of this.chunks.values()) {
      if (entry.references > 0) leasedChunks += 1;
    }
    return Object.freeze({
      residentChunks: this.chunks.size,
      residentBytes: this.residentBytes,
      leasedChunks,
      inFlightChunks: 0,
      cacheHits: 0,
      cacheMisses: 0,
      workers: 0,
      busyWorkers: 0,
      queuedWorkerTasks: 0
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.chunks.clear();
    this.residentBytes = 0;
  }
};
function assertSemanticWorldSource(source) {
  if (!source || typeof source !== "object") throw new TypeError("semantic world source must be an object");
  assertWorldDescriptorV2(source.descriptor);
  if (source.worldIdentity !== serializeWorldDescriptorV2(source.descriptor)) {
    throw new TypeError("semantic world source identity does not match its descriptor");
  }
  for (const method of ["resolveChunk", "chunkDistance", "loadChunk", "releaseChunk", "hasChunk", "dispose"]) {
    if (typeof source[method] !== "function") throw new TypeError(`semantic world source must implement ${method}()`);
  }
}

// src/world/MacroDrainageTree.ts
var MACRO_DRAINAGE_TERMINAL = -1;
var MACRO_DRAINAGE_INVALID = -2;
var MACRO_DRAINAGE_INVALID_RANK = 4294967295;
var UNREACHED_SPILL_HEIGHT = 65536;
var MAX_NODE_COUNT = 2147483647;
var NEIGHBOR_X = [-1, -1, -1, 0, 0, 1, 1, 1];
var NEIGHBOR_Y = [-1, 0, 1, -1, 1, -1, 0, 1];
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
var OCEAN_BODY_ID = "ocean";
function abortError3() {
  if (typeof DOMException !== "undefined") return new DOMException("macro drainage graph build was aborted", "AbortError");
  const error = new Error("macro drainage graph build was aborted");
  error.name = "AbortError";
  return error;
}
function classifyDischarge(discharge) {
  return Math.min(255, Math.floor(Math.log2(Math.max(1, discharge))));
}
function treeFor(raster, topology) {
  return topology === "toroidal" ? buildToroidalMacroDrainageTree(raster) : buildMacroDrainageTree(raster);
}
function assignTerminalNodes(tree) {
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
  return `node:${tile.x}:${tile.y}`;
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
  const expectedTerminalNode = assignTerminalNodes(graph);
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
    if (terminal >= length || graph.downstream[terminal] !== MACRO_DRAINAGE_TERMINAL || terminal !== expectedTerminalNode[index] || graph.dischargeClass[index] !== classifyDischarge(graph.discharge[index])) {
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
  if (options.signal?.aborted) throw abortError3();
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
    if (options.signal?.aborted) throw abortError3();
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
    dischargeClass[index] = classifyDischarge(tree.discharge[index]);
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
    terminalNode: assignTerminalNodes(tree),
    terminalKind: tree.terminalKind,
    terminalIndices: tree.terminalIndices,
    validNodeCount: tree.validNodeCount,
    maxDrainageRank: tree.maxDrainageRank
  });
  assertMacroDrainageGraph(graph);
  return graph;
}

// src/world/HydrologyRegion.ts
var HYDROLOGY_REGION_REVISION = 0;
var HYDROLOGY_POINT_QUANTIZATION = 64;
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
  const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
  const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
  if (port.point[0] < 0 || port.point[0] > maximumX || port.point[1] < 0 || port.point[1] > maximumY || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_X) !== 0 && port.point[0] !== 0 || (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_X) !== 0 && port.point[0] !== maximumX || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_Y) !== 0 && port.point[1] !== 0 || (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_Y) !== 0 && port.point[1] !== maximumY) {
    throw new RangeError("hydrology port point does not lie on its declared boundary");
  }
  if (!Number.isSafeInteger(port.canonicalTileX) || !Number.isSafeInteger(port.canonicalTileY)) {
    throw new RangeError("hydrology port canonical point must use safe integer tiles");
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
  const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
  const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const x = segment.controlPoints[pointIndex * 2];
    const y = segment.controlPoints[pointIndex * 2 + 1];
    if (x < 0 || x > maximumX || y < 0 || y > maximumY || segment.widthProfile[pointIndex] === 0) {
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
  const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
  const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
  if (lake.center[0] + lake.radius < 0 || lake.center[0] - lake.radius > maximumX || lake.center[1] + lake.radius < 0 || lake.center[1] - lake.radius > maximumY) {
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
  const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
  const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
  if (mouth.point[0] < 0 || mouth.point[0] > maximumX || mouth.point[1] < 0 || mouth.point[1] > maximumY) {
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
function hydrologyPortConnectionSignature(port) {
  assertStableId("hydrology connection", port.connectionId);
  assertStableId("hydrology port river", port.riverId);
  if (!Number.isSafeInteger(port.canonicalTileX) || !Number.isSafeInteger(port.canonicalTileY) || !(port.flowDirection instanceof Int8Array) || port.flowDirection.length !== 2) {
    throw new TypeError("hydrology port is not valid for a connection signature");
  }
  return JSON.stringify([
    port.connectionId,
    port.riverId,
    port.canonicalTileX,
    port.canonicalTileY,
    port.flowDirection[0],
    port.flowDirection[1],
    port.widthClass,
    port.level,
    port.dischargeClass
  ]);
}

// src/world/MacroDrainageHydrologySource.ts
var MIN_RIVER_DISCHARGE = 8;
var MIN_LAKE_RADIUS_TILES = 4;
var MAX_LAKE_RADIUS_TILES = 16;
var CLIP_EPSILON = 1e-9;
var MACRO_NODE_CENTER_OFFSET = MACRO_DRAINAGE_NODE_STEP_TILES / 2;
function positiveModulo5(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function compareIdentity2(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}
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
function wrappedNodeStep(from, to, count) {
  let step = to - from;
  if (step > 1) step -= count;
  else if (step < -1) step += count;
  if (step < -1 || step > 1) throw new Error("toroidal drainage edge is not a neighboring node step");
  return step;
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
  if (localX === 0) mask |= HYDROLOGY_BOUNDARY_MIN_X;
  if (localX === maximumX) mask |= HYDROLOGY_BOUNDARY_MAX_X;
  if (localY === 0) mask |= HYDROLOGY_BOUNDARY_MIN_Y;
  if (localY === maximumY) mask |= HYDROLOGY_BOUNDARY_MAX_Y;
  if (mask === 0) throw new Error("clipped hydrology endpoint is not on a region boundary");
  return mask;
}
function canonicalPortCoordinate(value, span, toroidal) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > CLIP_EPSILON || !Number.isSafeInteger(rounded)) {
    throw new Error("macro drainage boundary crossing is not an integer logical tile");
  }
  return toroidal ? positiveModulo5(rounded, span) : rounded;
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
function terminalRiverId(graph, sourceIndex) {
  return `river:${macroDrainageNodeId(graph, graph.terminalNode[sourceIndex])}`;
}
function edgeId(graph, source, parent) {
  return `edge:${macroDrainageNodeId(graph, source)}>${macroDrainageNodeId(graph, parent)}`;
}
function widthClass(dischargeClass) {
  return Math.min(255, dischargeClass + 1);
}
function addBody(bodies, body) {
  const existing = bodies.get(body.bodyId);
  if (existing && (existing.kind !== body.kind || existing.profileIndex !== body.profileIndex)) {
    throw new Error("hydrology body identity resolved to conflicting kinds or profiles");
  }
  if (!existing) bodies.set(body.bodyId, Object.freeze(body));
}
var MacroDrainageHydrologySource = class {
  constructor(graph) {
    assertMacroDrainageGraph(graph);
    this.graph = graph;
    this.regionCountX = Math.ceil(graph.worldWidth / HYDROLOGY_REGION_SIZE);
    this.regionCountY = Math.ceil(graph.worldHeight / HYDROLOGY_REGION_SIZE);
    this.terminalWaterLevel = new Uint16Array(graph.downstream.length);
    this.terminalWaterLevelResolved = new Uint8Array(graph.downstream.length);
    this.initializeTerminalWaterLevels();
  }
  resolveRegion(regionX, regionY) {
    if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return void 0;
    if (this.graph.topology === "finite") {
      return regionX >= 0 && regionX < this.regionCountX && regionY >= 0 && regionY < this.regionCountY ? Object.freeze({ regionX, regionY }) : void 0;
    }
    return Object.freeze({
      regionX: positiveModulo5(regionX, this.regionCountX),
      regionY: positiveModulo5(regionY, this.regionCountY)
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
    const rivers = [];
    const ports = [];
    const lakes = [];
    const mouths = [];
    const bodies = /* @__PURE__ */ new Map();
    const segmentIds = /* @__PURE__ */ new Set();
    const toroidal = this.graph.topology === "toroidal";
    const [minimumNodeX, maximumNodeX] = nodeAxisRange(origin.x, endX, this.graph.width, toroidal);
    const [minimumNodeY, maximumNodeY] = nodeAxisRange(origin.y, endY, this.graph.height, toroidal);
    for (let unwrappedNodeX = minimumNodeX; unwrappedNodeX <= maximumNodeX; unwrappedNodeX += 1) {
      const nodeX = toroidal ? positiveModulo5(unwrappedNodeX, this.graph.width) : unwrappedNodeX;
      for (let unwrappedNodeY = minimumNodeY; unwrappedNodeY <= maximumNodeY; unwrappedNodeY += 1) {
        const nodeY = toroidal ? positiveModulo5(unwrappedNodeY, this.graph.height) : unwrappedNodeY;
        const sourceIndex = macroDrainageIndex(nodeX, nodeY, this.graph.height);
        const sourceTile = macroDrainageNodeTile(this.graph, sourceIndex);
        const physicalSourceX = toroidal ? unwrappedNodeX * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : sourceTile.x;
        const physicalSourceY = toroidal ? unwrappedNodeY * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : sourceTile.y;
        if (physicalSourceX >= origin.x && physicalSourceX < endX && physicalSourceY >= origin.y && physicalSourceY < endY && this.graph.ocean[sourceIndex] !== 0) {
          addBody(bodies, {
            bodyId: OCEAN_BODY_ID,
            kind: "ocean",
            profileIndex: OCEAN_HYDROLOGY_PROFILE
          });
        }
        const parentIndex = this.graph.downstream[sourceIndex];
        if (parentIndex === MACRO_DRAINAGE_TERMINAL || this.graph.ocean[sourceIndex] !== 0 || this.graph.discharge[sourceIndex] < MIN_RIVER_DISCHARGE) continue;
        const parentX = Math.floor(parentIndex / this.graph.height);
        const parentY = parentIndex - parentX * this.graph.height;
        const parentTile = macroDrainageNodeTile(this.graph, parentIndex);
        const physicalParentX = toroidal ? (unwrappedNodeX + wrappedNodeStep(nodeX, parentX, this.graph.width)) * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : parentTile.x;
        const physicalParentY = toroidal ? (unwrappedNodeY + wrappedNodeStep(nodeY, parentY, this.graph.height)) * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET : parentTile.y;
        const clipped = clipLineToRegion(
          physicalSourceX,
          physicalSourceY,
          physicalParentX,
          physicalParentY,
          origin.x,
          origin.y,
          endX,
          endY
        );
        if (!clipped) continue;
        const localStartX = quantizeLocal(clipped.startX, origin.x);
        const localStartY = quantizeLocal(clipped.startY, origin.y);
        const localEndX = quantizeLocal(clipped.endX, origin.x);
        const localEndY = quantizeLocal(clipped.endY, origin.y);
        const canonicalEdgeId = edgeId(this.graph, sourceIndex, parentIndex);
        const segmentId = `segment:${canonicalEdgeId}@${regionX}:${regionY}:${localStartX},${localStartY}>${localEndX},${localEndY}`;
        if (segmentIds.has(segmentId)) throw new Error("hydrology region produced a duplicate segment identity");
        segmentIds.add(segmentId);
        const riverId = terminalRiverId(this.graph, sourceIndex);
        const edgeDischargeClass = this.graph.dischargeClass[sourceIndex];
        const edgeWidthClass = widthClass(edgeDischargeClass);
        const startLevel = interpolateUint16(
          this.graph.spillLevel[sourceIndex],
          this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL ? this.terminalWaterLevel[parentIndex] : this.graph.spillLevel[parentIndex],
          clipped.startT
        );
        const endLevel = interpolateUint16(
          this.graph.spillLevel[sourceIndex],
          this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL ? this.terminalWaterLevel[parentIndex] : this.graph.spillLevel[parentIndex],
          clipped.endT
        );
        const directionX = Math.sign(physicalParentX - physicalSourceX);
        const directionY = Math.sign(physicalParentY - physicalSourceY);
        let entry = {
          kind: "node",
          nodeId: macroDrainageNodeId(this.graph, sourceIndex)
        };
        let exit = this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL ? { kind: "body", bodyId: macroDrainageTerminalBodyId(this.graph, sourceIndex) } : { kind: "node", nodeId: macroDrainageNodeId(this.graph, parentIndex) };
        if (clipped.startT > CLIP_EPSILON) {
          const canonicalTileX = canonicalPortCoordinate(clipped.startX, this.graph.worldWidth, toroidal);
          const canonicalTileY = canonicalPortCoordinate(clipped.startY, this.graph.worldHeight, toroidal);
          const connectionId = `connection:${canonicalEdgeId}@${canonicalTileX}:${canonicalTileY}`;
          entry = { kind: "port", connectionId };
          ports.push({
            connectionId,
            riverId,
            segmentId,
            endpoint: "entry",
            boundaryMask: boundaryMask(
              localStartX,
              localStartY,
              validWidth * HYDROLOGY_POINT_QUANTIZATION,
              validHeight * HYDROLOGY_POINT_QUANTIZATION
            ),
            point: new Int16Array([localStartX, localStartY]),
            canonicalTileX,
            canonicalTileY,
            flowDirection: new Int8Array([directionX, directionY]),
            widthClass: edgeWidthClass,
            level: startLevel,
            dischargeClass: edgeDischargeClass
          });
        }
        if (clipped.endT < 1 - CLIP_EPSILON) {
          const canonicalTileX = canonicalPortCoordinate(clipped.endX, this.graph.worldWidth, toroidal);
          const canonicalTileY = canonicalPortCoordinate(clipped.endY, this.graph.worldHeight, toroidal);
          const connectionId = `connection:${canonicalEdgeId}@${canonicalTileX}:${canonicalTileY}`;
          exit = { kind: "port", connectionId };
          ports.push({
            connectionId,
            riverId,
            segmentId,
            endpoint: "exit",
            boundaryMask: boundaryMask(
              localEndX,
              localEndY,
              validWidth * HYDROLOGY_POINT_QUANTIZATION,
              validHeight * HYDROLOGY_POINT_QUANTIZATION
            ),
            point: new Int16Array([localEndX, localEndY]),
            canonicalTileX,
            canonicalTileY,
            flowDirection: new Int8Array([directionX, directionY]),
            widthClass: edgeWidthClass,
            level: endLevel,
            dischargeClass: edgeDischargeClass
          });
        }
        const segment = {
          riverId,
          segmentId,
          controlPoints: new Int16Array([localStartX, localStartY, localEndX, localEndY]),
          widthProfile: new Uint8Array([edgeWidthClass, edgeWidthClass]),
          levelProfile: new Uint16Array([startLevel, endLevel]),
          dischargeClass: edgeDischargeClass,
          entry,
          exit
        };
        rivers.push(segment);
        addBody(bodies, { bodyId: riverId, kind: "river", profileIndex: RIVER_HYDROLOGY_PROFILE });
        if (exit.kind === "body") {
          const targetKind = this.graph.ocean[parentIndex] !== 0 ? "ocean" : "lake";
          addBody(bodies, {
            bodyId: exit.bodyId,
            kind: targetKind,
            profileIndex: targetKind === "ocean" ? OCEAN_HYDROLOGY_PROFILE : LAKE_HYDROLOGY_PROFILE
          });
          mouths.push({
            mouthId: `mouth:${canonicalEdgeId}`,
            riverId,
            segmentId,
            targetBodyId: exit.bodyId,
            point: new Int16Array([localEndX, localEndY]),
            widthClass: edgeWidthClass,
            dischargeClass: edgeDischargeClass
          });
        }
      }
    }
    this.addLakeSlices(key, origin.x, origin.y, validWidth, validHeight, lakes, bodies);
    return createHydrologyRegion({
      worldIdentity: this.graph.worldIdentity,
      topology: this.graph.topology,
      key,
      revision: HYDROLOGY_REGION_REVISION,
      validBounds: { minX: 0, minY: 0, maxXExclusive: validWidth, maxYExclusive: validHeight },
      boundaryPorts: ports,
      rivers,
      lakes,
      mouths,
      bodies: [...bodies.values()].sort((first, second) => compareIdentity2(first.bodyId, second.bodyId))
    });
  }
  addLakeSlices(key, originX, originY, validWidth, validHeight, lakes, bodies) {
    if (this.graph.terminalKind !== "lake") return;
    const toroidal = this.graph.topology === "toroidal";
    for (const terminal of this.graph.terminalIndices) {
      const bodyId = macroDrainageTerminalBodyId(this.graph, terminal);
      const center = macroDrainageNodeTile(this.graph, terminal);
      const radiusTiles = Math.min(
        MAX_LAKE_RADIUS_TILES,
        MIN_LAKE_RADIUS_TILES + this.graph.dischargeClass[terminal]
      );
      const radius = radiusTiles * HYDROLOGY_POINT_QUANTIZATION;
      const shiftsX = toroidal ? [-this.graph.worldWidth, 0, this.graph.worldWidth] : [0];
      const shiftsY = toroidal ? [-this.graph.worldHeight, 0, this.graph.worldHeight] : [0];
      for (const shiftX of shiftsX) {
        for (const shiftY of shiftsY) {
          const physicalCenterX = center.x + shiftX;
          const physicalCenterY = center.y + shiftY;
          if (physicalCenterX + radiusTiles < originX || physicalCenterX - radiusTiles > originX + validWidth || physicalCenterY + radiusTiles < originY || physicalCenterY - radiusTiles > originY + validHeight) continue;
          const localCenterX = quantizeLocal(physicalCenterX, originX);
          const localCenterY = quantizeLocal(physicalCenterY, originY);
          lakes.push({
            featureId: `lake-slice:${bodyId}@${key.regionX}:${key.regionY}:${localCenterX},${localCenterY}`,
            bodyId,
            center: new Int16Array([localCenterX, localCenterY]),
            radius,
            level: this.terminalWaterLevel[terminal],
            profileIndex: LAKE_HYDROLOGY_PROFILE
          });
          addBody(bodies, { bodyId, kind: "lake", profileIndex: LAKE_HYDROLOGY_PROFILE });
        }
      }
    }
  }
  initializeTerminalWaterLevels() {
    this.terminalWaterLevel.fill(65535);
    for (const terminal of this.graph.terminalIndices) {
      if (this.graph.ocean[terminal] !== 0) {
        this.terminalWaterLevel[terminal] = this.graph.seaLevel;
        this.terminalWaterLevelResolved[terminal] = 1;
      }
    }
    for (let index = 0; index < this.graph.downstream.length; index += 1) {
      const parent = this.graph.downstream[index];
      if (parent < 0 || this.graph.ocean[parent] !== 0 || this.graph.downstream[parent] !== MACRO_DRAINAGE_TERMINAL) continue;
      this.terminalWaterLevel[parent] = Math.min(
        this.terminalWaterLevel[parent],
        this.graph.spillLevel[index]
      );
      this.terminalWaterLevelResolved[parent] = 1;
    }
    for (const terminal of this.graph.terminalIndices) {
      if (this.terminalWaterLevelResolved[terminal] === 0) {
        this.terminalWaterLevel[terminal] = this.graph.groundHeight[terminal];
      }
      if (this.terminalWaterLevel[terminal] < this.graph.groundHeight[terminal]) {
        throw new Error("hydrology terminal water level falls below its ground");
      }
    }
  }
};
export {
  BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
  BASE_SEMANTIC_CHUNK_TILE_COUNT,
  CORE_SUBSTRATE_ENTRIES,
  CORE_VEGETATION_PROFILE_ENTRIES,
  CORE_WORLD_SEMANTICS_V2,
  DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES,
  HYDROLOGY_BOUNDARY_MAX_X,
  HYDROLOGY_BOUNDARY_MAX_Y,
  HYDROLOGY_BOUNDARY_MIN_X,
  HYDROLOGY_BOUNDARY_MIN_Y,
  HYDROLOGY_POINT_QUANTIZATION,
  HYDROLOGY_REGION_FORMAT_VERSION,
  HYDROLOGY_REGION_REVISION,
  HYDROLOGY_REGION_SIZE,
  InfiniteSemanticWorldSource,
  LAKE_HYDROLOGY_PROFILE,
  MACRO_DRAINAGE_NODE_STEP_TILES,
  MAX_HYDROLOGY_REGION_BODIES,
  MAX_HYDROLOGY_REGION_LAKES,
  MAX_HYDROLOGY_REGION_MOUTHS,
  MAX_HYDROLOGY_REGION_PORTS,
  MAX_HYDROLOGY_REGION_RIVERS,
  MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS,
  MAX_LAKE_RADIUS_TILES,
  MAX_MACRO_DRAINAGE_GRAPH_NODES,
  MIN_LAKE_RADIUS_TILES,
  MIN_RIVER_DISCHARGE,
  MacroDrainageHydrologySource,
  OCEAN_BODY_ID,
  OCEAN_HYDROLOGY_PROFILE,
  RIVER_HYDROLOGY_PROFILE,
  SURFACE_COMPILE_PROFILE,
  SURFACE_COMPILE_PROFILE_VERSION,
  SURFACE_CORE_TEXELS,
  SURFACE_WORKER_PROTOCOL_VERSION,
  StaticSemanticWorldSource,
  SurfaceWorkerClient,
  SurfaceWorkerPool,
  ToroidalSemanticWorldSource,
  WORLD_CHUNK_FORMAT_VERSION_V2,
  WORLD_DESCRIPTOR_FORMAT_VERSION_V2,
  WORLD_GENERATOR_VERSION_V2,
  WORLD_SEMANTIC_CHUNK_SIZE,
  assertBaseSemanticChunk,
  assertCoreWorldSemanticsV2,
  assertGenerateSemanticChunkWorkerRequest,
  assertHydrologyRegion,
  assertMacroDrainageGraph,
  assertSemanticWorldSource,
  assertWorldDescriptorV2,
  buildMacroDrainageGraph,
  createBaseSemanticChunkGenerator,
  createCoreInfiniteWorldDescriptorV2,
  createCoreToroidalWorldDescriptorV2,
  createGenerateSemanticChunkWorkerRequest,
  createHydrologyRegion,
  createWorldDescriptorV2,
  deserializeBaseSemanticChunk,
  generateBaseSemanticChunk,
  getBaseSemanticTile,
  hydrologyPortConnectionSignature,
  macroDrainageNodeId,
  macroDrainageNodeTile,
  macroDrainageTerminalBodyId,
  semanticBiomeWeightIndex,
  semanticCatalogLimits,
  semanticClimateIndex,
  semanticGeneratorIdentity,
  semanticTileIndex,
  serializeBaseSemanticChunk,
  serializeWorldDescriptorV2,
  surfaceColumnStagger,
  surfaceStagger,
  surfaceTexelCenterAxis,
  surfaceToWorld,
  worldDescriptorsV2Equal,
  worldToSurface
};
//# sourceMappingURL=surface.mjs.map
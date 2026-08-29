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

// src/world/WorldGrid.ts
function assertLogicalCoordinate(name, value) {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}
function chunkLocation(tileX, tileY, chunkSize) {
  assertLogicalCoordinate("logical tile x", tileX);
  assertLogicalCoordinate("logical tile y", tileY);
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunk size must be a positive safe integer");
  }
  const chunkX = Math.floor(tileX / chunkSize);
  const chunkY = Math.floor(tileY / chunkSize);
  return {
    chunkX,
    chunkY,
    localX: tileX - chunkX * chunkSize,
    localY: tileY - chunkY * chunkSize
  };
}
function hydrologyRegionLocation(tileX, tileY) {
  return chunkLocation(tileX, tileY, HYDROLOGY_REGION_SIZE);
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
function createSurfaceRequestToken(sessionEpoch, renderChunkGeneration) {
  const token = Object.freeze({ sessionEpoch, renderChunkGeneration });
  assertSurfaceRequestToken(token);
  return token;
}
function surfaceRequestTokensEqual(first, second) {
  return first.sessionEpoch === second.sessionEpoch && first.renderChunkGeneration === second.renderChunkGeneration;
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
function serializeSurfaceDependencyKey(key) {
  assertSurfaceDependencyKey(key);
  return JSON.stringify([
    key.formatVersion,
    key.worldIdentity,
    key.renderKey.chunkX,
    key.renderKey.chunkY,
    key.compilerRevision,
    key.compileProfileVersion,
    key.metrics.hexSize,
    key.metrics.heightScale,
    key.semantic.map((dependency) => [
      dependency.key.chunkX,
      dependency.key.chunkY,
      dependency.baseRevision,
      dependency.deltaRevision
    ]),
    key.hydrologyRegions.map((dependency) => [
      dependency.key.regionX,
      dependency.key.regionY,
      dependency.baseRevision
    ]),
    key.hydrologyFeatures.map((dependency) => [
      dependency.featureId,
      dependency.featureKind,
      dependency.revision
    ])
  ]);
}
function surfaceDependencyKeysEqual(first, second) {
  return serializeSurfaceDependencyKey(first) === serializeSurfaceDependencyKey(second);
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
var SERIALIZED_MAGIC2 = 843338579;
function assertCatalogLimits2(limits) {
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
  assertCatalogLimits2(limits);
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
function sparseSemanticDeltaEntryIndex(delta, tileIndex) {
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT) {
    throw new RangeError("sparse semantic delta lookup tile index is invalid");
  }
  let minimum = 0;
  let maximum = delta.tileIndex.length - 1;
  while (minimum <= maximum) {
    const middle = minimum + maximum >>> 1;
    const candidate = delta.tileIndex[middle];
    if (candidate === tileIndex) return middle;
    if (candidate < tileIndex) minimum = middle + 1;
    else maximum = middle - 1;
  }
  return -1;
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
  view.setUint32(0, SERIALIZED_MAGIC2, true);
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
  if (view.getUint32(0, true) !== SERIALIZED_MAGIC2 || view.getUint16(4, true) !== SPARSE_SEMANTIC_DELTA_FORMAT_VERSION || view.getUint16(6, true) !== SPARSE_SEMANTIC_DELTA_HEADER_BYTES || view.getUint16(38, true) !== SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY) {
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

// src/world/EffectiveSemanticChunk.ts
function tileIndexIsWithinBounds(tileIndex, bounds) {
  const localX = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
  const localY = tileIndex - localX * WORLD_SEMANTIC_CHUNK_SIZE;
  return localX >= bounds.minX && localX < bounds.maxXExclusive && localY >= bounds.minY && localY < bounds.maxYExclusive;
}
function createEffectiveSemanticChunk(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("effective semantic chunk options are required");
  }
  const limits = semanticCatalogLimits(options.descriptor);
  assertBaseSemanticChunk(options.base, limits);
  const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
  if (!Number.isSafeInteger(options.effectiveRevision) || options.effectiveRevision < 0) {
    throw new RangeError("effective semantic revision must be a non-negative safe integer");
  }
  let deltaRevision = 0;
  if (options.delta) {
    assertSparseSemanticDelta(options.delta, limits);
    if (options.delta.worldIdentity !== worldIdentity || options.delta.key.chunkX !== options.base.key.chunkX || options.delta.key.chunkY !== options.base.key.chunkY) {
      throw new TypeError("semantic delta identity or key does not match its base chunk");
    }
    if (options.delta.revision > options.effectiveRevision) {
      throw new RangeError("semantic delta revision is newer than its effective snapshot");
    }
    for (const tileIndex of options.delta.tileIndex) {
      if (!tileIndexIsWithinBounds(tileIndex, options.base.validBounds)) {
        throw new RangeError("semantic delta tile lies outside its base chunk valid bounds");
      }
    }
    deltaRevision = options.delta.revision;
  }
  return Object.freeze({
    worldIdentity,
    key: options.base.key,
    effectiveRevision: options.effectiveRevision,
    baseRevision: options.base.revision,
    deltaRevision,
    validBounds: options.base.validBounds,
    base: options.base,
    ...options.delta ? { delta: options.delta } : {}
  });
}
function getEffectiveSemanticTile(chunk, localX, localY) {
  const tileIndex = semanticTileIndex(localX, localY);
  if (!tileIndexIsWithinBounds(tileIndex, chunk.validBounds)) {
    throw new RangeError("effective semantic tile lies outside chunk valid bounds");
  }
  const baseBiomeOffset = semanticBiomeWeightIndex(tileIndex, 0);
  const climateOffset = semanticClimateIndex(tileIndex, 0);
  const deltaEntry = chunk.delta ? sparseSemanticDeltaEntryIndex(chunk.delta, tileIndex) : -1;
  if (deltaEntry < 0 || !chunk.delta) {
    return Object.freeze({
      substrateClass: chunk.base.substrateClass[tileIndex],
      macroHeight: chunk.base.macroHeight[tileIndex],
      biomeWeights: Object.freeze([
        chunk.base.biomeWeights[baseBiomeOffset],
        chunk.base.biomeWeights[baseBiomeOffset + 1],
        chunk.base.biomeWeights[baseBiomeOffset + 2],
        chunk.base.biomeWeights[baseBiomeOffset + 3]
      ]),
      temperature: chunk.base.climate[climateOffset],
      moisture: chunk.base.climate[climateOffset + 1],
      vegetationDensity: chunk.base.vegetationDensity[tileIndex],
      vegetationProfile: chunk.base.vegetationProfile[tileIndex]
    });
  }
  const mask = chunk.delta.fieldMask[deltaEntry];
  const deltaBiomeOffset = deltaEntry * 4;
  return Object.freeze({
    substrateClass: (mask & SEMANTIC_DELTA_FIELD_SUBSTRATE) !== 0 ? chunk.delta.substrateClass[deltaEntry] : chunk.base.substrateClass[tileIndex],
    macroHeight: (mask & SEMANTIC_DELTA_FIELD_HEIGHT) !== 0 ? chunk.delta.macroHeight[deltaEntry] : chunk.base.macroHeight[tileIndex],
    biomeWeights: (mask & SEMANTIC_DELTA_FIELD_BIOME) !== 0 ? Object.freeze([
      chunk.delta.biomeWeights[deltaBiomeOffset],
      chunk.delta.biomeWeights[deltaBiomeOffset + 1],
      chunk.delta.biomeWeights[deltaBiomeOffset + 2],
      chunk.delta.biomeWeights[deltaBiomeOffset + 3]
    ]) : Object.freeze([
      chunk.base.biomeWeights[baseBiomeOffset],
      chunk.base.biomeWeights[baseBiomeOffset + 1],
      chunk.base.biomeWeights[baseBiomeOffset + 2],
      chunk.base.biomeWeights[baseBiomeOffset + 3]
    ]),
    temperature: chunk.base.climate[climateOffset],
    moisture: chunk.base.climate[climateOffset + 1],
    vegetationDensity: (mask & SEMANTIC_DELTA_FIELD_VEGETATION) !== 0 ? chunk.delta.vegetationDensity[deltaEntry] : chunk.base.vegetationDensity[tileIndex],
    vegetationProfile: (mask & SEMANTIC_DELTA_FIELD_VEGETATION) !== 0 ? chunk.delta.vegetationProfile[deltaEntry] : chunk.base.vegetationProfile[tileIndex]
  });
}

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
function hydrologyPortConnectionSignature(port) {
  assertStableId("hydrology connection", port.connectionId);
  assertStableId("hydrology port river", port.riverId);
  if (!Number.isSafeInteger(port.canonicalTileX * 2) || !Number.isSafeInteger(port.canonicalTileY * 2) || !(port.flowDirection instanceof Int8Array) || port.flowDirection.length !== 2) {
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
function authoredHydrologyPoint(tileX, tileY) {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    throw new RangeError("authored hydrology point must use finite tile coordinates");
  }
  const quantizedX = Math.round(tileX * HYDROLOGY_POINT_QUANTIZATION);
  const quantizedY = Math.round(tileY * HYDROLOGY_POINT_QUANTIZATION);
  if (!Number.isSafeInteger(quantizedX) || !Number.isSafeInteger(quantizedY) || quantizedX / HYDROLOGY_POINT_QUANTIZATION !== tileX || quantizedY / HYDROLOGY_POINT_QUANTIZATION !== tileY) {
    throw new RangeError("authored hydrology point must lie on the safe q64 lattice");
  }
  return new Float64Array([quantizedX, quantizedY]);
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

// src/world/TransferableEffectiveWindow.ts
var TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION = 1;
var EFFECTIVE_WINDOW_TILE_SIZE = SURFACE_COMPILE_PROFILE.renderChunkSize + SURFACE_COMPILE_PROFILE.influenceRadiusTiles * 2;
var EFFECTIVE_WINDOW_TILE_COUNT = EFFECTIVE_WINDOW_TILE_SIZE * EFFECTIVE_WINDOW_TILE_SIZE;
function transferableWorldDomain(view) {
  const descriptor = view.descriptor;
  return descriptor.sourceKind === "procedural-infinite" ? Object.freeze({ topology: "infinite" }) : Object.freeze({
    topology: descriptor.topology,
    width: descriptor.width,
    height: descriptor.height
  });
}
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
function coordinateIdentity(x, y) {
  return `${x}:${y}`;
}
function compareCoordinate(first, second) {
  return first.x - second.x || first.y - second.y;
}
function positiveModulo(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function canonicalTile(view, tileX, tileY) {
  const descriptor = view.descriptor;
  if (descriptor.sourceKind === "procedural-infinite") return { x: tileX, y: tileY };
  if (descriptor.sourceKind === "procedural-toroidal") {
    return {
      x: positiveModulo(tileX, descriptor.width),
      y: positiveModulo(tileY, descriptor.height)
    };
  }
  return tileX >= 0 && tileX < descriptor.width && tileY >= 0 && tileY < descriptor.height ? { x: tileX, y: tileY } : void 0;
}
function assertCanonicalRenderKey(view, key) {
  const origin = chunkOrigin(key.chunkX, key.chunkY, SURFACE_COMPILE_PROFILE.renderChunkSize);
  const descriptor = view.descriptor;
  if (descriptor.sourceKind === "procedural-infinite") return;
  const countX = Math.ceil(descriptor.width / SURFACE_COMPILE_PROFILE.renderChunkSize);
  const countY = Math.ceil(descriptor.height / SURFACE_COMPILE_PROFILE.renderChunkSize);
  if (key.chunkX < 0 || key.chunkX >= countX || key.chunkY < 0 || key.chunkY >= countY || origin.x < 0 || origin.y < 0) {
    throw new RangeError("effective window render key must be canonical and inside its world");
  }
}
async function loadSemanticLeases(view, keys, request) {
  const settled = await Promise.allSettled(keys.map((key) => view.loadSemanticChunk(key.x, key.y, request)));
  const loaded = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) {
    for (const chunk of loaded) view.releaseSemanticChunk(chunk);
    throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
  }
  return loaded;
}
async function loadHydrologyLeases(view, keys, request) {
  const settled = await Promise.allSettled(keys.map((key) => view.loadHydrologyRegion(key.x, key.y, request)));
  const loaded = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) {
    for (const region of loaded) view.releaseHydrologyRegion(region);
    throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
  }
  return loaded;
}
function cloneHydrologySlice(region) {
  const base = region.base;
  return Object.freeze({
    key: Object.freeze({ regionX: region.key.regionX, regionY: region.key.regionY }),
    topology: region.base.topology,
    validBounds: Object.freeze({
      minX: 0,
      minY: 0,
      maxXExclusive: region.base.validBounds.maxXExclusive,
      maxYExclusive: region.base.validBounds.maxYExclusive
    }),
    baseRevision: region.baseRevision,
    suppressedBaseFeatureIds: Object.freeze([...region.suppressedBaseFeatureIds]),
    boundaryPorts: Object.freeze(base.boundaryPorts.map((port) => Object.freeze({
      ...port,
      point: port.point.slice(),
      flowDirection: port.flowDirection.slice()
    }))),
    rivers: Object.freeze(base.rivers.map((river) => Object.freeze({
      ...river,
      entry: Object.freeze({ ...river.entry }),
      exit: Object.freeze({ ...river.exit }),
      controlPoints: river.controlPoints.slice(),
      widthProfile: river.widthProfile.slice(),
      levelProfile: river.levelProfile.slice()
    }))),
    lakes: Object.freeze(base.lakes.map((lake) => Object.freeze({
      ...lake,
      center: lake.center.slice()
    }))),
    mouths: Object.freeze(base.mouths.map((mouth) => Object.freeze({
      ...mouth,
      point: mouth.point.slice()
    }))),
    bodies: Object.freeze(base.bodies.map((body) => Object.freeze({ ...body })))
  });
}
function ownedFeature(feature) {
  return feature.kind === "river" ? {
    ...feature,
    controlPoints: feature.controlPoints.slice(),
    widthProfile: feature.widthProfile.slice(),
    levelProfile: feature.levelProfile.slice()
  } : {
    ...feature,
    polygon: feature.polygon.slice()
  };
}
function cloneAuthoredDelta(delta) {
  return createHydrologyFeatureDelta({
    worldIdentity: delta.worldIdentity,
    revision: delta.revision,
    featureId: delta.featureId,
    featureKind: delta.featureKind,
    operation: "upsert",
    feature: ownedFeature(delta.feature)
  });
}
function addBuffer(buffers, value) {
  if (!(value instanceof ArrayBuffer)) {
    throw new TypeError("effective transfer window requires owned ArrayBuffer payloads");
  }
  if (buffers.has(value)) throw new Error("effective transfer window typed arrays must not alias buffers");
  buffers.add(value);
}
function transferableEffectiveWindowTransferables(window) {
  assertTransferableEffectiveWindow(window);
  const buffers = /* @__PURE__ */ new Set();
  for (const array of [
    window.valid,
    window.substrateClass,
    window.macroHeight,
    window.biomeWeights,
    window.climate,
    window.vegetationDensity,
    window.vegetationProfile
  ]) addBuffer(buffers, array.buffer);
  for (const region of window.hydrologyRegions) {
    for (const port of region.boundaryPorts) {
      addBuffer(buffers, port.point.buffer);
      addBuffer(buffers, port.flowDirection.buffer);
    }
    for (const river of region.rivers) {
      addBuffer(buffers, river.controlPoints.buffer);
      addBuffer(buffers, river.widthProfile.buffer);
      addBuffer(buffers, river.levelProfile.buffer);
    }
    for (const lake of region.lakes) addBuffer(buffers, lake.center.buffer);
    for (const mouth of region.mouths) addBuffer(buffers, mouth.point.buffer);
  }
  for (const delta of window.authoredHydrology) {
    if (delta.feature.kind === "river") {
      addBuffer(buffers, delta.feature.controlPoints.buffer);
      addBuffer(buffers, delta.feature.widthProfile.buffer);
      addBuffer(buffers, delta.feature.levelProfile.buffer);
    } else addBuffer(buffers, delta.feature.polygon.buffer);
  }
  return Object.freeze([...buffers]);
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
async function buildTransferableEffectiveWindow(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("transferable effective window options are required");
  }
  assertCanonicalRenderKey(options.view, options.renderKey);
  const renderOrigin = chunkOrigin(
    options.renderKey.chunkX,
    options.renderKey.chunkY,
    SURFACE_COMPILE_PROFILE.renderChunkSize
  );
  const originTileX = renderOrigin.x - SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
  const originTileY = renderOrigin.y - SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
  const semanticKeyMap = /* @__PURE__ */ new Map();
  const hydrologyKeyMap = /* @__PURE__ */ new Map();
  for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE; localX += 1) {
    for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE; localY += 1) {
      const canonical = canonicalTile(options.view, originTileX + localX, originTileY + localY);
      if (!canonical) continue;
      const semanticLocation = chunkLocation(canonical.x, canonical.y, WORLD_SEMANTIC_CHUNK_SIZE);
      semanticKeyMap.set(
        coordinateIdentity(semanticLocation.chunkX, semanticLocation.chunkY),
        { x: semanticLocation.chunkX, y: semanticLocation.chunkY }
      );
      const hydrologyLocation = chunkLocation(canonical.x, canonical.y, HYDROLOGY_REGION_SIZE);
      hydrologyKeyMap.set(
        coordinateIdentity(hydrologyLocation.chunkX, hydrologyLocation.chunkY),
        { x: hydrologyLocation.chunkX, y: hydrologyLocation.chunkY }
      );
    }
  }
  const semanticKeys = [...semanticKeyMap.values()].sort(compareCoordinate);
  const hydrologyKeys = [...hydrologyKeyMap.values()].sort(compareCoordinate);
  const semanticLeases = await loadSemanticLeases(options.view, semanticKeys, options.request);
  let hydrologyLeases = [];
  try {
    hydrologyLeases = await loadHydrologyLeases(options.view, hydrologyKeys, options.request);
    const semanticByKey = new Map(semanticLeases.map((chunk) => [
      coordinateIdentity(chunk.key.chunkX, chunk.key.chunkY),
      chunk
    ]));
    const valid = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const substrateClass = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const macroHeight = new Uint16Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const biomeWeights = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT * 4);
    const climate = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    const vegetationProfile = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
    for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE; localX += 1) {
      for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE; localY += 1) {
        const index = localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
        const canonical = canonicalTile(options.view, originTileX + localX, originTileY + localY);
        if (!canonical) continue;
        const location = chunkLocation(canonical.x, canonical.y, WORLD_SEMANTIC_CHUNK_SIZE);
        const chunk = semanticByKey.get(coordinateIdentity(location.chunkX, location.chunkY));
        if (!chunk) throw new Error("effective semantic window lost one loaded chunk lease");
        const tile = getEffectiveSemanticTile(chunk, location.localX, location.localY);
        valid[index] = 1;
        substrateClass[index] = tile.substrateClass;
        macroHeight[index] = tile.macroHeight;
        biomeWeights.set(tile.biomeWeights, index * 4);
        climate[index * 2] = tile.temperature;
        climate[index * 2 + 1] = tile.moisture;
        vegetationDensity[index] = tile.vegetationDensity;
        vegetationProfile[index] = tile.vegetationProfile;
      }
    }
    const authoredById = /* @__PURE__ */ new Map();
    const featureDependencyIds = /* @__PURE__ */ new Set();
    for (const region of hydrologyLeases) {
      for (const delta of region.authoredFeatures) authoredById.set(delta.featureId, delta);
      for (const featureId of region.suppressedBaseFeatureIds) featureDependencyIds.add(featureId);
    }
    for (const delta of [...authoredById.values()]) {
      if (delta.feature.kind !== "river" || delta.feature.outlet.kind !== "lake") continue;
      const target = options.view.deltaSnapshot.getHydrologyDelta(delta.feature.outlet.bodyId);
      if (!target) continue;
      if (target.operation !== "upsert" || target.feature.kind !== "lake") {
        throw new Error("effective window authored river lost its lake outlet body");
      }
      authoredById.set(target.featureId, target);
    }
    for (const featureId of authoredById.keys()) featureDependencyIds.add(featureId);
    const authoredHydrology = Object.freeze([...authoredById.values()].sort((first, second) => first.featureId < second.featureId ? -1 : 1).map(cloneAuthoredDelta));
    const hydrologyRegions = Object.freeze(hydrologyLeases.slice().sort((first, second) => first.key.regionX - second.key.regionX || first.key.regionY - second.key.regionY).map(cloneHydrologySlice));
    const dependencyKey = createSurfaceDependencyKey({
      worldIdentity: options.view.worldIdentity,
      renderKey: options.renderKey,
      metrics: options.metrics,
      semantic: semanticLeases.map((chunk) => ({
        key: chunk.key,
        baseRevision: chunk.baseRevision,
        deltaRevision: chunk.deltaRevision
      })).sort((first, second) => first.key.chunkX - second.key.chunkX || first.key.chunkY - second.key.chunkY),
      hydrologyRegions: hydrologyLeases.map((region) => ({ key: region.key, baseRevision: region.baseRevision })).sort((first, second) => first.key.regionX - second.key.regionX || first.key.regionY - second.key.regionY),
      hydrologyFeatures: [...featureDependencyIds].sort().map((featureId) => {
        const delta = options.view.deltaSnapshot.getHydrologyDelta(featureId);
        if (!delta) throw new Error("effective window lost a hydrology feature dependency");
        return {
          featureId,
          featureKind: delta.featureKind,
          revision: delta.revision
        };
      })
    });
    const window = Object.freeze({
      formatVersion: TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION,
      worldIdentity: options.view.worldIdentity,
      effectiveRevision: options.view.effectiveRevision,
      seaLevel: options.view.descriptor.seaLevel,
      domain: transferableWorldDomain(options.view),
      renderKey: dependencyKey.renderKey,
      originTileX,
      originTileY,
      valid,
      substrateClass,
      macroHeight,
      biomeWeights,
      climate,
      vegetationDensity,
      vegetationProfile,
      hydrologyRegions,
      authoredHydrology,
      dependencyKey
    });
    assertTransferableEffectiveWindow(window);
    transferableEffectiveWindowTransferables(window);
    return window;
  } finally {
    for (const chunk of semanticLeases) options.view.releaseSemanticChunk(chunk);
    for (const region of hydrologyLeases) options.view.releaseHydrologyRegion(region);
  }
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
function positiveModulo2(value, modulus) {
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
  if (map.wrapX) normalizedX = positiveModulo2(normalizedX, map.w);
  else if (normalizedX < 0 || normalizedX >= map.w) return null;
  if (map.wrapY) normalizedY = positiveModulo2(normalizedY, map.h);
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
  return positiveModulo2(column, 2) === 0 ? 0.5 : 0;
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
function compiledWaterBodyPaletteIndex(palette, bodyId) {
  assertCompiledWaterBodyPalette(palette);
  assertBodyId(bodyId);
  let minimum = 0;
  let maximum = palette.entries.length - 1;
  while (minimum <= maximum) {
    const middle = minimum + maximum >>> 1;
    const candidate = palette.entries[middle].bodyId;
    if (candidate === bodyId) return middle + 1;
    if (candidate < bodyId) minimum = middle + 1;
    else maximum = middle - 1;
  }
  return 0;
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
  const offsets2 = [];
  for (let image = first; image <= last; image += 1) offsets2.push(image * period);
  return offsets2;
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

// src/world/HydrologyGeometry.ts
var HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES = 0.5;
var HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES = 0.25;
function hydrologyRiverHalfWidthTiles(widthClass2) {
  if (!Number.isInteger(widthClass2) || widthClass2 <= 0 || widthClass2 > 255) {
    throw new RangeError("hydrology river width class must be a positive uint8 value");
  }
  return HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES + widthClass2 * HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES;
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

// src/world/CompiledSurfaceBounds.ts
var COMPILED_SURFACE_BOUNDS_FORMAT_VERSION = 1;
function finiteOrdered(name, minimum, maximum) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new RangeError(`${name} bounds must be finite and ordered`);
  }
}
function assertCompiledSurfaceBounds(bounds) {
  if (!bounds || typeof bounds !== "object" || bounds.formatVersion !== COMPILED_SURFACE_BOUNDS_FORMAT_VERSION) {
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
  const includeWater = (localU, localV) => {
    sampler.sampleBilinear(localU, localV, sample);
    if (!(sample.waterCoverage > 0) || sample.waterBodyIndex === 0) {
      throw new Error("compiled water geometry vertex has no sampleable water payload");
    }
    minimumWaterHeight = Math.min(minimumWaterHeight, sample.waterLevel);
    maximumWaterHeight = Math.max(maximumWaterHeight, sample.waterLevel);
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
  const bounds = Object.freeze({
    formatVersion: COMPILED_SURFACE_BOUNDS_FORMAT_VERSION,
    minimumX,
    maximumX,
    minimumZ,
    maximumZ,
    minimumGroundHeight,
    maximumGroundHeight,
    minimumWaterHeight: waterMinimum,
    maximumWaterHeight: waterMaximum,
    minimumBaseHeight: waterMinimum === null ? minimumGroundHeight : Math.min(minimumGroundHeight, waterMinimum),
    maximumBaseHeight: waterMaximum === null ? maximumGroundHeight : Math.max(maximumGroundHeight, waterMaximum)
  });
  assertCompiledSurfaceBounds(bounds);
  return bounds;
}

// src/rendering/SurfaceTexturePool.ts
import {
  ByteType,
  ClampToEdgeWrapping,
  DataArrayTexture,
  HalfFloatType,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  RGFormat,
  UnsignedByteType
} from "three";
var SURFACE_STATIC_GPU_BYTES_PER_TEXEL = 18;
var SURFACE_FOG_GPU_BYTES_PER_TEXEL = 1;
var SURFACE_TEXTURE_PAGE_GPU_BYTES = COMPILED_SURFACE_TEXEL_COUNT * SURFACE_COMPILE_PROFILE.pageLayers * (SURFACE_STATIC_GPU_BYTES_PER_TEXEL + SURFACE_FOG_GPU_BYTES_PER_TEXEL);
function positiveSafeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
function assertSlotHandle(handle) {
  if (!handle || typeof handle !== "object" || !Number.isSafeInteger(handle.pageIndex) || handle.pageIndex < 0 || !Number.isInteger(handle.layerIndex) || handle.layerIndex < 0 || handle.layerIndex >= SURFACE_COMPILE_PROFILE.pageLayers || !Number.isSafeInteger(handle.generation) || handle.generation <= 0) {
    throw new TypeError("surface texture slot handle is invalid");
  }
}
function readSurfaceArrayTextureCapabilities(source) {
  if (!source || typeof source !== "object" || typeof source.getParameter !== "function" || typeof source.texStorage3D !== "function") {
    throw new TypeError("surface texture pool requires a WebGL2 capability source");
  }
  const maxTextureSize = source.getParameter(source.MAX_TEXTURE_SIZE);
  const maxArrayTextureLayers = source.getParameter(source.MAX_ARRAY_TEXTURE_LAYERS);
  if (!Number.isInteger(maxTextureSize) || maxTextureSize < SURFACE_COMPILE_PROFILE.textureLayerSize || !Number.isInteger(maxArrayTextureLayers) || maxArrayTextureLayers < SURFACE_COMPILE_PROFILE.pageLayers) {
    throw new Error("WebGL2 does not satisfy the frozen surface array-texture profile");
  }
  return Object.freeze({
    maxTextureSize,
    maxArrayTextureLayers
  });
}
function configureTexture(texture, name, internalFormat) {
  texture.name = name;
  texture.internalFormat = internalFormat;
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  return texture;
}
function createPageResources(pageIndex) {
  const width = SURFACE_COMPILE_PROFILE.textureLayerSize;
  const layers = SURFACE_COMPILE_PROFILE.pageLayers;
  const texels = COMPILED_SURFACE_TEXEL_COUNT * layers;
  const elevationData = new Uint16Array(texels * 4);
  const materialData = new Uint8Array(texels * 4);
  const flowData = new Int8Array(texels * 2);
  const waterData = new Uint8Array(texels * 4);
  const fogData = new Uint8Array(texels);
  const elevation = configureTexture(
    new DataArrayTexture(elevationData, width, width, layers),
    `surface-elevation-page-${pageIndex}`,
    "RGBA16F"
  );
  elevation.format = RGBAFormat;
  elevation.type = HalfFloatType;
  const material = configureTexture(
    new DataArrayTexture(materialData, width, width, layers),
    `surface-material-page-${pageIndex}`,
    "RGBA8"
  );
  material.format = RGBAFormat;
  material.type = UnsignedByteType;
  const flow = configureTexture(
    new DataArrayTexture(flowData, width, width, layers),
    `surface-flow-page-${pageIndex}`,
    "RG8_SNORM"
  );
  flow.format = RGFormat;
  flow.type = ByteType;
  const water = configureTexture(
    new DataArrayTexture(waterData, width, width, layers),
    `surface-water-page-${pageIndex}`,
    "RGBA8"
  );
  water.format = RGBAFormat;
  water.type = UnsignedByteType;
  const fog = configureTexture(
    new DataArrayTexture(fogData, width, width, layers),
    `surface-fog-page-${pageIndex}`,
    "R8"
  );
  fog.format = RedFormat;
  fog.type = UnsignedByteType;
  return {
    pageIndex,
    elevation,
    material,
    flow,
    water,
    fog,
    elevationData,
    materialData,
    flowData,
    waterData,
    fogData
  };
}
function markLayer(texture, layerIndex) {
  texture.addLayerUpdate(layerIndex);
  texture.needsUpdate = true;
}
function markAllLayerResources(resources, layerIndex) {
  markLayer(resources.elevation, layerIndex);
  markLayer(resources.material, layerIndex);
  markLayer(resources.flow, layerIndex);
  markLayer(resources.water, layerIndex);
  markLayer(resources.fog, layerIndex);
}
function disposePageResources(resources) {
  resources.elevation.dispose();
  resources.material.dispose();
  resources.flow.dispose();
  resources.water.dispose();
  resources.fog.dispose();
}
var SurfaceTexturePool = class {
  constructor(capabilitySource, options) {
    this.pages = [];
    this.residentSlots = 0;
    this.disposed = false;
    readSurfaceArrayTextureCapabilities(capabilitySource);
    if (!options || typeof options !== "object") {
      throw new TypeError("surface texture pool options are required");
    }
    positiveSafeInteger("surface texture maximum page count", options.maximumPages);
    this.maximumPages = options.maximumPages;
    if (!Number.isSafeInteger(this.maximumPages * SURFACE_COMPILE_PROFILE.pageLayers) || !Number.isSafeInteger(this.maximumPages * SURFACE_TEXTURE_PAGE_GPU_BYTES)) {
      throw new RangeError("surface texture pool capacity exceeds the safe integer range");
    }
  }
  allocate() {
    this.assertActive();
    let page = this.pages.find((candidate) => candidate.residentSlots < SURFACE_COMPILE_PROFILE.pageLayers);
    if (!page) {
      if (this.pages.length >= this.maximumPages) {
        throw new Error("surface texture pool exhausted its fixed page budget");
      }
      page = {
        pageIndex: this.pages.length,
        generation: new Array(SURFACE_COMPILE_PROFILE.pageLayers).fill(1),
        allocated: new Uint8Array(SURFACE_COMPILE_PROFILE.pageLayers),
        residentSlots: 0
      };
      this.pages.push(page);
    }
    const layerIndex = page.allocated.indexOf(0);
    if (layerIndex < 0) throw new Error("surface texture page free-slot accounting is inconsistent");
    page.allocated[layerIndex] = 1;
    page.residentSlots += 1;
    this.residentSlots += 1;
    const resources = this.resourcesFor(page);
    this.clearLayer(resources, layerIndex);
    markAllLayerResources(resources, layerIndex);
    return Object.freeze({
      pageIndex: page.pageIndex,
      layerIndex,
      generation: page.generation[layerIndex]
    });
  }
  release(handle) {
    assertSlotHandle(handle);
    if (!this.isCurrent(handle)) return false;
    const page = this.pages[handle.pageIndex];
    if (page.generation[handle.layerIndex] >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("surface texture slot generation space is exhausted");
    }
    page.allocated[handle.layerIndex] = 0;
    page.generation[handle.layerIndex] += 1;
    page.residentSlots -= 1;
    this.residentSlots -= 1;
    if (page.residentSlots === 0 && page.resources) {
      disposePageResources(page.resources);
      page.resources = void 0;
    }
    return true;
  }
  isCurrent(handle) {
    assertSlotHandle(handle);
    if (this.disposed) return false;
    const page = this.pages[handle.pageIndex];
    return page !== void 0 && page.allocated[handle.layerIndex] === 1 && page.generation[handle.layerIndex] === handle.generation;
  }
  uploadSurface(handle, field2) {
    assertSlotHandle(handle);
    if (!this.isCurrent(handle)) return false;
    assertCompiledSurfaceField(field2);
    const resources = this.resourcesFor(this.pages[handle.pageIndex]);
    const texelOffset = handle.layerIndex * COMPILED_SURFACE_TEXEL_COUNT;
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    for (let texelX = 0; texelX < size; texelX += 1) {
      for (let texelY = 0; texelY < size; texelY += 1) {
        const source = texelX * size + texelY;
        const destination = texelOffset + texelY * size + texelX;
        const elevation = destination * 4;
        const material = destination * 4;
        const sourceMaterial = source * 4;
        const packedFlow = destination * 2;
        const sourceFlow = source * 2;
        resources.elevationData[elevation] = field2.groundHeight[source];
        resources.elevationData[elevation + 1] = field2.waterLevel[source];
        resources.elevationData[elevation + 2] = field2.waterDepth[source];
        resources.elevationData[elevation + 3] = field2.shorelineDistance[source];
        resources.materialData[material] = field2.materialWeights[sourceMaterial];
        resources.materialData[material + 1] = field2.materialWeights[sourceMaterial + 1];
        resources.materialData[material + 2] = field2.materialWeights[sourceMaterial + 2];
        resources.materialData[material + 3] = field2.materialWeights[sourceMaterial + 3];
        resources.flowData[packedFlow] = field2.flow[sourceFlow];
        resources.flowData[packedFlow + 1] = field2.flow[sourceFlow + 1];
        resources.waterData[elevation] = field2.waterCoverage[source];
        resources.waterData[elevation + 1] = field2.waterKind[source];
        resources.waterData[elevation + 2] = field2.waterProfile[source];
        resources.waterData[elevation + 3] = 0;
      }
    }
    markLayer(resources.elevation, handle.layerIndex);
    markLayer(resources.material, handle.layerIndex);
    markLayer(resources.flow, handle.layerIndex);
    markLayer(resources.water, handle.layerIndex);
    return true;
  }
  uploadFog(handle, fog) {
    assertSlotHandle(handle);
    if (!this.isCurrent(handle)) return false;
    if (!(fog instanceof Uint8Array) || fog.length !== COMPILED_SURFACE_TEXEL_COUNT) {
      throw new TypeError("surface fog layer does not match the fixed physical texture layout");
    }
    const resources = this.resourcesFor(this.pages[handle.pageIndex]);
    const texelOffset = handle.layerIndex * COMPILED_SURFACE_TEXEL_COUNT;
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    for (let texelX = 0; texelX < size; texelX += 1) {
      for (let texelY = 0; texelY < size; texelY += 1) {
        resources.fogData[texelOffset + texelY * size + texelX] = fog[texelX * size + texelY];
      }
    }
    markLayer(resources.fog, handle.layerIndex);
    return true;
  }
  getPageBindings(pageIndex) {
    this.assertActive();
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new RangeError("surface texture page index must be a non-negative integer");
    }
    const resources = this.pages[pageIndex]?.resources;
    if (!resources) return void 0;
    return Object.freeze({
      pageIndex,
      elevation: resources.elevation,
      material: resources.material,
      flow: resources.flow,
      water: resources.water,
      fog: resources.fog
    });
  }
  restoreContext() {
    this.assertActive();
    for (const page of this.pages) {
      if (!page.resources) continue;
      const textures = [
        page.resources.elevation,
        page.resources.material,
        page.resources.flow,
        page.resources.water,
        page.resources.fog
      ];
      for (const texture of textures) texture.clearLayerUpdates();
      for (let layerIndex = 0; layerIndex < page.allocated.length; layerIndex += 1) {
        if (page.allocated[layerIndex] === 1) {
          for (const texture of textures) texture.addLayerUpdate(layerIndex);
        }
      }
      for (const texture of textures) texture.needsUpdate = true;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const page of this.pages) {
      if (page.resources) disposePageResources(page.resources);
      page.resources = void 0;
      page.allocated.fill(0);
      page.residentSlots = 0;
    }
    this.residentSlots = 0;
  }
  get stats() {
    const allocatedPages = this.pages.reduce(
      (count, page) => count + (page.resources ? 1 : 0),
      0
    );
    return Object.freeze({
      maximumPages: this.maximumPages,
      pageRecords: this.pages.length,
      allocatedPages,
      residentSlots: this.residentSlots,
      maximumSlots: this.maximumPages * SURFACE_COMPILE_PROFILE.pageLayers,
      allocatedGpuBytes: allocatedPages * SURFACE_TEXTURE_PAGE_GPU_BYTES,
      stagingBytes: allocatedPages * SURFACE_TEXTURE_PAGE_GPU_BYTES
    });
  }
  resourcesFor(page) {
    if (!page.resources) page.resources = createPageResources(page.pageIndex);
    return page.resources;
  }
  clearLayer(resources, layerIndex) {
    const texelOffset = layerIndex * COMPILED_SURFACE_TEXEL_COUNT;
    resources.elevationData.fill(0, texelOffset * 4, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 4);
    resources.materialData.fill(0, texelOffset * 4, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 4);
    resources.flowData.fill(0, texelOffset * 2, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 2);
    resources.waterData.fill(0, texelOffset * 4, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 4);
    resources.fogData.fill(0, texelOffset, texelOffset + COMPILED_SURFACE_TEXEL_COUNT);
  }
  assertActive() {
    if (this.disposed) throw new Error("surface texture pool has been disposed");
  }
};

// src/rendering/SurfaceGroundGeometry.ts
import { BufferAttribute, BufferGeometry } from "three";
var SURFACE_GROUND_LODS = Object.freeze([
  "near",
  "mid",
  "far"
]);
var LOD_STRIDE_TEXELS = Object.freeze({
  near: 1,
  mid: 2,
  far: 4
});
function assertLod(lod) {
  if (lod !== "near" && lod !== "mid" && lod !== "far") {
    throw new TypeError("surface ground LOD is invalid");
  }
}
function vertexKey(gridX, gridY) {
  return `${gridX}:${gridY}`;
}
function addVertex(output, gridX, gridY) {
  const key = vertexKey(gridX, gridY);
  const existing = output.vertices.get(key);
  if (existing !== void 0) return existing;
  const index = output.positions.length / 3;
  const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const localU = -0.5 + gridX / samplesPerTile;
  const localV = -0.5 + gridY / samplesPerTile;
  output.positions.push(localU, 0, localV);
  output.surfaceFieldCoordinates.push(
    gridX - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels,
    gridY - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels
  );
  output.vertices.set(key, index);
  return index;
}
function addUpwardTriangle(output, first, second, third) {
  const area = (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
  if (area === 0) throw new Error("surface ground topology produced a degenerate triangle");
  const firstIndex = addVertex(output, first[0], first[1]);
  const secondIndex = addVertex(output, second[0], second[1]);
  const thirdIndex = addVertex(output, third[0], third[1]);
  if (area < 0) output.indices.push(firstIndex, secondIndex, thirdIndex);
  else output.indices.push(firstIndex, thirdIndex, secondIndex);
}
function addRegularGrid(output, minimum, maximum, stride) {
  for (let gridX = minimum; gridX < maximum; gridX += stride) {
    for (let gridY = minimum; gridY < maximum; gridY += stride) {
      const bottomLeft = [gridX, gridY];
      const bottomRight = [gridX + stride, gridY];
      const topLeft = [gridX, gridY + stride];
      const topRight = [gridX + stride, gridY + stride];
      addUpwardTriangle(output, bottomLeft, topRight, bottomRight);
      addUpwardTriangle(output, bottomLeft, topLeft, topRight);
    }
  }
}
function addTransitionStrip(output, outer, inner) {
  let outerIndex = 0;
  let innerIndex = 0;
  const outerLast = outer.length - 1;
  const innerLast = inner.length - 1;
  while (outerIndex < outerLast || innerIndex < innerLast) {
    const nextOuter = outerIndex < outerLast ? (outerIndex + 1) / outerLast : Number.POSITIVE_INFINITY;
    const nextInner = innerIndex < innerLast ? (innerIndex + 1) / innerLast : Number.POSITIVE_INFINITY;
    if (nextOuter <= nextInner) {
      addUpwardTriangle(
        output,
        outer[outerIndex],
        inner[innerIndex],
        outer[outerIndex + 1]
      );
      outerIndex += 1;
    } else {
      addUpwardTriangle(
        output,
        outer[outerIndex],
        inner[innerIndex],
        inner[innerIndex + 1]
      );
      innerIndex += 1;
    }
  }
}
function inclusiveRange(start, end, step) {
  const values = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}
function buildTransitionGround(output, stride) {
  const end = SURFACE_CORE_TEXELS;
  const innerStart = stride;
  const innerEnd = end - stride;
  const fine = inclusiveRange(0, end, 1);
  const coarse = inclusiveRange(innerStart, innerEnd, stride);
  addRegularGrid(output, innerStart, innerEnd, stride);
  addTransitionStrip(
    output,
    fine.map((value) => [value, 0]),
    coarse.map((value) => [value, innerStart])
  );
  addTransitionStrip(
    output,
    fine.map((value) => [value, end]),
    coarse.map((value) => [value, innerEnd])
  );
  addTransitionStrip(
    output,
    fine.map((value) => [0, value]),
    coarse.map((value) => [innerStart, value])
  );
  addTransitionStrip(
    output,
    fine.map((value) => [end, value]),
    coarse.map((value) => [innerEnd, value])
  );
}
function edgeKey(first, second) {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}
function assertSurfaceGroundGeometryData(data) {
  if (!data || typeof data !== "object") throw new TypeError("surface ground geometry data is required");
  assertLod(data.lod);
  const expectedStride = LOD_STRIDE_TEXELS[data.lod];
  const vertexCount = data.positions.length / 3;
  if (data.interiorStrideTexels !== expectedStride || !(data.positions instanceof Float32Array) || data.positions.length % 3 !== 0 || !(data.surfaceFieldCoordinates instanceof Float32Array) || data.surfaceFieldCoordinates.length !== vertexCount * 2 || !(data.indices instanceof Uint16Array) || data.indices.length === 0 || data.indices.length % 3 !== 0 || vertexCount > 65535) {
    throw new TypeError("surface ground geometry arrays or LOD stride are invalid");
  }
  const coordinateIndex = /* @__PURE__ */ new Map();
  const size = SURFACE_COMPILE_PROFILE.renderChunkSize;
  let totalArea = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const u = data.positions[index * 3];
    const y = data.positions[index * 3 + 1];
    const v = data.positions[index * 3 + 2];
    if (!Number.isFinite(u) || y !== 0 || !Number.isFinite(v) || u < -0.5 || u > size - 0.5 || v < -0.5 || v > size - 0.5) {
      throw new RangeError("surface ground vertex is outside its canonical logical bounds");
    }
    const key = `${u}:${v}`;
    if (coordinateIndex.has(key)) throw new Error("surface ground geometry contains duplicate vertices");
    coordinateIndex.set(key, index);
    const fieldX = data.surfaceFieldCoordinates[index * 2];
    const fieldY = data.surfaceFieldCoordinates[index * 2 + 1];
    const expectedFieldX = (u + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels;
    const expectedFieldY = (v + 0.5) * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5 + SURFACE_COMPILE_PROFILE.gutterTexels;
    if (fieldX !== expectedFieldX || fieldY !== expectedFieldY) {
      throw new Error("surface ground field coordinate drifted from its texel-center phase");
    }
  }
  const edgeUses = /* @__PURE__ */ new Map();
  for (let offset = 0; offset < data.indices.length; offset += 3) {
    const first = data.indices[offset];
    const second = data.indices[offset + 1];
    const third = data.indices[offset + 2];
    if (first >= vertexCount || second >= vertexCount || third >= vertexCount || first === second || second === third || first === third) {
      throw new RangeError("surface ground triangle index is invalid");
    }
    const firstU = data.positions[first * 3];
    const firstV = data.positions[first * 3 + 2];
    const secondU = data.positions[second * 3];
    const secondV = data.positions[second * 3 + 2];
    const thirdU = data.positions[third * 3];
    const thirdV = data.positions[third * 3 + 2];
    const area = (secondU - firstU) * (thirdV - firstV) - (secondV - firstV) * (thirdU - firstU);
    if (!(area < 0)) throw new Error("surface ground triangles must face positive world Y");
    totalArea += -area * 0.5;
    for (const [edgeFirst, edgeSecond] of [
      [first, second],
      [second, third],
      [third, first]
    ]) {
      const key = edgeKey(edgeFirst, edgeSecond);
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    }
  }
  if (Math.abs(totalArea - size * size) > 1e-9) {
    throw new Error("surface ground triangles do not cover the canonical chunk exactly");
  }
  const boundaryStep = 1 / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
  const maximumBoundary = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
  const boundaryEdges = /* @__PURE__ */ new Set();
  for (let index = 0; index < SURFACE_CORE_TEXELS; index += 1) {
    const start = -0.5 + index * boundaryStep;
    const end = start + boundaryStep;
    for (const [firstKey, secondKey] of [
      [`${start}:${-0.5}`, `${end}:${-0.5}`],
      [`${start}:${maximumBoundary}`, `${end}:${maximumBoundary}`],
      [`${-0.5}:${start}`, `${-0.5}:${end}`],
      [`${maximumBoundary}:${start}`, `${maximumBoundary}:${end}`]
    ]) {
      const first = coordinateIndex.get(firstKey);
      const second = coordinateIndex.get(secondKey);
      if (first === void 0 || second === void 0) {
        throw new Error("surface ground LOD omitted a canonical boundary vertex");
      }
      boundaryEdges.add(edgeKey(first, second));
    }
  }
  for (const [edge, uses] of edgeUses) {
    if (uses !== (boundaryEdges.has(edge) ? 1 : 2)) {
      throw new Error("surface ground topology is non-manifold or contains a T-junction");
    }
  }
  if (boundaryEdges.size !== SURFACE_CORE_TEXELS * 4 || [...boundaryEdges].some((edge) => edgeUses.get(edge) !== 1)) {
    throw new Error("surface ground topology does not own every canonical boundary segment exactly once");
  }
}
function createSurfaceGroundGeometryData(lod) {
  assertLod(lod);
  const output = {
    positions: [],
    surfaceFieldCoordinates: [],
    indices: [],
    vertices: /* @__PURE__ */ new Map()
  };
  const stride = LOD_STRIDE_TEXELS[lod];
  if (stride === 1) addRegularGrid(output, 0, SURFACE_CORE_TEXELS, 1);
  else buildTransitionGround(output, stride);
  const data = Object.freeze({
    lod,
    interiorStrideTexels: stride,
    positions: new Float32Array(output.positions),
    surfaceFieldCoordinates: new Float32Array(output.surfaceFieldCoordinates),
    indices: new Uint16Array(output.indices)
  });
  assertSurfaceGroundGeometryData(data);
  return data;
}
function createSurfaceGroundGeometry(lod) {
  const data = createSurfaceGroundGeometryData(lod);
  const geometry = new BufferGeometry();
  geometry.name = `surface-ground-${lod}`;
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("surfaceFieldCoordinate", new BufferAttribute(data.surfaceFieldCoordinates, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.surfaceGroundLod = lod;
  geometry.userData.interiorStrideTexels = data.interiorStrideTexels;
  return geometry;
}
var SurfaceGroundGeometrySet = class {
  constructor() {
    this.geometries = /* @__PURE__ */ new Map();
    this.disposed = false;
    for (const lod of SURFACE_GROUND_LODS) this.geometries.set(lod, createSurfaceGroundGeometry(lod));
  }
  get(lod) {
    if (this.disposed) throw new Error("surface ground geometry set has been disposed");
    assertLod(lod);
    const geometry = this.geometries.get(lod);
    if (!geometry) throw new Error("surface ground geometry set lost a frozen LOD");
    return geometry;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
  }
};

// src/rendering/SurfaceWaterGeometry.ts
import { BufferAttribute as BufferAttribute2, BufferGeometry as BufferGeometry2 } from "three";
function createSurfaceCoverageGeometry(compiled) {
  assertCompiledWaterGeometry(compiled);
  if (compiled.kind !== "coverage") {
    throw new TypeError("surface coverage BufferGeometry requires compiled coverage buffers");
  }
  const geometry = new BufferGeometry2();
  geometry.name = "surface-water-coverage";
  geometry.setAttribute("position", new BufferAttribute2(compiled.positions, 3));
  geometry.setAttribute(
    "surfaceFieldCoordinate",
    new BufferAttribute2(compiled.surfaceFieldCoordinates, 2)
  );
  geometry.setIndex(new BufferAttribute2(compiled.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.surfaceWaterGeometryKind = "coverage";
  return geometry;
}
var SurfaceWaterGeometryBinding = class {
  constructor(compiled, sharedGround) {
    this.disposed = false;
    assertCompiledWaterGeometry(compiled);
    if (!(sharedGround instanceof SurfaceGroundGeometrySet)) {
      throw new TypeError("surface water geometry requires the shared ground topology owner");
    }
    this.kind = compiled.kind;
    this.geometry = compiled.kind === "none" ? void 0 : compiled.kind === "fullPatch" ? sharedGround.get("near") : createSurfaceCoverageGeometry(compiled);
    this.ownsGeometry = compiled.kind === "coverage";
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.ownsGeometry) this.geometry?.dispose();
  }
  get isDisposed() {
    return this.disposed;
  }
};

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
function positiveModulo3(value, modulus) {
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
    positiveModulo3(gx, px),
    positiveModulo3(gy, py)
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
var positiveModulo4 = (value, modulus) => (value % modulus + modulus) % modulus;
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
    periodX === void 0 ? cellX : positiveModulo4(cellX, periodX),
    periodY === void 0 ? cellY : positiveModulo4(cellY, periodY)
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
  const sampleX = wrapWidth === void 0 ? x : positiveModulo4(x, wrapWidth);
  const sampleY = wrapHeight === void 0 ? y : positiveModulo4(y, wrapHeight);
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
function generateBaseSemanticChunk(options) {
  if (!options || typeof options !== "object") throw new TypeError("semantic chunk generation options are required");
  return createBaseSemanticChunkGenerator(options.descriptor).generate(options.chunkX, options.chunkY);
}
function semanticGeneratorIdentity(descriptor) {
  assertCoreDescriptor(descriptor);
  return serializeWorldDescriptorV2(descriptor);
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
function assertRevision2(name, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
function assertFeatureId2(name, featureId) {
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
    controlPoints: feature.controlPoints.slice(),
    widthProfile: feature.widthProfile.slice(),
    levelProfile: feature.levelProfile.slice()
  } : {
    ...feature,
    polygon: feature.polygon.slice()
  };
}
function assertGraphNode(node, expectedId) {
  if (!node || typeof node !== "object" || node.featureId !== expectedId) {
    throw new TypeError("base hydrology feature index returned a mismatched feature identity");
  }
  assertFeatureId2("base hydrology feature", node.featureId);
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
  if (node.source.kind === "spring") assertFeatureId2("base hydrology spring", node.source.sourceId);
  else if (node.source.kind === "river") assertFeatureId2("base hydrology source river", node.source.riverId);
  else throw new TypeError("base hydrology river source kind is invalid");
  if (node.outlet.kind === "ocean") {
    if (node.outlet.bodyId !== "ocean") throw new Error("base hydrology ocean outlet must use ocean");
  } else if (node.outlet.kind === "lake") assertFeatureId2("base hydrology outlet lake", node.outlet.bodyId);
  else if (node.outlet.kind === "river") assertFeatureId2("base hydrology outlet river", node.outlet.riverId);
  else throw new TypeError("base hydrology river outlet kind is invalid");
}
function assertCanonicalReferences(featureId, references) {
  if (!Array.isArray(references)) {
    throw new TypeError("base hydrology reverse references must be an array");
  }
  let previous;
  for (const reference of references) {
    assertFeatureId2("base hydrology reverse reference", reference);
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
    assertFeatureId2("hydrology snapshot feature", featureId);
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
  commit(input) {
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
      revision
    ));
    const hydrologyChanges = hydrologyMutations.map((mutation) => this.applyHydrologyMutation(
      hydrologyById,
      mutation,
      revision
    ));
    this.assertEffectiveHydrologyGraph(hydrologyById, hydrologyMutations);
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
    this.current = next;
    return commit;
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
      assertRevision2("surface semantic expected revision", mutation.expectedRevision);
      const identity = semanticKeyIdentity(mutation.key);
      if (semanticKeys.has(identity)) throw new Error("surface delta transaction contains duplicate semantic chunks");
      semanticKeys.add(identity);
    }
    const featureIds = /* @__PURE__ */ new Set();
    for (const mutation of input.hydrologyMutations) {
      if (!mutation || typeof mutation !== "object" || mutation.operation !== "upsert" && mutation.operation !== "delete") {
        throw new TypeError("surface hydrology mutation operation is invalid");
      }
      assertFeatureId2("surface hydrology mutation", mutation.featureId);
      if (mutation.featureKind !== "river" && mutation.featureKind !== "lake") {
        throw new TypeError("surface hydrology mutation kind is invalid");
      }
      assertRevision2("surface hydrology expected revision", mutation.expectedRevision);
      if (featureIds.has(mutation.featureId)) {
        throw new Error("surface delta transaction contains duplicate hydrology features");
      }
      featureIds.add(mutation.featureId);
    }
  }
  applySemanticMutation(semanticByKey, mutation, revision) {
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
      ...ownedSemanticPayload(mutation.payload),
      worldIdentity: this.worldIdentity,
      key,
      revision
    }, semanticCatalogLimits(this.descriptor));
    assertSemanticDeltaBounds(this.descriptor, delta);
    semanticByKey.set(identity, Object.freeze({ key, revision, delta }));
    return Object.freeze({ operation: "upsert", expectedRevision: mutation.expectedRevision, delta });
  }
  applyHydrologyMutation(hydrologyById, mutation, revision) {
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
      feature: ownedHydrologyFeature(mutation.feature)
    } : {
      worldIdentity: this.worldIdentity,
      revision,
      featureId: mutation.featureId,
      featureKind: mutation.featureKind,
      operation: "delete"
    });
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
  assertEffectiveHydrologyGraph(hydrologyById, mutations) {
    const ids = /* @__PURE__ */ new Set();
    for (const delta of hydrologyById.values()) {
      if (delta.operation === "upsert") ids.add(delta.featureId);
    }
    for (const mutation of mutations) {
      const references = this.baseHydrology.referencesTo(mutation.featureId);
      assertCanonicalReferences(mutation.featureId, references);
      for (const featureId of references) ids.add(featureId);
      if (this.resolveEffectiveHydrologyFeature(mutation.featureId, hydrologyById)) {
        ids.add(mutation.featureId);
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

// src/world/HydrologyFeatureSpatialIndex.ts
var HYDROLOGY_FEATURE_SPATIAL_INDEX_LEAF_SIZE = 8;
var MAX_HYDROLOGY_FEATURE_SPATIAL_INDEX_ITEMS = 16384;
function assertBounds(bounds) {
  if (!bounds || typeof bounds !== "object" || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new RangeError("hydrology feature query bounds are invalid");
  }
}
function boundsForPoints(points, expansion) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < points.length; index += 2) {
    minX = Math.min(minX, points[index]);
    minY = Math.min(minY, points[index + 1]);
    maxX = Math.max(maxX, points[index]);
    maxY = Math.max(maxY, points[index + 1]);
  }
  return Object.freeze({
    minX: minX - expansion,
    minY: minY - expansion,
    maxX: maxX + expansion,
    maxY: maxY + expansion
  });
}
function authoredHydrologyFeatureBoundsQ64(feature) {
  if (!feature || typeof feature !== "object") {
    throw new TypeError("authored hydrology feature is required for spatial bounds");
  }
  if (feature.kind === "lake") return boundsForPoints(feature.polygon, 0);
  let maximumHalfWidth = 0;
  for (const widthClass2 of feature.widthProfile) {
    maximumHalfWidth = Math.max(maximumHalfWidth, hydrologyRiverHalfWidthTiles(widthClass2));
  }
  return boundsForPoints(
    feature.controlPoints,
    maximumHalfWidth * HYDROLOGY_POINT_QUANTIZATION
  );
}
function hydrologyRegionBoundsQ64(region) {
  assertHydrologyRegion(region);
  const origin = chunkOrigin(region.key.regionX, region.key.regionY, HYDROLOGY_REGION_SIZE);
  return Object.freeze({
    minX: origin.x * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2,
    minY: origin.y * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2,
    maxX: (origin.x + region.validBounds.maxXExclusive) * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2,
    maxY: (origin.y + region.validBounds.maxYExclusive) * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2
  });
}
function positiveModulo5(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function periodicIntervals(minimum, maximum, period) {
  const domainMinimum = -HYDROLOGY_POINT_QUANTIZATION / 2;
  const domainMaximum = domainMinimum + period;
  const span = maximum - minimum;
  if (span >= period) return Object.freeze([{ minimum: domainMinimum, maximum: domainMaximum }]);
  const start = domainMinimum + positiveModulo5(minimum - domainMinimum, period);
  const end = start + span;
  return end <= domainMaximum ? Object.freeze([{ minimum: start, maximum: end }]) : Object.freeze([
    { minimum: start, maximum: domainMaximum },
    { minimum: domainMinimum, maximum: domainMinimum + end - domainMaximum }
  ]);
}
function projectedBounds(descriptor, bounds) {
  if (descriptor.sourceKind !== "procedural-toroidal") return Object.freeze([bounds]);
  const periodX = descriptor.width * HYDROLOGY_POINT_QUANTIZATION;
  const periodY = descriptor.height * HYDROLOGY_POINT_QUANTIZATION;
  if (!Number.isSafeInteger(periodX) || !Number.isSafeInteger(periodY)) {
    throw new RangeError("toroidal hydrology q64 period exceeds the safe integer range");
  }
  const xIntervals = periodicIntervals(bounds.minX, bounds.maxX, periodX);
  const yIntervals = periodicIntervals(bounds.minY, bounds.maxY, periodY);
  const output = [];
  for (const x of xIntervals) {
    for (const y of yIntervals) {
      output.push(Object.freeze({
        minX: x.minimum,
        minY: y.minimum,
        maxX: x.maximum,
        maxY: y.maximum
      }));
    }
  }
  return Object.freeze(output);
}
function unionBounds(items, start, end) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = start; index < end; index += 1) {
    const bounds = items[index].bounds;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return { minX, minY, maxX, maxY };
}
function intersects(first, second) {
  return first.minX <= second.maxX && first.maxX >= second.minX && first.minY <= second.maxY && first.maxY >= second.minY;
}
function compareItems(axis, first, second) {
  const firstCenter = axis === "x" ? first.bounds.minX + first.bounds.maxX : first.bounds.minY + first.bounds.maxY;
  const secondCenter = axis === "x" ? second.bounds.minX + second.bounds.maxX : second.bounds.minY + second.bounds.maxY;
  return firstCenter - secondCenter || first.deltaIndex - second.deltaIndex || first.bounds.minX - second.bounds.minX || first.bounds.minY - second.bounds.minY;
}
var HydrologyFeatureSpatialIndex = class {
  constructor(descriptor, deltas) {
    this.nodes = [];
    assertWorldDescriptorV2(descriptor);
    if (!Array.isArray(deltas)) throw new TypeError("hydrology feature spatial index deltas must be an array");
    this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    const upserts = [];
    const items = [];
    let previousId;
    for (const delta of deltas) {
      assertHydrologyFeatureDelta(delta);
      if (delta.worldIdentity !== this.worldIdentity) {
        throw new TypeError("hydrology feature spatial index delta belongs to another world");
      }
      if (previousId !== void 0 && previousId >= delta.featureId) {
        throw new Error("hydrology feature spatial index deltas must use unique ascending feature identities");
      }
      previousId = delta.featureId;
      if (delta.operation === "delete") continue;
      const deltaIndex = upserts.length;
      upserts.push(delta);
      const bounds = authoredHydrologyFeatureBoundsQ64(delta.feature);
      for (const projected of projectedBounds(descriptor, bounds)) {
        items.push({ bounds: projected, deltaIndex });
      }
    }
    if (items.length > MAX_HYDROLOGY_FEATURE_SPATIAL_INDEX_ITEMS) {
      throw new RangeError("hydrology feature spatial index exceeds its fixed item budget");
    }
    this.deltas = Object.freeze(upserts);
    this.items = items;
    this.featureCount = upserts.length;
    this.itemCount = items.length;
    this.root = items.length === 0 ? -1 : this.buildNode(0, items.length);
  }
  query(bounds) {
    assertBounds(bounds);
    if (this.root < 0) return Object.freeze([]);
    const stack = [this.root];
    const matches = /* @__PURE__ */ new Set();
    while (stack.length > 0) {
      const node = this.nodes[stack.pop()];
      if (!intersects(node, bounds)) continue;
      if (node.count > 0) {
        for (let index = node.start; index < node.start + node.count; index += 1) {
          const item = this.items[index];
          if (intersects(item.bounds, bounds)) matches.add(item.deltaIndex);
        }
      } else {
        stack.push(node.left, node.right);
      }
    }
    return Object.freeze([...matches].sort((first, second) => first - second).map((index) => this.deltas[index]));
  }
  queryRegion(region) {
    if (region.worldIdentity !== this.worldIdentity) {
      throw new TypeError("hydrology feature spatial query region belongs to another world");
    }
    return this.query(hydrologyRegionBoundsQ64(region));
  }
  buildNode(start, end) {
    const bounds = unionBounds(this.items, start, end);
    const nodeIndex = this.nodes.length;
    this.nodes.push({ ...bounds, start: 0, count: 0, left: -1, right: -1 });
    const count = end - start;
    if (count <= HYDROLOGY_FEATURE_SPATIAL_INDEX_LEAF_SIZE) {
      this.nodes[nodeIndex] = Object.freeze({ ...bounds, start, count, left: -1, right: -1 });
      return nodeIndex;
    }
    const axis = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY ? "x" : "y";
    const sorted = this.items.slice(start, end).sort((first, second) => compareItems(axis, first, second));
    this.items.splice(start, count, ...sorted);
    const middle = start + Math.floor(count / 2);
    const left = this.buildNode(start, middle);
    const right = this.buildNode(middle, end);
    this.nodes[nodeIndex] = Object.freeze({ ...bounds, start: 0, count: 0, left, right });
    return nodeIndex;
  }
};

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
function createGenerateHydrologyRegionWorkerRequest(requestId, descriptor, key) {
  const request = {
    protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
    generatorVersion: WORLD_GENERATOR_VERSION_V2,
    requestId,
    type: "generateHydrologyRegion",
    descriptor,
    key: Object.freeze({ regionX: key.regionX, regionY: key.regionY })
  };
  assertGenerateHydrologyRegionWorkerRequest(request);
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
  if (response.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION || response.generatorVersion !== WORLD_GENERATOR_VERSION_V2 || !Number.isSafeInteger(response.requestId) || response.requestId <= 0 || response.type !== "generateSemanticChunkResult" && response.type !== "generateHydrologyRegionResult" && response.type !== "surfaceWorkerError") {
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
          if (response.requestType !== request.type) {
            throw new TypeError("surface worker error does not match its pending request type");
          }
          this.pending.delete(response.requestId);
          request.reject(remoteError(response));
          return;
        }
        if (response.type === "generateSemanticChunkResult") {
          if (request.type !== "generateSemanticChunk") {
            throw new TypeError("surface worker semantic result does not match its pending request type");
          }
          const chunk = this.publishChunk(response, request);
          this.pending.delete(response.requestId);
          request.resolve(chunk);
        } else {
          if (request.type !== "generateHydrologyRegion") {
            throw new TypeError("surface worker hydrology result does not match its pending request type");
          }
          const region = this.publishHydrologyRegion(response, request);
          this.pending.delete(response.requestId);
          request.resolve(region);
        }
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
        type: "generateSemanticChunk",
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
  generateHydrologyRegion(options) {
    if (this.disposed) return Promise.reject(new Error("SurfaceWorkerClient has been disposed"));
    if (!options || typeof options !== "object") {
      return Promise.reject(new TypeError("hydrology region worker options are required"));
    }
    if (!Number.isSafeInteger(this.nextRequestId)) {
      return Promise.reject(new RangeError("surface worker request id space is exhausted"));
    }
    const requestId = this.nextRequestId;
    let request;
    try {
      request = createGenerateHydrologyRegionWorkerRequest(requestId, options.descriptor, options.key);
    } catch (reason) {
      return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        type: "generateHydrologyRegion",
        descriptor: options.descriptor,
        key: Object.freeze({ regionX: options.key.regionX, regionY: options.key.regionY }),
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
  publishHydrologyRegion(response, request) {
    const region = response.region;
    const descriptor = request.descriptor;
    const expectedWidth = descriptor.sourceKind === "procedural-toroidal" ? Math.min(HYDROLOGY_REGION_SIZE, descriptor.width - request.key.regionX * HYDROLOGY_REGION_SIZE) : HYDROLOGY_REGION_SIZE;
    const expectedHeight = descriptor.sourceKind === "procedural-toroidal" ? Math.min(HYDROLOGY_REGION_SIZE, descriptor.height - request.key.regionY * HYDROLOGY_REGION_SIZE) : HYDROLOGY_REGION_SIZE;
    if (!region || region.formatVersion !== descriptor.hydrologyRegionFormatVersion || region.worldIdentity !== serializeWorldDescriptorV2(descriptor) || region.topology !== descriptor.topology || region.key?.regionX !== request.key.regionX || region.key?.regionY !== request.key.regionY || region.revision !== HYDROLOGY_REGION_REVISION || region.validBounds?.minX !== 0 || region.validBounds?.minY !== 0 || region.validBounds?.maxXExclusive !== expectedWidth || region.validBounds?.maxYExclusive !== expectedHeight) {
      throw new TypeError("surface worker returned hydrology for the wrong request or world contract");
    }
    return createHydrologyRegion({
      worldIdentity: region.worldIdentity,
      topology: region.topology,
      key: region.key,
      revision: region.revision,
      validBounds: region.validBounds,
      boundaryPorts: region.boundaryPorts,
      rivers: region.rivers,
      lakes: region.lakes,
      mouths: region.mouths,
      bodies: region.bodies
    });
  }
  fail(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.dispose();
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
    this.completedSemanticChunks = 0;
    this.completedHydrologyRegions = 0;
    this.averageSemanticChunkMs = 0;
    this.averageHydrologyRegionMs = 0;
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
    if (!options || typeof options !== "object" || !options.key) {
      return Promise.reject(new TypeError("semantic chunk pool options are required"));
    }
    const taskOptions = Object.freeze({
      descriptor: options.descriptor,
      key: Object.freeze({ chunkX: options.key.chunkX, chunkY: options.key.chunkY })
    });
    return this.enqueueTask(
      "semantic",
      (client) => client.generateSemanticChunk(taskOptions),
      request
    );
  }
  generateHydrologyRegion(options, request = {}) {
    if (!options || typeof options !== "object" || !options.key) {
      return Promise.reject(new TypeError("hydrology region pool options are required"));
    }
    const taskOptions = Object.freeze({
      descriptor: options.descriptor,
      key: Object.freeze({ regionX: options.key.regionX, regionY: options.key.regionY })
    });
    return this.enqueueTask(
      "hydrology",
      (client) => client.generateHydrologyRegion(taskOptions),
      request
    );
  }
  enqueueTask(kind, run, request) {
    if (this.disposed) return Promise.reject(new Error("SurfaceWorkerPool has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const task = {
        kind,
        run,
        resolveResult: (result) => resolve(result),
        signal: request.signal,
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
      completedSemanticChunks: this.completedSemanticChunks,
      completedHydrologyRegions: this.completedHydrologyRegions,
      averageSemanticChunkMs: this.averageSemanticChunkMs,
      averageHydrologyRegionMs: this.averageHydrologyRegionMs
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
      pending = task.run(slot.client);
    } catch (reason) {
      pending = Promise.reject(reason);
    }
    void pending.then((result) => {
      this.recordDuration(task.kind, started);
      if (!task.settled) {
        this.completed += 1;
        if (task.kind === "semantic") this.completedSemanticChunks += 1;
        else this.completedHydrologyRegions += 1;
        this.finishTask(task, () => task.resolveResult(result));
      }
      this.releaseSlot(slot);
    }, (reason) => {
      this.recordDuration(task.kind, started);
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
    if (!client || typeof client.generateSemanticChunk !== "function" || typeof client.generateHydrologyRegion !== "function" || typeof client.dispose !== "function") {
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
  recordDuration(kind, started) {
    const finished = typeof performance === "undefined" ? Date.now() : performance.now();
    const duration = Math.max(0, finished - started);
    if (kind === "semantic") {
      this.averageSemanticChunkMs = this.averageSemanticChunkMs === 0 ? duration : this.averageSemanticChunkMs + (duration - this.averageSemanticChunkMs) * 0.2;
    } else {
      this.averageHydrologyRegionMs = this.averageHydrologyRegionMs === 0 ? duration : this.averageHydrologyRegionMs + (duration - this.averageHydrologyRegionMs) * 0.2;
    }
  }
};

// src/world/HydrologyWorldSource.ts
var DEFAULT_HYDROLOGY_REGION_CACHE_BYTES = 16 * 1024 * 1024;
var HYDROLOGY_REGION_BASE_RESIDENT_BYTES = 256;
var HYDROLOGY_PORT_RESIDENT_BYTES = 128;
var HYDROLOGY_RIVER_RESIDENT_BYTES = 160;
var HYDROLOGY_LAKE_RESIDENT_BYTES = 96;
var HYDROLOGY_MOUTH_RESIDENT_BYTES = 96;
var HYDROLOGY_BODY_RESIDENT_BYTES = 64;
function positiveModulo6(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function abortError2() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("hydrology region request was aborted", "AbortError");
  }
  const error = new Error("hydrology region request was aborted");
  error.name = "AbortError";
  return error;
}
function stringPayloadBytes(value) {
  const bytes = value.length * 2;
  if (!Number.isSafeInteger(bytes)) throw new RangeError("hydrology string size exceeds safe integers");
  return bytes;
}
function endpointPayloadBytes(endpoint) {
  return stringPayloadBytes(endpoint.kind === "node" ? endpoint.nodeId : endpoint.kind === "port" ? endpoint.connectionId : endpoint.bodyId);
}
function hydrologyRegionResidentBytes(region) {
  assertHydrologyRegion(region);
  let bytes = HYDROLOGY_REGION_BASE_RESIDENT_BYTES + region.boundaryPorts.length * HYDROLOGY_PORT_RESIDENT_BYTES + region.rivers.length * HYDROLOGY_RIVER_RESIDENT_BYTES + region.lakes.length * HYDROLOGY_LAKE_RESIDENT_BYTES + region.mouths.length * HYDROLOGY_MOUTH_RESIDENT_BYTES + region.bodies.length * HYDROLOGY_BODY_RESIDENT_BYTES + stringPayloadBytes(region.worldIdentity);
  for (const port of region.boundaryPorts) {
    bytes += port.point.byteLength + port.flowDirection.byteLength;
    bytes += stringPayloadBytes(port.connectionId) + stringPayloadBytes(port.riverId) + stringPayloadBytes(port.segmentId);
  }
  for (const river of region.rivers) {
    bytes += river.controlPoints.byteLength + river.widthProfile.byteLength + river.levelProfile.byteLength;
    bytes += stringPayloadBytes(river.riverId) + stringPayloadBytes(river.segmentId) + endpointPayloadBytes(river.entry) + endpointPayloadBytes(river.exit);
  }
  for (const lake of region.lakes) {
    bytes += lake.center.byteLength + stringPayloadBytes(lake.featureId) + stringPayloadBytes(lake.bodyId);
  }
  for (const mouth of region.mouths) {
    bytes += mouth.point.byteLength + stringPayloadBytes(mouth.mouthId) + stringPayloadBytes(mouth.riverId) + stringPayloadBytes(mouth.segmentId) + stringPayloadBytes(mouth.targetBodyId);
  }
  for (const body of region.bodies) bytes += stringPayloadBytes(body.bodyId);
  if (!Number.isSafeInteger(bytes)) throw new RangeError("hydrology region resident size exceeds safe integers");
  return bytes;
}
function validateRegionContract(region, descriptor, key) {
  assertHydrologyRegion(region);
  const expectedWidth = descriptor.sourceKind === "procedural-toroidal" ? Math.min(HYDROLOGY_REGION_SIZE, descriptor.width - key.regionX * HYDROLOGY_REGION_SIZE) : HYDROLOGY_REGION_SIZE;
  const expectedHeight = descriptor.sourceKind === "procedural-toroidal" ? Math.min(HYDROLOGY_REGION_SIZE, descriptor.height - key.regionY * HYDROLOGY_REGION_SIZE) : HYDROLOGY_REGION_SIZE;
  if (region.worldIdentity !== serializeWorldDescriptorV2(descriptor) || region.topology !== descriptor.topology || region.key.regionX !== key.regionX || region.key.regionY !== key.regionY || region.revision !== HYDROLOGY_REGION_REVISION || region.validBounds.minX !== 0 || region.validBounds.minY !== 0 || region.validBounds.maxXExclusive !== expectedWidth || region.validBounds.maxYExclusive !== expectedHeight) {
    throw new TypeError("hydrology pool returned a region outside its requested world contract");
  }
}
var ProceduralHydrologyWorldSource = class {
  constructor(options) {
    this.cache = new CoordinatePairMap();
    this.inFlight = new CoordinatePairMap();
    this.cacheBytes = 0;
    this.cacheClock = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.disposed = false;
    if (!options || typeof options !== "object" || !options.descriptor || options.descriptor.sourceKind !== "procedural-infinite" && options.descriptor.sourceKind !== "procedural-toroidal") {
      throw new TypeError("procedural hydrology source requires a procedural descriptor");
    }
    this.descriptor = options.descriptor;
    this.worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    if (options.descriptor.sourceKind === "procedural-toroidal") {
      this.regionCountX = Math.ceil(options.descriptor.width / HYDROLOGY_REGION_SIZE);
      this.regionCountY = Math.ceil(options.descriptor.height / HYDROLOGY_REGION_SIZE);
    }
    this.cacheMaxBytes = options.cacheMaxBytes ?? DEFAULT_HYDROLOGY_REGION_CACHE_BYTES;
    const minimumCacheBytes = HYDROLOGY_REGION_BASE_RESIDENT_BYTES + stringPayloadBytes(this.worldIdentity);
    if (!Number.isSafeInteger(this.cacheMaxBytes) || this.cacheMaxBytes < minimumCacheBytes) {
      throw new RangeError("hydrology region cache must hold at least one empty region");
    }
    if (options.workerPool) {
      if (options.workerUrl !== void 0 || options.workerPoolOptions !== void 0) {
        throw new TypeError("external hydrology workerPool cannot be combined with worker URL or options");
      }
      this.pool = options.workerPool;
      this.ownsPool = false;
    } else {
      if (!options.workerUrl) throw new TypeError("procedural hydrology source requires a surface worker URL");
      if (options.workerPoolOptions?.size !== void 0 && options.workerPoolOptions.size !== 1 || options.workerPoolOptions?.maxWorkers !== void 0 && options.workerPoolOptions.maxWorkers !== 1) {
        throw new RangeError("owned hydrology worker pool must use exactly one affinity worker");
      }
      this.pool = new SurfaceWorkerPool(options.workerUrl, {
        ...options.workerPoolOptions,
        size: 1,
        maxWorkers: 1
      });
      this.ownsPool = true;
    }
  }
  resolveRegion(regionX, regionY) {
    if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return void 0;
    if (this.descriptor.sourceKind === "procedural-toroidal") {
      return Object.freeze({
        regionX: positiveModulo6(regionX, this.regionCountX),
        regionY: positiveModulo6(regionY, this.regionCountY)
      });
    }
    try {
      chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
      return Object.freeze({ regionX, regionY });
    } catch {
      return void 0;
    }
  }
  regionDistance(regionX, regionY, centerRegionX, centerRegionY) {
    const first = this.resolveRegion(regionX, regionY);
    const second = this.resolveRegion(centerRegionX, centerRegionY);
    if (!first || !second) return Number.POSITIVE_INFINITY;
    if (this.descriptor.sourceKind === "procedural-infinite") {
      return Math.hypot(first.regionX - second.regionX, first.regionY - second.regionY);
    }
    const distanceX = Math.min(
      Math.abs(first.regionX - second.regionX),
      this.regionCountX - Math.abs(first.regionX - second.regionX)
    );
    const distanceY = Math.min(
      Math.abs(first.regionY - second.regionY),
      this.regionCountY - Math.abs(first.regionY - second.regionY)
    );
    return Math.hypot(distanceX, distanceY);
  }
  loadRegion(regionX, regionY, request = {}) {
    if (this.disposed) return Promise.reject(new Error("procedural hydrology source has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError2());
    const key = this.resolveRegion(regionX, regionY);
    if (!key || key.regionX !== regionX || key.regionY !== regionY) {
      return Promise.reject(new RangeError("hydrology region request must use a canonical in-domain key"));
    }
    const cached = this.cache.get(regionX, regionY);
    if (cached) {
      this.cacheHits += 1;
      cached.references += 1;
      this.touch(cached);
      return Promise.resolve(cached.region);
    }
    this.cacheMisses += 1;
    let pending = this.inFlight.get(regionX, regionY);
    if (!pending) {
      const controller = new AbortController();
      const created = {
        controller,
        waiters: 0,
        settled: false,
        promise: void 0
      };
      created.promise = this.pool.generateHydrologyRegion({
        descriptor: this.descriptor,
        key
      }, {
        priority: request.priority,
        lane: request.lane,
        weight: request.weight,
        signal: controller.signal
      }).then((region) => {
        if (this.disposed) throw new Error("hydrology source was disposed during generation");
        validateRegionContract(region, this.descriptor, key);
        this.insert(region);
        return region;
      }).finally(() => {
        created.settled = true;
        this.inFlight.delete(regionX, regionY);
        if (created.waiters === 0) this.evictUnleased();
      });
      pending = created;
      this.inFlight.set(regionX, regionY, pending);
    }
    return this.waitFor(pending, request.signal);
  }
  releaseRegion(region) {
    const entry = this.cache.get(region.key.regionX, region.key.regionY);
    if (!entry || entry.region !== region || entry.references <= 0) {
      throw new Error("hydrology region release does not match an active source lease");
    }
    entry.references -= 1;
    this.touch(entry);
    this.evictUnleased();
  }
  hasRegion(regionX, regionY) {
    return this.cache.has(regionX, regionY);
  }
  get stats() {
    const worker = this.pool.stats;
    let leasedRegions = 0;
    for (const entry of this.cache.values()) {
      if (entry.references > 0) leasedRegions += 1;
    }
    return Object.freeze({
      residentRegions: this.cache.size,
      residentBytes: this.cacheBytes,
      leasedRegions,
      inFlightRegions: this.inFlight.size,
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
      const finish = () => {
        if (settled) return;
        settled = true;
        pending.waiters -= 1;
        if (signal) signal.removeEventListener("abort", abort);
        if (pending.waiters === 0 && !pending.settled) pending.controller.abort();
      };
      const abort = () => {
        finish();
        reject(abortError2());
      };
      if (signal) signal.addEventListener("abort", abort, { once: true });
      pending.promise.then((region) => {
        if (settled) return;
        finish();
        const entry = this.cache.get(region.key.regionX, region.key.regionY);
        if (!entry || entry.region !== region) {
          reject(new Error("generated hydrology region was not published to its source cache"));
          return;
        }
        entry.references += 1;
        this.touch(entry);
        this.evictUnleased();
        resolve(region);
      }, (reason) => {
        if (settled) return;
        finish();
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      });
      if (signal?.aborted) abort();
    });
  }
  insert(region) {
    const existing = this.cache.get(region.key.regionX, region.key.regionY);
    if (existing) throw new Error("hydrology source generated a duplicate resident region");
    const bytes = hydrologyRegionResidentBytes(region);
    const entry = { region, bytes, references: 0, lastUsed: 0 };
    this.touch(entry);
    this.cache.set(region.key.regionX, region.key.regionY, entry);
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
      this.cache.delete(candidate.region.key.regionX, candidate.region.key.regionY);
      this.cacheBytes -= candidate.bytes;
    }
  }
};
function assertHydrologyWorldSource(source) {
  if (!source || typeof source !== "object" || source.worldIdentity !== serializeWorldDescriptorV2(source.descriptor) || typeof source.resolveRegion !== "function" || typeof source.regionDistance !== "function" || typeof source.loadRegion !== "function" || typeof source.releaseRegion !== "function" || typeof source.hasRegion !== "function" || typeof source.dispose !== "function") {
    throw new TypeError("hydrology world source does not satisfy the v2 runtime contract");
  }
}

// src/world/compileStaticSemanticChunk.ts
var STATIC_PLAIN_HEIGHT = 32768;
var STATIC_HILL_HEIGHT = 39321;
var STATIC_MOUNTAIN_HEIGHT = 52428;
var STATIC_WOOD_DENSITY = 140;
var ALLOWED_MODIFIERS = /* @__PURE__ */ new Set(["hill", "wood", "lake", "river"]);
var LAND_TYPES = new Set(Object.values(Land));
function assertStaticMapDescriptor(map, descriptor) {
  assertWorldDescriptorV2(descriptor);
  assertCoreWorldSemanticsV2(descriptor);
  if (descriptor.sourceKind !== "static" || descriptor.topology !== "finite") {
    throw new TypeError("static semantic compiler requires a static finite descriptor");
  }
  if (!map || typeof map !== "object" || map.infinite || map.wrapX || map.wrapY || map.w !== descriptor.width || map.h !== descriptor.height) {
    throw new TypeError("static MapInfo topology does not match its v2 descriptor");
  }
}
function assertStaticSemanticTile(tile, x, y) {
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
function staticMacroHeightFor(tile, seaLevel) {
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
  assertStaticMapDescriptor(options.map, options.descriptor);
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
      assertStaticSemanticTile(tile, worldX, worldY);
      const tileIndex = semanticTileIndex(localX, localY);
      substrateClass[tileIndex] = substrateFor2(tile);
      macroHeight[tileIndex] = staticMacroHeightFor(tile, options.descriptor.seaLevel);
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

// src/world/SemanticWorldSource.ts
var DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES = 32 * 1024 * 1024;
function positiveModulo7(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function abortError3() {
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
      chunkX: positiveModulo7(chunkX, countX),
      chunkY: positiveModulo7(chunkY, countY)
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
    if (request.signal?.aborted) return Promise.reject(abortError3());
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
      const onAbort = () => finish(() => reject(abortError3()));
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
    if (request.signal?.aborted) return Promise.reject(abortError3());
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

// src/world/EffectiveWorldView.ts
function compareIdentity4(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}
function collectBaseFeatureIds(region) {
  const featureIds = /* @__PURE__ */ new Set();
  for (const port of region.boundaryPorts) featureIds.add(port.riverId);
  for (const river of region.rivers) featureIds.add(river.riverId);
  for (const lake of region.lakes) featureIds.add(lake.bodyId);
  for (const mouth of region.mouths) featureIds.add(mouth.riverId);
  for (const body of region.bodies) if (body.bodyId !== "ocean") featureIds.add(body.bodyId);
  return Object.freeze([...featureIds].sort(compareIdentity4));
}
function effectiveBaseSlices(region, suppressedFeatureIds) {
  if (suppressedFeatureIds.size === 0) {
    return Object.freeze({
      boundaryPorts: region.boundaryPorts,
      rivers: region.rivers,
      lakes: region.lakes,
      mouths: region.mouths,
      bodies: region.bodies
    });
  }
  return Object.freeze({
    boundaryPorts: Object.freeze(region.boundaryPorts.filter((port) => !suppressedFeatureIds.has(port.riverId))),
    rivers: Object.freeze(region.rivers.filter((river) => !suppressedFeatureIds.has(river.riverId))),
    lakes: Object.freeze(region.lakes.filter((lake) => !suppressedFeatureIds.has(lake.bodyId))),
    mouths: Object.freeze(region.mouths.filter((mouth) => !suppressedFeatureIds.has(mouth.riverId))),
    bodies: Object.freeze(region.bodies.filter((body) => body.bodyId === "ocean" || !suppressedFeatureIds.has(body.bodyId)))
  });
}
function createEffectiveHydrologyRegion(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("effective hydrology region options are required");
  }
  assertHydrologyRegion(options.base);
  const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
  if (options.base.worldIdentity !== worldIdentity || options.deltaSnapshot.worldIdentity !== worldIdentity || options.featureIndex.worldIdentity !== worldIdentity) {
    throw new TypeError("effective hydrology inputs belong to different worlds");
  }
  if (options.base.topology !== options.descriptor.topology) {
    throw new TypeError("effective hydrology base topology does not match its descriptor");
  }
  if (options.base.revision > options.deltaSnapshot.effectiveRevision) {
    throw new RangeError("base hydrology region is newer than its effective snapshot");
  }
  const suppressedBaseFeatureIds = collectBaseFeatureIds(options.base).filter((featureId) => options.deltaSnapshot.getHydrologyDelta(featureId) !== void 0);
  const suppressedFeatureIds = new Set(suppressedBaseFeatureIds);
  const authoredFeatures = options.featureIndex.queryRegion(options.base);
  for (const delta of authoredFeatures) {
    if (delta.revision > options.deltaSnapshot.effectiveRevision) {
      throw new RangeError("authored hydrology feature is newer than its effective snapshot");
    }
  }
  return Object.freeze({
    worldIdentity,
    key: options.base.key,
    effectiveRevision: options.deltaSnapshot.effectiveRevision,
    baseRevision: options.base.revision,
    base: options.base,
    effectiveBase: effectiveBaseSlices(options.base, suppressedFeatureIds),
    suppressedBaseFeatureIds: Object.freeze(suppressedBaseFeatureIds),
    authoredFeatures
  });
}
function effectiveHydrologySuppressesBaseFeature(region, featureId) {
  if (typeof featureId !== "string" || featureId.length === 0) {
    throw new TypeError("effective hydrology base feature identity is required");
  }
  let minimum = 0;
  let maximum = region.suppressedBaseFeatureIds.length - 1;
  while (minimum <= maximum) {
    const middle = minimum + maximum >>> 1;
    const candidate = region.suppressedBaseFeatureIds[middle];
    if (candidate === featureId) return true;
    if (candidate < featureId) minimum = middle + 1;
    else maximum = middle - 1;
  }
  return false;
}
var EffectiveWorldView = class {
  constructor(options) {
    this.semanticLeases = /* @__PURE__ */ new Map();
    this.hydrologyLeases = /* @__PURE__ */ new Map();
    this.disposed = false;
    if (!options || typeof options !== "object") {
      throw new TypeError("effective world view options are required");
    }
    assertSemanticWorldSource(options.semanticSource);
    assertHydrologyWorldSource(options.hydrologySource);
    const worldIdentity = options.semanticSource.worldIdentity;
    if (options.hydrologySource.worldIdentity !== worldIdentity || options.deltaSnapshot.worldIdentity !== worldIdentity) {
      throw new TypeError("effective world view sources and delta snapshot belong to different worlds");
    }
    this.descriptor = options.semanticSource.descriptor;
    this.worldIdentity = worldIdentity;
    this.effectiveRevision = options.deltaSnapshot.effectiveRevision;
    this.deltaSnapshot = options.deltaSnapshot;
    this.semanticSource = options.semanticSource;
    this.hydrologySource = options.hydrologySource;
    this.featureIndex = new HydrologyFeatureSpatialIndex(
      this.descriptor,
      this.deltaSnapshot.hydrologyDeltas
    );
  }
  resolveSemanticChunk(chunkX, chunkY) {
    this.assertActive();
    return this.semanticSource.resolveChunk(chunkX, chunkY);
  }
  resolveHydrologyRegion(regionX, regionY) {
    this.assertActive();
    return this.hydrologySource.resolveRegion(regionX, regionY);
  }
  async loadSemanticChunk(chunkX, chunkY, request = {}) {
    this.assertActive();
    const resolved = this.semanticSource.resolveChunk(chunkX, chunkY);
    if (!resolved || resolved.chunkX !== chunkX || resolved.chunkY !== chunkY) {
      throw new RangeError("effective semantic request must use a canonical in-domain key");
    }
    const base = await this.semanticSource.loadChunk(chunkX, chunkY, request);
    if (this.disposed) {
      this.semanticSource.releaseChunk(base);
      throw new Error("effective world view was disposed during semantic loading");
    }
    try {
      const effective = createEffectiveSemanticChunk({
        descriptor: this.descriptor,
        base,
        delta: this.deltaSnapshot.getSemanticDelta(chunkX, chunkY),
        effectiveRevision: this.effectiveRevision
      });
      this.semanticLeases.set(effective, base);
      return effective;
    } catch (reason) {
      this.semanticSource.releaseChunk(base);
      throw reason;
    }
  }
  releaseSemanticChunk(chunk) {
    const base = this.semanticLeases.get(chunk);
    if (!base) throw new Error("effective semantic release does not match an active view lease");
    this.semanticLeases.delete(chunk);
    this.semanticSource.releaseChunk(base);
  }
  async loadHydrologyRegion(regionX, regionY, request = {}) {
    this.assertActive();
    const resolved = this.hydrologySource.resolveRegion(regionX, regionY);
    if (!resolved || resolved.regionX !== regionX || resolved.regionY !== regionY) {
      throw new RangeError("effective hydrology request must use a canonical in-domain key");
    }
    const base = await this.hydrologySource.loadRegion(regionX, regionY, request);
    if (this.disposed) {
      this.hydrologySource.releaseRegion(base);
      throw new Error("effective world view was disposed during hydrology loading");
    }
    try {
      const effective = createEffectiveHydrologyRegion({
        descriptor: this.descriptor,
        base,
        deltaSnapshot: this.deltaSnapshot,
        featureIndex: this.featureIndex
      });
      this.hydrologyLeases.set(effective, base);
      return effective;
    } catch (reason) {
      this.hydrologySource.releaseRegion(base);
      throw reason;
    }
  }
  releaseHydrologyRegion(region) {
    const base = this.hydrologyLeases.get(region);
    if (!base) throw new Error("effective hydrology release does not match an active view lease");
    this.hydrologyLeases.delete(region);
    this.hydrologySource.releaseRegion(base);
  }
  get stats() {
    return Object.freeze({
      effectiveRevision: this.effectiveRevision,
      leasedSemanticChunks: this.semanticLeases.size,
      leasedHydrologyRegions: this.hydrologyLeases.size,
      authoredHydrologyFeatures: this.featureIndex.featureCount,
      authoredHydrologyIndexItems: this.featureIndex.itemCount
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const base of this.semanticLeases.values()) this.semanticSource.releaseChunk(base);
    for (const base of this.hydrologyLeases.values()) this.hydrologySource.releaseRegion(base);
    this.semanticLeases.clear();
    this.hydrologyLeases.clear();
  }
  assertActive() {
    if (this.disposed) throw new Error("effective world view has been disposed");
  }
};

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
function abortError4() {
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
  if (options.signal?.aborted) throw abortError4();
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
    if (options.signal?.aborted) throw abortError4();
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

// src/world/MacroDrainageHydrologySource.ts
var MIN_RIVER_DISCHARGE = 8;
var MIN_LAKE_RADIUS_TILES = 4;
var MAX_LAKE_RADIUS_TILES = 16;
var MACRO_NODE_CENTER_OFFSET = MACRO_DRAINAGE_NODE_STEP_TILES / 2;
function positiveModulo8(value, modulus) {
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
      regionX: positiveModulo8(regionX, this.regionCountX),
      regionY: positiveModulo8(regionY, this.regionCountY)
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
          tileX: positiveModulo8(canonical.tileX, this.graph.worldWidth),
          tileY: positiveModulo8(canonical.tileY, this.graph.worldHeight)
        }) : canonical;
      }
    });
    const [minimumNodeX, maximumNodeX] = nodeAxisRange(origin.x, endX, this.graph.width, toroidal);
    const [minimumNodeY, maximumNodeY] = nodeAxisRange(origin.y, endY, this.graph.height, toroidal);
    for (let unwrappedNodeX = minimumNodeX; unwrappedNodeX <= maximumNodeX; unwrappedNodeX += 1) {
      const nodeX = toroidal ? positiveModulo8(unwrappedNodeX, this.graph.width) : unwrappedNodeX;
      for (let unwrappedNodeY = minimumNodeY; unwrappedNodeY <= maximumNodeY; unwrappedNodeY += 1) {
        const nodeY = toroidal ? positiveModulo8(unwrappedNodeY, this.graph.height) : unwrappedNodeY;
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
  return positiveModulo2(column, 2) === 0 ? 0.5 : 0;
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
function positiveModulo9(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function abortError5() {
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
      chunkX: positiveModulo9(chunkX, this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE),
      chunkY: positiveModulo9(chunkY, this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE)
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
    if (request.signal?.aborted) return Promise.reject(abortError5());
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

// src/world/HydrologyRegionSpatialIndex.ts
var HYDROLOGY_SPATIAL_CELL_SIZE = 16;
var HYDROLOGY_KIND_NONE = 0;
var HYDROLOGY_KIND_OCEAN = 1;
var HYDROLOGY_KIND_LAKE = 2;
var HYDROLOGY_KIND_RIVER = 3;
var OCEAN_BODY_REF = Object.freeze({
  bodyId: "ocean",
  kind: "ocean",
  profileIndex: OCEAN_HYDROLOGY_PROFILE
});
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function compareCandidate(first, second) {
  if (!second) return true;
  return first.coverage > second.coverage || first.coverage === second.coverage && (first.priority > second.priority || first.priority === second.priority && first.stableIdentity < second.stableIdentity);
}
function profileAt(profile, index, amount) {
  return Math.round(profile[index] + (profile[index + 1] - profile[index]) * amount);
}
function closestRiverPoint(river, x, y) {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestLevel = 0;
  let bestHalfWidth = 0;
  let bestFlowX = 0;
  let bestFlowY = 0;
  let bestSegmentIndex = -1;
  let bestSegmentAmount = 0;
  const pointCount = river.controlPoints.length / 2;
  for (let segmentIndex = 0; segmentIndex < pointCount - 1; segmentIndex += 1) {
    const startX = river.controlPoints[segmentIndex * 2] / HYDROLOGY_POINT_QUANTIZATION;
    const startY = river.controlPoints[segmentIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION;
    const endX = river.controlPoints[segmentIndex * 2 + 2] / HYDROLOGY_POINT_QUANTIZATION;
    const endY = river.controlPoints[segmentIndex * 2 + 3] / HYDROLOGY_POINT_QUANTIZATION;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    if (lengthSquared === 0) continue;
    const amount = clamp(((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared, 0, 1);
    const closestX = startX + deltaX * amount;
    const closestY = startY + deltaY * amount;
    const distanceSquared = (x - closestX) ** 2 + (y - closestY) ** 2;
    if (distanceSquared >= bestDistanceSquared) continue;
    bestDistanceSquared = distanceSquared;
    bestLevel = profileAt(river.levelProfile, segmentIndex, amount);
    bestHalfWidth = hydrologyRiverHalfWidthTiles(profileAt(river.widthProfile, segmentIndex, amount));
    bestFlowX = Math.sign(deltaX);
    bestFlowY = Math.sign(deltaY);
    bestSegmentIndex = segmentIndex;
    bestSegmentAmount = amount;
  }
  if (!Number.isFinite(bestDistanceSquared)) throw new Error("river segment has no non-zero geometry span");
  let bestDistanceToEnd = 0;
  for (let segmentIndex = bestSegmentIndex; segmentIndex < pointCount - 1; segmentIndex += 1) {
    const startX = river.controlPoints[segmentIndex * 2] / HYDROLOGY_POINT_QUANTIZATION;
    const startY = river.controlPoints[segmentIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION;
    const endX = river.controlPoints[segmentIndex * 2 + 2] / HYDROLOGY_POINT_QUANTIZATION;
    const endY = river.controlPoints[segmentIndex * 2 + 3] / HYDROLOGY_POINT_QUANTIZATION;
    const length = Math.hypot(endX - startX, endY - startY);
    bestDistanceToEnd += segmentIndex === bestSegmentIndex ? length * (1 - bestSegmentAmount) : length;
  }
  return {
    distance: Math.sqrt(bestDistanceSquared),
    level: bestLevel,
    halfWidth: bestHalfWidth,
    flowX: bestFlowX,
    flowY: bestFlowY,
    distanceToEnd: bestDistanceToEnd
  };
}
function rangeFor(minimum, maximum, count) {
  return [
    clamp(Math.floor(minimum / HYDROLOGY_SPATIAL_CELL_SIZE), 0, count - 1),
    clamp(Math.floor(maximum / HYDROLOGY_SPATIAL_CELL_SIZE), 0, count - 1)
  ];
}
var HydrologyRegionSpatialIndex = class {
  constructor(region) {
    assertHydrologyRegion(region);
    this.region = region;
    this.cellCountX = Math.ceil(region.validBounds.maxXExclusive / HYDROLOGY_SPATIAL_CELL_SIZE);
    this.cellCountY = Math.ceil(region.validBounds.maxYExclusive / HYDROLOGY_SPATIAL_CELL_SIZE);
    const mutableBuckets = Array.from(
      { length: this.cellCountX * this.cellCountY },
      () => ({ rivers: [], lakes: [] })
    );
    const addToBuckets = (kind, featureIndex, minimumX, minimumY, maximumX, maximumY) => {
      const [minimumCellX, maximumCellX] = rangeFor(minimumX, maximumX, this.cellCountX);
      const [minimumCellY, maximumCellY] = rangeFor(minimumY, maximumY, this.cellCountY);
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
          mutableBuckets[cellX * this.cellCountY + cellY][kind].push(featureIndex);
        }
      }
    };
    for (let riverIndex = 0; riverIndex < region.rivers.length; riverIndex += 1) {
      const river = region.rivers[riverIndex];
      let minimumX = Number.POSITIVE_INFINITY;
      let minimumY = Number.POSITIVE_INFINITY;
      let maximumX = Number.NEGATIVE_INFINITY;
      let maximumY = Number.NEGATIVE_INFINITY;
      let maximumHalfWidth = 0;
      for (let pointIndex = 0; pointIndex < river.widthProfile.length; pointIndex += 1) {
        minimumX = Math.min(
          minimumX,
          river.controlPoints[pointIndex * 2] / HYDROLOGY_POINT_QUANTIZATION
        );
        minimumY = Math.min(
          minimumY,
          river.controlPoints[pointIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION
        );
        maximumX = Math.max(
          maximumX,
          river.controlPoints[pointIndex * 2] / HYDROLOGY_POINT_QUANTIZATION
        );
        maximumY = Math.max(
          maximumY,
          river.controlPoints[pointIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION
        );
        maximumHalfWidth = Math.max(maximumHalfWidth, hydrologyRiverHalfWidthTiles(
          river.widthProfile[pointIndex]
        ));
      }
      addToBuckets(
        "rivers",
        riverIndex,
        minimumX - maximumHalfWidth - 0.5,
        minimumY - maximumHalfWidth - 0.5,
        maximumX + maximumHalfWidth + 0.5,
        maximumY + maximumHalfWidth + 0.5
      );
    }
    for (let lakeIndex = 0; lakeIndex < region.lakes.length; lakeIndex += 1) {
      const lake = region.lakes[lakeIndex];
      const centerX = lake.center[0] / HYDROLOGY_POINT_QUANTIZATION;
      const centerY = lake.center[1] / HYDROLOGY_POINT_QUANTIZATION;
      const radius = lake.radius / HYDROLOGY_POINT_QUANTIZATION;
      addToBuckets(
        "lakes",
        lakeIndex,
        centerX - radius - 0.5,
        centerY - radius - 0.5,
        centerX + radius + 0.5,
        centerY + radius + 0.5
      );
    }
    this.buckets = Object.freeze(mutableBuckets.map((bucket) => Object.freeze({
      rivers: Object.freeze(bucket.rivers),
      lakes: Object.freeze(bucket.lakes)
    })));
    this.bodies = new Map(region.bodies.map((body) => [body.bodyId, body]));
    this.mouths = new Map(region.mouths.map((mouth) => [mouth.segmentId, mouth]));
  }
  query(localX, localY, groundHeight, seaLevel) {
    if (!Number.isFinite(localX) || !Number.isFinite(localY) || localX < -0.5 || localX >= this.region.validBounds.maxXExclusive - 0.5 || localY < -0.5 || localY >= this.region.validBounds.maxYExclusive - 0.5) {
      throw new RangeError("hydrology query point lies outside region valid bounds");
    }
    if (!Number.isInteger(groundHeight) || groundHeight < 0 || groundHeight > 65535 || !Number.isInteger(seaLevel) || seaLevel < 0 || seaLevel > 65535) {
      throw new RangeError("hydrology query heights must be uint16 values");
    }
    const cellX = clamp(Math.floor(localX / HYDROLOGY_SPATIAL_CELL_SIZE), 0, this.cellCountX - 1);
    const cellY = clamp(Math.floor(localY / HYDROLOGY_SPATIAL_CELL_SIZE), 0, this.cellCountY - 1);
    const bucket = this.buckets[cellX * this.cellCountY + cellY];
    let best;
    if (groundHeight < seaLevel) {
      best = {
        coverage: 255,
        kind: HYDROLOGY_KIND_OCEAN,
        level: seaLevel,
        flowX: 0,
        flowY: 0,
        body: OCEAN_BODY_REF,
        priority: 0,
        stableIdentity: "ocean"
      };
    }
    for (const lakeIndex of bucket.lakes) {
      const lake = this.region.lakes[lakeIndex];
      if (groundHeight > lake.level) continue;
      const distance = Math.hypot(
        localX - lake.center[0] / HYDROLOGY_POINT_QUANTIZATION,
        localY - lake.center[1] / HYDROLOGY_POINT_QUANTIZATION
      );
      const coverage = clamp(Math.round((lake.radius / HYDROLOGY_POINT_QUANTIZATION + 0.5 - distance) * 255), 0, 255);
      if (coverage === 0) continue;
      const body = this.bodies.get(lake.bodyId);
      if (!body) throw new Error("hydrology lake query lost its body reference");
      const candidate = {
        coverage,
        kind: HYDROLOGY_KIND_LAKE,
        level: lake.level,
        flowX: 0,
        flowY: 0,
        body,
        priority: 1,
        stableIdentity: lake.bodyId
      };
      if (compareCandidate(candidate, best)) best = candidate;
    }
    for (const riverIndex of bucket.rivers) {
      const river = this.region.rivers[riverIndex];
      const closest = closestRiverPoint(river, localX, localY);
      const coverage = clamp(Math.round((closest.halfWidth + 0.5 - closest.distance) * 255), 0, 255);
      if (coverage === 0) continue;
      const body = this.bodies.get(river.riverId);
      if (!body) throw new Error("hydrology river query lost its body reference");
      const candidate = {
        coverage,
        kind: HYDROLOGY_KIND_RIVER,
        level: closest.level,
        flowX: closest.flowX,
        flowY: closest.flowY,
        body,
        priority: 2 + river.dischargeClass,
        stableIdentity: `${river.riverId}:${river.segmentId}`,
        mouth: this.mouths.get(river.segmentId),
        mouthDistance: closest.distanceToEnd,
        halfWidth: closest.halfWidth
      };
      if (compareCandidate(candidate, best)) best = candidate;
    }
    if (!best) {
      return Object.freeze({
        coverage: 0,
        kind: HYDROLOGY_KIND_NONE,
        level: 0,
        depth: 0,
        flowX: 0,
        flowY: 0,
        profileIndex: 0
      });
    }
    if (best.mouth && best.mouthDistance !== void 0 && best.halfWidth !== void 0 && best.mouthDistance <= best.halfWidth * 0.5) {
      const target = this.bodies.get(best.mouth.targetBodyId);
      if (!target) throw new Error("hydrology mouth query lost its target body reference");
      best = {
        ...best,
        kind: target.kind === "ocean" ? HYDROLOGY_KIND_OCEAN : HYDROLOGY_KIND_LAKE,
        flowX: 0,
        flowY: 0,
        body: target,
        stableIdentity: target.bodyId
      };
    }
    return Object.freeze({
      coverage: best.coverage,
      kind: best.kind,
      level: best.level,
      depth: Math.max(0, best.level - groundHeight),
      flowX: best.flowX,
      flowY: best.flowY,
      profileIndex: best.body.profileIndex,
      body: best.body
    });
  }
};

// src/world/DerivedHydrologyRaster.ts
var MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES = 1048576;
var MAX_DERIVED_HYDROLOGY_BODY_PALETTE = 255;
function compareIdentity5(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}
function derivedHydrologyRasterIndex(x, y, width, height) {
  if (!Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0 || !Number.isInteger(width) || width <= 0 || x >= width || !Number.isInteger(height) || height <= 0 || y >= height) {
    throw new RangeError("derived hydrology raster coordinate is invalid");
  }
  const index = x * height + y;
  if (!Number.isSafeInteger(index)) throw new RangeError("derived hydrology raster index is unsafe");
  return index;
}
function assertDerivedHydrologyRaster(raster) {
  if (!raster || typeof raster !== "object" || typeof raster.worldIdentity !== "string" || raster.worldIdentity.length === 0 || !raster.regionKey || !Number.isSafeInteger(raster.regionKey.regionX) || !Number.isSafeInteger(raster.regionKey.regionY) || !Number.isSafeInteger(raster.regionRevision) || raster.regionRevision < 0 || !Number.isInteger(raster.width) || raster.width <= 0 || !Number.isInteger(raster.height) || raster.height <= 0 || !Number.isFinite(raster.localOriginX) || !Number.isFinite(raster.localOriginY) || !Number.isFinite(raster.stepX) || raster.stepX <= 0 || !Number.isFinite(raster.stepY) || raster.stepY <= 0) {
    throw new TypeError("derived hydrology raster metadata is invalid");
  }
  const length = raster.width * raster.height;
  if (!Number.isSafeInteger(length) || length > MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES || !(raster.coverage instanceof Uint8Array) || raster.coverage.length !== length || !(raster.kind instanceof Uint8Array) || raster.kind.length !== length || !(raster.level instanceof Uint16Array) || raster.level.length !== length || !(raster.depth instanceof Uint16Array) || raster.depth.length !== length || !(raster.flow instanceof Int8Array) || raster.flow.length !== length * 2 || !(raster.profile instanceof Uint8Array) || raster.profile.length !== length || !(raster.bodyIndex instanceof Uint8Array) || raster.bodyIndex.length !== length || !Array.isArray(raster.bodies) || raster.bodies.length > MAX_DERIVED_HYDROLOGY_BODY_PALETTE) {
    throw new TypeError("derived hydrology raster arrays violate the frozen layout");
  }
  let previousBodyId;
  for (const body of raster.bodies) {
    if (!body || typeof body.bodyId !== "string" || body.bodyId.length === 0 || body.kind !== "ocean" && body.kind !== "lake" && body.kind !== "river" || !Number.isInteger(body.profileIndex) || body.profileIndex < 0 || body.profileIndex > 255 || previousBodyId !== void 0 && previousBodyId >= body.bodyId) {
      throw new Error("derived hydrology body palette is invalid or not canonical");
    }
    previousBodyId = body.bodyId;
  }
  for (let index = 0; index < length; index += 1) {
    const bodyIndex = raster.bodyIndex[index];
    if (raster.coverage[index] === 0) {
      if (raster.kind[index] !== HYDROLOGY_KIND_NONE || bodyIndex !== 0 || raster.level[index] !== 0 || raster.depth[index] !== 0 || raster.flow[index * 2] !== 0 || raster.flow[index * 2 + 1] !== 0 || raster.profile[index] !== 0) {
        throw new Error("dry derived hydrology samples must use the zero representation");
      }
      continue;
    }
    if (raster.kind[index] < 1 || raster.kind[index] > 3 || bodyIndex === 0 || bodyIndex > raster.bodies.length || raster.profile[index] !== raster.bodies[bodyIndex - 1].profileIndex || raster.depth[index] > raster.level[index] || raster.flow[index * 2] < -1 || raster.flow[index * 2] > 1 || raster.flow[index * 2 + 1] < -1 || raster.flow[index * 2 + 1] > 1) {
      throw new Error("wet derived hydrology sample has an invalid kind, flow or body reference");
    }
    const bodyKind = raster.bodies[bodyIndex - 1].kind;
    if (raster.kind[index] === 1 && bodyKind !== "ocean" || raster.kind[index] === 2 && bodyKind !== "lake" || raster.kind[index] === 3 && bodyKind !== "river" || raster.kind[index] !== 3 && (raster.flow[index * 2] !== 0 || raster.flow[index * 2 + 1] !== 0)) {
      throw new Error("derived hydrology kind does not match its body or flow semantics");
    }
  }
}
function deriveHydrologyRaster(options) {
  if (!options || typeof options !== "object" || !(options.index instanceof HydrologyRegionSpatialIndex)) {
    throw new TypeError("derived hydrology raster requires a spatial index");
  }
  if (!Number.isInteger(options.width) || options.width <= 0 || !Number.isInteger(options.height) || options.height <= 0) {
    throw new RangeError("derived hydrology raster dimensions must be positive integers");
  }
  const length = options.width * options.height;
  if (!Number.isSafeInteger(length) || length > MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES || !(options.groundHeight instanceof Uint16Array) || options.groundHeight.length !== length) {
    throw new RangeError("derived hydrology raster exceeds its sample budget or ground input");
  }
  if (!Number.isFinite(options.localOriginX) || !Number.isFinite(options.localOriginY) || !Number.isFinite(options.stepX) || options.stepX <= 0 || !Number.isFinite(options.stepY) || options.stepY <= 0 || !Number.isInteger(options.seaLevel) || options.seaLevel < 0 || options.seaLevel > 65535) {
    throw new RangeError("derived hydrology sampling lattice or sea level is invalid");
  }
  const lastX = options.localOriginX + (options.width - 1) * options.stepX;
  const lastY = options.localOriginY + (options.height - 1) * options.stepY;
  if (options.localOriginX < -0.5 || options.localOriginY < -0.5 || lastX >= options.index.region.validBounds.maxXExclusive - 0.5 || lastY >= options.index.region.validBounds.maxYExclusive - 0.5) {
    throw new RangeError("derived hydrology sampling lattice leaves region valid bounds");
  }
  const samples = new Array(length);
  const usedBodies = /* @__PURE__ */ new Map();
  for (let x = 0; x < options.width; x += 1) {
    for (let y = 0; y < options.height; y += 1) {
      const index = derivedHydrologyRasterIndex(x, y, options.width, options.height);
      const sample = options.index.query(
        options.localOriginX + x * options.stepX,
        options.localOriginY + y * options.stepY,
        options.groundHeight[index],
        options.seaLevel
      );
      samples[index] = sample;
      if (sample.body) usedBodies.set(sample.body.bodyId, sample.body);
    }
  }
  const bodies = [...usedBodies.values()].sort((first, second) => compareIdentity5(first.bodyId, second.bodyId));
  if (bodies.length > MAX_DERIVED_HYDROLOGY_BODY_PALETTE) {
    throw new RangeError("derived hydrology raster exceeds the uint8 body palette");
  }
  const paletteIndices = new Map(bodies.map((body, index) => [body.bodyId, index + 1]));
  const coverage = new Uint8Array(length);
  const kind = new Uint8Array(length);
  const level = new Uint16Array(length);
  const depth = new Uint16Array(length);
  const flow = new Int8Array(length * 2);
  const profile = new Uint8Array(length);
  const bodyIndex = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const sample = samples[index];
    coverage[index] = sample.coverage;
    kind[index] = sample.kind;
    level[index] = sample.level;
    depth[index] = sample.depth;
    flow[index * 2] = sample.flowX;
    flow[index * 2 + 1] = sample.flowY;
    profile[index] = sample.profileIndex;
    if (sample.body) bodyIndex[index] = paletteIndices.get(sample.body.bodyId);
  }
  const region = options.index.region;
  const raster = Object.freeze({
    worldIdentity: region.worldIdentity,
    regionKey: region.key,
    regionRevision: region.revision,
    width: options.width,
    height: options.height,
    localOriginX: options.localOriginX,
    localOriginY: options.localOriginY,
    stepX: options.stepX,
    stepY: options.stepY,
    coverage,
    kind,
    level,
    depth,
    flow,
    profile,
    bodyIndex,
    bodies: Object.freeze(bodies)
  });
  assertDerivedHydrologyRaster(raster);
  return raster;
}

// src/world/StaticHydrologyRegionSource.ts
var STATIC_EXPLICIT_WATER_LEVEL_OFFSET = 1024;
var STATIC_EXPLICIT_WATER_LEVEL = STATIC_PLAIN_HEIGHT + STATIC_EXPLICIT_WATER_LEVEL_OFFSET;
var STATIC_LAKE_TILE_RADIUS = 1;
function coordinateIdentity2(x, y) {
  return `${x}:${y}`;
}
function compareCoordinate2(first, second) {
  return first.x - second.x || first.y - second.y;
}
function isHexNeighbor(first, second) {
  return getNeighbors(first.x, first.y).some((neighbor) => neighbor.x === second.x && neighbor.y === second.y);
}
function assertExplicitWaterTile(tile, x, y, kind) {
  if (tile.type !== "land" /* land */ || tile.modifiers?.includes("hill")) {
    throw new TypeError(`static ${kind} tile ${x},${y} must use plain land ground`);
  }
}
function assertRiverEntry(entry, x, y) {
  if (!entry || typeof entry !== "object" || !Number.isSafeInteger(entry.riverIndex) || entry.riverIndex < 0 || !Number.isSafeInteger(entry.riverTileIndex) || entry.riverTileIndex < 0) {
    throw new TypeError(`static river metadata at ${x},${y} must use non-negative safe integers`);
  }
}
function find(parent, value) {
  let root = parent.get(value);
  while (root !== parent.get(root)) root = parent.get(root);
  let cursor = value;
  while (cursor !== root) {
    const next = parent.get(cursor);
    parent.set(cursor, root);
    cursor = next;
  }
  return root;
}
function union(parent, first, second) {
  const firstRoot = find(parent, first);
  const secondRoot = find(parent, second);
  if (firstRoot === secondRoot) return;
  parent.set(Math.max(firstRoot, secondRoot), Math.min(firstRoot, secondRoot));
}
function addBucketValue(buckets, regionX, regionY, value) {
  const values = buckets.get(regionX, regionY);
  if (values) values.push(value);
  else buckets.set(regionX, regionY, [value]);
}
function abortError6() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("static hydrology region request was aborted", "AbortError");
  }
  const error = new Error("static hydrology region request was aborted");
  error.name = "AbortError";
  return error;
}
var StaticHydrologyRegionSource = class {
  constructor(map, descriptor, options = {}) {
    this.riverEdges = new CoordinatePairMap();
    this.lakeSlices = new CoordinatePairMap();
    this.oceanRegions = new CoordinatePairMap();
    this.regions = new CoordinatePairMap();
    this.residentBytes = 0;
    this.cacheClock = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.disposed = false;
    assertStaticMapDescriptor(map, descriptor);
    this.descriptor = descriptor;
    this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    this.cacheMaxBytes = options.cacheMaxBytes ?? DEFAULT_HYDROLOGY_REGION_CACHE_BYTES;
    const minimumCacheBytes = HYDROLOGY_REGION_BASE_RESIDENT_BYTES + this.worldIdentity.length * 2;
    if (!Number.isSafeInteger(this.cacheMaxBytes) || this.cacheMaxBytes < minimumCacheBytes) {
      throw new RangeError("static hydrology cache must hold at least one empty region");
    }
    this.regionCountX = Math.ceil(descriptor.width / HYDROLOGY_REGION_SIZE);
    this.regionCountY = Math.ceil(descriptor.height / HYDROLOGY_REGION_SIZE);
    this.compile(map);
  }
  resolveRegion(regionX, regionY) {
    return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY) && regionX >= 0 && regionX < this.regionCountX && regionY >= 0 && regionY < this.regionCountY ? Object.freeze({ regionX, regionY }) : void 0;
  }
  buildRegion(regionX, regionY) {
    if (this.disposed) throw new Error("static hydrology source has been disposed");
    const key = this.resolveRegion(regionX, regionY);
    if (!key) throw new RangeError("static hydrology region key is outside the finite world");
    const entry = this.regionFor(key);
    this.evictUnleased();
    return entry.region;
  }
  regionDistance(regionX, regionY, centerRegionX, centerRegionY) {
    const first = this.resolveRegion(regionX, regionY);
    const second = this.resolveRegion(centerRegionX, centerRegionY);
    return first && second ? Math.hypot(first.regionX - second.regionX, first.regionY - second.regionY) : Number.POSITIVE_INFINITY;
  }
  loadRegion(regionX, regionY, request = {}) {
    if (this.disposed) return Promise.reject(new Error("static hydrology source has been disposed"));
    if (request.signal?.aborted) return Promise.reject(abortError6());
    const key = this.resolveRegion(regionX, regionY);
    if (!key) return Promise.reject(new RangeError("static hydrology region key is outside the finite world"));
    const entry = this.regionFor(key);
    entry.references += 1;
    this.touch(entry);
    this.evictUnleased();
    return Promise.resolve(entry.region);
  }
  releaseRegion(region) {
    const entry = this.regions.get(region.key.regionX, region.key.regionY);
    if (!entry || entry.region !== region || entry.references <= 0) {
      throw new Error("static hydrology region release does not match an active source lease");
    }
    entry.references -= 1;
    this.touch(entry);
    this.evictUnleased();
  }
  hasRegion(regionX, regionY) {
    return this.regions.has(regionX, regionY);
  }
  get stats() {
    let leasedRegions = 0;
    for (const entry of this.regions.values()) {
      if (entry.references > 0) leasedRegions += 1;
    }
    return Object.freeze({
      residentRegions: this.regions.size,
      residentBytes: this.residentBytes,
      leasedRegions,
      inFlightRegions: 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      workers: 0,
      busyWorkers: 0,
      queuedWorkerTasks: 0
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.regions.clear();
    this.residentBytes = 0;
  }
  regionFor(key) {
    const cached = this.regions.get(key.regionX, key.regionY);
    if (cached) {
      this.cacheHits += 1;
      this.touch(cached);
      return cached;
    }
    this.cacheMisses += 1;
    const region = this.assembleRegion(key);
    const entry = {
      region,
      bytes: hydrologyRegionResidentBytes(region),
      references: 0,
      lastUsed: 0
    };
    this.touch(entry);
    this.regions.set(key.regionX, key.regionY, entry);
    this.residentBytes += entry.bytes;
    return entry;
  }
  touch(entry) {
    if (this.cacheClock >= Number.MAX_SAFE_INTEGER) {
      const entries = [...this.regions.values()].sort((first, second) => first.lastUsed - second.lastUsed);
      for (let index = 0; index < entries.length; index += 1) entries[index].lastUsed = index + 1;
      this.cacheClock = entries.length;
    }
    this.cacheClock += 1;
    entry.lastUsed = this.cacheClock;
  }
  evictUnleased() {
    while (this.residentBytes > this.cacheMaxBytes) {
      let candidate;
      for (const entry of this.regions.values()) {
        if (entry.references === 0 && (!candidate || entry.lastUsed < candidate.lastUsed)) candidate = entry;
      }
      if (!candidate) return;
      this.regions.delete(candidate.region.key.regionX, candidate.region.key.regionY);
      this.residentBytes -= candidate.bytes;
    }
  }
  assembleRegion(key) {
    const regionX = key.regionX;
    const regionY = key.regionY;
    const origin = chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
    const assembler = new HydrologyRegionAssembler({
      worldIdentity: this.worldIdentity,
      topology: "finite",
      key,
      validWidth: Math.min(HYDROLOGY_REGION_SIZE, this.descriptor.width - origin.x),
      validHeight: Math.min(HYDROLOGY_REGION_SIZE, this.descriptor.height - origin.y),
      canonicalizePort: canonicalHydrologyPoint
    });
    if (this.oceanRegions.has(regionX, regionY)) assembler.addOceanReference();
    for (const edge of this.riverEdges.get(regionX, regionY) ?? []) assembler.addDrainageEdge(edge);
    for (const lake of this.lakeSlices.get(regionX, regionY) ?? []) assembler.addLakeSlice(lake);
    return assembler.finish();
  }
  compile(map) {
    const riverGroups = /* @__PURE__ */ new Map();
    const riverEntriesByTile = /* @__PURE__ */ new Map();
    const lakeTiles = /* @__PURE__ */ new Map();
    for (let x = 0; x < this.descriptor.width; x += 1) {
      for (let y = 0; y < this.descriptor.height; y += 1) {
        const tile = getMapTile(map, x, y);
        if (!tile) throw new TypeError(`static hydrology map is missing tile ${x},${y}`);
        assertStaticSemanticTile(tile, x, y);
        const isRiver = tile.modifiers?.includes("river") ?? false;
        const isLake = tile.modifiers?.includes("lake") ?? false;
        if (isRiver && isLake) throw new TypeError(`static water tile ${x},${y} cannot be river and lake`);
        if (tile.type === "sea" /* sea */ || tile.type === "coastal" /* coastal */) {
          const location = hydrologyRegionLocation(x, y);
          this.oceanRegions.set(location.chunkX, location.chunkY, true);
        }
        if (isLake) {
          assertExplicitWaterTile(tile, x, y, "lake");
          if (tile.rivers && tile.rivers.length > 0) {
            throw new TypeError(`static lake tile ${x},${y} cannot carry river ordering metadata`);
          }
          lakeTiles.set(coordinateIdentity2(x, y), Object.freeze({ x, y }));
        }
        if (!isRiver) {
          if (tile.rivers && tile.rivers.length > 0) {
            throw new TypeError(`static non-river tile ${x},${y} carries river ordering metadata`);
          }
          continue;
        }
        assertExplicitWaterTile(tile, x, y, "river");
        if (!Array.isArray(tile.rivers) || tile.rivers.length === 0) {
          throw new TypeError(`static river tile ${x},${y} requires ordered river metadata`);
        }
        const riverIndices = /* @__PURE__ */ new Set();
        for (const entry of tile.rivers) {
          assertRiverEntry(entry, x, y);
          if (riverIndices.has(entry.riverIndex)) {
            throw new Error(`static river tile ${x},${y} repeats river ${entry.riverIndex}`);
          }
          riverIndices.add(entry.riverIndex);
          let group = riverGroups.get(entry.riverIndex);
          if (!group) {
            group = /* @__PURE__ */ new Map();
            riverGroups.set(entry.riverIndex, group);
          }
          if (group.has(entry.riverTileIndex)) {
            throw new Error(`static river ${entry.riverIndex} repeats tile index ${entry.riverTileIndex}`);
          }
          group.set(entry.riverTileIndex, Object.freeze({ x, y }));
        }
        riverEntriesByTile.set(coordinateIdentity2(x, y), tile.rivers);
      }
    }
    const lakeBodyByTile = this.compileLakes(lakeTiles);
    const chains = this.compileRiverChains(riverGroups);
    this.compileRivers(map, chains, riverEntriesByTile, lakeBodyByTile);
  }
  compileLakes(lakeTiles) {
    const bodyByTile = /* @__PURE__ */ new Map();
    const visited = /* @__PURE__ */ new Set();
    for (const tile of lakeTiles.values()) {
      const identity = coordinateIdentity2(tile.x, tile.y);
      if (visited.has(identity)) continue;
      const component = [];
      const queue = [tile];
      visited.add(identity);
      for (let read = 0; read < queue.length; read += 1) {
        const current = queue[read];
        component.push(current);
        for (const neighbor of getNeighbors(current.x, current.y)) {
          const neighborIdentity = coordinateIdentity2(neighbor.x, neighbor.y);
          const next = lakeTiles.get(neighborIdentity);
          if (!next || visited.has(neighborIdentity)) continue;
          visited.add(neighborIdentity);
          queue.push(next);
        }
      }
      component.sort(compareCoordinate2);
      const bodyId = `static-lake:${component[0].x}:${component[0].y}`;
      for (const current of component) {
        bodyByTile.set(coordinateIdentity2(current.x, current.y), bodyId);
        this.assignLakeSlice({
          bodyId,
          centerX: current.x,
          centerY: current.y,
          radiusTiles: STATIC_LAKE_TILE_RADIUS,
          level: STATIC_EXPLICIT_WATER_LEVEL
        });
      }
    }
    return bodyByTile;
  }
  compileRiverChains(groups) {
    const chains = [];
    for (const [riverIndex, indexedTiles] of groups) {
      const tiles = [];
      for (let riverTileIndex = 0; riverTileIndex < indexedTiles.size; riverTileIndex += 1) {
        const tile = indexedTiles.get(riverTileIndex);
        if (!tile) throw new Error(`static river ${riverIndex} tile indices must be contiguous from zero`);
        tiles.push(tile);
        if (riverTileIndex > 0 && !isHexNeighbor(tiles[riverTileIndex - 1], tile)) {
          throw new Error(`static river ${riverIndex} has non-neighboring ordered tiles`);
        }
      }
      chains.push(Object.freeze({ riverIndex, tiles: Object.freeze(tiles) }));
    }
    chains.sort((first, second) => first.riverIndex - second.riverIndex);
    return Object.freeze(chains);
  }
  compileRivers(map, chains, entriesByTile, lakeBodyByTile) {
    const parent = /* @__PURE__ */ new Map();
    for (const chain of chains) parent.set(chain.riverIndex, chain.riverIndex);
    for (const entries of entriesByTile.values()) {
      for (let index = 1; index < entries.length; index += 1) {
        union(parent, entries[0].riverIndex, entries[index].riverIndex);
      }
    }
    const componentMinimum = /* @__PURE__ */ new Map();
    for (const chain of chains) {
      const root = find(parent, chain.riverIndex);
      componentMinimum.set(root, Math.min(componentMinimum.get(root) ?? chain.riverIndex, chain.riverIndex));
    }
    const componentByRiver = /* @__PURE__ */ new Map();
    for (const chain of chains) componentByRiver.set(
      chain.riverIndex,
      componentMinimum.get(find(parent, chain.riverIndex))
    );
    const edgeDrafts = /* @__PURE__ */ new Map();
    const graphNodes = /* @__PURE__ */ new Set();
    const graphEdges = /* @__PURE__ */ new Map();
    const downstreamByNode = /* @__PURE__ */ new Map();
    const claimDownstream = (source, targetIdentity) => {
      const sourceId = coordinateIdentity2(source.x, source.y);
      const existing = downstreamByNode.get(sourceId);
      if (existing !== void 0 && existing !== targetIdentity) {
        throw new Error(`static river node ${source.x},${source.y} has divergent ordered outlets`);
      }
      downstreamByNode.set(sourceId, targetIdentity);
    };
    const addGraphEdge = (source, target) => {
      const sourceId = coordinateIdentity2(source.x, source.y);
      const targetId = coordinateIdentity2(target.x, target.y);
      claimDownstream(source, `node:${targetId}`);
      graphNodes.add(sourceId);
      graphNodes.add(targetId);
      let targets = graphEdges.get(sourceId);
      if (!targets) {
        targets = /* @__PURE__ */ new Set();
        graphEdges.set(sourceId, targets);
      }
      targets.add(targetId);
    };
    const addEdgeDraft = (source, target, component, terminal) => {
      const identity = `${component}:${source.x}:${source.y}>${target.x}:${target.y}:${terminal?.bodyId ?? "node"}`;
      if (!edgeDrafts.has(identity)) edgeDrafts.set(identity, Object.freeze({
        source,
        target,
        component,
        ...terminal ? { terminal } : {}
      }));
    };
    for (const chain of chains) {
      const component = componentByRiver.get(chain.riverIndex);
      for (const tile of chain.tiles) graphNodes.add(coordinateIdentity2(tile.x, tile.y));
      for (let index = 0; index < chain.tiles.length - 1; index += 1) {
        addGraphEdge(chain.tiles[index], chain.tiles[index + 1]);
        addEdgeDraft(chain.tiles[index], chain.tiles[index + 1], component);
      }
      const finalTile = chain.tiles[chain.tiles.length - 1];
      const targets = /* @__PURE__ */ new Map();
      for (const neighbor of getNeighbors(finalTile.x, finalTile.y)) {
        const tile = getMapTile(map, neighbor.x, neighbor.y);
        if (!tile) continue;
        const lakeBody = lakeBodyByTile.get(coordinateIdentity2(neighbor.x, neighbor.y));
        const bodyId = lakeBody ?? (tile.type === "sea" /* sea */ || tile.type === "coastal" /* coastal */ ? "ocean" : void 0);
        if (!bodyId) continue;
        const current = targets.get(bodyId);
        if (!current || compareCoordinate2(neighbor, current) < 0) {
          targets.set(bodyId, Object.freeze({ x: neighbor.x, y: neighbor.y }));
        }
      }
      if (targets.size > 1) {
        throw new Error(`static river ${chain.riverIndex} has ambiguous terminal water bodies`);
      }
      for (const [bodyId, target] of targets) {
        claimDownstream(finalTile, `body:${bodyId}`);
        addEdgeDraft(finalTile, target, component, {
          bodyId,
          kind: bodyId === "ocean" ? "ocean" : "lake"
        });
      }
    }
    for (const node of graphNodes) {
      if (!downstreamByNode.has(node)) {
        throw new Error(`static river node ${node} has no ocean, lake or continuing river outlet`);
      }
    }
    const dischargeByNode = this.calculateRiverDischarge(graphNodes, graphEdges);
    for (const draft of edgeDrafts.values()) {
      const sourceIdentity = coordinateIdentity2(draft.source.x, draft.source.y);
      const discharge = dischargeByNode.get(sourceIdentity);
      if (discharge === void 0) throw new Error("static river edge lost its discharge source");
      const edge = Object.freeze({
        sourceNodeId: `static-node:${draft.source.x}:${draft.source.y}`,
        parentNodeId: `static-node:${draft.target.x}:${draft.target.y}`,
        terminalNodeId: `static:${draft.component}`,
        sourceX: draft.source.x,
        sourceY: draft.source.y,
        parentX: draft.target.x,
        parentY: draft.target.y,
        sourceLevel: STATIC_EXPLICIT_WATER_LEVEL,
        parentLevel: draft.terminal?.kind === "ocean" ? this.descriptor.seaLevel : STATIC_EXPLICIT_WATER_LEVEL,
        dischargeClass: macroDrainageDischargeClass(discharge),
        ...draft.terminal ? { parentTerminal: draft.terminal } : {}
      });
      this.assignRiverEdge(edge);
    }
  }
  calculateRiverDischarge(nodes, edges) {
    const indegree = /* @__PURE__ */ new Map();
    const discharge = /* @__PURE__ */ new Map();
    for (const node of nodes) indegree.set(node, 0);
    for (const node of nodes) discharge.set(node, 1);
    for (const targets of edges.values()) {
      for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
    const queue = [...nodes].filter((node) => indegree.get(node) === 0).sort();
    let visited = 0;
    for (let read = 0; read < queue.length; read += 1) {
      const node = queue[read];
      visited += 1;
      for (const target of edges.get(node) ?? []) {
        const nextDischarge = discharge.get(target) + discharge.get(node);
        if (!Number.isSafeInteger(nextDischarge)) {
          throw new RangeError("static river accumulated discharge exceeds safe integer range");
        }
        discharge.set(target, nextDischarge);
        const next = indegree.get(target) - 1;
        indegree.set(target, next);
        if (next === 0) queue.push(target);
      }
    }
    if (visited !== nodes.size) throw new Error("static ordered river metadata contains a directed cycle");
    return discharge;
  }
  assignRiverEdge(edge) {
    const minimumRegionX = Math.max(0, Math.floor(Math.min(edge.sourceX, edge.parentX) / HYDROLOGY_REGION_SIZE));
    const maximumRegionX = Math.min(
      this.regionCountX - 1,
      Math.floor(Math.max(edge.sourceX, edge.parentX) / HYDROLOGY_REGION_SIZE)
    );
    const minimumRegionY = Math.max(0, Math.floor(Math.min(edge.sourceY, edge.parentY) / HYDROLOGY_REGION_SIZE));
    const maximumRegionY = Math.min(
      this.regionCountY - 1,
      Math.floor(Math.max(edge.sourceY, edge.parentY) / HYDROLOGY_REGION_SIZE)
    );
    for (let regionX = minimumRegionX; regionX <= maximumRegionX; regionX += 1) {
      for (let regionY = minimumRegionY; regionY <= maximumRegionY; regionY += 1) {
        addBucketValue(this.riverEdges, regionX, regionY, edge);
      }
    }
  }
  assignLakeSlice(lake) {
    const minimumRegionX = Math.max(0, Math.floor((lake.centerX - lake.radiusTiles) / HYDROLOGY_REGION_SIZE));
    const maximumRegionX = Math.min(
      this.regionCountX - 1,
      Math.floor((lake.centerX + lake.radiusTiles) / HYDROLOGY_REGION_SIZE)
    );
    const minimumRegionY = Math.max(0, Math.floor((lake.centerY - lake.radiusTiles) / HYDROLOGY_REGION_SIZE));
    const maximumRegionY = Math.min(
      this.regionCountY - 1,
      Math.floor((lake.centerY + lake.radiusTiles) / HYDROLOGY_REGION_SIZE)
    );
    for (let regionX = minimumRegionX; regionX <= maximumRegionX; regionX += 1) {
      for (let regionY = minimumRegionY; regionY <= maximumRegionY; regionY += 1) {
        addBucketValue(this.lakeSlices, regionX, regionY, lake);
      }
    }
  }
};
export {
  BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
  BASE_SEMANTIC_CHUNK_TILE_COUNT,
  COMPILED_SURFACE_BOUNDS_FORMAT_VERSION,
  COMPILED_SURFACE_FIELD_FORMAT_VERSION,
  COMPILED_SURFACE_TEXEL_COUNT,
  COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION,
  COMPILED_WATER_GEOMETRY_FORMAT_VERSION,
  CORE_SUBSTRATE_ENTRIES,
  CORE_VEGETATION_PROFILE_ENTRIES,
  CORE_WORLD_SEMANTICS_V2,
  CompiledSurfaceSampler,
  DEFAULT_HYDROLOGY_REGION_CACHE_BYTES,
  DEFAULT_INFINITE_HYDROLOGY_RESIDENT_BASINS,
  DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES,
  EFFECTIVE_WINDOW_TILE_COUNT,
  EFFECTIVE_WINDOW_TILE_SIZE,
  EffectiveWorldView,
  HALF_FLOAT_CANONICAL_NAN,
  HALF_FLOAT_MAX_FINITE,
  HALF_FLOAT_POSITIVE_INFINITY,
  HYDROLOGY_BOUNDARY_MAX_X,
  HYDROLOGY_BOUNDARY_MAX_Y,
  HYDROLOGY_BOUNDARY_MIN_X,
  HYDROLOGY_BOUNDARY_MIN_Y,
  HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION,
  HYDROLOGY_FEATURE_SPATIAL_INDEX_LEAF_SIZE,
  HYDROLOGY_KIND_LAKE,
  HYDROLOGY_KIND_NONE,
  HYDROLOGY_KIND_OCEAN,
  HYDROLOGY_KIND_RIVER,
  HYDROLOGY_POINT_QUANTIZATION,
  HYDROLOGY_REGION_BASE_RESIDENT_BYTES,
  HYDROLOGY_REGION_FORMAT_VERSION,
  HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE,
  HYDROLOGY_REGION_REVISION,
  HYDROLOGY_REGION_SIZE,
  HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES,
  HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES,
  HYDROLOGY_SPATIAL_CELL_SIZE,
  HydrologyFeatureSpatialIndex,
  HydrologyRegionSpatialIndex,
  InfiniteHydrologyRegionSource,
  InfiniteSemanticWorldSource,
  LAKE_HYDROLOGY_PROFILE,
  MACRO_DRAINAGE_NODE_STEP_TILES,
  MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS,
  MAX_AUTHORED_LAKE_POLYGON_POINTS,
  MAX_COMPILED_WATER_BODIES,
  MAX_COMPILED_WATER_COVERAGE_TRIANGLES,
  MAX_COMPILED_WATER_COVERAGE_VERTICES,
  MAX_DERIVED_HYDROLOGY_BODY_PALETTE,
  MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES,
  MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL,
  MAX_HYDROLOGY_FEATURE_SPATIAL_INDEX_ITEMS,
  MAX_HYDROLOGY_REGION_BODIES,
  MAX_HYDROLOGY_REGION_LAKES,
  MAX_HYDROLOGY_REGION_MOUTHS,
  MAX_HYDROLOGY_REGION_PORTS,
  MAX_HYDROLOGY_REGION_RIVERS,
  MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS,
  MAX_LAKE_RADIUS_TILES,
  MAX_MACRO_DRAINAGE_GRAPH_NODES,
  MAX_SURFACE_DELTA_TRANSACTION_MUTATIONS,
  MAX_SURFACE_DEPENDENCY_HYDROLOGY_FEATURES,
  MAX_SURFACE_DEPENDENCY_HYDROLOGY_REGIONS,
  MAX_SURFACE_DEPENDENCY_SEMANTIC_CHUNKS,
  MAX_SURFACE_PERIODIC_FEATURE_IMAGES,
  MIN_INFINITE_HYDROLOGY_RESIDENT_BASINS,
  MIN_LAKE_RADIUS_TILES,
  MIN_RIVER_DISCHARGE,
  MacroDrainageHydrologySource,
  MemorySurfaceDeltaStore,
  OCEAN_BODY_ID,
  OCEAN_HYDROLOGY_PROFILE,
  ProceduralHydrologyWorldSource,
  RIVER_HYDROLOGY_PROFILE,
  SEMANTIC_DELTA_ALL_FIELDS,
  SEMANTIC_DELTA_FIELD_BIOME,
  SEMANTIC_DELTA_FIELD_HEIGHT,
  SEMANTIC_DELTA_FIELD_SUBSTRATE,
  SEMANTIC_DELTA_FIELD_VEGETATION,
  SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY,
  SPARSE_SEMANTIC_DELTA_FORMAT_VERSION,
  SPARSE_SEMANTIC_DELTA_HEADER_BYTES,
  STATIC_EXPLICIT_WATER_LEVEL,
  STATIC_EXPLICIT_WATER_LEVEL_OFFSET,
  STATIC_LAKE_TILE_RADIUS,
  SURFACE_COMPILER_REVISION,
  SURFACE_COMPILE_PROFILE,
  SURFACE_COMPILE_PROFILE_VERSION,
  SURFACE_CORE_TEXELS,
  SURFACE_DELTA_TRANSACTION_FORMAT_VERSION,
  SURFACE_DEPENDENCY_KEY_FORMAT_VERSION,
  SURFACE_FOG_GPU_BYTES_PER_TEXEL,
  SURFACE_GROUND_LODS,
  SURFACE_STATIC_GPU_BYTES_PER_TEXEL,
  SURFACE_TEXTURE_PAGE_GPU_BYTES,
  SURFACE_WATER_KIND_LAKE,
  SURFACE_WATER_KIND_NONE,
  SURFACE_WATER_KIND_OCEAN,
  SURFACE_WATER_KIND_RIVER,
  SURFACE_WORKER_PROTOCOL_VERSION,
  StaticHydrologyRegionSource,
  StaticSemanticWorldSource,
  SurfaceDeltaConflictError,
  SurfaceDeltaSnapshot,
  SurfaceGroundGeometrySet,
  SurfaceTexturePool,
  SurfaceWaterGeometryBinding,
  SurfaceWorkerClient,
  SurfaceWorkerPool,
  TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION,
  ToroidalSemanticWorldSource,
  WORLD_CHUNK_FORMAT_VERSION_V2,
  WORLD_DESCRIPTOR_FORMAT_VERSION_V2,
  WORLD_GENERATOR_VERSION_V2,
  WORLD_SEMANTIC_CHUNK_SIZE,
  assertAuthoredLakeFeature,
  assertAuthoredRiverFeature,
  assertBaseSemanticChunk,
  assertCompiledSurfaceBounds,
  assertCompiledSurfaceField,
  assertCompiledWaterBodyPalette,
  assertCompiledWaterGeometry,
  assertCoreWorldSemanticsV2,
  assertDerivedHydrologyRaster,
  assertGenerateHydrologyRegionWorkerRequest,
  assertGenerateSemanticChunkWorkerRequest,
  assertHydrologyFeatureDelta,
  assertHydrologyRegion,
  assertHydrologyWorldSource,
  assertMacroDrainageGraph,
  assertSemanticWorldSource,
  assertSparseSemanticDelta,
  assertSurfaceDependencyKey,
  assertSurfaceGroundGeometryData,
  assertSurfaceRequestToken,
  assertTransferableEffectiveWindow,
  assertWorldDescriptorV2,
  authoredHydrologyFeatureBoundsQ64,
  authoredHydrologyPoint,
  buildMacroDrainageGraph,
  buildTransferableEffectiveWindow,
  compileLakeSurfaceField,
  compileOceanSurfaceField,
  compileSemanticSurfaceField,
  compileSurfaceBounds,
  compileSurfaceField,
  compileWaterGeometry,
  compiledSurfaceFieldResidentBytes,
  compiledSurfaceFieldTransferables,
  compiledWaterBodyPaletteIndex,
  compiledWaterGeometryTransferables,
  createAuthoredLakeFeature,
  createAuthoredRiverFeature,
  createBaseSemanticChunkGenerator,
  createCompiledSurfaceField,
  createCompiledSurfaceSample,
  createCompiledWaterBodyPalette,
  createCoreInfiniteWorldDescriptorV2,
  createCoreToroidalWorldDescriptorV2,
  createEffectiveHydrologyRegion,
  createEffectiveSemanticChunk,
  createGenerateHydrologyRegionWorkerRequest,
  createGenerateSemanticChunkWorkerRequest,
  createHydrologyFeatureDelta,
  createHydrologyRegion,
  createProceduralHydrologyRegionGenerator,
  createSparseSemanticDelta,
  createSurfaceCoverageGeometry,
  createSurfaceDependencyKey,
  createSurfaceGroundGeometry,
  createSurfaceGroundGeometryData,
  createSurfaceRequestToken,
  createWorldDescriptorV2,
  deriveHydrologyRaster,
  derivedHydrologyRasterIndex,
  deserializeBaseSemanticChunk,
  deserializeSparseSemanticDelta,
  effectiveHydrologySuppressesBaseFeature,
  finiteFloat16Bits,
  float16BitsToFloat32,
  float32ToFloat16Bits,
  generateBaseSemanticChunk,
  getBaseSemanticTile,
  getEffectiveSemanticTile,
  hydrologyPortConnectionSignature,
  hydrologyRegionBoundsQ64,
  hydrologyRegionMaximumQuantizedCoordinate,
  hydrologyRegionResidentBytes,
  hydrologyRiverHalfWidthTiles,
  macroDrainageNodeId,
  macroDrainageNodeTile,
  macroDrainageTerminalBodyId,
  readSurfaceArrayTextureCapabilities,
  semanticBiomeWeightIndex,
  semanticCatalogLimits,
  semanticClimateIndex,
  semanticGeneratorIdentity,
  semanticTileIndex,
  serializeBaseSemanticChunk,
  serializeSparseSemanticDelta,
  serializeSurfaceDependencyKey,
  serializeWorldDescriptorV2,
  sparseSemanticDeltaEntryIndex,
  sparseSemanticDeltaSerializedBytes,
  surfaceColumnStagger,
  surfaceDependencyKeysEqual,
  surfaceFieldTexelIndex,
  surfaceInfluenceRadiusWorld,
  surfaceRequestTokensEqual,
  surfaceStagger,
  surfaceTexelCenterAxis,
  surfaceToWorld,
  transferableEffectiveWindowTransferables,
  worldDescriptorsV2Equal,
  worldToSurface
};
//# sourceMappingURL=surface.mjs.map
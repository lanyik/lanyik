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
  return (value % modulus + modulus) % modulus;
}
function normalizeMapCoordinates(map, x, y) {
  if (map.w <= 0 || map.h <= 0) return null;
  let normalizedX = x;
  let normalizedY = y;
  if (map.wrapX) normalizedX = positiveModulo(normalizedX, map.w);
  else if (normalizedX < 0 || normalizedX >= map.w) return null;
  if (map.wrapY) normalizedY = positiveModulo(normalizedY, map.h);
  else if (normalizedY < 0 || normalizedY >= map.h) return null;
  return { x: normalizedX, y: normalizedY };
}
function getMapNeighbors(map, x, y) {
  const seen = /* @__PURE__ */ new Set();
  const neighbors = [];
  for (const neighbor of getNeighbors(x, y)) {
    const normalized = normalizeMapCoordinates(map, neighbor.x, neighbor.y);
    if (!normalized) continue;
    const key = `${normalized.x},${normalized.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    neighbors.push({ ...normalized, direction: neighbor.direction });
  }
  return neighbors;
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

// src/world/generateWorld.ts
var MIN_WORLD_SIZE = 8;
var MAX_WORLD_SIZE = 512;
var SEA_LEVEL = 0.43;
var isWater = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
function assertDimension(name, value) {
  if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
    throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
  }
}
function sampleBoundedClimate(seed, x, y, width, height) {
  const nx = width === 1 ? 0 : x / (width - 1) * 2 - 1;
  const ny = height === 1 ? 0 : y / (height - 1) * 2 - 1;
  const edge = Math.max(Math.abs(nx), Math.abs(ny));
  const continent = fractalNoise2D(seed, x * 0.055, y * 0.055, 5);
  const detail = fractalNoise2D(seed ^ 2738958700, x * 0.14, y * 0.14, 3);
  const elevation = continent * 0.78 + detail * 0.22 + 0.12 - Math.pow(edge, 3) * 0.58;
  const moisture = fractalNoise2D(seed ^ 3355524772, x * 0.08, y * 0.08, 4);
  const temperatureNoise = fractalNoise2D(seed ^ 2911926141, x * 0.07, y * 0.07, 3);
  const latitude = Math.abs(ny);
  const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
  return { elevation, moisture, temperature };
}
function sampleToroidalClimate(seed, x, y, width, height) {
  const nx = x / width;
  const ny = y / height;
  const cells = (scale, dimension, minimum) => Math.max(minimum, Math.round(dimension * scale));
  const continent = periodicFractalNoise2D(
    seed,
    nx,
    ny,
    cells(0.055, width, 2),
    cells(0.055, height, 2),
    5
  );
  const detail = periodicFractalNoise2D(
    seed ^ 2738958700,
    nx,
    ny,
    cells(0.14, width, 3),
    cells(0.14, height, 3),
    3
  );
  const elevation = continent * 0.78 + detail * 0.22 + 0.03;
  const moisture = periodicFractalNoise2D(
    seed ^ 3355524772,
    nx,
    ny,
    cells(0.08, width, 2),
    cells(0.08, height, 2),
    4
  );
  const temperatureNoise = periodicFractalNoise2D(
    seed ^ 2911926141,
    nx,
    ny,
    cells(0.07, width, 2),
    cells(0.07, height, 2),
    3
  );
  const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
  const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
  return { elevation, moisture, temperature };
}
function classifyTerrain({ elevation, moisture, temperature }) {
  if (elevation < SEA_LEVEL) return "sea" /* sea */;
  if (elevation > 0.75) return "mountain" /* mountain */;
  if (temperature < 0.18) return "snow" /* snow */;
  if (temperature < 0.34) return "tundra" /* tundra */;
  if (temperature > 0.68 && moisture < 0.42) return "sand" /* sand */;
  return "land" /* land */;
}
function decorateTile(seed, x, y, climate, type) {
  const tile = { type };
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return tile;
  const modifiers = [];
  const lake = type === "land" /* land */ && climate.elevation > SEA_LEVEL + 0.025 && climate.elevation < 0.56 && climate.moisture > 0.74 && randomAt(seed, x, y, 1821285621) > 0.94;
  if (lake) {
    modifiers.push("lake");
  } else {
    if (climate.elevation > 0.62) modifiers.push("hill");
    const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
    if (randomAt(seed, x, y, 668265263) < forestChance) {
      modifiers.push("wood");
      tile.treeModel = climate.temperature > 0.67 ? "Assets/models/palm" : climate.temperature < 0.4 ? "Assets/models/pinia" : "Assets/models/oak";
    }
  }
  if (modifiers.length > 0) tile.modifiers = modifiers;
  return tile;
}
function generateWorld({ seed, width, height, topology = "bounded" }) {
  assertDimension("width", width);
  assertDimension("height", height);
  if (topology === "toroidal" && width % 2 !== 0) {
    throw new RangeError("toroidal worlds require an even width");
  }
  const numericSeed = seedToUint32(seed);
  const data = {};
  const toroidal = topology === "toroidal";
  for (let x = 0; x < width; x += 1) {
    data[x] = {};
    for (let y = 0; y < height; y += 1) {
      const climate = toroidal ? sampleToroidalClimate(numericSeed, x, y, width, height) : sampleBoundedClimate(numericSeed, x, y, width, height);
      const type = classifyTerrain(climate);
      data[x][y] = decorateTile(numericSeed, x, y, climate, type);
    }
  }
  const world = { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const tile = data[x][y];
      if (tile.type !== "sea" /* sea */) continue;
      const touchesLand = getMapNeighbors(world, x, y).some(({ x: nx, y: ny }) => {
        const neighbor = data[nx]?.[ny];
        return neighbor !== void 0 && !isWater(neighbor.type);
      });
      if (touchesLand) tile.type = "coastal" /* coastal */;
    }
  }
  return world;
}

// src/world/generateWorld.worker.ts
var scope = globalThis;
scope.addEventListener("message", (event) => {
  const { id, options } = event.data;
  try {
    scope.postMessage({ id, world: generateWorld(options) });
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    scope.postMessage({
      id,
      error: { name: error.name, message: error.message, stack: error.stack }
    });
  }
});
//# sourceMappingURL=world-generator.worker.mjs.map
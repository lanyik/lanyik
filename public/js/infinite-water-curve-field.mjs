// src/world/InfiniteWaterCurveField.ts
var UINT32_RANGE = 4294967296;
var TAU = Math.PI * 2;
var REFERENCE_FAMILIES = Object.freeze([
  Object.freeze({
    cellSize: 950 / 28,
    slots: 2,
    spawnScale: 0.34,
    minimumLength: 700 / 28,
    maximumLength: 2600 / 28,
    minimumWidth: 2.5 / 28,
    maximumWidth: 11 / 28,
    minimumControlStep: 65 / 28,
    maximumControlStep: 125 / 28,
    maximumBranches: 1
  }),
  Object.freeze({
    cellSize: 2300 / 28,
    slots: 2,
    spawnScale: 0.52,
    minimumLength: 2200 / 28,
    maximumLength: 7200 / 28,
    minimumWidth: 9 / 28,
    maximumWidth: 29 / 28,
    minimumControlStep: 115 / 28,
    maximumControlStep: 210 / 28,
    maximumBranches: 3
  }),
  Object.freeze({
    cellSize: 5900 / 28,
    slots: 1,
    spawnScale: 0.62,
    minimumLength: 7200 / 28,
    maximumLength: 17e3 / 28,
    minimumWidth: 24 / 28,
    maximumWidth: 54 / 28,
    minimumControlStep: 190 / 28,
    maximumControlStep: 310 / 28,
    maximumBranches: 5
  })
]);
var INFINITE_WATER_CURVE_REFERENCE_PROFILE = Object.freeze({
  density: 0.46,
  curvature: 0.68,
  polylineChance: 0.34,
  sampleSpacing: 0.64,
  minimumBranchLength: 280 / 28,
  maximumBranchLength: 860 / 28,
  broadDensityScale: 11e3 / 28,
  regionalDensityScale: 4800 / 28,
  families: REFERENCE_FAMILIES
});
function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}
function positive(name, value) {
  const number = finite(name, value);
  if (number <= 0) throw new RangeError(`${name} must be positive`);
  return number;
}
function unitInterval(name, value) {
  const number = finite(name, value);
  if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
  return number;
}
function assertInfiniteWaterCurveProfile(value) {
  if (!value || typeof value !== "object") throw new TypeError("water curve profile must be an object");
  const profile = value;
  unitInterval("waterCurve.density", profile.density);
  unitInterval("waterCurve.curvature", profile.curvature);
  unitInterval("waterCurve.polylineChance", profile.polylineChance);
  positive("waterCurve.sampleSpacing", profile.sampleSpacing);
  positive("waterCurve.minimumBranchLength", profile.minimumBranchLength);
  positive("waterCurve.maximumBranchLength", profile.maximumBranchLength);
  positive("waterCurve.broadDensityScale", profile.broadDensityScale);
  positive("waterCurve.regionalDensityScale", profile.regionalDensityScale);
  if (!(profile.minimumBranchLength < profile.maximumBranchLength)) {
    throw new RangeError("water curve branch length range must be ordered");
  }
  if (!Array.isArray(profile.families) || profile.families.length === 0) {
    throw new RangeError("water curve profile must contain at least one family");
  }
  for (const [index, family] of profile.families.entries()) {
    if (!family || typeof family !== "object") {
      throw new TypeError(`waterCurve.families.${index} must be an object`);
    }
    positive(`waterCurve.families.${index}.cellSize`, family.cellSize);
    positive(`waterCurve.families.${index}.minimumLength`, family.minimumLength);
    positive(`waterCurve.families.${index}.maximumLength`, family.maximumLength);
    positive(`waterCurve.families.${index}.minimumWidth`, family.minimumWidth);
    positive(`waterCurve.families.${index}.maximumWidth`, family.maximumWidth);
    positive(`waterCurve.families.${index}.minimumControlStep`, family.minimumControlStep);
    positive(`waterCurve.families.${index}.maximumControlStep`, family.maximumControlStep);
    unitInterval(`waterCurve.families.${index}.spawnScale`, family.spawnScale);
    if (!Number.isInteger(family.slots) || family.slots <= 0) {
      throw new RangeError(`waterCurve.families.${index}.slots must be a positive integer`);
    }
    if (!Number.isInteger(family.maximumBranches) || family.maximumBranches < 0) {
      throw new RangeError(`waterCurve.families.${index}.maximumBranches must be a non-negative integer`);
    }
    if (!(family.minimumLength < family.maximumLength) || !(family.minimumWidth < family.maximumWidth) || !(family.minimumControlStep < family.maximumControlStep)) {
      throw new RangeError(`waterCurve.families.${index} ranges must be ordered`);
    }
  }
}
function assertBounds(bounds) {
  if (!bounds || typeof bounds !== "object") throw new TypeError("water curve bounds are required");
  for (const name of ["minX", "maxX", "minY", "maxY"]) {
    finite(`water curve bounds.${name}`, bounds[name]);
  }
  if (!(bounds.minX <= bounds.maxX) || !(bounds.minY <= bounds.maxY)) {
    throw new RangeError("water curve bounds must be ordered");
  }
}
function mix32(value) {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 2146121005);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 2221713035);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}
function waterCurveSeedToUint32(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function featureKey(seed, familyIndex, cellX, cellY, slot) {
  return mix32(
    seed ^ Math.imul(cellX, 1663821227) ^ Math.imul(cellY, 2232777461) ^ Math.imul(familyIndex, 2654435761) ^ Math.imul(slot, 2246822519)
  );
}
function random(seed, x, y, salt) {
  return mix32(
    seed ^ Math.imul(x, 2654435761) ^ Math.imul(y, 2246822519) ^ Math.imul(salt, 3266489917)
  ) / UINT32_RANGE;
}
function randomForFeature(seed, key, salt) {
  return mix32(seed ^ key ^ Math.imul(salt, 668265261)) / UINT32_RANGE;
}
var smoothstep = (value) => value * value * (3 - 2 * value);
function valueNoise1D(seed, x, key, salt) {
  const cell = Math.floor(x);
  const amount = smoothstep(x - cell);
  const first = random(seed, cell, key, salt) * 2 - 1;
  const second = random(seed, cell + 1, key, salt) * 2 - 1;
  return first + (second - first) * amount;
}
function valueNoise2D(seed, x, y, salt) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const amountX = smoothstep(x - cellX);
  const amountY = smoothstep(y - cellY);
  const topLeft = random(seed, cellX, cellY, salt) * 2 - 1;
  const topRight = random(seed, cellX + 1, cellY, salt) * 2 - 1;
  const bottomLeft = random(seed, cellX, cellY + 1, salt) * 2 - 1;
  const bottomRight = random(seed, cellX + 1, cellY + 1, salt) * 2 - 1;
  const top = topLeft + (topRight - topLeft) * amountX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * amountX;
  return top + (bottom - top) * amountY;
}
function localDensity(seed, profile, x, y) {
  const broad = valueNoise2D(seed, x / profile.broadDensityScale, y / profile.broadDensityScale, 61) * 0.5 + 0.5;
  const regional = valueNoise2D(
    seed,
    x / profile.regionalDensityScale,
    y / profile.regionalDensityScale,
    67
  ) * 0.5 + 0.5;
  const clustered = Math.max(0, Math.min(1, (broad * 0.72 + regional * 0.28 - 0.36) / 0.44));
  return 0.22 + smoothstep(clustered) * 0.78;
}
function turnAt(seed, key, parameter, turnScale) {
  const broad = valueNoise1D(seed, parameter / 8.2, key, 101);
  const middle = valueNoise1D(seed, parameter / 3.3, key, 211);
  const detail = valueNoise1D(seed, parameter / 1.45, key, 307);
  return turnScale * (broad * 0.58 + middle * 0.29 + detail * 0.13);
}
function buildMainCurve(seed, profile, familyIndex, cellX, cellY, slot) {
  const family = profile.families[familyIndex];
  const key = featureKey(seed, familyIndex, cellX, cellY, slot);
  const centerX = (cellX + 0.5) * family.cellSize;
  const centerY = (cellY + 0.5) * family.cellSize;
  const spawnChance = profile.density * family.spawnScale * localDensity(seed, profile, centerX, centerY);
  if (randomForFeature(seed, key, 17) >= spawnChance) return void 0;
  const origin = {
    x: (cellX + 0.04 + randomForFeature(seed, key, 23) * 0.92) * family.cellSize,
    y: (cellY + 0.04 + randomForFeature(seed, key, 29) * 0.92) * family.cellSize
  };
  const baseAngle = randomForFeature(seed, key, 31) * TAU;
  const lengthAmount = randomForFeature(seed, key, 37) ** 1.35;
  const totalLength = family.minimumLength + lengthAmount * (family.maximumLength - family.minimumLength);
  const controlStep = family.minimumControlStep + randomForFeature(seed, key, 41) * (family.maximumControlStep - family.minimumControlStep);
  const halfSteps = Math.ceil(totalLength / (controlStep * 2));
  const baseWidth = family.minimumWidth + randomForFeature(seed, key, 43) * (family.maximumWidth - family.minimumWidth);
  const turnScale = (0.035 + profile.curvature * 0.24) * (0.78 + randomForFeature(seed, key, 47) * 0.72);
  const widthAt = (parameter) => {
    const progress = (parameter + halfSteps) / (halfSteps * 2);
    const growth = 0.38 + smoothstep(progress) * 0.78;
    const variation = 1 + valueNoise1D(seed, parameter / 5.5, key, 401) * 0.24;
    return Math.max(profile.sampleSpacing * 0.08, baseWidth * growth * variation);
  };
  const before = [];
  const after = [];
  let current = { ...origin };
  let heading = baseAngle;
  for (let step = 1; step <= halfSteps; step += 1) {
    heading -= turnAt(seed, key, -step + 0.5, turnScale);
    current = {
      x: current.x - Math.cos(heading) * controlStep,
      y: current.y - Math.sin(heading) * controlStep
    };
    before.push({ ...current, width: widthAt(-step) });
  }
  current = { ...origin };
  heading = baseAngle;
  for (let step = 1; step <= halfSteps; step += 1) {
    heading += turnAt(seed, key, step - 0.5, turnScale);
    current = {
      x: current.x + Math.cos(heading) * controlStep,
      y: current.y + Math.sin(heading) * controlStep
    };
    after.push({ ...current, width: widthAt(step) });
  }
  return {
    familyIndex,
    family,
    key,
    ownerCellX: cellX,
    ownerCellY: cellY,
    ownerSlot: slot,
    polyline: randomForFeature(seed, key, 59) < profile.polylineChance,
    controls: [...before.reverse(), { ...origin, width: widthAt(0) }, ...after]
  };
}
function catmullRomPoint(first, second, third, fourth, amount) {
  const squared = amount * amount;
  const cubed = squared * amount;
  const interpolate = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * amount + (2 * a - 5 * b + 4 * c - d) * squared + (-a + 3 * b - 3 * c + d) * cubed);
  return {
    x: interpolate(first.x, second.x, third.x, fourth.x),
    y: interpolate(first.y, second.y, third.y, fourth.y),
    width: second.width + (third.width - second.width) * smoothstep(amount)
  };
}
function linearPoint(first, second, amount) {
  return {
    x: first.x + (second.x - first.x) * amount,
    y: first.y + (second.y - first.y) * amount,
    width: first.width + (second.width - first.width) * smoothstep(amount)
  };
}
function sampleMain(profile, main) {
  const points = [];
  for (let index = 0; index < main.controls.length - 1; index += 1) {
    const first = main.controls[Math.max(0, index - 1)];
    const second = main.controls[index];
    const third = main.controls[index + 1];
    const fourth = main.controls[Math.min(main.controls.length - 1, index + 2)];
    const distance = Math.hypot(third.x - second.x, third.y - second.y);
    const samples = Math.max(1, Math.ceil(distance / profile.sampleSpacing));
    for (let sample = 0; sample < samples; sample += 1) {
      const amount = sample / samples;
      points.push(main.polyline ? linearPoint(second, third, amount) : catmullRomPoint(first, second, third, fourth, amount));
    }
  }
  points.push(main.controls[main.controls.length - 1]);
  return Object.freeze({
    featureKey: main.key,
    familyIndex: main.familyIndex,
    ownerCellX: main.ownerCellX,
    ownerCellY: main.ownerCellY,
    ownerSlot: main.ownerSlot,
    pathIndex: 0,
    branch: false,
    kind: main.polyline ? "polyline" : "curve",
    points: Object.freeze(points)
  });
}
function cubicPoint(points, amount) {
  const inverse = 1 - amount;
  const first = inverse ** 3;
  const second = 3 * inverse ** 2 * amount;
  const third = 3 * inverse * amount ** 2;
  const fourth = amount ** 3;
  return {
    x: points[0].x * first + points[1].x * second + points[2].x * third + points[3].x * fourth,
    y: points[0].y * first + points[1].y * second + points[2].y * third + points[3].y * fourth,
    width: points[0].width * first + points[1].width * second + points[2].width * third + points[3].width * fourth
  };
}
function buildBranch(seed, profile, main, branchIndex) {
  const controls = main.controls;
  const joinIndex = Math.min(
    controls.length - 2,
    2 + Math.floor(random(seed, main.key, branchIndex, 503) * Math.max(1, controls.length - 4))
  );
  const join = controls[joinIndex];
  const previous = controls[joinIndex - 1];
  const next = controls[joinIndex + 1];
  const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
  const tangent = {
    x: (next.x - previous.x) / tangentLength,
    y: (next.y - previous.y) / tangentLength
  };
  const normal = { x: -tangent.y, y: tangent.x };
  const side = random(seed, main.key, branchIndex, 509) < 0.5 ? -1 : 1;
  const length = profile.minimumBranchLength + random(seed, main.key, branchIndex, 521) * (profile.maximumBranchLength - profile.minimumBranchLength);
  const upstream = length * (0.34 + random(seed, main.key, branchIndex, 523) * 0.28);
  const lateral = length * (0.48 + random(seed, main.key, branchIndex, 541) * 0.38) * side;
  const sourceWidth = Math.max(
    profile.sampleSpacing * 0.08,
    main.family.minimumWidth * (0.72 + random(seed, main.key, branchIndex, 547) * 0.8)
  );
  const targetWidth = Math.min(main.family.maximumWidth * 0.42, join.width * 0.42);
  const source = {
    x: join.x - tangent.x * upstream + normal.x * lateral,
    y: join.y - tangent.y * upstream + normal.y * lateral,
    width: sourceWidth
  };
  const branchControls = [
    source,
    {
      x: source.x + tangent.x * length * 0.23 - normal.x * lateral * 0.12,
      y: source.y + tangent.y * length * 0.23 - normal.y * lateral * 0.12,
      width: sourceWidth + (targetWidth - sourceWidth) * 0.33
    },
    {
      x: join.x - tangent.x * length * 0.22,
      y: join.y - tangent.y * length * 0.22,
      width: sourceWidth + (targetWidth - sourceWidth) * 0.75
    },
    { x: join.x, y: join.y, width: targetWidth }
  ];
  const samples = Math.max(2, Math.ceil(length / profile.sampleSpacing));
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    points.push(cubicPoint(branchControls, index / samples));
  }
  return Object.freeze({
    featureKey: main.key,
    familyIndex: main.familyIndex,
    ownerCellX: main.ownerCellX,
    ownerCellY: main.ownerCellY,
    ownerSlot: main.ownerSlot,
    pathIndex: branchIndex + 1,
    branch: true,
    kind: "branch",
    points: Object.freeze(points)
  });
}
function intersects(points, bounds, margin) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return maxX >= bounds.minX - margin && minX <= bounds.maxX + margin && maxY >= bounds.minY - margin && minY <= bounds.maxY + margin;
}
function scaledFamily(family, scale) {
  return Object.freeze({
    cellSize: family.cellSize * scale,
    slots: family.slots,
    spawnScale: family.spawnScale,
    minimumLength: family.minimumLength * scale,
    maximumLength: family.maximumLength * scale,
    minimumWidth: family.minimumWidth * scale,
    maximumWidth: family.maximumWidth * scale,
    minimumControlStep: family.minimumControlStep * scale,
    maximumControlStep: family.maximumControlStep * scale,
    maximumBranches: family.maximumBranches
  });
}
function scaleInfiniteWaterCurveProfile(profile, scale) {
  assertInfiniteWaterCurveProfile(profile);
  positive("water curve spatial scale", scale);
  return Object.freeze({
    density: profile.density,
    curvature: profile.curvature,
    polylineChance: profile.polylineChance,
    sampleSpacing: profile.sampleSpacing * scale,
    minimumBranchLength: profile.minimumBranchLength * scale,
    maximumBranchLength: profile.maximumBranchLength * scale,
    broadDensityScale: profile.broadDensityScale * scale,
    regionalDensityScale: profile.regionalDensityScale * scale,
    families: Object.freeze(profile.families.map((family) => scaledFamily(family, scale)))
  });
}
var DeterministicInfiniteWaterCurveField = class {
  constructor(numericSeed, profile) {
    this.numericSeed = numericSeed;
    this.profile = profile;
    this.maximumReach = profile.families.reduce((maximum, family) => Math.max(
      maximum,
      family.maximumLength / 2 + family.maximumControlStep * 2 + profile.maximumBranchLength
    ), 0);
  }
  forEachPathIntersecting(bounds, visit) {
    assertBounds(bounds);
    if (typeof visit !== "function") throw new TypeError("water curve visitor must be a function");
    this.forEachCandidate(bounds, true, visit);
  }
  forEachPathOwnedBy(bounds, visit) {
    assertBounds(bounds);
    if (typeof visit !== "function") throw new TypeError("water curve visitor must be a function");
    this.forEachCandidate(bounds, false, visit);
  }
  forEachCandidate(bounds, intersecting, visit) {
    for (let familyIndex = 0; familyIndex < this.profile.families.length; familyIndex += 1) {
      const family = this.profile.families[familyIndex];
      const reach = intersecting ? family.maximumLength / 2 + family.maximumControlStep * 2 + this.profile.maximumBranchLength : 0;
      const firstCellX = Math.floor((bounds.minX - reach) / family.cellSize);
      const lastCellX = intersecting ? Math.floor((bounds.maxX + reach) / family.cellSize) : Math.ceil(bounds.maxX / family.cellSize) - 1;
      const firstCellY = Math.floor((bounds.minY - reach) / family.cellSize);
      const lastCellY = intersecting ? Math.floor((bounds.maxY + reach) / family.cellSize) : Math.ceil(bounds.maxY / family.cellSize) - 1;
      for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
        for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
          for (let slot = 0; slot < family.slots; slot += 1) {
            const main = buildMainCurve(
              this.numericSeed,
              this.profile,
              familyIndex,
              cellX,
              cellY,
              slot
            );
            if (!main) continue;
            if (intersecting && !intersects(
              main.controls,
              bounds,
              this.profile.maximumBranchLength + family.maximumControlStep
            )) continue;
            const sampledMain = sampleMain(this.profile, main);
            if (!intersecting || intersects(sampledMain.points, bounds, this.profile.sampleSpacing * 2)) {
              visit(sampledMain);
            }
            const branchCount = Math.floor(
              randomForFeature(this.numericSeed, main.key, 557) * (family.maximumBranches + 1)
            );
            for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
              const branch = buildBranch(this.numericSeed, this.profile, main, branchIndex);
              if (!intersecting || intersects(branch.points, bounds, this.profile.sampleSpacing * 2)) {
                visit(branch);
              }
            }
          }
        }
      }
    }
  }
};
function createInfiniteWaterCurveField(seed, profile = INFINITE_WATER_CURVE_REFERENCE_PROFILE) {
  return createInfiniteWaterCurveFieldFromUint32(waterCurveSeedToUint32(seed), profile);
}
function createInfiniteWaterCurveFieldFromUint32(numericSeed, profile = INFINITE_WATER_CURVE_REFERENCE_PROFILE) {
  if (!Number.isInteger(numericSeed) || numericSeed < 0 || numericSeed > 4294967295) {
    throw new RangeError("water curve numeric seed must be an unsigned 32-bit integer");
  }
  assertInfiniteWaterCurveProfile(profile);
  return new DeterministicInfiniteWaterCurveField(numericSeed, profile);
}
export {
  INFINITE_WATER_CURVE_REFERENCE_PROFILE,
  assertInfiniteWaterCurveProfile,
  createInfiniteWaterCurveField,
  createInfiniteWaterCurveFieldFromUint32,
  scaleInfiniteWaterCurveProfile,
  waterCurveSeedToUint32
};
//# sourceMappingURL=infinite-water-curve-field.mjs.map
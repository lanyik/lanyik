import {
    createInfiniteWaterCurveField,
    INFINITE_WATER_CURVE_REFERENCE_PROFILE,
    scaleInfiniteWaterCurveProfile,
    waterCurveSeedToUint32
} from "./js/infinite-water-curve-field.mjs";

const canvas = document.querySelector("[data-water-field]");
const seedInput = document.querySelector("[data-seed]");
const densityInput = document.querySelector("[data-density]");
const curvatureInput = document.querySelector("[data-curvature]");
const seaLevelInput = document.querySelector("[data-sea-level]");
const showBranchesInput = document.querySelector("[data-show-branches]");
const showOceanInput = document.querySelector("[data-show-ocean]");
const showSamplesInput = document.querySelector("[data-show-samples]");
const showChunksInput = document.querySelector("[data-show-chunks]");
const showHexesInput = document.querySelector("[data-show-hexes]");
const positionOutput = document.querySelector("[data-position]");
const zoomOutput = document.querySelector("[data-zoom]");
const featuresOutput = document.querySelector("[data-features]");
const oceanCoverageOutput = document.querySelector("[data-ocean-coverage]");
const oceanDiameterOutput = document.querySelector("[data-ocean-diameter]");
const densityOutput = document.querySelector("[data-density-output]");
const curvatureOutput = document.querySelector("[data-curvature-output]");
const seaLevelOutput = document.querySelector("[data-sea-level-output]");
const applySeedButton = document.querySelector("[data-apply-seed]");
const resetViewButton = document.querySelector("[data-reset-view]");
const randomSeedButton = document.querySelector("[data-random-seed]");

if (!(canvas instanceof HTMLCanvasElement)
    || !(seedInput instanceof HTMLInputElement)
    || !(densityInput instanceof HTMLInputElement)
    || !(curvatureInput instanceof HTMLInputElement)
    || !(seaLevelInput instanceof HTMLInputElement)
    || !(showBranchesInput instanceof HTMLInputElement)
    || !(showOceanInput instanceof HTMLInputElement)
    || !(showSamplesInput instanceof HTMLInputElement)
    || !(showChunksInput instanceof HTMLInputElement)
    || !(showHexesInput instanceof HTMLInputElement)
    || !(positionOutput instanceof HTMLElement)
    || !(zoomOutput instanceof HTMLElement)
    || !(featuresOutput instanceof HTMLElement)
    || !(oceanCoverageOutput instanceof HTMLElement)
    || !(oceanDiameterOutput instanceof HTMLElement)
    || !(densityOutput instanceof HTMLOutputElement)
    || !(curvatureOutput instanceof HTMLOutputElement)
    || !(seaLevelOutput instanceof HTMLOutputElement)
    || !(applySeedButton instanceof HTMLButtonElement)
    || !(resetViewButton instanceof HTMLButtonElement)
    || !(randomSeedButton instanceof HTMLButtonElement)) {
    throw new Error("infinite water prototype controls are incomplete");
}

const context = canvas.getContext("2d", { alpha: false });
if (!context) throw new Error("2D canvas is unavailable");
const oceanCanvas = document.createElement("canvas");
const oceanContext = oceanCanvas.getContext("2d");
if (!oceanContext) throw new Error("2D ocean canvas is unavailable");

const TAU = Math.PI * 2;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 5;
const OCEAN_SAMPLE_STEP = 12;
const OCEAN_CANDIDATE_CELL_SIZE = 2600;
const OCEAN_MIN_SEPARATION = 5600;
const OCEAN_MAX_REACH = 2600;
const CHUNK_SIZE = 384;
const HEX_RADIUS = 28;
const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS;

const querySeed = new URLSearchParams(location.search).get("seed");
if (querySeed) seedInput.value = querySeed;

const camera = { x: 0, y: 0, zoom: 0.82 };
const pointer = { id: undefined, x: 0, y: 0 };
let width = 1;
let height = 1;
let pixelRatio = 1;
let landGradient;
let seed = seedInput.value.trim();
let numericSeed = waterCurveSeedToUint32(seed);
let geometryDirty = true;
let oceanDirty = true;
let oceanInteractionPending = false;
let oceanRefreshTimer;
let oceanCacheView;
let oceanCoverage = 0;
let visibleOceanBasins = 0;
let largestOceanDiameter = 0;
let renderedMainCurves = 0;
let renderedBranches = 0;
let waterGeometry = { mains: [], branches: [] };

function mix32(value) {
    let mixed = value >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
}

function randomAt(x, y = 0, salt = 0) {
    const value = numericSeed
        ^ Math.imul(x | 0, 0x9e3779b1)
        ^ Math.imul(y | 0, 0x85ebca77)
        ^ Math.imul(salt | 0, 0xc2b2ae3d);
    return mix32(value) / 0x1_0000_0000;
}

function featureKey(familyIndex, cellX, cellY, slot) {
    return mix32(
        numericSeed
        ^ Math.imul(cellX | 0, 0x632be5ab)
        ^ Math.imul(cellY | 0, 0x85157af5)
        ^ Math.imul(familyIndex | 0, 0x9e3779b1)
        ^ Math.imul(slot | 0, 0x85ebca77)
    );
}

function randomForFeature(key, salt) {
    return mix32(numericSeed ^ key ^ Math.imul(salt | 0, 0x27d4eb2d)) / 0x1_0000_0000;
}

function smoothstep(value) {
    return value * value * (3 - 2 * value);
}

function valueNoise2d(x, y, salt) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const amountX = smoothstep(x - cellX);
    const amountY = smoothstep(y - cellY);
    const topLeft = randomAt(cellX, cellY, salt) * 2 - 1;
    const topRight = randomAt(cellX + 1, cellY, salt) * 2 - 1;
    const bottomLeft = randomAt(cellX, cellY + 1, salt) * 2 - 1;
    const bottomRight = randomAt(cellX + 1, cellY + 1, salt) * 2 - 1;
    const top = topLeft + (topRight - topLeft) * amountX;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * amountX;
    return top + (bottom - top) * amountY;
}

function density() {
    return Number(densityInput.value) / 100;
}

function curvature() {
    return Number(curvatureInput.value) / 100;
}

function seaLevel() {
    return Number(seaLevelInput.value) / 100;
}

function buildOceanCandidate(cellX, cellY) {
    const key = featureKey(101, cellX, cellY, 0);
    const spawnChance = Math.min(0.58, 0.12 + seaLevel() * 0.55);
    if (randomForFeature(key, 1001) >= spawnChance) return undefined;

    return {
        cellX,
        cellY,
        key,
        centerX: (cellX + 0.05 + randomForFeature(key, 1019) * 0.9) * OCEAN_CANDIDATE_CELL_SIZE,
        centerY: (cellY + 0.05 + randomForFeature(key, 1021) * 0.9) * OCEAN_CANDIDATE_CELL_SIZE,
        priority: randomForFeature(key, 1003)
    };
}

function buildOceanBasin(cellX, cellY, candidateAt) {
    const candidate = candidateAt(cellX, cellY);
    if (!candidate) return undefined;

    const neighborRadius = Math.ceil(OCEAN_MIN_SEPARATION / OCEAN_CANDIDATE_CELL_SIZE);
    const minimumSquaredDistance = OCEAN_MIN_SEPARATION ** 2;
    for (let neighborX = cellX - neighborRadius; neighborX <= cellX + neighborRadius; neighborX += 1) {
        for (let neighborY = cellY - neighborRadius; neighborY <= cellY + neighborRadius; neighborY += 1) {
            if (neighborX === cellX && neighborY === cellY) continue;
            const neighbor = candidateAt(neighborX, neighborY);
            if (!neighbor) continue;
            const squaredDistance = (neighbor.centerX - candidate.centerX) ** 2
                + (neighbor.centerY - candidate.centerY) ** 2;
            const neighborWins = neighbor.priority < candidate.priority
                || (neighbor.priority === candidate.priority
                    && (neighborX < cellX || (neighborX === cellX && neighborY < cellY)));
            if (squaredDistance < minimumSquaredDistance && neighborWins) return undefined;
        }
    }

    const key = candidate.key;
    const sizeScale = 0.82 + seaLevel() * 0.22;
    const majorRadius = (1250 + randomForFeature(key, 1009) * 800) * sizeScale;
    const minorRadius = majorRadius * (0.55 + randomForFeature(key, 1013) * 0.27);
    const angle = randomForFeature(key, 1031) * TAU;
    return {
        centerX: candidate.centerX,
        centerY: candidate.centerY,
        cosine: Math.cos(angle),
        sine: Math.sin(angle),
        majorRadius,
        minorRadius,
        waveA: 0.07 + randomForFeature(key, 1033) * 0.05,
        waveB: 0.035 + randomForFeature(key, 1039) * 0.035,
        waveC: 0.02 + randomForFeature(key, 1049) * 0.03,
        phaseA: randomForFeature(key, 1051) * TAU,
        phaseB: randomForFeature(key, 1061) * TAU,
        phaseC: randomForFeature(key, 1063) * TAU
    };
}

function queryOceanBasins(bounds) {
    const firstCellX = Math.floor((bounds.minX - OCEAN_MAX_REACH) / OCEAN_CANDIDATE_CELL_SIZE);
    const lastCellX = Math.floor((bounds.maxX + OCEAN_MAX_REACH) / OCEAN_CANDIDATE_CELL_SIZE);
    const firstCellY = Math.floor((bounds.minY - OCEAN_MAX_REACH) / OCEAN_CANDIDATE_CELL_SIZE);
    const lastCellY = Math.floor((bounds.maxY + OCEAN_MAX_REACH) / OCEAN_CANDIDATE_CELL_SIZE);
    const candidates = new Map();
    const candidateAt = (cellX, cellY) => {
        const cacheKey = `${cellX}:${cellY}`;
        if (!candidates.has(cacheKey)) candidates.set(cacheKey, buildOceanCandidate(cellX, cellY));
        return candidates.get(cacheKey);
    };
    const basins = [];
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
        for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
            const basin = buildOceanBasin(cellX, cellY, candidateAt);
            if (basin) basins.push(basin);
        }
    }
    return basins;
}

function oceanBasinValue(x, y, basin) {
    const deltaX = x - basin.centerX;
    const deltaY = y - basin.centerY;
    const localX = deltaX * basin.cosine + deltaY * basin.sine;
    const localY = -deltaX * basin.sine + deltaY * basin.cosine;
    const angle = Math.atan2(localY / basin.minorRadius, localX / basin.majorRadius);
    const boundary = 1
        + Math.sin(angle * 3 + basin.phaseA) * basin.waveA
        + Math.sin(angle * 5 + basin.phaseB) * basin.waveB
        + Math.sin(angle * 8 + basin.phaseC) * basin.waveC;
    return Math.hypot(localX / basin.majorRadius, localY / basin.minorRadius) / boundary - 1;
}

function oceanValue(x, y, basins) {
    let value = Infinity;
    for (const basin of basins) value = Math.min(value, oceanBasinValue(x, y, basin));
    return value;
}

function visibleBounds() {
    const halfWidth = width / camera.zoom / 2;
    const halfHeight = height / camera.zoom / 2;
    return {
        minX: camera.x - halfWidth,
        maxX: camera.x + halfWidth,
        minY: camera.y - halfHeight,
        maxY: camera.y + halfHeight
    };
}

function rebuildWaterGeometry(bounds) {
    const mains = [];
    const branches = [];
    const reference = {
        ...INFINITE_WATER_CURVE_REFERENCE_PROFILE,
        density: density(),
        curvature: curvature()
    };
    const field = createInfiniteWaterCurveField(
        seed,
        scaleInfiniteWaterCurveProfile(reference, HEX_RADIUS)
    );
    field.forEachPathIntersecting(bounds, path => {
        const feature = {
            points: path.points.map(point => ({ x: point.x, y: point.y })),
            widths: path.points.map(point => point.width),
            branch: path.branch
        };
        (path.branch ? branches : mains).push(feature);
    });

    waterGeometry = { mains, branches };
    geometryDirty = false;
}

function drawRibbon(feature, expansion, color) {
    const { points, widths } = feature;
    if (points.length < 2) return;
    const left = [];
    const right = [];
    for (let index = 0; index < points.length; index += 1) {
        const previous = points[Math.max(0, index - 1)];
        const next = points[Math.min(points.length - 1, index + 1)];
        const dx = next.x - previous.x;
        const dy = next.y - previous.y;
        const length = Math.hypot(dx, dy) || 1;
        const normalX = -dy / length;
        const normalY = dx / length;
        const widthAtPoint = widths[index] + expansion;
        left.push({ x: points[index].x + normalX * widthAtPoint, y: points[index].y + normalY * widthAtPoint });
        right.push({ x: points[index].x - normalX * widthAtPoint, y: points[index].y - normalY * widthAtPoint });
    }
    context.beginPath();
    context.moveTo(left[0].x, left[0].y);
    for (let index = 1; index < left.length; index += 1) context.lineTo(left[index].x, left[index].y);
    for (let index = right.length - 1; index >= 0; index -= 1) context.lineTo(right[index].x, right[index].y);
    context.closePath();
    context.fillStyle = color;
    context.fill();

    context.beginPath();
    context.arc(points[0].x, points[0].y, widths[0] + expansion, 0, TAU);
    if (!feature.branch) {
        const lastIndex = points.length - 1;
        context.moveTo(points[lastIndex].x + widths[lastIndex] + expansion, points[lastIndex].y);
        context.arc(points[lastIndex].x, points[lastIndex].y, widths[lastIndex] + expansion, 0, TAU);
    }
    context.fill();
}

function drawCenterline(feature, time) {
    const { points, widths } = feature;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.strokeStyle = feature.branch ? "rgba(155, 231, 226, 0.34)" : "rgba(174, 239, 234, 0.4)";
    let narrowestWidth = Infinity;
    for (const widthAtPoint of widths) narrowestWidth = Math.min(narrowestWidth, widthAtPoint);
    context.lineWidth = Math.max(0.75 / camera.zoom, narrowestWidth * 0.1);
    context.setLineDash([22, 58]);
    context.lineDashOffset = -time * 0.022;
    context.stroke();
    context.setLineDash([]);
}

function drawSampleOverlay(points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.strokeStyle = "rgba(255, 216, 128, 0.68)";
    context.lineWidth = 1 / camera.zoom;
    context.stroke();
    context.fillStyle = "#ffe3a0";
    const radius = 2.2 / camera.zoom;
    for (const point of points) {
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, TAU);
        context.fill();
    }
}

function setWorldTransform() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.translate(width / 2, height / 2);
    context.scale(camera.zoom, camera.zoom);
    context.translate(-camera.x, -camera.y);
}

function drawLand(bounds) {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = landGradient;
    context.fillRect(0, 0, width, height);

    setWorldTransform();
    const patchSize = 520;
    const startX = Math.floor(bounds.minX / patchSize) - 1;
    const endX = Math.ceil(bounds.maxX / patchSize) + 1;
    const startY = Math.floor(bounds.minY / patchSize) - 1;
    const endY = Math.ceil(bounds.maxY / patchSize) + 1;
    for (let x = startX; x <= endX; x += 1) {
        for (let y = startY; y <= endY; y += 1) {
            const centerX = (x + randomAt(x, y, 811)) * patchSize;
            const centerY = (y + randomAt(x, y, 823)) * patchSize;
            const radius = patchSize * (0.35 + randomAt(x, y, 827) * 0.5);
            context.beginPath();
            context.arc(centerX, centerY, radius, 0, TAU);
            context.fillStyle = randomAt(x, y, 829) > 0.5
                ? "rgba(88, 116, 75, 0.075)"
                : "rgba(165, 144, 89, 0.045)";
            context.fill();
        }
    }
}

function thresholdIntersection(first, second, threshold) {
    const difference = second.value - first.value;
    const amount = difference === 0 ? 0.5 : (threshold - first.value) / difference;
    return {
        x: first.x + (second.x - first.x) * amount,
        y: first.y + (second.y - first.y) * amount,
        value: threshold
    };
}

function clipTriangleToOcean(vertices, threshold) {
    const clipped = [];
    for (let index = 0; index < vertices.length; index += 1) {
        const current = vertices[index];
        const previous = vertices[(index + vertices.length - 1) % vertices.length];
        const currentInside = current.value < threshold;
        const previousInside = previous.value < threshold;
        if (currentInside) {
            if (!previousInside) clipped.push(thresholdIntersection(previous, current, threshold));
            clipped.push(current);
        } else if (previousInside) {
            clipped.push(thresholdIntersection(previous, current, threshold));
        }
    }
    return clipped;
}

function polygonArea(points) {
    let twiceArea = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        twiceArea += current.x * next.y - next.x * current.y;
    }
    return Math.abs(twiceArea) * 0.5;
}

function appendPolygon(path, points) {
    if (points.length < 3) return;
    path.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) path.lineTo(points[index].x, points[index].y);
    path.closePath();
}

function rebuildOceanLayer() {
    const columns = Math.max(1, Math.ceil(width / OCEAN_SAMPLE_STEP));
    const rows = Math.max(1, Math.ceil(height / OCEAN_SAMPLE_STEP));
    const stride = columns + 1;
    const threshold = 0;
    const basins = queryOceanBasins(visibleBounds());
    const samples = new Array((columns + 1) * (rows + 1));
    visibleOceanBasins = basins.length;
    largestOceanDiameter = basins.reduce((largest, basin) => Math.max(
        largest,
        basin.majorRadius * 2 * (1 + basin.waveA + basin.waveB + basin.waveC)
    ), 0);

    for (let row = 0; row <= rows; row += 1) {
        const screenY = Math.min(height, row * OCEAN_SAMPLE_STEP);
        const worldY = camera.y + (screenY - height / 2) / camera.zoom;
        for (let column = 0; column <= columns; column += 1) {
            const screenX = Math.min(width, column * OCEAN_SAMPLE_STEP);
            const worldX = camera.x + (screenX - width / 2) / camera.zoom;
            samples[row * stride + column] = {
                x: screenX,
                y: screenY,
                value: oceanValue(worldX, worldY, basins)
            };
        }
    }

    oceanCanvas.width = Math.ceil(width);
    oceanCanvas.height = Math.ceil(height);
    const waterPath = new Path2D();
    const coastPath = new Path2D();
    let waterArea = 0;
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const topLeft = samples[row * stride + column];
            const topRight = samples[row * stride + column + 1];
            const bottomLeft = samples[(row + 1) * stride + column];
            const bottomRight = samples[(row + 1) * stride + column + 1];
            const triangles = [
                [topLeft, topRight, bottomRight],
                [topLeft, bottomRight, bottomLeft]
            ];
            for (const triangle of triangles) {
                const polygon = clipTriangleToOcean(triangle, threshold);
                appendPolygon(waterPath, polygon);
                if (polygon.length >= 3) waterArea += polygonArea(polygon);
            }

            const intersections = [];
            const edges = [
                [topLeft, topRight],
                [topRight, bottomRight],
                [bottomRight, bottomLeft],
                [bottomLeft, topLeft]
            ];
            for (const [first, second] of edges) {
                if ((first.value < threshold) !== (second.value < threshold)) {
                    intersections.push(thresholdIntersection(first, second, threshold));
                }
            }
            for (let index = 0; index + 1 < intersections.length; index += 2) {
                coastPath.moveTo(intersections[index].x, intersections[index].y);
                coastPath.lineTo(intersections[index + 1].x, intersections[index + 1].y);
            }
        }
    }

    const oceanGradient = oceanContext.createLinearGradient(0, 0, 0, oceanCanvas.height);
    oceanGradient.addColorStop(0, "rgba(22, 116, 139, 0.98)");
    oceanGradient.addColorStop(1, "rgba(14, 91, 116, 0.99)");
    oceanContext.fillStyle = oceanGradient;
    oceanContext.fill(waterPath);
    oceanContext.strokeStyle = "rgba(79, 166, 166, 0.9)";
    oceanContext.lineWidth = 2;
    oceanContext.lineCap = "round";
    oceanContext.lineJoin = "round";
    oceanContext.stroke(coastPath);
    oceanCoverage = waterArea / (width * height);
    oceanCacheView = { x: camera.x, y: camera.y, zoom: camera.zoom, width, height };
    oceanDirty = false;
}

function drawOcean() {
    if (!showOceanInput.checked) return;
    if (oceanDirty && (!oceanCacheView || !oceanInteractionPending)) rebuildOceanLayer();
    if (!oceanCacheView) return;
    const scale = camera.zoom / oceanCacheView.zoom;
    const cachedWorldLeft = oceanCacheView.x - oceanCacheView.width / (oceanCacheView.zoom * 2);
    const cachedWorldTop = oceanCacheView.y - oceanCacheView.height / (oceanCacheView.zoom * 2);
    const destinationX = width / 2 + (cachedWorldLeft - camera.x) * camera.zoom;
    const destinationY = height / 2 + (cachedWorldTop - camera.y) * camera.zoom;
    context.save();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = true;
    context.filter = "blur(0.45px)";
    context.drawImage(
        oceanCanvas,
        destinationX,
        destinationY,
        oceanCacheView.width * scale,
        oceanCacheView.height * scale
    );
    context.restore();
}

function deferOceanRefresh() {
    oceanInteractionPending = true;
    clearTimeout(oceanRefreshTimer);
    oceanRefreshTimer = setTimeout(() => {
        oceanInteractionPending = false;
        oceanDirty = true;
    }, 90);
}

function drawChunkGrid(bounds) {
    if (!showChunksInput.checked) return;
    setWorldTransform();
    const startX = Math.floor(bounds.minX / CHUNK_SIZE) * CHUNK_SIZE;
    const startY = Math.floor(bounds.minY / CHUNK_SIZE) * CHUNK_SIZE;
    context.strokeStyle = "rgba(180, 218, 196, 0.13)";
    context.lineWidth = 1 / camera.zoom;
    context.setLineDash([6 / camera.zoom, 7 / camera.zoom]);
    context.beginPath();
    for (let x = startX; x <= bounds.maxX; x += CHUNK_SIZE) {
        context.moveTo(x, bounds.minY);
        context.lineTo(x, bounds.maxY);
    }
    for (let y = startY; y <= bounds.maxY; y += CHUNK_SIZE) {
        context.moveTo(bounds.minX, y);
        context.lineTo(bounds.maxX, y);
    }
    context.stroke();
    context.setLineDash([]);
}

function drawHexGrid(bounds) {
    if (!showHexesInput.checked || camera.zoom < 0.36) return;
    setWorldTransform();
    const qStart = Math.floor(bounds.minX / (HEX_RADIUS * 1.5)) - 2;
    const qEnd = Math.ceil(bounds.maxX / (HEX_RADIUS * 1.5)) + 2;
    context.strokeStyle = "rgba(205, 228, 209, 0.085)";
    context.lineWidth = 0.7 / camera.zoom;
    context.beginPath();
    for (let q = qStart; q <= qEnd; q += 1) {
        const rStart = Math.floor(bounds.minY / HEX_HEIGHT - q / 2) - 2;
        const rEnd = Math.ceil(bounds.maxY / HEX_HEIGHT - q / 2) + 2;
        for (let r = rStart; r <= rEnd; r += 1) {
            const centerX = q * HEX_RADIUS * 1.5;
            const centerY = (r + q / 2) * HEX_HEIGHT;
            for (let corner = 0; corner < 6; corner += 1) {
                const angle = corner * Math.PI / 3;
                const x = centerX + Math.cos(angle) * HEX_RADIUS;
                const y = centerY + Math.sin(angle) * HEX_RADIUS;
                if (corner === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            context.closePath();
        }
    }
    context.stroke();
}

function drawWater(bounds, time) {
    if (geometryDirty) rebuildWaterGeometry(bounds);
    setWorldTransform();
    const features = showBranchesInput.checked
        ? waterGeometry.mains.concat(waterGeometry.branches)
        : waterGeometry.mains;
    renderedMainCurves = waterGeometry.mains.length;
    renderedBranches = showBranchesInput.checked ? waterGeometry.branches.length : 0;

    for (const feature of features) {
        drawRibbon(feature, feature.branch ? 6 : 11, "rgba(39, 67, 54, 0.92)");
    }
    for (const feature of features) {
        drawRibbon(
            feature,
            0,
            feature.branch ? "rgba(36, 121, 132, 0.96)" : "rgba(32, 128, 145, 0.98)"
        );
        drawCenterline(feature, time);
        if (showSamplesInput.checked) drawSampleOverlay(feature.points);
    }
}

function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    pixelRatio = Math.min(1.75, window.devicePixelRatio || 1);
    const targetWidth = Math.round(width * pixelRatio);
    const targetHeight = Math.round(height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        landGradient = context.createRadialGradient(
            width * 0.46,
            height * 0.42,
            0,
            width * 0.5,
            height * 0.5,
            Math.max(width, height)
        );
        landGradient.addColorStop(0, "#263a2f");
        landGradient.addColorStop(1, "#14221d");
        geometryDirty = true;
        oceanDirty = true;
    }
}

function updateOutputs() {
    positionOutput.textContent = `${Math.round(camera.x).toLocaleString()}, ${Math.round(camera.y).toLocaleString()}`;
    zoomOutput.textContent = `${camera.zoom.toFixed(2)}×`;
    featuresOutput.textContent = `${renderedMainCurves} 主曲线 / ${renderedBranches} 支线`;
    oceanCoverageOutput.textContent = showOceanInput.checked
        ? `${Math.round(oceanCoverage * 100)}%`
        : "关闭";
    oceanDiameterOutput.textContent = showOceanInput.checked && largestOceanDiameter > 0
        ? `${Math.round(largestOceanDiameter).toLocaleString()} u`
        : "—";
    densityOutput.value = `${Math.round(density() * 100)}%`;
    curvatureOutput.value = `${Math.round(curvature() * 100)}%`;
    seaLevelOutput.value = `${Math.round(seaLevel() * 100)}%`;
}

function render(time) {
    const bounds = visibleBounds();
    drawLand(bounds);
    drawWater(bounds, time);
    drawOcean();
    drawChunkGrid(bounds);
    drawHexGrid(bounds);
    updateOutputs();
    canvas.dataset.state = "ready";
    requestAnimationFrame(render);
}

function screenToWorld(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    return {
        x: camera.x + (clientX - bounds.left - bounds.width / 2) / camera.zoom,
        y: camera.y + (clientY - bounds.top - bounds.height / 2) / camera.zoom
    };
}

function applySeed() {
    const next = seedInput.value.trim();
    if (!next) {
        seedInput.setCustomValidity("种子不能为空");
        seedInput.reportValidity();
        return;
    }
    seedInput.setCustomValidity("");
    seed = next;
    numericSeed = waterCurveSeedToUint32(seed);
    geometryDirty = true;
    oceanDirty = true;
    const nextQuery = new URLSearchParams(location.search);
    nextQuery.set("seed", seed);
    history.replaceState(null, "", `${location.pathname}?${nextQuery}`);
}

function resetView() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 0.82;
    geometryDirty = true;
    oceanDirty = true;
}

canvas.addEventListener("pointerdown", event => {
    pointer.id = event.pointerId;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
    oceanInteractionPending = true;
});

canvas.addEventListener("pointermove", event => {
    if (pointer.id !== event.pointerId) return;
    camera.x -= (event.clientX - pointer.x) / camera.zoom;
    camera.y -= (event.clientY - pointer.y) / camera.zoom;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    geometryDirty = true;
    oceanDirty = true;
});

const endDrag = event => {
    if (pointer.id !== event.pointerId) return;
    pointer.id = undefined;
    delete canvas.dataset.dragging;
    oceanInteractionPending = false;
    oceanDirty = true;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const before = screenToWorld(event.clientX, event.clientY);
    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * Math.exp(-event.deltaY * 0.0012)));
    const after = screenToWorld(event.clientX, event.clientY);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    geometryDirty = true;
    oceanDirty = true;
    deferOceanRefresh();
}, { passive: false });

applySeedButton.addEventListener("click", applySeed);
seedInput.addEventListener("keydown", event => {
    if (event.key === "Enter") applySeed();
});
densityInput.addEventListener("input", () => {
    geometryDirty = true;
});
curvatureInput.addEventListener("input", () => {
    geometryDirty = true;
});
seaLevelInput.addEventListener("input", () => {
    oceanDirty = true;
    deferOceanRefresh();
});
resetViewButton.addEventListener("click", resetView);
randomSeedButton.addEventListener("click", () => {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    seedInput.value = `water-${values[0].toString(36)}-${values[1].toString(36)}`;
    applySeed();
    resetView();
});

window.addEventListener("keydown", event => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key.toLowerCase() === "g") showChunksInput.checked = !showChunksInput.checked;
    if (event.key.toLowerCase() === "p") showSamplesInput.checked = !showSamplesInput.checked;
    if (event.key.toLowerCase() === "h") showHexesInput.checked = !showHexesInput.checked;
    if (event.key === "0") resetView();
});

window.getInfiniteWaterDiagnostics = () => {
    const directionBins = new Set(waterGeometry.mains.map(main => {
        const start = main.points[0];
        const end = main.points.at(-1);
        const undirectedAngle = (Math.atan2(end.y - start.y, end.x - start.x) + Math.PI) % Math.PI;
        return Math.floor(undirectedAngle / Math.PI * 12);
    })).size;
    return {
        ready: canvas.dataset.state === "ready",
        seed,
        camera: { ...camera },
        renderedMainCurves,
        renderedBranches,
        directionBins,
        oceanCoverage: showOceanInput.checked ? oceanCoverage : 0,
        visibleOceanBasins: showOceanInput.checked ? visibleOceanBasins : 0,
        largestOceanDiameter: showOceanInput.checked ? largestOceanDiameter : 0,
        minimumOceanCorridor: OCEAN_MIN_SEPARATION - OCEAN_MAX_REACH * 2,
        sampleSignature: [
            randomAt(-7, 11, 17),
            randomAt(-7, 11, 23),
            randomAt(-3, 1, 307),
            randomAt(-7200, 11_400, 1001),
            density(),
            curvature(),
            seaLevel()
        ].map(value => value.toFixed(6)).join("|")
    };
};

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
resize();
requestAnimationFrame(render);

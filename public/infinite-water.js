const canvas = document.querySelector("[data-water-field]");
const seedInput = document.querySelector("[data-seed]");
const densityInput = document.querySelector("[data-density]");
const curvatureInput = document.querySelector("[data-curvature]");
const showBranchesInput = document.querySelector("[data-show-branches]");
const showSamplesInput = document.querySelector("[data-show-samples]");
const showChunksInput = document.querySelector("[data-show-chunks]");
const showHexesInput = document.querySelector("[data-show-hexes]");
const positionOutput = document.querySelector("[data-position]");
const zoomOutput = document.querySelector("[data-zoom]");
const featuresOutput = document.querySelector("[data-features]");
const densityOutput = document.querySelector("[data-density-output]");
const curvatureOutput = document.querySelector("[data-curvature-output]");
const applySeedButton = document.querySelector("[data-apply-seed]");
const resetViewButton = document.querySelector("[data-reset-view]");
const randomSeedButton = document.querySelector("[data-random-seed]");

if (!(canvas instanceof HTMLCanvasElement)
    || !(seedInput instanceof HTMLInputElement)
    || !(densityInput instanceof HTMLInputElement)
    || !(curvatureInput instanceof HTMLInputElement)
    || !(showBranchesInput instanceof HTMLInputElement)
    || !(showSamplesInput instanceof HTMLInputElement)
    || !(showChunksInput instanceof HTMLInputElement)
    || !(showHexesInput instanceof HTMLInputElement)
    || !(positionOutput instanceof HTMLElement)
    || !(zoomOutput instanceof HTMLElement)
    || !(featuresOutput instanceof HTMLElement)
    || !(densityOutput instanceof HTMLOutputElement)
    || !(curvatureOutput instanceof HTMLOutputElement)
    || !(applySeedButton instanceof HTMLButtonElement)
    || !(resetViewButton instanceof HTMLButtonElement)
    || !(randomSeedButton instanceof HTMLButtonElement)) {
    throw new Error("infinite water prototype controls are incomplete");
}

const context = canvas.getContext("2d", { alpha: false });
if (!context) throw new Error("2D canvas is unavailable");

const TAU = Math.PI * 2;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 5;
const FEATURE_CELL_SIZE = 1650;
const MAX_CURVE_REACH = 4500;
const MAX_BRANCH_LENGTH = 860;
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
let numericSeed = hashText(seed);
let geometryDirty = true;
let renderedMainCurves = 0;
let renderedBranches = 0;
let waterGeometry = { mains: [], branches: [] };

function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
        hash ^= hash >>> 13;
    }
    return hash >>> 0;
}

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

function featureKey(cellX, cellY) {
    return mix32(
        numericSeed
        ^ Math.imul(cellX | 0, 0x632be5ab)
        ^ Math.imul(cellY | 0, 0x85157af5)
    );
}

function smoothstep(value) {
    return value * value * (3 - 2 * value);
}

function valueNoise1d(x, key, salt) {
    const cell = Math.floor(x);
    const amount = smoothstep(x - cell);
    const first = randomAt(cell, key, salt) * 2 - 1;
    const second = randomAt(cell + 1, key, salt) * 2 - 1;
    return first + (second - first) * amount;
}

function density() {
    return Number(densityInput.value) / 100;
}

function curvature() {
    return Number(curvatureInput.value) / 100;
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

function headingAt(key, baseAngle, parameter) {
    const bend = 0.14 + curvature() * 1.02;
    const broad = valueNoise1d(parameter / 10.5, key, 101);
    const middle = valueNoise1d(parameter / 4.1, key, 211);
    const detail = valueNoise1d(parameter / 1.8, key, 307);
    return baseAngle + bend * (broad * 0.55 + middle * 0.32 + detail * 0.13);
}

function buildMainControlLine(cellX, cellY) {
    if (randomAt(cellX, cellY, 17) >= density()) return undefined;

    const key = featureKey(cellX, cellY);
    const origin = {
        x: (cellX + 0.08 + randomAt(cellX, cellY, 23) * 0.84) * FEATURE_CELL_SIZE,
        y: (cellY + 0.08 + randomAt(cellX, cellY, 29) * 0.84) * FEATURE_CELL_SIZE
    };
    const baseAngle = randomAt(cellX, cellY, 31) * TAU;
    const totalLength = 2200 + randomAt(cellX, cellY, 37) * 5000;
    const controlStep = 135 + randomAt(cellX, cellY, 41) * 65;
    const halfSteps = Math.ceil(totalLength / (controlStep * 2));
    const baseWidth = 13 + randomAt(cellX, cellY, 43) * 22;
    const before = [];
    const after = [];

    const widthAt = parameter => {
        const progress = (parameter + halfSteps) / (halfSteps * 2);
        const growth = 0.46 + smoothstep(progress) * 0.68;
        const variation = 1 + valueNoise1d(parameter / 5.5, key, 401) * 0.2;
        return Math.max(3, baseWidth * growth * variation);
    };

    let current = { ...origin };
    for (let step = 1; step <= halfSteps; step += 1) {
        const parameter = -step + 0.5;
        const angle = headingAt(key, baseAngle, parameter);
        current = {
            x: current.x - Math.cos(angle) * controlStep,
            y: current.y - Math.sin(angle) * controlStep
        };
        before.push({ point: current, width: widthAt(-step) });
    }

    current = { ...origin };
    for (let step = 1; step <= halfSteps; step += 1) {
        const parameter = step - 0.5;
        const angle = headingAt(key, baseAngle, parameter);
        current = {
            x: current.x + Math.cos(angle) * controlStep,
            y: current.y + Math.sin(angle) * controlStep
        };
        after.push({ point: current, width: widthAt(step) });
    }

    const controls = before.reverse();
    controls.push({ point: origin, width: widthAt(0) }, ...after);
    return { cellX, cellY, key, controls };
}

function catmullRomPoint(first, second, third, fourth, amount) {
    const squared = amount * amount;
    const cubed = squared * amount;
    return {
        x: 0.5 * ((2 * second.x)
            + (-first.x + third.x) * amount
            + (2 * first.x - 5 * second.x + 4 * third.x - fourth.x) * squared
            + (-first.x + 3 * second.x - 3 * third.x + fourth.x) * cubed),
        y: 0.5 * ((2 * second.y)
            + (-first.y + third.y) * amount
            + (2 * first.y - 5 * second.y + 4 * third.y - fourth.y) * squared
            + (-first.y + 3 * second.y - 3 * third.y + fourth.y) * cubed)
    };
}

function sampleMainCurve(main) {
    const subdivisions = Math.max(2, Math.min(9, Math.ceil(150 * camera.zoom / 18)));
    const points = [];
    const widths = [];
    for (let index = 0; index < main.controls.length - 1; index += 1) {
        const first = main.controls[Math.max(0, index - 1)].point;
        const second = main.controls[index].point;
        const third = main.controls[index + 1].point;
        const fourth = main.controls[Math.min(main.controls.length - 1, index + 2)].point;
        for (let sample = 0; sample < subdivisions; sample += 1) {
            const amount = sample / subdivisions;
            points.push(catmullRomPoint(first, second, third, fourth, amount));
            widths.push(
                main.controls[index].width
                + (main.controls[index + 1].width - main.controls[index].width) * smoothstep(amount)
            );
        }
    }
    const finalControl = main.controls.at(-1);
    points.push(finalControl.point);
    widths.push(finalControl.width);
    return { points, widths, branch: false };
}

function cubicPoint(points, amount) {
    const inverse = 1 - amount;
    const first = inverse ** 3;
    const second = 3 * inverse ** 2 * amount;
    const third = 3 * inverse * amount ** 2;
    const fourth = amount ** 3;
    return {
        x: points[0].x * first + points[1].x * second + points[2].x * third + points[3].x * fourth,
        y: points[0].y * first + points[1].y * second + points[2].y * third + points[3].y * fourth
    };
}

function buildBranch(main, branchIndex) {
    const controls = main.controls;
    const joinIndex = 2 + Math.floor(
        randomAt(main.key, branchIndex, 503) * Math.max(1, controls.length - 4)
    );
    const join = controls[joinIndex].point;
    const previous = controls[joinIndex - 1].point;
    const next = controls[joinIndex + 1].point;
    const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
    const tangent = {
        x: (next.x - previous.x) / tangentLength,
        y: (next.y - previous.y) / tangentLength
    };
    const normal = { x: -tangent.y, y: tangent.x };
    const side = randomAt(main.key, branchIndex, 509) < 0.5 ? -1 : 1;
    const length = 280 + randomAt(main.key, branchIndex, 521) * (MAX_BRANCH_LENGTH - 280);
    const upstream = length * (0.34 + randomAt(main.key, branchIndex, 523) * 0.28);
    const lateral = length * (0.48 + randomAt(main.key, branchIndex, 541) * 0.38) * side;
    const source = {
        x: join.x - tangent.x * upstream + normal.x * lateral,
        y: join.y - tangent.y * upstream + normal.y * lateral
    };
    const curveControls = [
        source,
        {
            x: source.x + tangent.x * length * 0.23 - normal.x * lateral * 0.12,
            y: source.y + tangent.y * length * 0.23 - normal.y * lateral * 0.12
        },
        {
            x: join.x - tangent.x * length * 0.22,
            y: join.y - tangent.y * length * 0.22
        },
        join
    ];
    const sampleCount = Math.max(8, Math.min(48, Math.ceil(length * camera.zoom / 18)));
    const points = [];
    const widths = [];
    const sourceWidth = 1.8 + randomAt(main.key, branchIndex, 547) * 3.2;
    const targetWidth = Math.min(12, controls[joinIndex].width * 0.42);
    for (let index = 0; index <= sampleCount; index += 1) {
        const amount = index / sampleCount;
        points.push(cubicPoint(curveControls, amount));
        widths.push(sourceWidth + (targetWidth - sourceWidth) * smoothstep(amount));
    }
    return { points, widths, branch: true };
}

function intersectsWorld(points, bounds, margin = 40) {
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
    return maxX >= bounds.minX - margin && minX <= bounds.maxX + margin
        && maxY >= bounds.minY - margin && minY <= bounds.maxY + margin;
}

function rebuildWaterGeometry(bounds) {
    const mains = [];
    const branches = [];
    const queryMargin = MAX_CURVE_REACH + MAX_BRANCH_LENGTH;
    const firstCellX = Math.floor((bounds.minX - queryMargin) / FEATURE_CELL_SIZE);
    const lastCellX = Math.floor((bounds.maxX + queryMargin) / FEATURE_CELL_SIZE);
    const firstCellY = Math.floor((bounds.minY - queryMargin) / FEATURE_CELL_SIZE);
    const lastCellY = Math.floor((bounds.maxY + queryMargin) / FEATURE_CELL_SIZE);

    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
        for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
            const main = buildMainControlLine(cellX, cellY);
            if (!main) continue;
            const controlPoints = main.controls.map(control => control.point);
            if (!intersectsWorld(controlPoints, bounds, MAX_BRANCH_LENGTH)) continue;

            const sampledMain = sampleMainCurve(main);
            if (intersectsWorld(sampledMain.points, bounds, 100)) mains.push(sampledMain);

            const branchCount = Math.floor(randomAt(main.key, 0, 557) * 4);
            for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
                const branch = buildBranch(main, branchIndex);
                if (intersectsWorld(branch.points, bounds, 60)) branches.push(branch);
            }
        }
    }

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
    }
}

function updateOutputs() {
    positionOutput.textContent = `${Math.round(camera.x).toLocaleString()}, ${Math.round(camera.y).toLocaleString()}`;
    zoomOutput.textContent = `${camera.zoom.toFixed(2)}×`;
    featuresOutput.textContent = `${renderedMainCurves} 主曲线 / ${renderedBranches} 支线`;
    densityOutput.value = `${Math.round(density() * 100)}%`;
    curvatureOutput.value = `${Math.round(curvature() * 100)}%`;
}

function render(time) {
    const bounds = visibleBounds();
    drawLand(bounds);
    drawChunkGrid(bounds);
    drawHexGrid(bounds);
    drawWater(bounds, time);
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
    numericSeed = hashText(seed);
    geometryDirty = true;
    const nextQuery = new URLSearchParams(location.search);
    nextQuery.set("seed", seed);
    history.replaceState(null, "", `${location.pathname}?${nextQuery}`);
}

function resetView() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 0.82;
    geometryDirty = true;
}

canvas.addEventListener("pointerdown", event => {
    pointer.id = event.pointerId;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
});

canvas.addEventListener("pointermove", event => {
    if (pointer.id !== event.pointerId) return;
    camera.x -= (event.clientX - pointer.x) / camera.zoom;
    camera.y -= (event.clientY - pointer.y) / camera.zoom;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    geometryDirty = true;
});

const endDrag = event => {
    if (pointer.id !== event.pointerId) return;
    pointer.id = undefined;
    delete canvas.dataset.dragging;
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
    const key = featureKey(-7, 11);
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
        sampleSignature: [
            randomAt(-7, 11, 17),
            randomAt(-7, 11, 23),
            headingAt(key, randomAt(-7, 11, 31) * TAU, -3),
            density(),
            curvature()
        ].map(value => value.toFixed(6)).join("|")
    };
};

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
resize();
requestAnimationFrame(render);

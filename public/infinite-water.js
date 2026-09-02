const canvas = document.querySelector("[data-water-field]");
const seedInput = document.querySelector("[data-seed]");
const spacingInput = document.querySelector("[data-spacing]");
const curvatureInput = document.querySelector("[data-curvature]");
const showBranchesInput = document.querySelector("[data-show-branches]");
const showSamplesInput = document.querySelector("[data-show-samples]");
const showChunksInput = document.querySelector("[data-show-chunks]");
const showHexesInput = document.querySelector("[data-show-hexes]");
const positionOutput = document.querySelector("[data-position]");
const zoomOutput = document.querySelector("[data-zoom]");
const featuresOutput = document.querySelector("[data-features]");
const spacingOutput = document.querySelector("[data-spacing-output]");
const curvatureOutput = document.querySelector("[data-curvature-output]");
const applySeedButton = document.querySelector("[data-apply-seed]");
const resetViewButton = document.querySelector("[data-reset-view]");
const randomSeedButton = document.querySelector("[data-random-seed]");

if (!(canvas instanceof HTMLCanvasElement)
    || !(seedInput instanceof HTMLInputElement)
    || !(spacingInput instanceof HTMLInputElement)
    || !(curvatureInput instanceof HTMLInputElement)
    || !(showBranchesInput instanceof HTMLInputElement)
    || !(showSamplesInput instanceof HTMLInputElement)
    || !(showChunksInput instanceof HTMLInputElement)
    || !(showHexesInput instanceof HTMLInputElement)
    || !(positionOutput instanceof HTMLElement)
    || !(zoomOutput instanceof HTMLElement)
    || !(featuresOutput instanceof HTMLElement)
    || !(spacingOutput instanceof HTMLOutputElement)
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
const BRANCH_INTERVAL = 430;
const CHUNK_SIZE = 384;
const HEX_RADIUS = 28;
const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS;

const query = new URLSearchParams(location.search);
const querySeed = query.get("seed");
if (querySeed) seedInput.value = querySeed;

const camera = { x: 0, y: 0, zoom: 0.82 };
const pointer = { id: undefined, x: 0, y: 0 };
let width = 1;
let height = 1;
let pixelRatio = 1;
let landGradient;
let seed = seedInput.value.trim();
let numericSeed = hashText(seed);
let fieldAngle = angleForSeed(numericSeed);
let fieldCosine = Math.cos(fieldAngle);
let fieldSine = Math.sin(fieldAngle);
let renderedMainCurves = 0;
let renderedBranches = 0;

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

function randomAt(a, b = 0, lane = 0) {
    const value = numericSeed
        ^ Math.imul(a | 0, 0x9e3779b1)
        ^ Math.imul(b | 0, 0x85ebca77)
        ^ Math.imul(lane | 0, 0xc2b2ae3d);
    return mix32(value) / 0x1_0000_0000;
}

function smoothstep(value) {
    return value * value * (3 - 2 * value);
}

function valueNoise1d(x, lane, salt) {
    const cell = Math.floor(x);
    const amount = smoothstep(x - cell);
    const first = randomAt(cell, lane, salt) * 2 - 1;
    const second = randomAt(cell + 1, lane, salt) * 2 - 1;
    return first + (second - first) * amount;
}

function angleForSeed(value) {
    return (mix32(value ^ 0x68bc21eb) / 0x1_0000_0000 * 0.72 - 0.36) * Math.PI;
}

function spacing() {
    return Number(spacingInput.value);
}

function curvature() {
    return Number(curvatureInput.value) / 100;
}

function laneOffset(lane) {
    return (randomAt(lane, 0, 41) * 2 - 1) * spacing() * 0.08;
}

function riverV(lane, u) {
    const gap = spacing();
    const amplitude = gap * (0.055 + curvature() * 0.16);
    const broad = valueNoise1d(u / 940, lane, 101);
    const middle = valueNoise1d(u / 390, lane, 211);
    const detail = valueNoise1d(u / 155, lane, 307);
    return lane * gap + laneOffset(lane)
        + amplitude * (broad * 0.58 + middle * 0.29 + detail * 0.13);
}

function riverWidth(lane, u) {
    const base = 18 + randomAt(lane, 0, 503) * 17;
    const variation = valueNoise1d(u / 620, lane, 607) * 0.22;
    return base * (1 + variation);
}

function fieldToWorld(u, v) {
    return { x: u * fieldCosine - v * fieldSine, y: u * fieldSine + v * fieldCosine };
}

function worldToField(x, y) {
    return { u: x * fieldCosine + y * fieldSine, v: -x * fieldSine + y * fieldCosine };
}

function riverPoint(lane, u) {
    return fieldToWorld(u, riverV(lane, u));
}

function visibleBounds() {
    const halfWidth = width / camera.zoom / 2;
    const halfHeight = height / camera.zoom / 2;
    const world = {
        minX: camera.x - halfWidth,
        maxX: camera.x + halfWidth,
        minY: camera.y - halfHeight,
        maxY: camera.y + halfHeight
    };
    const corners = [
        worldToField(world.minX, world.minY),
        worldToField(world.maxX, world.minY),
        worldToField(world.maxX, world.maxY),
        worldToField(world.minX, world.maxY)
    ];
    return {
        world,
        field: {
            minU: Math.min(...corners.map(point => point.u)),
            maxU: Math.max(...corners.map(point => point.u)),
            minV: Math.min(...corners.map(point => point.v)),
            maxV: Math.max(...corners.map(point => point.v))
        }
    };
}

function sampleMainRiver(lane, minU, maxU) {
    const step = Math.max(7, Math.min(52, 18 / camera.zoom));
    const start = Math.floor((minU - step * 2) / step) * step;
    const end = Math.ceil((maxU + step * 2) / step) * step;
    const points = [];
    const widths = [];
    for (let u = start; u <= end; u += step) {
        points.push(riverPoint(lane, u));
        widths.push(riverWidth(lane, u));
    }
    return { points, widths };
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

function branchFor(lane, branchIndex) {
    if (randomAt(lane, branchIndex, 701) < 0.36) return undefined;
    const gap = spacing();
    const joinU = (branchIndex + 0.16 + randomAt(lane, branchIndex, 709) * 0.68) * BRANCH_INTERVAL;
    const length = 210 + randomAt(lane, branchIndex, 719) * 350;
    const sourceU = joinU - length;
    const side = randomAt(lane, branchIndex, 727) < 0.5 ? -1 : 1;
    const lateral = gap * (0.15 + randomAt(lane, branchIndex, 733) * 0.24) * side;
    const sourceV = riverV(lane, sourceU) + lateral;
    const joinV = riverV(lane, joinU);
    const derivative = (riverV(lane, joinU + 2) - riverV(lane, joinU - 2)) / 4;
    const handle = Math.min(125, length * 0.28);
    const start = fieldToWorld(sourceU, sourceV);
    const end = fieldToWorld(joinU, joinV);
    const controls = [
        start,
        fieldToWorld(
            sourceU + length * (0.25 + randomAt(lane, branchIndex, 739) * 0.12),
            sourceV - lateral * (0.08 + randomAt(lane, branchIndex, 743) * 0.16)
        ),
        fieldToWorld(joinU - handle, joinV - derivative * handle),
        end
    ];
    const samples = Math.max(8, Math.min(48, Math.ceil(length * camera.zoom / 18)));
    const points = [];
    const widths = [];
    const sourceWidth = 3.2 + randomAt(lane, branchIndex, 751) * 2.8;
    const targetWidth = Math.min(13, riverWidth(lane, joinU) * 0.43);
    for (let index = 0; index <= samples; index += 1) {
        const amount = index / samples;
        points.push(cubicPoint(controls, amount));
        widths.push(sourceWidth + (targetWidth - sourceWidth) * smoothstep(amount));
    }
    return { points, widths };
}

function drawRibbon(points, widths, expansion, color) {
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
}

function drawCenterline(points, widths, time, branch) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.strokeStyle = branch ? "rgba(155, 231, 226, 0.34)" : "rgba(174, 239, 234, 0.4)";
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
    const startX = Math.floor(bounds.world.minX / patchSize) - 1;
    const endX = Math.ceil(bounds.world.maxX / patchSize) + 1;
    const startY = Math.floor(bounds.world.minY / patchSize) - 1;
    const endY = Math.ceil(bounds.world.maxY / patchSize) + 1;
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
    const startX = Math.floor(bounds.world.minX / CHUNK_SIZE) * CHUNK_SIZE;
    const startY = Math.floor(bounds.world.minY / CHUNK_SIZE) * CHUNK_SIZE;
    context.strokeStyle = "rgba(180, 218, 196, 0.13)";
    context.lineWidth = 1 / camera.zoom;
    context.setLineDash([6 / camera.zoom, 7 / camera.zoom]);
    context.beginPath();
    for (let x = startX; x <= bounds.world.maxX; x += CHUNK_SIZE) {
        context.moveTo(x, bounds.world.minY);
        context.lineTo(x, bounds.world.maxY);
    }
    for (let y = startY; y <= bounds.world.maxY; y += CHUNK_SIZE) {
        context.moveTo(bounds.world.minX, y);
        context.lineTo(bounds.world.maxX, y);
    }
    context.stroke();
    context.setLineDash([]);
}

function drawHexGrid(bounds) {
    if (!showHexesInput.checked || camera.zoom < 0.36) return;
    setWorldTransform();
    const qStart = Math.floor(bounds.world.minX / (HEX_RADIUS * 1.5)) - 2;
    const qEnd = Math.ceil(bounds.world.maxX / (HEX_RADIUS * 1.5)) + 2;
    context.strokeStyle = "rgba(205, 228, 209, 0.085)";
    context.lineWidth = 0.7 / camera.zoom;
    context.beginPath();
    for (let q = qStart; q <= qEnd; q += 1) {
        const rStart = Math.floor(bounds.world.minY / HEX_HEIGHT - q / 2) - 2;
        const rEnd = Math.ceil(bounds.world.maxY / HEX_HEIGHT - q / 2) + 2;
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

function drawWater(bounds, time) {
    setWorldTransform();
    renderedMainCurves = 0;
    renderedBranches = 0;
    const gap = spacing();
    const curvatureMargin = gap * 0.38;
    const firstLane = Math.floor((bounds.field.minV - curvatureMargin) / gap) - 1;
    const lastLane = Math.ceil((bounds.field.maxV + curvatureMargin) / gap) + 1;
    const sampled = [];
    const branches = [];

    for (let lane = firstLane; lane <= lastLane; lane += 1) {
        const river = sampleMainRiver(lane, bounds.field.minU, bounds.field.maxU);
        if (!intersectsWorld(river.points, bounds.world, 90)) continue;
        sampled.push({ ...river, branch: false });
        renderedMainCurves += 1;

        if (!showBranchesInput.checked) continue;
        const firstBranch = Math.floor((bounds.field.minU - 650) / BRANCH_INTERVAL) - 1;
        const lastBranch = Math.ceil((bounds.field.maxU + 200) / BRANCH_INTERVAL) + 1;
        for (let branchIndex = firstBranch; branchIndex <= lastBranch; branchIndex += 1) {
            const branch = branchFor(lane, branchIndex);
            if (!branch || !intersectsWorld(branch.points, bounds.world, 50)) continue;
            branches.push({ ...branch, branch: true });
            renderedBranches += 1;
        }
    }

    const features = sampled.concat(branches);
    for (const feature of features) {
        drawRibbon(feature.points, feature.widths, feature.branch ? 6 : 11, "rgba(39, 67, 54, 0.92)");
    }
    for (const feature of features) {
        drawRibbon(
            feature.points,
            feature.widths,
            0,
            feature.branch ? "rgba(36, 121, 132, 0.96)" : "rgba(32, 128, 145, 0.98)"
        );
        drawCenterline(feature.points, feature.widths, time, feature.branch);
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
    }
}

function updateOutputs() {
    positionOutput.textContent = `${Math.round(camera.x).toLocaleString()}, ${Math.round(camera.y).toLocaleString()}`;
    zoomOutput.textContent = `${camera.zoom.toFixed(2)}×`;
    featuresOutput.textContent = `${renderedMainCurves} 主河 / ${renderedBranches} 支流`;
    spacingOutput.value = `${spacing()} u`;
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
    fieldAngle = angleForSeed(numericSeed);
    fieldCosine = Math.cos(fieldAngle);
    fieldSine = Math.sin(fieldAngle);
    const nextQuery = new URLSearchParams(location.search);
    nextQuery.set("seed", seed);
    history.replaceState(null, "", `${location.pathname}?${nextQuery}`);
}

function resetView() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 0.82;
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
}, { passive: false });

applySeedButton.addEventListener("click", applySeed);
seedInput.addEventListener("keydown", event => {
    if (event.key === "Enter") applySeed();
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

window.getInfiniteWaterDiagnostics = () => ({
    ready: canvas.dataset.state === "ready",
    seed,
    camera: { ...camera },
    renderedMainCurves,
    renderedBranches,
    sampleSignature: [
        fieldAngle,
        riverV(-1, -1200),
        riverV(0, 0),
        riverV(2, 1730),
        riverWidth(0, 0)
    ].map(value => value.toFixed(6)).join("|")
});

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
resize();
requestAnimationFrame(render);

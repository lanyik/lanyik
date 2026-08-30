import { GUI } from "./js/vendor/dat.gui.module.js";
import { createI18n } from "./i18n.js";

const api = window.HexMap;
if (!api) throw new Error("HexMap global bundle is unavailable");

const LOCALE_STORAGE_KEY = "three-hex-world.locale";
const query = new URLSearchParams(window.location.search);
const fast = query.get("quality") === "fast";
const canvas = document.querySelector("[data-world-canvas]");
const title = document.querySelector("[data-world-title]");
const detail = document.querySelector("[data-world-detail]");
const controlsHint = document.querySelector("[data-world-controls]");
const performanceTitle = document.querySelector("[data-performance-title]");
const performanceLabels = document.querySelectorAll("[data-performance-label]");
const performanceUnits = document.querySelectorAll("[data-performance-unit]");
const performanceValues = Object.fromEntries(
    [...document.querySelectorAll("[data-performance-value]")]
        .map(element => [element.dataset.performanceValue, element])
);

function readInitialLocale() {
    try {
        return localStorage.getItem(LOCALE_STORAGE_KEY) || navigator.languages?.[0] || navigator.language;
    } catch {
        return navigator.languages?.[0] || navigator.language;
    }
}

function persistLocale(locale) {
    try {
        localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // The active session still changes language when storage is unavailable.
    }
}

const i18n = createI18n({ locale: readInitialLocale() });
const map = new api.HexMap({
    element: canvas,
    hexSize: 2,
    heightScale: 24,
    antialias: !fast,
    maxPixelRatio: fast ? 1 : 2,
    skyVisible: !fast,
    farPlane: 20_000
});
const workerUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
const worldControls = {
    language: i18n.locale,
    worldMode: query.has("toroidal") ? "finite" : "infinite",
    seed: query.get("seed") || "surface-v2-demo",
    width: 512,
    height: 512,
    initialX: Number.parseInt(query.get("x") || "0", 10) || 0,
    initialY: Number.parseInt(query.get("y") || "0", 10) || 0,
    gridVisible: true,
    terrainDetailStrength: 1,
    waterWaveAmplitude: 1,
    waterWaveSpeed: 1,
    coastalWaveOpacity: 1,
    treesVisible: true,
    grassVisible: true,
    grassWindStrength: 1,
    regenerate: () => regenerateWorld()
};

let currentPool;
let generating = false;
let pendingRegeneration = false;
let generationPromise;
let generation = 0;
let lastError;
let activeWorldConfig;
let statusState = { kind: "initializing" };
let contextState = "ready";
let contextLosses = 0;
let contextRestores = 0;
let contextGeneration = 1;

function budgets() {
    return {
        semanticAuthorityBytes: 4 * 1024 * 1024,
        hydrologyAuthorityBytes: 24 * 1024 * 1024,
        compiledCpuBytes: 32 * 1024 * 1024,
        retainedWindowBytes: 4 * 1024 * 1024,
        compiledWorkingSetBytes: 32 * 1024 * 1024,
        surfaceGpuBytes: api.SURFACE_GPU_PAGE_BYTES * 2,
        fogGpuBytes: api.SURFACE_FOG_PAGE_BYTES * 2
    };
}

function setStatus(kind, values = {}) {
    statusState = { kind, ...values };
    renderStatus();
}

function renderStatus() {
    if (statusState.kind === "generating" || statusState.kind === "initializing") {
        title.textContent = i18n.t(`status.${statusState.kind}`);
        detail.textContent = `Surface v2 · generator ${api.WORLD_GENERATOR_VERSION}`;
        return;
    }
    if (statusState.kind === "failed") {
        title.textContent = i18n.t("status.failed");
        detail.textContent = lastError?.message || i18n.t("performance.unavailable");
        return;
    }
    if (statusState.kind === "tile" || statusState.kind === "selected") {
        title.textContent = i18n.t(`status.${statusState.kind}`, statusState);
        detail.textContent = i18n.t("status.surface", {
            surface: i18n.t(`surface.${statusState.surface}`),
            height: statusState.height
        });
        return;
    }
    title.textContent = i18n.t("status.generated");
    const config = activeWorldConfig;
    detail.textContent = config?.worldMode === "finite"
        ? i18n.t("status.worldDetail", config)
        : i18n.t("status.infiniteDetail", config || { seed: worldControls.seed });
}

function applyPresentationStyle() {
    map.setPresentationStyle({
        gridVisible: worldControls.gridVisible,
        terrainDetailStrength: worldControls.terrainDetailStrength,
        waterWaveAmplitude: worldControls.waterWaveAmplitude,
        waterWaveSpeed: worldControls.waterWaveSpeed,
        coastalWaveOpacity: worldControls.coastalWaveOpacity,
        treesVisible: worldControls.treesVisible,
        grassVisible: worldControls.grassVisible,
        grassWindStrength: worldControls.grassWindStrength
    });
}

async function generateOnce() {
    generating = true;
    lastError = undefined;
    setStatus("generating");
    const config = Object.freeze({
        worldMode: worldControls.worldMode,
        seed: String(worldControls.seed),
        width: Number(worldControls.width),
        height: Number(worldControls.height),
        initialX: Number(worldControls.initialX),
        initialY: Number(worldControls.initialY)
    });
    const pool = new api.WorldSurfaceWorkerPool(workerUrl, {
        size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)),
        maxQueuedTasks: 256
    });
    const finite = config.worldMode === "finite";
    let source;
    try {
        const descriptor = api.createWorldDescriptorV2({
            seed: config.seed,
            topology: finite
                ? { kind: "toroidal", width: config.width, height: config.height }
                : { kind: "infinite" }
        });
        source = new api.ProceduralWorldAuthoritySource({ descriptor, pool, ownsPool: true });
        await map.loadWorld({
            source,
            worker: pool,
            budgets: budgets(),
            initialTile: finite
                ? { x: Math.floor(config.width / 2), y: Math.floor(config.height / 2) }
                : { x: config.initialX, y: config.initialY },
            visibleRadiusTiles: fast ? 16 : 24,
            prefetchRadiusTiles: fast ? 28 : 40,
            lod1DistanceTiles: 12,
            lod2DistanceTiles: 22
        });
        currentPool = pool;
        activeWorldConfig = config;
        generation += 1;
        applyPresentationStyle();
        setStatus("generated");
    } catch (reason) {
        source?.dispose();
        if (!source) pool.dispose();
        lastError = reason instanceof Error ? reason : new Error(String(reason));
        setStatus("failed");
        throw lastError;
    } finally {
        generating = false;
    }
}

async function regenerateWorld() {
    if (generating) {
        pendingRegeneration = true;
        return generationPromise;
    }
    generationPromise = (async () => {
        do {
            pendingRegeneration = false;
            await generateOnce();
        } while (pendingRegeneration);
    })();
    return generationPromise;
}

function inspectRenderBackend() {
    const gl = map.renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(renderer || "WebGL renderer unavailable");
}

const renderBackend = inspectRenderBackend();
let performanceNumberFormatter;
let performanceCompactFormatter;
let performanceSampleAt = performance.now();
let performanceSampleFrames = map.stats.renderedFrames;
let performanceSnapshot = {
    fps: null,
    frameTime: null,
    memory: null,
    drawCalls: null,
    triangles: null,
    visibleChunks: null,
    residentChunks: null,
    lod: null,
    sourceChunks: null,
    cache: null,
    cachedChunks: null,
    cacheStorage: null,
    backend: renderBackend
};

function renderPerformance() {
    const formats = {
        fps: value => Math.round(value),
        frameTime: value => value.toFixed(1),
        memory: value => Math.round(value),
        drawCalls: value => performanceNumberFormatter.format(value),
        triangles: value => performanceCompactFormatter.format(value),
        visibleChunks: value => performanceNumberFormatter.format(value),
        residentChunks: value => performanceNumberFormatter.format(value),
        lod: value => value,
        sourceChunks: value => value,
        cache: value => value,
        cachedChunks: value => performanceNumberFormatter.format(value),
        cacheStorage: value => value.toFixed(1),
        backend: value => value
    };
    Object.entries(performanceValues).forEach(([key, element]) => {
        const value = performanceSnapshot[key];
        element.textContent = value === null ? "—" : formats[key](value);
        element.title = value === null ? i18n.t("performance.unavailable") : String(value);
    });
}

function samplePerformance(now) {
    if (map.state === "disposed") return;
    const elapsed = now - performanceSampleAt;
    if (elapsed >= 500) {
        const frameCount = map.stats.renderedFrames - performanceSampleFrames;
        const runtime = map.runtime;
        const rendererInfo = map.renderer.info;
        const authority = runtime?.authority.stats;
        const compilation = runtime?.compilation.stats;
        const ground = runtime?.presentation.stats.ground;
        const worker = currentPool?.stats;
        const heapSize = performance.memory?.usedJSHeapSize;
        performanceSnapshot = {
            fps: frameCount > 0 ? frameCount * 1_000 / elapsed : null,
            frameTime: frameCount > 0 ? elapsed / frameCount : null,
            memory: Number.isFinite(heapSize) ? heapSize / 1_048_576 : null,
            drawCalls: rendererInfo.render.calls,
            triangles: rendererInfo.render.triangles,
            visibleChunks: runtime?.session.stats.mountedChunks ?? null,
            residentChunks: compilation?.cacheEntries ?? null,
            lod: ground ? `${ground.lod0Chunks}/${ground.lod1Chunks}/${ground.lod2Chunks}` : null,
            sourceChunks: authority && worker
                ? `${authority.semanticEntries + authority.hydrologyEntries}/${worker.queuedTasks}`
                : null,
            cache: authority && compilation
                ? `${authority.cacheHits + compilation.cacheHits}/${authority.cacheMisses + compilation.cacheMisses}`
                : null,
            cachedChunks: compilation?.cacheEntries ?? null,
            cacheStorage: authority && compilation
                ? (authority.semanticBytes + authority.hydrologyBytes + compilation.cacheBytes) / 1_048_576
                : null,
            backend: renderBackend
        };
        performanceSampleAt = now;
        performanceSampleFrames = map.stats.renderedFrames;
        renderPerformance();
    }
    requestAnimationFrame(samplePerformance);
}

function updatePerformanceLocale(locale) {
    performanceNumberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    performanceCompactFormatter = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1
    });
    performanceTitle.textContent = i18n.t("performance.title");
    performanceLabels.forEach(element => {
        element.textContent = i18n.t(`performance.${element.dataset.performanceLabel}`);
    });
    performanceUnits.forEach(element => {
        element.textContent = i18n.t(`performance.unit.${element.dataset.performanceUnit}`);
    });
    renderPerformance();
}

const gui = new GUI({ width: 310 });
const languageController = gui.add(worldControls, "language", { English: "en", "简体中文": "zh-CN" });
const worldFolder = gui.addFolder("World generation");
const worldModeController = worldFolder.add(worldControls, "worldMode", {
    [i18n.t("worldMode.finite")]: "finite",
    [i18n.t("worldMode.infinite")]: "infinite"
});
const worldModeSelect = worldModeController.domElement.querySelector("select");
if (worldModeSelect) worldModeSelect.dataset.worldMode = "";
const seedController = worldFolder.add(worldControls, "seed");
const widthController = worldFolder.add(worldControls, "width", 32, 2048, 32);
const heightController = worldFolder.add(worldControls, "height", 32, 2048, 32);
const initialXController = worldFolder.add(worldControls, "initialX").step(1);
const initialYController = worldFolder.add(worldControls, "initialY").step(1);
const generateController = worldFolder.add(worldControls, "regenerate");
worldFolder.open();

const terrainFolder = gui.addFolder("Terrain");
const gridController = terrainFolder.add(worldControls, "gridVisible").onChange(applyPresentationStyle);
const terrainDetailController = terrainFolder
    .add(worldControls, "terrainDetailStrength", 0, 2, 0.05).onChange(applyPresentationStyle);
const waterFolder = gui.addFolder("Water & coast");
const waveHeightController = waterFolder
    .add(worldControls, "waterWaveAmplitude", 0, 4, 0.05).onChange(applyPresentationStyle);
const waveSpeedController = waterFolder
    .add(worldControls, "waterWaveSpeed", 0, 4, 0.05).onChange(applyPresentationStyle);
const foamController = waterFolder
    .add(worldControls, "coastalWaveOpacity", 0, 1, 0.01).onChange(applyPresentationStyle);
const vegetationFolder = gui.addFolder("Vegetation");
const treesController = vegetationFolder.add(worldControls, "treesVisible").onChange(applyPresentationStyle);
const grassController = vegetationFolder.add(worldControls, "grassVisible").onChange(applyPresentationStyle);
const windController = vegetationFolder
    .add(worldControls, "grassWindStrength", 0, 6, 0.1).onChange(applyPresentationStyle);

const translatedControllers = [
    [languageController, "panel.language"],
    [worldModeController, "control.worldMode"],
    [seedController, "control.seed"],
    [widthController, "control.width"],
    [heightController, "control.height"],
    [initialXController, "control.initialX"],
    [initialYController, "control.initialY"],
    [generateController, "control.generate"],
    [gridController, "control.grid"],
    [terrainDetailController, "control.terrainDetail"],
    [waveHeightController, "control.waveHeight"],
    [waveSpeedController, "control.waveSpeed"],
    [foamController, "control.foam"],
    [treesController, "control.trees"],
    [grassController, "control.grass"],
    [windController, "control.wind"]
];
const translatedFolders = [
    [worldFolder, "panel.world"],
    [terrainFolder, "panel.terrain"],
    [waterFolder, "panel.water"],
    [vegetationFolder, "panel.vegetation"]
];

function setControllerVisible(controller, visible) {
    const row = controller.domElement.closest("li");
    if (row) row.style.display = visible ? "" : "none";
}

function syncWorldModeUi() {
    const finite = worldControls.worldMode === "finite";
    setControllerVisible(widthController, finite);
    setControllerVisible(heightController, finite);
    setControllerVisible(initialXController, !finite);
    setControllerVisible(initialYController, !finite);
}

function applyLocale(locale) {
    worldControls.language = locale;
    languageController.updateDisplay();
    document.documentElement.lang = locale;
    document.title = i18n.t("app.title");
    controlsHint.textContent = i18n.t("status.controlsHint");
    if (worldModeSelect) {
        [...worldModeSelect.options].forEach(option => {
            option.textContent = i18n.t(`worldMode.${option.value}`);
        });
    }
    translatedControllers.forEach(([controller, key]) => controller.name(i18n.t(key)));
    translatedFolders.forEach(([folder, key]) => { folder.name = i18n.t(key); });
    GUI.TEXT_OPEN = i18n.t("panel.open");
    GUI.TEXT_CLOSED = i18n.t("panel.close");
    gui.closed = gui.closed;
    updatePerformanceLocale(locale);
    renderStatus();
}

languageController.onChange(locale => persistLocale(i18n.setLocale(locale)));
worldModeController.onChange(() => {
    syncWorldModeUi();
    void regenerateWorld().catch(error => console.error(error));
});
i18n.subscribe(applyLocale);
syncWorldModeUi();
applyLocale(i18n.locale);

map.on("hover", result => setStatus("tile", {
    x: result.x,
    y: result.y,
    surface: result.surface,
    height: (result.height * map.heightScale).toFixed(1)
}));
map.on("click", result => setStatus("selected", {
    x: result.x,
    y: result.y,
    surface: result.surface,
    height: (result.height * map.heightScale).toFixed(1)
}));
map.on("error", error => console.error(error));
canvas.addEventListener("webglcontextlost", () => {
    contextState = "lost";
    contextLosses += 1;
});
canvas.addEventListener("webglcontextrestored", () => {
    contextState = "ready";
    contextRestores += 1;
    contextGeneration += 1;
});

function getWorldDiagnostics() {
    const runtime = map.runtime;
    const rendererInfo = map.renderer.info;
    return {
        status: statusState.kind === "generated" || statusState.kind === "tile" || statusState.kind === "selected"
            ? "generated" : statusState.kind,
        generating,
        generation,
        topology: activeWorldConfig?.worldMode === "finite" ? "toroidal" : "infinite",
        error: lastError?.message,
        renderSession: runtime?.session.stats,
        authority: runtime?.authority.stats,
        compilation: runtime?.compilation.stats,
        presentation: runtime?.presentation.stats,
        surfaceTextures: runtime?.surfaceTextures.stats,
        fogTextures: runtime?.fogTextures.stats,
        worker: currentPool?.stats,
        renderer: { calls: rendererInfo.render.calls, triangles: rendererInfo.render.triangles },
        rendererMemory: {
            geometries: rendererInfo.memory.geometries,
            textures: rendererInfo.memory.textures
        },
        rendererPixelRatio: map.renderer.getPixelRatio(),
        cameraTarget: map.getCameraTarget().toArray(),
        presentationStyle: map.presentationStyle,
        performance: { ...performanceSnapshot },
        webglContext: {
            state: contextState,
            losses: contextLosses,
            restores: contextRestores,
            generation: contextGeneration
        }
    };
}

window.hexWorld = map;
window.hexWorldI18n = i18n;
window.worldControls = worldControls;
window.regenerateWorld = regenerateWorld;
window.getWorldDiagnostics = getWorldDiagnostics;
window.disposeHexWorld = () => map.dispose();
window.addEventListener("beforeunload", () => map.dispose(), { once: true });

requestAnimationFrame(samplePerformance);
void regenerateWorld().catch(error => console.error(error));

import { GUI } from "./js/vendor/dat.gui.module.js";
import { createI18n } from "./i18n.js";
import { FramePerformanceSampler } from "./frame-performance.js";
import {
    IndexedDbWorldChunkCache,
    IndexedDbWorldDeltaStore,
    clearWorldChunkCache
} from "./js/persistence.mjs";

const LOCALE_STORAGE_KEY = "three-hex-world.locale";
const WORLD_MODE_STORAGE_KEY = "three-hex-world.mode";
const WORLD_MODES = new Set(["finite", "infinite", "campaign"]);
const {
    HexMap,
    WorldMinimap,
    ProceduralWorldSource,
    ToroidalWorldSource,
    MIN_WORLD_SIZE,
    MAX_WORLD_SIZE,
    DEFAULT_WORLD_WATER_STYLE,
    WORLD_WATER_STYLE_RANGES
} = window.HexMap;
const query = new URLSearchParams(window.location.search);
const fastRenderMode = query.get("quality") === "fast";
const galleryRenderMode = query.get("quality") === "gallery";
const TARGET_FRAME_RATE = 240;
const TARGET_FRAME_MS = 1000 / TARGET_FRAME_RATE;
const title = document.querySelector("[data-world-title]");
const detail = document.querySelector("[data-world-detail]");
const controlsHint = document.querySelector("[data-world-controls]");
const campaignPanel = document.querySelector("[data-campaign-panel]");
const campaignTitle = document.querySelector("[data-campaign-title]");
const campaignDetail = document.querySelector("[data-campaign-detail]");
const campaignMeta = document.querySelector("[data-campaign-meta]");
const performanceTitle = document.querySelector("[data-performance-title]");
const performanceLabels = document.querySelectorAll("[data-performance-label]");
const performanceUnits = document.querySelectorAll("[data-performance-unit]");
const performanceValues = Object.fromEntries(
    [...document.querySelectorAll("[data-performance-value]")]
        .map(element => [element.dataset.performanceValue, element])
);
const minimapWindow = document.querySelector("[data-minimap-window]");
const minimapTitle = document.querySelector("[data-minimap-title]");
const minimapHint = document.querySelector("[data-minimap-hint]");
const minimapCanvas = document.querySelector("[data-world-minimap]");
const minimapPanel = document.querySelector("[data-minimap-panel]");
const minimapBackdrop = document.querySelector("[data-minimap-backdrop]");
const minimapRefresh = document.querySelector("[data-minimap-refresh]");

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
        // Language switching still works when storage is unavailable.
    }
}

function readInitialWorldMode() {
    if (query.has("campaign")) return "campaign";
    if (query.has("infinite")) return "infinite";
    try {
        const stored = localStorage.getItem(WORLD_MODE_STORAGE_KEY);
        if (WORLD_MODES.has(stored)) return stored;
    } catch {
        // The root route still works with the finite default when storage is unavailable.
    }
    return "finite";
}

function persistWorldMode(mode) {
    try {
        localStorage.setItem(WORLD_MODE_STORAGE_KEY, mode);
    } catch {
        // Mode switching remains available for the current page session.
    }
}

const i18n = createI18n({ locale: readInitialLocale() });

const map = new HexMap({
    element: "[data-world-canvas]",
    size: 48,
    texturesBaseUrl: "textures/",
    gridVisible: false,
    gridColor: 0x42322b,
    gridWidth: 0.04,
    gridOpacity: 0.35,
    treesPerTile: 12,
    treeModel: "Assets/models/oak",
    grassEnabled: true,
    grassDensity: 45,
    waterColorShallow: 0x2f9c8f,
    waterColorDeep: 0x0f4c75,
    waterWaveAmplitude: 1.6,
    waterWaveFrequency: 1,
    waterWaveSpeed: 1,
    coastalWavesEnabled: true,
    coastalWaveDistortion: 0.5,
    coastCurvature: 0.5,
    landBlendCurvature: 0.5,
    ...(galleryRenderMode ? {
        maxPixelRatio: 1,
        antialias: false,
        skyVisible: false,
        treesPerTile: 4,
        grassEnabled: false,
        grassDensity: 0,
        renderDistance: 1_000,
        lodNearDistance: 450,
        lodFarDistance: 850,
        vegetationRenderDistance: 900
    } : fastRenderMode ? {
        maxPixelRatio: 1,
        antialias: false,
        terrainShaderQuality: "fast",
        skyVisible: false,
        treesPerTile: 0,
        grassEnabled: false,
        grassDensity: 0,
        renderDistance: 800,
        lodNearDistance: 350,
        lodFarDistance: 700,
        vegetationRenderDistance: 0,
        landBlendEnabled: false
    } : {})
});

window.hexWorld = map;
window.hexWorldI18n = i18n;

const minimap = new WorldMinimap({
    map,
    element: minimapCanvas,
    infiniteTileSpan: 512,
    rasterSize: 256,
    onExpandedChange: expanded => {
        minimapPanel.classList.toggle("minimap-panel--expanded", expanded);
        minimapBackdrop.hidden = !expanded;
        minimapPanel.setAttribute("role", expanded ? "dialog" : "region");
        // The authoring panel remains usable while the overview is expanded.
        minimapHint.textContent = i18n.t(expanded ? "minimap.expandedHint" : "minimap.hint");
        minimapCanvas.setAttribute("aria-label", i18n.t(
            expanded ? "minimap.expandedLabel" : "minimap.label"
        ));
    },
    onError: error => console.error("World minimap failed", error)
});
window.worldMinimap = minimap;
minimapBackdrop.addEventListener("click", () => minimap.setExpanded(false));
minimapRefresh.addEventListener("click", async () => {
    minimapRefresh.disabled = true;
    try {
        await minimap.refresh(true);
    } catch (error) {
        console.error("World minimap refresh failed", error);
    } finally {
        minimapRefresh.disabled = generating || minimap.view.loading;
    }
});

function inspectRenderBackend() {
    const gl = map.renderer?.getContext();
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl && debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : "WebGL renderer unavailable";
    const software = /swiftshader|software|llvmpipe|basic render/i.test(renderer);
    return {
        renderer,
        software,
        label: software ? `${renderer} · software rendering` : renderer
    };
}

const renderBackend = inspectRenderBackend();

const performanceSampler = new FramePerformanceSampler();
document.addEventListener("visibilitychange", () => performanceSampler.reset());
let performanceNumberFormatter;
let performanceCompactFormatter;
let performanceSnapshot = {
    fps: null,
    frameTime: null,
    cpuFrameMs: null,
    gpuFrameMs: null,
    workFrameMs: null,
    theoreticalFps: null,
    timingBasis: null,
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
    backend: renderBackend.label
};

function renderPerformance() {
    const formats = {
        fps: value => Math.round(value),
        theoreticalFps: value => Math.round(value),
        workFrameMs: value => value.toFixed(2),
        cpuFrameMs: value => value.toFixed(2),
        gpuFrameMs: value => value.toFixed(2),
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
        element.title = value === null
            ? i18n.t("performance.unavailable")
            : typeof value === "number" ? performanceNumberFormatter.format(value) : String(value);
    });
    performanceLabels.forEach(element => {
        const key = element.dataset.performanceLabel;
        const basis = performanceSnapshot.timingBasis;
        const partial = basis === "cpu" || basis === "gpu";
        element.textContent = i18n.t(`performance.${key}${key === "theoreticalFps" && partial ? `.${basis}` : ""}`);
        if (key === "theoreticalFps" || key === "workFrameMs") {
            element.title = i18n.t(`performance.timing.${basis ?? "unavailable"}`);
        }
    });
}

function updatePerformanceLocale(locale) {
    performanceNumberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    performanceCompactFormatter = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1
    });
    performanceTitle.textContent = i18n.t("performance.title");
    performanceUnits.forEach(element => {
        element.textContent = i18n.t(`performance.unit.${element.dataset.performanceUnit}`);
    });
    renderPerformance();
}

function samplePerformance(frame) {
    if (document.hidden || frame.dtS === 0) performanceSampler.reset();
    if (document.hidden) return;
    const timing = performanceSampler.sample(frame);
    if (!timing) return;

    const rendererInfo = map.renderer?.info;
    const streaming = map.streamingStats;
    const worldStreaming = map.worldStreamingStats;
    const heapSize = performance.memory?.usedJSHeapSize;
    performanceSnapshot = {
        ...timing,
        memory: Number.isFinite(heapSize) ? heapSize / 1048576 : null,
        drawCalls: rendererInfo?.render.calls ?? null,
        triangles: rendererInfo?.render.triangles ?? null,
        visibleChunks: streaming?.visibleChunks ?? null,
        residentChunks: streaming?.residentChunks ?? null,
        lod: streaming ? `${streaming.lod0}/${streaming.lod1}/${streaming.lod2}` : null,
        sourceChunks: worldStreaming
            ? `${worldStreaming.residentChunks}/${worldStreaming.pendingChunks}`
            : null,
        cache: worldStreaming ? `${worldStreaming.cacheHits}/${worldStreaming.cacheMisses}` : null,
        cachedChunks: worldStreaming?.cachedChunks ?? null,
        cacheStorage: worldStreaming ? worldStreaming.cachedBytes / 1048576 : null,
        backend: renderBackend.label
    };
    renderPerformance();
}

map.on("frame", samplePerformance);

const controls = {
    language: i18n.locale,
    worldMode: readInitialWorldMode(),
    initialX: Number.parseInt(query.get("x") ?? "0", 10),
    initialY: Number.parseInt(query.get("y") ?? "0", 10),
    seed: "new-world",
    width: 42,
    height: 32,
    oceanScale: DEFAULT_WORLD_WATER_STYLE.oceanScale,
    oceanLevel: DEFAULT_WORLD_WATER_STYLE.oceanLevel,
    riverSourceCellSize: DEFAULT_WORLD_WATER_STYLE.riverSourceCellSize,
    riverSourcesPerCell: DEFAULT_WORLD_WATER_STYLE.riverSourcesPerCell,
    riverLength: DEFAULT_WORLD_WATER_STYLE.riverLength,
    riverWarpScale: DEFAULT_WORLD_WATER_STYLE.riverWarpScale,
    riverWarpAmplitude: DEFAULT_WORLD_WATER_STYLE.riverWarpAmplitude,
    riverBaseRadius: DEFAULT_WORLD_WATER_STYLE.riverBaseRadius,
    riverHighFlowRadius: DEFAULT_WORLD_WATER_STYLE.riverHighFlowRadius,
    riverHighFlowThreshold: DEFAULT_WORLD_WATER_STYLE.riverHighFlowThreshold,
    regenerate,
    resetWaterGeneration,
    clearCachedData,
    startCampaignMarch,
    followCampaignArmy,
    saveCampaign
};

window.worldControls = controls;
window.regenerateWorld = regenerate;
window.clearWorldCache = clearCachedData;
window.startCampaignMarch = startCampaignMarch;
window.followCampaignArmy = followCampaignArmy;
window.saveCampaign = saveCampaign;
window.advanceCampaign = seconds => activeCampaign?.advance(seconds);
window.runCampaignUntilSettled = seconds => activeCampaign?.runUntilSettled(seconds);

let activeSource;
let activeCampaign;
let activeWorldMode;
let generating = false;
let pendingRegeneration = false;
let statusState = { kind: "initializing" };
let campaignSnapshot;

campaignPanel.hidden = true;

window.getWorldDiagnostics = () => ({
    status: statusState.kind,
    generating,
    streaming: map.streamingStats,
    worldStreaming: map.worldStreamingStats,
    frameTasks: map.frameTaskStats,
    adaptive: map.adaptiveStreamingStats,
    gpuTiming: map.gpuTimingStats,
    webglContext: map.webGlContextStats,
    worldLifecycle: map.renderWorldController?.lifecycleStats,
    worldEditing: map.worldEditingStats,
    work: map.workStats,
    rendererMemory: map.renderer ? { ...map.renderer.info.memory } : undefined,
    renderer: map.renderer ? { ...map.renderer.info.render } : undefined,
    modelAssets: map.modelAssetStats,
    rendererPixelRatio: map.renderer?.getPixelRatio(),
    renderBackend,
    worldMode: activeWorldMode ?? controls.worldMode,
    waterStyle: activeSource?.descriptor.waterStyle,
    performance: { ...performanceSnapshot },
    cameraTarget: map.getCameraTarget().toArray(),
    minimap: minimap.view,
    campaign: activeCampaign?.diagnostics
});

window.getCampaignDiagnostics = () => activeCampaign?.diagnostics ?? { ready: false };

window.addEventListener("beforeunload", () => {
    minimap.dispose();
    if (activeCampaign) void activeCampaign.dispose().finally(() => map.dispose());
    else map.dispose();
}, { once: true });

function renderCampaign(snapshot = campaignSnapshot) {
    campaignSnapshot = snapshot;
    if (activeWorldMode !== "campaign") return;
    campaignTitle.textContent = i18n.t("campaign.title");
    const army = snapshot?.army;
    if (!army) {
        campaignDetail.textContent = i18n.t("campaign.loading");
        campaignMeta.textContent = "";
        return;
    }
    campaignDetail.textContent = i18n.t(`campaign.${army.state.status}`, {
        label: army.state.label,
        x: army.x,
        y: army.y
    });
    campaignMeta.textContent = i18n.t("campaign.meta", {
        chunks: snapshot.simulation.residentChunks,
        visibility: i18n.t(snapshot.offscreen ? "campaign.offscreen" : "campaign.onscreen")
    });
}

async function startCampaignMarch() {
    if (activeCampaign) await activeCampaign.startLongMarch();
}

function followCampaignArmy() {
    activeCampaign?.followArmy();
}

async function saveCampaign() {
    await activeCampaign?.flush();
}

function formatTile(tile) {
    return [
        i18n.t(`terrain.${tile.type}`),
        ...(tile.modifiers ?? []).map(modifier => i18n.t(`modifier.${modifier}`))
    ].join(" · ");
}

function renderStatus() {
    const { kind } = statusState;
    if (kind === "initializing") {
        title.textContent = i18n.t("status.initializing");
        detail.textContent = i18n.t("status.initializingDetail");
        return;
    }
    if (kind === "generating" || kind === "generated") {
        title.textContent = i18n.t(`status.${kind}`);
        detail.textContent = i18n.t(statusState.infinite ? "status.infiniteDetail" : "status.worldDetail", statusState);
        return;
    }
    if (kind === "failed") {
        title.textContent = i18n.t("status.failed");
        detail.textContent = statusState.message;
        return;
    }
    if (kind === "cacheCleared" || kind === "cacheUnavailable") {
        title.textContent = i18n.t(`status.${kind}`);
        detail.textContent = i18n.t(`status.${kind}Detail`);
        return;
    }
    if (kind === "tile" || kind === "selected") {
        title.textContent = i18n.t(`status.${kind}`, statusState);
        detail.textContent = formatTile(statusState.tile);
    }
}

function setStatus(kind, values = {}) {
    statusState = { kind, ...values };
    renderStatus();
}

function currentWaterStyle() {
    return {
        oceanScale: Number(controls.oceanScale),
        oceanLevel: Number(controls.oceanLevel),
        riverSourceCellSize: Number(controls.riverSourceCellSize),
        riverSourcesPerCell: Number(controls.riverSourcesPerCell),
        riverLength: Number(controls.riverLength),
        riverWarpScale: Number(controls.riverWarpScale),
        riverWarpAmplitude: Number(controls.riverWarpAmplitude),
        riverBaseRadius: Number(controls.riverBaseRadius),
        riverHighFlowRadius: Number(controls.riverHighFlowRadius),
        riverHighFlowThreshold: Number(controls.riverHighFlowThreshold)
    };
}

function resetWaterGeneration() {
    Object.assign(controls, DEFAULT_WORLD_WATER_STYLE);
    waterGenerationControllers.forEach(controller => controller.updateDisplay());
    void regenerate();
}

async function clearCachedData() {
    if (generating || !window.confirm(i18n.t("cache.confirm"))) return;
    generating = true;
    try {
        const cleared = activeSource?.clearCache
            ? await activeSource.clearCache()
            : await clearWorldChunkCache();
        setStatus(cleared ? "cacheCleared" : "cacheUnavailable");
    } catch (error) {
        console.error(error);
        setStatus("failed", {
            message: error instanceof Error ? error.message : String(error)
        });
    } finally {
        generating = false;
    }
}

async function regenerate() {
    if (generating) {
        pendingRegeneration = true;
        return;
    }
    generating = true;
    const requestedWorldMode = WORLD_MODES.has(controls.worldMode) ? controls.worldMode : "finite";
    const infiniteMode = requestedWorldMode !== "finite";
    const campaignMode = requestedWorldMode === "campaign";
    persistWorldMode(requestedWorldMode);
    syncWorldModeUi();
    setStatus("generating", {
        width: controls.width,
        height: controls.height,
        seed: controls.seed
    });

    try {
        const waterStyle = currentWaterStyle();
        if (activeCampaign) {
            await activeCampaign.dispose();
            activeCampaign = undefined;
            renderCampaign(null);
        }
        activeWorldMode = requestedWorldMode;
        const workerUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
        if (infiniteMode) {
            const initialTile = {
                x: Number(controls.initialX),
                y: Number(controls.initialY)
            };
            const source = new ProceduralWorldSource({
                seed: controls.seed,
                waterStyle,
                workerUrl,
                chunkSize: 24,
                cache: new IndexedDbWorldChunkCache(),
                deltaStore: campaignMode ? new IndexedDbWorldDeltaStore() : undefined,
                workCoordinator: map.workCoordinator
            });
            activeSource = undefined;
            await map.loadWorld({
                source,
                initialTile,
                adaptiveStreaming: false,
                targetFrameMs: TARGET_FRAME_MS
            });
            activeSource = source;
            if (campaignMode) {
                const { createCampaignDemo } = await import("./campaign.js");
                activeCampaign = await createCampaignDemo({
                    map,
                    source,
                    initialTile,
                    tileSize: 48,
                    onUpdate: renderCampaign
                });
                const army = activeCampaign.diagnostics.army;
                if (query.has("autostart") && army?.state.status === "idle"
                    && army.state.completedMarches === 0) {
                    await activeCampaign.startLongMarch();
                }
            }
            setStatus("generated", { infinite: true, seed: controls.seed });
            return;
        }
        const source = new ToroidalWorldSource({
            seed: controls.seed,
            waterStyle,
            width: Number(controls.width),
            height: Number(controls.height),
            workerUrl,
            chunkSize: 24,
            cache: new IndexedDbWorldChunkCache(),
            workCoordinator: map.workCoordinator
        });
        activeSource = undefined;
        await map.loadWorld({
            source,
            adaptiveStreaming: false,
            targetFrameMs: TARGET_FRAME_MS
        });
        activeSource = source;
        setStatus("generated", {
            width: source.bounds.width,
            height: source.bounds.height,
            seed: controls.seed
        });
    } catch (error) {
        if (!map.worldDescriptor) minimap.clear();
        console.error(error);
        setStatus("failed", {
            message: error instanceof Error ? error.message : String(error)
        });
    } finally {
        generating = false;
        if (pendingRegeneration) {
            pendingRegeneration = false;
            queueMicrotask(() => { void regenerate(); });
        }
    }
}

map.on("hover", ({ x, y, tile }) => setStatus("tile", { x, y, tile }));
map.on("click", ({ x, y, tile }) => {
    setStatus("selected", { x, y, tile });
    if (activeWorldMode === "campaign" && activeCampaign && tile.type !== "sea"
        && tile.type !== "coastal" && tile.type !== "mountain") {
        void activeCampaign.orderTo({ x, y }).catch(console.error);
    }
});

const gui = new GUI({ width: 310 });
const languageOptions = { English: "en", "简体中文": "zh-CN" };
const languageController = gui.add(controls, "language", languageOptions);

const worldFolder = gui.addFolder("World generation");
const worldModeOptions = {
    [i18n.t("worldMode.finite")]: "finite",
    [i18n.t("worldMode.infinite")]: "infinite",
    [i18n.t("worldMode.campaign")]: "campaign"
};
const worldModeController = worldFolder.add(controls, "worldMode", worldModeOptions);
const worldModeSelect = worldModeController.domElement.querySelector("select");
if (worldModeSelect) worldModeSelect.dataset.worldMode = "";
const seedController = worldFolder.add(controls, "seed");
const widthController = worldFolder.add(controls, "width", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 2);
const heightController = worldFolder.add(controls, "height", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 1);
const initialXController = worldFolder.add(controls, "initialX").step(1);
const initialYController = worldFolder.add(controls, "initialY").step(1);
const generateController = worldFolder.add(controls, "regenerate");
const clearCacheController = worldFolder.add(controls, "clearCachedData");
worldFolder.open();

const waterGenerationFolder = gui.addFolder("Water generation");
function addWaterController(property) {
    const { min, max, step } = WORLD_WATER_STYLE_RANGES[property];
    const precision = (String(step).split(".")[1] ?? "").length;
    return waterGenerationFolder.add(controls, property, min, max, step).onChange(value => {
        // dat.gui clamps before snapping to step multiples: 78 * 0.05 becomes
        // 3.9000000000000004. Normalize the authored decimal AFTER that snap,
        // for both the slider and its linked input. setValue would snap again.
        controls[property] = Number(value.toFixed(precision));
    });
}
const oceanScaleController = addWaterController("oceanScale");
const oceanLevelController = addWaterController("oceanLevel");
const riverSourceCellController = addWaterController("riverSourceCellSize");
const riverSourcesController = addWaterController("riverSourcesPerCell");
const riverLengthController = addWaterController("riverLength");
const riverWarpScaleController = addWaterController("riverWarpScale");
const riverWarpAmplitudeController = addWaterController("riverWarpAmplitude");
const riverBaseRadiusController = addWaterController("riverBaseRadius");
const riverHighFlowRadiusController = addWaterController("riverHighFlowRadius");
const riverHighFlowThresholdController = addWaterController("riverHighFlowThreshold");
const resetWaterController = waterGenerationFolder.add(controls, "resetWaterGeneration");
const waterGenerationControllers = [
    oceanScaleController,
    oceanLevelController,
    riverSourceCellController,
    riverSourcesController,
    riverLengthController,
    riverWarpScaleController,
    riverWarpAmplitudeController,
    riverBaseRadiusController,
    riverHighFlowRadiusController,
    riverHighFlowThresholdController
];
for (const controller of waterGenerationControllers) {
    const input = controller.domElement.querySelector("input");
    if (input) input.dataset.waterGeneration = controller.property;
    controller.onFinishChange(() => { void regenerate(); });
}
waterGenerationFolder.open();

const campaignFolder = gui.addFolder("Campaign");
const startMarchController = campaignFolder.add(controls, "startCampaignMarch");
const followArmyController = campaignFolder.add(controls, "followCampaignArmy");
const saveCampaignController = campaignFolder.add(controls, "saveCampaign");
campaignFolder.open();

function setControllerVisible(controller, visible) {
    const row = controller.domElement.closest("li");
    if (row) row.style.display = visible ? "" : "none";
}

function syncWorldModeUi() {
    const infinite = controls.worldMode !== "finite";
    const campaign = controls.worldMode === "campaign";
    setControllerVisible(widthController, !infinite);
    setControllerVisible(heightController, !infinite);
    setControllerVisible(initialXController, infinite);
    setControllerVisible(initialYController, infinite);
    if (campaignFolder.domElement.parentElement) {
        campaignFolder.domElement.parentElement.style.display = campaign ? "" : "none";
    }
    campaignPanel.hidden = !campaign;
}

worldModeController.onChange(mode => {
    if (!WORLD_MODES.has(mode)) return;
    persistWorldMode(mode);
    syncWorldModeUi();
    void regenerate();
});
syncWorldModeUi();

const terrainFolder = gui.addFolder("Terrain");
const gridController = terrainFolder.add(map, "gridVisible");
const blendWidthController = terrainFolder.add(map, "landBlendWidth", 0, 1, 0.01);
const blendCurveController = terrainFolder.add(map, "landBlendCurvature", 0, 1, 0.01);
const textureRegionController = terrainFolder.add(map, "terrainTextureRegionSize", 1, 8, 0.5);
const textureRegionInput = textureRegionController.domElement.querySelector("input");
if (textureRegionInput) textureRegionInput.dataset.textureRegion = "";
const mountainController = terrainFolder.add(map, "mountainHeight", 0, 160, 1);
const landformDebugOptions = {
    [i18n.t("landformDebug.off")]: "off",
    [i18n.t("landformDebug.elevation")]: "elevation",
    [i18n.t("landformDebug.ridge")]: "ridge",
    [i18n.t("landformDebug.valley")]: "valley",
    [i18n.t("landformDebug.roughness")]: "roughness"
};
const landformDebugController = terrainFolder.add(map, "landformDebugMode", landformDebugOptions);
const landformDebugSelect = landformDebugController.domElement.querySelector("select");
if (landformDebugSelect) landformDebugSelect.dataset.landformDebug = "";

const waterFolder = gui.addFolder("Water & coast");
const waveHeightController = waterFolder.add(map, "waterWaveAmplitude", 0, 5, 0.1);
const waveSpeedController = waterFolder.add(map, "waterWaveSpeed", 0, 4, 0.05);
const coastCurveController = waterFolder.add(map, "coastCurvature", 0, 1, 0.01);
const foamController = waterFolder.add(map, "coastalWaveOpacity", 0, 1, 0.01);

const vegetationFolder = gui.addFolder("Vegetation");
const treesController = vegetationFolder.add(map, "treesPerTile", 0, 40, 1);
const grassController = vegetationFolder.add(map, "grassVisible");
const windController = vegetationFolder.add(map, "grassWindStrength", 0, 6, 0.1);

const translatedControllers = [
    [languageController, "panel.language"],
    [worldModeController, "control.worldMode"],
    [seedController, "control.seed"],
    [widthController, "control.width"],
    [heightController, "control.height"],
    [initialXController, "control.initialX"],
    [initialYController, "control.initialY"],
    [generateController, "control.generate"],
    [clearCacheController, "control.clearCache"],
    [oceanScaleController, "control.oceanScale"],
    [oceanLevelController, "control.oceanLevel"],
    [riverSourceCellController, "control.riverSourceCellSize"],
    [riverSourcesController, "control.riverSourcesPerCell"],
    [riverLengthController, "control.riverLength"],
    [riverWarpScaleController, "control.riverWarpScale"],
    [riverWarpAmplitudeController, "control.riverWarpAmplitude"],
    [riverBaseRadiusController, "control.riverBaseRadius"],
    [riverHighFlowRadiusController, "control.riverHighFlowRadius"],
    [riverHighFlowThresholdController, "control.riverHighFlowThreshold"],
    [resetWaterController, "control.resetWaterGeneration"],
    [gridController, "control.grid"],
    [blendWidthController, "control.blendWidth"],
    [blendCurveController, "control.blendCurve"],
    [textureRegionController, "control.textureRegion"],
    [mountainController, "control.mountains"],
    [landformDebugController, "control.landformDebug"],
    [waveHeightController, "control.waveHeight"],
    [waveSpeedController, "control.waveSpeed"],
    [coastCurveController, "control.coastCurve"],
    [foamController, "control.foam"],
    [treesController, "control.trees"],
    [grassController, "control.grass"],
    [windController, "control.wind"],
    [startMarchController, "control.startMarch"],
    [followArmyController, "control.followArmy"],
    [saveCampaignController, "control.saveCampaign"]
];

const translatedFolders = [
    [worldFolder, "panel.world"],
    [waterGenerationFolder, "panel.waterGeneration"],
    [terrainFolder, "panel.terrain"],
    [waterFolder, "panel.water"],
    [vegetationFolder, "panel.vegetation"],
    [campaignFolder, "panel.campaign"]
];

function applyLocale(locale) {
    controls.language = locale;
    languageController.updateDisplay();
    document.documentElement.lang = locale;
    document.title = i18n.t("app.title");
    controlsHint.textContent = i18n.t("status.controlsHint");
    minimapTitle.textContent = i18n.t("minimap.title");
    minimapRefresh.textContent = i18n.t("minimap.refresh");
    minimapHint.textContent = i18n.t(minimap.isExpanded ? "minimap.expandedHint" : "minimap.hint");
    minimapCanvas.setAttribute("aria-label", i18n.t(
        minimap.isExpanded ? "minimap.expandedLabel" : "minimap.label"
    ));
    if (worldModeSelect) {
        [...worldModeSelect.options].forEach(option => {
            option.textContent = i18n.t(`worldMode.${option.value}`);
        });
    }
    if (landformDebugSelect) {
        [...landformDebugSelect.options].forEach(option => {
            option.textContent = i18n.t(`landformDebug.${option.value}`);
        });
    }
    translatedControllers.forEach(([controller, key]) => controller.name(i18n.t(key)));
    translatedFolders.forEach(([folder, key]) => {
        folder.name = i18n.t(key);
    });
    GUI.TEXT_OPEN = i18n.t("panel.open");
    GUI.TEXT_CLOSED = i18n.t("panel.close");
    gui.closed = gui.closed;
    updatePerformanceLocale(locale);
    renderStatus();
    renderCampaign();
}

let minimapStatusAt = -Infinity;
let minimapWindowText = "";
map.on("frame", ({ t }) => {
    if (t - minimapStatusAt < 250) return;
    minimapStatusAt = t;
    const view = minimap.view;
    minimapRefresh.disabled = generating || view.loading;
    const text = view.loading ? i18n.t("minimap.loading")
        : view.tileSpanX && view.tileSpanY
            ? `${Math.round(view.tileSpanX)} × ${Math.round(view.tileSpanY)}`
            : i18n.t("minimap.waiting");
    if (text !== minimapWindowText) {
        minimapWindowText = text;
        minimapWindow.textContent = text;
    }
});

languageController.onChange(locale => {
    const resolved = i18n.setLocale(locale);
    persistLocale(resolved);
});

i18n.subscribe(applyLocale);
applyLocale(i18n.locale);
await regenerate();

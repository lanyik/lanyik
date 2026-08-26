import { GUI } from "./js/vendor/dat.gui.module.js";
import { createI18n } from "./i18n.js";

const LOCALE_STORAGE_KEY = "three-hex-world.locale";
const {
    HexMap,
    ProceduralWorldSource,
    ToroidalWorldSource,
    clearWorldChunkCache,
    MIN_WORLD_SIZE,
    MAX_WORLD_SIZE
} = window.HexMap;
const query = new URLSearchParams(window.location.search);
const infiniteMode = query.has("infinite");
const campaignMode = infiniteMode && query.has("campaign");
const fastRenderMode = query.get("quality") === "fast";
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

const i18n = createI18n({ locale: readInitialLocale() });

const map = new HexMap({
    element: "[data-world-canvas]",
    size: 48,
    texturesBaseUrl: "textures/",
    gridVisible: true,
    gridColor: 0x42322b,
    gridWidth: 0.04,
    gridOpacity: 0.35,
    treesPerTile: 16,
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
    mountainHeight: 30,
    ...(fastRenderMode ? {
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

const PERFORMANCE_SAMPLE_INTERVAL = 500;
let performanceSampleStart = performance.now();
let performanceFrameCount = 0;
let performanceNumberFormatter;
let performanceCompactFormatter;
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
    backend: renderBackend.label
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
        element.title = value === null
            ? i18n.t("performance.unavailable")
            : typeof value === "number" ? performanceNumberFormatter.format(value) : String(value);
    });
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

function samplePerformance() {
    const now = performance.now();
    const elapsed = now - performanceSampleStart;
    performanceFrameCount += 1;
    if (elapsed < PERFORMANCE_SAMPLE_INTERVAL) return;

    const rendererInfo = map.renderer?.info;
    const streaming = map.streamingStats;
    const worldStreaming = map.worldStreamingStats;
    const heapSize = performance.memory?.usedJSHeapSize;
    performanceSnapshot = {
        fps: performanceFrameCount * 1000 / elapsed,
        frameTime: elapsed / performanceFrameCount,
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
    performanceFrameCount = 0;
    performanceSampleStart = now;
    renderPerformance();
}

map.on("frame", samplePerformance);

const controls = {
    language: i18n.locale,
    seed: "new-world",
    width: 42,
    height: 32,
    regenerate,
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
let generating = false;
let statusState = { kind: "initializing" };
let campaignSnapshot;

campaignPanel.hidden = !campaignMode;

window.getWorldDiagnostics = () => ({
    status: statusState.kind,
    generating,
    streaming: map.streamingStats,
    worldStreaming: map.worldStreamingStats,
    frameTasks: map.frameTaskStats,
    adaptive: map.adaptiveStreamingStats,
    rendererMemory: map.renderer ? { ...map.renderer.info.memory } : undefined,
    renderer: map.renderer ? { ...map.renderer.info.render } : undefined,
    rendererPixelRatio: map.renderer?.getPixelRatio(),
    renderBackend,
    performance: { ...performanceSnapshot },
    cameraTarget: map.getCameraTarget().toArray(),
    campaign: activeCampaign?.diagnostics
});

window.getCampaignDiagnostics = () => activeCampaign?.diagnostics ?? { ready: false };

window.addEventListener("beforeunload", () => {
    if (activeCampaign) void activeCampaign.dispose().finally(() => map.dispose());
    else map.dispose();
}, { once: true });

function renderCampaign(snapshot = campaignSnapshot) {
    campaignSnapshot = snapshot;
    if (!campaignMode) return;
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
    if (generating) return;
    generating = true;
    setStatus("generating", {
        width: controls.width,
        height: controls.height,
        seed: controls.seed
    });

    try {
        if (activeCampaign) {
            await activeCampaign.dispose();
            activeCampaign = undefined;
            renderCampaign(null);
        }
        const workerUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
        if (infiniteMode) {
            const initialTile = {
                x: Number.parseInt(query.get("x") ?? "0", 10),
                y: Number.parseInt(query.get("y") ?? "0", 10)
            };
            const source = new ProceduralWorldSource({
                seed: controls.seed,
                workerUrl,
                chunkSize: 24,
                cache: true,
                deltaStore: campaignMode,
                worldId: campaignMode ? `campaign-demo:${controls.seed}:terrain` : undefined
            });
            activeSource = undefined;
            await map.loadWorld({
                source,
                initialTile,
                targetFrameMs: 1000 / 120,
                adaptiveDegradeFrames: 6,
                adaptiveRecoverFrames: 600,
                adaptiveCooldownFrames: 6
            });
            activeSource = source;
            if (campaignMode) {
                const { createCampaignDemo } = await import("./campaign.js");
                activeCampaign = await createCampaignDemo({
                    map,
                    source,
                    seed: controls.seed,
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
            width: Number(controls.width),
            height: Number(controls.height),
            workerUrl,
            chunkSize: 24,
            cache: true
        });
        activeSource = undefined;
        await map.loadWorld({
            source,
            targetFrameMs: 1000 / 120,
            adaptiveDegradeFrames: 6,
            adaptiveRecoverFrames: 600,
            adaptiveCooldownFrames: 6
        });
        activeSource = source;
        setStatus("generated", {
            width: source.bounds.width,
            height: source.bounds.height,
            seed: controls.seed
        });
    } catch (error) {
        console.error(error);
        setStatus("failed", {
            message: error instanceof Error ? error.message : String(error)
        });
    } finally {
        generating = false;
    }
}

map.on("hover", ({ x, y, tile }) => setStatus("tile", { x, y, tile }));
map.on("click", ({ x, y, tile }) => {
    setStatus("selected", { x, y, tile });
    if (campaignMode && activeCampaign && tile.type !== "sea"
        && tile.type !== "coastal" && tile.type !== "mountain") {
        void activeCampaign.orderTo({ x, y }).catch(console.error);
    }
});

const gui = new GUI({ width: 310 });
const languageOptions = { English: "en", "简体中文": "zh-CN" };
const languageController = gui.add(controls, "language", languageOptions);

const worldFolder = gui.addFolder("World generation");
const seedController = worldFolder.add(controls, "seed");
const widthController = worldFolder.add(controls, "width", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 2);
const heightController = worldFolder.add(controls, "height", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 1);
const generateController = worldFolder.add(controls, "regenerate");
const clearCacheController = worldFolder.add(controls, "clearCachedData");
worldFolder.open();

let campaignFolder;
let startMarchController;
let followArmyController;
let saveCampaignController;
if (campaignMode) {
    campaignFolder = gui.addFolder("Campaign");
    startMarchController = campaignFolder.add(controls, "startCampaignMarch");
    followArmyController = campaignFolder.add(controls, "followCampaignArmy");
    saveCampaignController = campaignFolder.add(controls, "saveCampaign");
    campaignFolder.open();
}

const terrainFolder = gui.addFolder("Terrain");
const gridController = terrainFolder.add(map, "gridVisible");
const blendWidthController = terrainFolder.add(map, "landBlendWidth", 0, 1, 0.01);
const blendCurveController = terrainFolder.add(map, "landBlendCurvature", 0, 1, 0.01);
const mountainController = terrainFolder.add(map, "mountainHeight", 0, 80, 1);

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
    [seedController, "control.seed"],
    [widthController, "control.width"],
    [heightController, "control.height"],
    [generateController, "control.generate"],
    [clearCacheController, "control.clearCache"],
    [gridController, "control.grid"],
    [blendWidthController, "control.blendWidth"],
    [blendCurveController, "control.blendCurve"],
    [mountainController, "control.mountains"],
    [waveHeightController, "control.waveHeight"],
    [waveSpeedController, "control.waveSpeed"],
    [coastCurveController, "control.coastCurve"],
    [foamController, "control.foam"],
    [treesController, "control.trees"],
    [grassController, "control.grass"],
    [windController, "control.wind"]
];
if (campaignMode) translatedControllers.push(
    [startMarchController, "control.startMarch"],
    [followArmyController, "control.followArmy"],
    [saveCampaignController, "control.saveCampaign"]
);

const translatedFolders = [
    [worldFolder, "panel.world"],
    [terrainFolder, "panel.terrain"],
    [waterFolder, "panel.water"],
    [vegetationFolder, "panel.vegetation"]
];
if (campaignMode) translatedFolders.push([campaignFolder, "panel.campaign"]);

function applyLocale(locale) {
    controls.language = locale;
    languageController.updateDisplay();
    document.documentElement.lang = locale;
    document.title = i18n.t("app.title");
    controlsHint.textContent = i18n.t("status.controlsHint");
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

languageController.onChange(locale => {
    const resolved = i18n.setLocale(locale);
    persistLocale(resolved);
});

i18n.subscribe(applyLocale);
applyLocale(i18n.locale);
await regenerate();

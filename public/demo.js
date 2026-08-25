import { GUI } from "./js/vendor/dat.gui.module.js";
import { createI18n } from "./i18n.js";

const LOCALE_STORAGE_KEY = "three-hex-world.locale";
const { HexMap, generateWorld, WorldGeneratorClient, MIN_WORLD_SIZE, MAX_WORLD_SIZE } = window.HexMap;
const query = new URLSearchParams(window.location.search);
const infiniteMode = query.has("infinite");
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
    mountainHeight: 30
});

window.hexWorld = map;
window.hexWorldI18n = i18n;

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
    lod: null
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
        lod: value => value
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
    const heapSize = performance.memory?.usedJSHeapSize;
    performanceSnapshot = {
        fps: performanceFrameCount * 1000 / elapsed,
        frameTime: elapsed / performanceFrameCount,
        memory: Number.isFinite(heapSize) ? heapSize / 1048576 : null,
        drawCalls: rendererInfo?.render.calls ?? null,
        triangles: rendererInfo?.render.triangles ?? null,
        visibleChunks: streaming?.visibleChunks ?? null,
        residentChunks: streaming?.residentChunks ?? null,
        lod: streaming ? `${streaming.lod0}/${streaming.lod1}/${streaming.lod2}` : null
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
    regenerate
};

window.worldControls = controls;
window.regenerateWorld = regenerate;

let currentWorld;
let generating = false;
let statusState = { kind: "initializing" };
let worldGenerator;
if (!infiniteMode) {
    try {
        worldGenerator = new WorldGeneratorClient(new URL("./js/world-generator.worker.mjs", window.location.href));
    } catch (error) {
        console.warn("World generation worker unavailable; using the synchronous fallback", error);
    }
}

window.addEventListener("beforeunload", () => {
    worldGenerator?.dispose();
    map.dispose();
}, { once: true });

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
    if (kind === "tile" || kind === "selected") {
        title.textContent = i18n.t(`status.${kind}`, statusState);
        detail.textContent = formatTile(statusState.tile);
    }
}

function setStatus(kind, values = {}) {
    statusState = { kind, ...values };
    renderStatus();
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
        if (infiniteMode) {
            await map.loadInfinite({
                seed: controls.seed,
                workerUrl: new URL("./js/world-generator.worker.mjs", window.location.href),
                chunkSize: 24,
                initialTile: {
                    x: Number.parseInt(query.get("x") ?? "0", 10),
                    y: Number.parseInt(query.get("y") ?? "0", 10)
                }
            });
            currentWorld = undefined;
            setStatus("generated", { infinite: true, seed: controls.seed });
            return;
        }
        const generationOptions = {
            seed: controls.seed,
            width: Number(controls.width),
            height: Number(controls.height),
            topology: "toroidal"
        };
        const nextWorld = worldGenerator
            ? await worldGenerator.generate(generationOptions)
            : generateWorld(generationOptions);
        await map.load(nextWorld);
        currentWorld = nextWorld;
        setStatus("generated", {
            width: nextWorld.w,
            height: nextWorld.h,
            seed: controls.seed
        });
    } catch (error) {
        console.error(error);
        setStatus("failed", {
            message: error instanceof Error ? error.message : String(error)
        });
        if (currentWorld) {
            await map.load(currentWorld).catch(restoreError => console.error("Map restore failed", restoreError));
        }
    } finally {
        generating = false;
    }
}

map.on("hover", ({ x, y, tile }) => setStatus("tile", { x, y, tile }));
map.on("click", ({ x, y, tile }) => setStatus("selected", { x, y, tile }));

const gui = new GUI({ width: 310 });
const languageOptions = { English: "en", "简体中文": "zh-CN" };
const languageController = gui.add(controls, "language", languageOptions);

const worldFolder = gui.addFolder("World generation");
const seedController = worldFolder.add(controls, "seed");
const widthController = worldFolder.add(controls, "width", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 2);
const heightController = worldFolder.add(controls, "height", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 1);
const generateController = worldFolder.add(controls, "regenerate");
worldFolder.open();

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

const translatedFolders = [
    [worldFolder, "panel.world"],
    [terrainFolder, "panel.terrain"],
    [waterFolder, "panel.water"],
    [vegetationFolder, "panel.vegetation"]
];

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
}

languageController.onChange(locale => {
    const resolved = i18n.setLocale(locale);
    persistLocale(resolved);
});

i18n.subscribe(applyLocale);
applyLocale(i18n.locale);
await regenerate();

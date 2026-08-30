const api = window.HexMap;
if (!api) throw new Error("HexMap global bundle is unavailable");

const query = new URLSearchParams(window.location.search);
const fast = query.get("quality") === "fast";
const canvas = document.querySelector("[data-world-canvas]");
const title = document.querySelector("[data-world-title]");
const detail = document.querySelector("[data-world-detail]");
const controls = document.querySelector("[data-world-controls]");

const map = new api.HexMap({
    element: canvas,
    hexSize: 2,
    heightScale: 24,
    antialias: !fast,
    maxPixelRatio: fast ? 1 : 2,
    farPlane: 20_000
});

const workerUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
const worldControls = {
    seed: query.get("seed") || "surface-v2-demo",
    topology: query.has("toroidal") ? "toroidal" : "infinite",
    initialX: Number.parseInt(query.get("x") || "0", 10) || 0,
    initialY: Number.parseInt(query.get("y") || "0", 10) || 0
};
let currentPool;
let generating = false;
let status = "idle";
let generation = 0;
let lastError;
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

function updateStatus() {
    title.textContent = generating ? "Compiling world surface…" : status === "generated" ? "Surface v2" : "World unavailable";
    detail.textContent = lastError
        ? lastError.message
        : `${worldControls.topology} · generator ${api.WORLD_GENERATOR_VERSION} · revision ${map.runtime?.editor.effectiveRevision ?? 0}`;
    controls.textContent = "Drag to orbit · wheel to zoom · call hexWorld.setCameraTargetTile(x, y) to stream";
}

async function regenerateWorld() {
    if (generating) throw new Error("world replacement is already running");
    generating = true;
    status = "loading";
    lastError = undefined;
    updateStatus();
    const pool = new api.WorldSurfaceWorkerPool(workerUrl, {
        size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)),
        maxQueuedTasks: 256
    });
    const descriptor = api.createWorldDescriptorV2({
        seed: worldControls.seed,
        topology: worldControls.topology === "toroidal"
            ? { kind: "toroidal", width: 512, height: 512 }
            : { kind: "infinite" }
    });
    const source = new api.ProceduralWorldAuthoritySource({ descriptor, pool, ownsPool: true });
    try {
        await map.loadWorld({
            source,
            worker: pool,
            budgets: budgets(),
            initialTile: { x: worldControls.initialX, y: worldControls.initialY },
            visibleRadiusTiles: fast ? 16 : 24,
            prefetchRadiusTiles: fast ? 28 : 40,
            lod1DistanceTiles: 12,
            lod2DistanceTiles: 22
        });
        currentPool = pool;
        generation += 1;
        status = "generated";
    } catch (reason) {
        source.dispose();
        lastError = reason instanceof Error ? reason : new Error(String(reason));
        status = "error";
        throw lastError;
    } finally {
        generating = false;
        updateStatus();
    }
}

function getWorldDiagnostics() {
    const runtime = map.runtime;
    const rendererInfo = map.renderer.info;
    return {
        status,
        generating,
        generation,
        topology: worldControls.topology,
        error: lastError?.message,
        renderSession: runtime?.session.stats,
        authority: runtime?.authority.stats,
        compilation: runtime?.compilation.stats,
        presentation: runtime?.presentation.stats,
        surfaceTextures: runtime?.surfaceTextures.stats,
        fogTextures: runtime?.fogTextures.stats,
        worker: currentPool?.stats,
        renderer: {
            calls: rendererInfo.render.calls,
            triangles: rendererInfo.render.triangles
        },
        rendererMemory: {
            geometries: rendererInfo.memory.geometries,
            textures: rendererInfo.memory.textures
        },
        rendererPixelRatio: map.renderer.getPixelRatio(),
        webglContext: {
            state: contextState,
            losses: contextLosses,
            restores: contextRestores,
            generation: contextGeneration
        }
    };
}

canvas.addEventListener("webglcontextlost", () => {
    contextState = "lost";
    contextLosses += 1;
});
canvas.addEventListener("webglcontextrestored", () => {
    contextState = "ready";
    contextRestores += 1;
    contextGeneration += 1;
});

window.hexWorld = map;
window.worldControls = worldControls;
window.regenerateWorld = regenerateWorld;
window.getWorldDiagnostics = getWorldDiagnostics;
window.disposeHexWorld = () => map.dispose();

void regenerateWorld().catch(error => console.error(error));

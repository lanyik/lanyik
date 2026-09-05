import {
    GenerationCheckpointCoordinator, IndexedDbGenerationCheckpointStore
} from "../js/persistence.mjs";
import {
    TURN_LIMIT, DEFAULT_SEED, HOME, UPGRADES, act, beacons, capacity, chargeAmount,
    createExpedition, distance, samePoint, score, siteAt, validateExpedition
} from "./rules.js";
import { createFlightView, drawRadar } from "./view.js";

const engine = window.HexMap;
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const seed = query.get("seed") || DEFAULT_SEED;
const fast = query.get("quality") === "fast";
let state;
let map;
let source;
let checkpoints;
let view;
let ready = false;
let busy = false;
let flying = false;
let stopRequested = false;
let fatal = false;
let selected;
let radarPoints = [];
let exclusive = true;
let noticeTimer;
const terrainChunks = new Map();
const terrainNames = { land: "原野", sand: "沙丘", snow: "雪原", tundra: "苔原", mountain: "山地", sea: "远海", coastal: "浅海" };
$("seed").value = seed;
$("welcome").showModal();

function notice(message) {
    $("notice").textContent = message;
    $("notice").hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 5500);
}

function routeTo(point) {
    if (!point || !state || distance(state.position, point) > 48) return [];
    const path = [];
    let cursor = state.position;
    while (!samePoint(cursor, point)) {
        cursor = engine.getNeighbors(cursor.x, cursor.y).reduce((best, next) =>
            distance(next, point) < distance(best, point) ? next : best);
        path.push({ x: cursor.x, y: cursor.y });
    }
    return path;
}

function select(point, focus = false) {
    if (!ready || busy || flying || fatal || state.status !== "playing" || state.pendingUpgrade) return;
    if (distance(state.position, point) > 48) { notice("单段航线最多 48 格。可以分段探索更远的天空。"); return; }
    selected = { x: point.x, y: point.y };
    if (focus) map.setCameraTargetTile(point.x, point.y);
    render();
}

function nextObjective() {
    return beacons(seed).find(site => !state.lit.includes(site.id)) ?? { ...HOME, name: "浮岛母港" };
}

function render() {
    if (!state) return;
    const fuelCapacity = capacity(state);
    $("fuel").replaceChildren(document.createTextNode(`${state.fuel} `), small(`/ ${fuelCapacity}`));
    $("fuel-meter").max = fuelCapacity;
    $("fuel-meter").value = state.fuel;
    $("time").replaceChildren(document.createTextNode(`${TURN_LIMIT - state.turn} `), small("小时"));
    $("time-meter").value = TURN_LIMIT - state.turn;
    document.body.dataset.danger = String(state.turn >= 90);
    $("signals").replaceChildren(document.createTextNode(`${state.lit.length} `), small("/ 3"));
    $("signal-lights").textContent = [0, 1, 2].map(i => i < state.lit.length ? "●" : "○").join(" ");
    $("mission-count").textContent = `0${state.lit.length} / 03`;
    $("coordinates").textContent = `${state.position.x} / ${state.position.y}`;
    $("log").textContent = state.log[0];
    $("beacons").replaceChildren(...beacons(seed).map(site => {
        const lit = state.lit.includes(site.id);
        const button = document.createElement("button");
        button.className = `beacon-card${lit ? " lit" : ""}`;
        button.disabled = !ready || busy || flying || fatal || state.pendingUpgrade || state.status !== "playing";
        const icon = document.createElement("span");
        icon.className = "beacon-icon";
        icon.textContent = lit ? "✧" : "⋄";
        const text = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = site.name;
        text.append(title, small(`${lit ? "已接通" : "等待唤醒"} · ${distance(state.position, site)} 格`));
        button.append(icon, text);
        button.addEventListener("click", () => select(site, true));
        return button;
    }));
    $("objective").textContent = state.lit.length === 3 ? "定位母港 · 带信号回家 ↗" : "定位下一座信标 ↗";
    $("objective").disabled = !ready || busy || flying || fatal || state.pendingUpgrade || state.status !== "playing";
    $("upgrades").textContent = state.upgrades.length ? state.upgrades.map(id => UPGRADES[id].name).join(" / ") : "飞艇尚未改装";

    const path = routeTo(selected);
    const site = selected && siteAt(seed, selected);
    const currentSite = siteAt(seed, state.position);
    const actionable = currentSite && currentSite.kind !== "home" && !state.collected.includes(currentSite.id);
    const locked = !ready || busy || fatal || state.pendingUpgrade || state.status !== "playing";
    $("destination-kind").textContent = flying ? "航行中 / 可随时暂停" : site ? "已捕获地面信号" : "航线规划";
    $("destination-name").textContent = selected
        ? site?.name ?? `${terrainNames[map?.getTile(selected.x, selected.y)?.type] ?? "未知天空"} · ${selected.x}, ${selected.y}`
        : currentSite?.name ?? "选择下一段航线";
    $("route-detail").textContent = path.length
        ? `${path.length} 格 / ${path.length} 小时 · 每格 ${state.upgrades.includes("turbine") ? "1" : "1–2"} 燃料 · 遇站自动暂停`
        : "点击地面或雷达选点；信标卡片可定位远方。";
    $("interact").textContent = actionable ? currentSite.kind === "beacon" ? "接通信标 · 2h" : currentSite.kind === "supply" ? "补给 +16 · 1h" : "打捞回声 · 2h" : "停靠交互 [E]";
    $("interact").disabled = locked || flying || !actionable;
    $("charge").textContent = `充能 +${chargeAmount(state)} · 3h`;
    $("charge").disabled = locked || flying || state.fuel === fuelCapacity;
    $("fly").textContent = flying ? "暂停航行 ■" : "启航 →";
    $("fly").disabled = fatal || !ready || (!flying && (locked || !path.length));
    $("follow").disabled = !ready;
    $("help-button").disabled = busy || flying;
    $("new-game").disabled = busy || flying;
    radarPoints = drawRadar($("radar"), state, selected, engine);
    view?.update(state, path, selected);
    if (!$("welcome").open) showDecision();
}

function small(text) { const element = document.createElement("small"); element.textContent = text; return element; }

function showDecision() {
    if (state.status !== "playing") {
        $("upgrade-dialog").close();
        const won = state.status === "won";
        $("ending-label").textContent = won ? "TRANSMISSION COMPLETE / 信号已送达" : "TRANSMISSION LOST / 航线已失联";
        $("ending-title").textContent = won ? "长夜里，有了回家的光。" : "这次，风暴先到了。";
        $("ending-text").textContent = state.log[0];
        $("ending-score").replaceChildren(document.createTextNode(String(score(state))), small(`航行评分 · ${state.visited.length} 格探索 / ${state.relics} 段回声 / ${state.turn} 小时`));
        if (!$("ending").open) $("ending").showModal();
    } else if (state.pendingUpgrade) {
        $("upgrade-options").replaceChildren(...Object.entries(UPGRADES).filter(([id]) => !state.upgrades.includes(id)).map(([id, option]) => {
            const button = document.createElement("button");
            button.className = "upgrade-choice";
            button.disabled = busy || fatal;
            const title = document.createElement("strong"); title.textContent = option.name;
            const detail = document.createElement("span"); detail.textContent = option.detail;
            button.append(title, detail);
            button.addEventListener("click", () => runAction({ type: "upgrade", upgrade: id }));
            return button;
        }));
        if (!$("upgrade-dialog").open) $("upgrade-dialog").showModal();
    } else $("upgrade-dialog").close();
}

async function save() {
    $("save-status").textContent = "正在保存…";
    try {
        await checkpoints.checkpoint();
        $("save-status").textContent = "航程已保存";
    } catch (error) {
        fatal = true;
        $("save-status").textContent = "存档失败 · 已暂停";
        throw new Error(`存档失败，航行已暂停。请刷新后恢复最近的完整存档。${error.message}`);
    }
}

async function commit(action) {
    exclusive = true;
    try { state = act(state, action); await save(); }
    finally { exclusive = false; }
}

async function runAction(action) {
    if (!ready || busy || flying || fatal) return;
    busy = true;
    render();
    try { await commit(action); }
    catch (error) { notice(error.message); }
    finally { busy = false; render(); }
}

async function tileAt(point) {
    const resident = map.getTile(point.x, point.y);
    if (resident) return resident;
    const x = Math.floor(point.x / source.chunkSize);
    const y = Math.floor(point.y / source.chunkSize);
    const key = `${x},${y}`;
    let chunk = terrainChunks.get(key);
    if (!chunk) {
        chunk = await source.sampleBaseChunk(x, y, { lane: "interactive" });
        if (terrainChunks.size === 4) terrainChunks.delete(terrainChunks.keys().next().value);
        terrainChunks.set(key, chunk);
    }
    return engine.decodeWorldChunkTile(chunk, point.x - x * source.chunkSize, point.y - y * source.chunkSize);
}

async function fly() {
    if (flying) { stopRequested = true; return; }
    if (!ready || busy || fatal || state.pendingUpgrade || state.status !== "playing") return;
    const route = routeTo(selected);
    if (!route.length) return;
    flying = true;
    stopRequested = false;
    render();
    try {
        for (const point of route) {
            if (stopRequested || document.hidden) break;
            const tile = await tileAt(point);
            if (stopRequested || document.hidden) break;
            await commit({ type: "move", to: point, tile });
            map.setCameraTargetTile(point.x, point.y);
            render();
            const site = siteAt(seed, point);
            if (state.status !== "playing" || site && site.kind !== "home" && !state.collected.includes(site.id)) break;
            await new Promise(resolve => setTimeout(resolve, 180));
        }
    } catch (error) { notice(error.message); }
    finally { flying = false; render(); }
}

async function newGame() {
    if (busy || flying) return;
    const nextSeed = $("seed").value.trim();
    try { createExpedition(nextSeed); } catch (error) { $("welcome-status").textContent = error.message; return; }
    if (nextSeed !== seed || fatal) {
        const url = new URL(location.href);
        url.searchParams.set("seed", nextSeed);
        url.searchParams.set("new", "1");
        location.assign(url);
        return;
    }
    busy = true;
    exclusive = true;
    render();
    try {
        state = createExpedition(seed);
        selected = undefined;
        await save();
        map.setCameraTargetTile(0, 0);
        $("welcome").close();
        $("ending").close();
        $("upgrade-dialog").close();
    } catch (error) { $("welcome-status").textContent = error.message; }
    finally { busy = false; exclusive = false; render(); }
}

$("fly").addEventListener("click", fly);
$("charge").addEventListener("click", () => runAction({ type: "charge" }));
$("interact").addEventListener("click", () => runAction({ type: "interact" }));
$("follow").addEventListener("click", () => map.setCameraTargetTile(state.position.x, state.position.y));
$("objective").addEventListener("click", () => select(nextObjective(), true));
$("help-button").addEventListener("click", () => {
    $("begin").textContent = "继续航行 →";
    $("welcome-status").textContent = "重开航程会重置当前种子的航行进度；更换种子可以探索另一片天空。";
    $("welcome").showModal();
});
$("begin").addEventListener("click", () => {
    if ($("seed").value.trim() !== seed) { void newGame(); return; }
    $("welcome").close();
    showDecision();
});
$("seed").addEventListener("input", () => {
    if (ready) $("begin").textContent = $("seed").value.trim() === seed ? "继续航行 →" : "生成新航图 →";
});
$("new-game").addEventListener("click", newGame);
$("again").addEventListener("click", () => { $("ending").close(); $("welcome").showModal(); });
for (const id of ["upgrade-dialog", "ending"]) $(id).addEventListener("cancel", event => event.preventDefault());
$("welcome").addEventListener("cancel", event => { if (!ready) event.preventDefault(); else queueMicrotask(showDecision); });
$("radar").addEventListener("click", event => {
    const bounds = $("radar").getBoundingClientRect();
    const x = (event.clientX - bounds.left) * $("radar").width / bounds.width;
    const y = (event.clientY - bounds.top) * $("radar").height / bounds.height;
    const nearest = radarPoints.reduce((best, point) => Math.hypot(point.screenX - x, point.screenY - y)
        < Math.hypot(best.screenX - x, best.screenY - y) ? point : best, { screenX: Infinity, screenY: Infinity });
    if (Math.hypot(nearest.screenX - x, nearest.screenY - y) < 12) select(nearest);
});
document.addEventListener("keydown", event => {
    if (!ready || event.target instanceof HTMLInputElement || document.querySelector("dialog[open]")
        || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "f") map.setCameraTargetTile(state.position.x, state.position.y);
    else if (key === "e") void runAction({ type: "interact" });
    else if (key === "r") void runAction({ type: "charge" });
    else if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); void fly(); }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stopRequested = true; });

async function initialize() {
    state = createExpedition(seed);
    map = new engine.HexMap({
        element: "#world", size: 36, texturesBaseUrl: "textures/", maxPixelRatio: 1.5,
        gridVisible: true, gridOpacity: 0.12, gridColor: 0xd4d2b2, gridWidth: 0.025,
        selectorColor: 0xedc987, pointerColor: 0xe6d1a2,
        treeModel: "Assets/models/oak", treesPerTile: 5, treeScale: 1.2,
        grassEnabled: true, grassDensity: 12, mountainHeight: 58,
        waterColorShallow: 0x589d9d, waterColorDeep: 0x234e66,
        waterWaveAmplitude: 0.9, horizonFogColor: 0x829fa8,
        renderDistance: 1500, vegetationRenderDistance: 1050,
        lodNearDistance: 500, lodFarDistance: 1000,
        ...(fast ? { terrainShaderQuality: "fast", treesPerTile: 0, grassEnabled: false,
            maxPixelRatio: 1, antialias: false, skyVisible: false, renderDistance: 800,
            vegetationRenderDistance: 0, landBlendEnabled: false } : {})
    });
    map.on("error", error => { fatal = true; stopRequested = true; notice(`世界加载失败：${error.message}`); render(); });
    source = new engine.ProceduralWorldSource({
        seed, chunkSize: 24, workerCount: 2,
        workerUrl: new URL("../js/world-generator.worker.mjs", import.meta.url),
        workCoordinator: map.workCoordinator
    });
    checkpoints = new GenerationCheckpointCoordinator({
        worldId: `emberwake:${seed}`, descriptor: source.descriptor,
        store: new IndexedDbGenerationCheckpointStore({ databaseName: "emberwake-generations-v1", openTimeoutMs: 15000 }),
        operationTimeoutMs: 15000,
        withWorldState: operation => {
            if (!exclusive) throw new Error("航行存档必须在独占状态操作内执行。");
            return operation();
        },
        participants: [{ id: "expedition", version: 1, required: true,
            capture: context => { context.signal.throwIfAborted(); return structuredClone(state); },
            restore: (context, snapshot) => { context.signal.throwIfAborted(); state = validateExpedition(snapshot, seed); }
        }]
    });
    const recovered = query.has("new") ? undefined : await checkpoints.recover();
    if (!recovered || query.has("new")) await save();
    if (query.has("new")) {
        const url = new URL(location.href); url.searchParams.delete("new"); history.replaceState(null, "", url);
    }
    await map.loadWorld({ source, initialTile: state.position, loadRadius: 1, retentionRadius: 2,
        maxResidentChunks: 25, maxMountsPerFrame: 1, frameBudgetMs: 3, adaptiveStreaming: false });
    view = createFlightView(map, engine);
    await map.registerWorldRenderLayer(view.layer);
    map.on("click", point => select(point));
    const camera = map.getCamera();
    const target = map.getCameraTarget();
    camera.position.set(target.x + 80, target.y + 580, target.z + 580);
    camera.lookAt(target);
    ready = true;
    exclusive = false;
    $("begin").disabled = false;
    $("new-game").disabled = false;
    $("begin").textContent = recovered && !query.has("new") ? "继续航行 →" : "开启航程 →";
    $("welcome-status").textContent = recovered ? `已恢复航程 · 第 ${state.turn} 小时 · ${state.lit.length} 座信标` : "飞艇已就绪。世界会随着你的航程不断展开。";
    $("save-status").textContent = "航程已保存";
    render();
}

// One writer per seed. A second tab must not overwrite a newer expedition.
void navigator.locks.request(`emberwake:${seed}`, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("这张航图正在另一个标签页中航行。请先关闭那个标签页，再刷新这里。");
    await initialize();
    // The browser releases this lock with the document. Retain it while a
    // document is suspended as well, so a restored page cannot become a stale writer.
    await new Promise(() => {});
}).catch(async error => {
    fatal = true;
    $("welcome-status").textContent = error.message;
    $("begin").textContent = "航图连接失败";
    $("begin").disabled = true;
    $("new-game").disabled = false;
    checkpoints?.dispose();
    try { if (map) await map.disposeAsync(); }
    finally { source?.dispose(); } // Recovery can fail before loadWorld takes source ownership.
});

window.addEventListener("pagehide", () => {
    stopRequested = true;
});

// Read-only browser diagnostics; actions are exercised through the real UI.
window.getEmberwakeDiagnostics = () => ({
    ready, busy, flying, fatal, state: state && structuredClone(state), selected: selected && { ...selected },
    checkpoints: checkpoints?.stats, streaming: map?.worldStreamingStats,
    resources: map?.resourceBudget.stats, ship: view?.shipPosition
});

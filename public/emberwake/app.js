import { GenerationCheckpointCoordinator, IndexedDbGenerationCheckpointStore } from "../js/persistence.mjs";
import { SEED, STEP_SECONDS, FortressSimulation, UPGRADES, WEAPONS, createRun, distance, elevated, frontX, keyOf, mineAt, samePoint, timeSeconds, waveApproach } from "./rules.js";
import { CombatWorld } from "./world.js";
import { createBattleAudio, createBattleView, drawRadar, TILE_SIZE } from "./view.js";

const engine = window.HexMap;
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const sound = createBattleAudio();
const modeNames = { inspect: "观察战场", move: "转移要塞", mine: "派出采矿车", gun: "部署速射机炮", mortar: "部署震荡迫击炮", barrage: "呼叫轨道炮击", salvage: "回收炮塔" };
const modeHints = {
    inspect: "选择下方指令，再点击地面；空格可以暂停思考。",
    move: "点击 10 格内的陆地或浅滩。主车每移动一格消耗 1 燃料。",
    mine: "点击 8 格内的绿色矿脉。矿车自动开采并追赶主车返航。",
    gun: "点击主车 4 格内的空地。高地射程 +1；保持后方撤离通道。",
    mortar: "点击主车 4 格内的空地。迫击炮射程远，能击中成群目标。",
    barrage: "点击虫群密集处。1.2 秒后轰击半径 2 格，消耗 4 燃料。",
    salvage: "点击 4 格内的己方炮塔。停火打包 3 秒后，才会返还金属。"
};
const terrainNames = { land: "原野", tundra: "苔原", mountain: "山地", snow: "雪原", sand: "沙地", sea: "深海", coastal: "浅滩" };
let map, source, world, game, view, checkpoints, terrainAccount, terrainReservation;
let ready = false, paused = true, fatal = false, capturing = false, terrainLoading = false, resetting = false;
let saving, saveRequested = false, savedTick = 0, accumulated = 0, speed = 1, mode = "inspect", selected, noticeTimer, rosterKey;
let radarPoints = [], audioStarted = false;
$("welcome").showModal();

const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const state = () => game.state;
const isStopped = () => paused || fatal || capturing || terrainLoading || resetting || document.hidden
    || !ready || state().status !== "playing" || state().pendingUpgrade || map.webGlContextStats.state !== "ready";

function notice(text) {
    $("notice").textContent = text; $("notice").hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 4500);
}
function fail(error) {
    fatal = true; paused = true;
    $("save-status").textContent = "运行已暂停 · 请重新载入";
    $("welcome-status").textContent = error.message;
    notice(error.message);
    render();
}
async function checkpoint() {
    saveRequested = true;
    if (saving) return saving;
    $("save-status").textContent = "正在保存战场…";
    const task = (async () => {
        do {
            saveRequested = false;
            await checkpoints.checkpoint();
        } while (saveRequested);
    })();
    saving = task;
    try { await task; $("save-status").textContent = `已保存 ${clock(savedTick * STEP_SECONDS)} · 点击保存`; }
    finally { saving = undefined; }
}
async function loadTerrain() {
    if (terrainLoading || world.readyAt(state().base)) return;
    terrainLoading = true;
    try {
        await world.load(state().base);
        terrainReservation.update({ cpuBytes: world.stats.bytes });
    } catch (error) { fail(error); }
    finally { terrainLoading = false; accumulated = 0; render(); }
}
function effects() {
    const events = game.drainEvents();
    view?.effects(events); sound.play(events);
    if (events.some(event => event.type === "delivery")) void checkpoint().catch(fail);
}
function command(action) {
    if (!ready || fatal || capturing || terrainLoading || resetting) return false;
    try {
        game.command(action); effects(); render();
        void checkpoint().catch(fail);
        return true;
    } catch (error) { notice(error.message); return false; }
}
function selectMode(value) {
    if (!ready || fatal || state().status !== "playing" || state().pendingUpgrade) return;
    mode = mode === value ? "inspect" : value;
    render();
}
function selectPoint(point) {
    if (!ready || fatal || document.querySelector("dialog[open]")) return;
    selected = { x: point.x, y: point.y };
    let done = false;
    if (mode === "move" || mode === "mine" || mode === "barrage" || mode === "salvage") done = command({ type: mode, point: selected });
    if (mode === "gun" || mode === "mortar") done = command({ type: "build", kind: mode, point: selected });
    if (done && (mode === "move" || mode === "barrage")) mode = "inspect";
    render();
}
function follow() { if (ready) map.setCameraTargetTile(state().base.x, state().base.y); }
function pause() {
    if (!ready || fatal || state().pendingUpgrade || state().status !== "playing") return;
    paused = !paused; accumulated = 0;
    if (paused) void checkpoint().catch(fail);
    render();
}
function nearestMine() {
    const s = state();
    const mine = world.mines(s, 8).find(point => point.x > frontX(s) + 1 && !samePoint(point, s.base)
        && !s.rovers.some(rover => samePoint(rover.mine, point)) && world.path(s.base, point).length);
    if (!mine) { notice("近域没有未派车的可达矿脉。向东移动，或手动派车到仍有储量的矿区。"); return; }
    selected = mine; command({ type: "mine", point: mine });
}
function advance() {
    const s = state();
    if (s.base.path.length) { command({ type: "stop" }); return; }
    for (const y of [0, 1, -1, 2, -2, 3, -3]) {
        const point = { x: Math.min(s.goal, s.base.x + 8), y: s.base.y + y };
        if (world.path(s.base, point).length) {
            selected = point;
            command({ type: "move", point });
            return;
        }
    }
    notice("正前方被海域阻断。请使用转移指令，选择陆地绕行点。");
}
function renderRoster() {
    const s = state();
    const rows = [0, 1].map(index => {
        const rover = s.rovers[index];
        return rover ? { id: rover.id, name: `矿车 ${rover.id}`, detail: `${({ outbound: "驶向矿区", mining: "正在开采", returning: "返航中" })[rover.job]} · 载货 ${rover.cargo}`,
            danger: rover.hp < rover.maxHp * 0.6 || s.enemies.some(enemy => distance(enemy, rover) < 3) }
            : { name: index < s.crews ? "矿车待命" : "矿车损毁", detail: index < s.crews ? "等待开采指令" : "重建需要 22 金属", danger: index >= s.crews };
    });
    const signature = JSON.stringify(rows);
    if (signature === rosterKey) return;
    rosterKey = signature;
    $("rovers").replaceChildren(...rows.map(row => {
        const element = document.createElement("div"); element.className = `rover${row.danger ? " danger" : ""}`;
        const icon = document.createElement("span"); icon.className = "icon"; icon.textContent = "▰";
        const text = document.createElement("span"), title = document.createElement("strong"), detail = document.createElement("small");
        title.textContent = row.name; detail.textContent = row.detail; text.append(title, detail); element.append(icon, text);
        if (row.id !== undefined) {
            const button = document.createElement("button"); button.className = "quiet"; button.textContent = "召回";
            button.addEventListener("click", () => command({ type: "recall", id: row.id })); element.append(button);
        }
        return element;
    }));
}
function render() {
    if (!game) return;
    const s = state(), active = ready && !fatal && !resetting && s.status === "playing" && !s.pendingUpgrade;
    $("health-value").textContent = `${Math.ceil(s.base.hp)} / ${s.base.maxHp}`;
    $("health-meter").max = s.base.maxHp; $("health-meter").value = s.base.hp;
    $("metal").textContent = s.metal; $("fuel").textContent = s.fuel;
    $("distance").textContent = `${s.highestX} / ${s.goal} 格`;
    $("progress").max = s.goal; $("progress").value = s.highestX;
    $("time").textContent = clock(timeSeconds(s));
    $("wave").textContent = s.enemies.length ? `第 ${s.wave} 波虫潮交战中` : s.wave ? "暂时击退虫潮" : "西侧发现虫群";
    $("countdown").textContent = `${waveApproach(s.wave + 1)} ${Math.max(0, Math.ceil((s.nextWave - s.tick) * STEP_SECONDS))}s`;
    $("enemy-count").textContent = `${s.enemies.length} 个敌对目标`;
    $("danger-distance").textContent = `${Math.max(0, s.base.x - frontX(s)).toFixed(1)} 格`;
    $("heat").textContent = `${Math.round(s.heat)}%`; $("heat-meter").value = s.heat;
    $("coordinates").textContent = `${s.base.x} / ${s.base.y}`;
    $("crew-count").textContent = `${s.crews - s.rovers.length} / ${s.crews} 待命`;
    $("log").textContent = s.log[0].text;
    $("installed").textContent = s.upgrades.length ? s.upgrades.map(id => UPGRADES[id].name).join(" / ") : "履带、装甲、火炮。一座移动的家。";
    $("objective").textContent = s.fuel < 4 ? "燃料紧缺：矿车必须把货运回来。轨道炮也会消耗撤离燃料。"
        : s.rovers.length ? "矿车正在外出作业。转移前可以召回；离主车超过 17 格会失联。" : "向东突破封锁线，16 格和 32 格处获得改装。";
    $("advance").textContent = s.base.path.length ? "停止转移 ■" : "向东转移 8 格 →";
    $("advance").disabled = !active;
    $("mine-nearest").disabled = !active || s.rovers.length >= s.crews;
    $("recall").disabled = !active || !s.rovers.length;
    $("rebuild-rover").hidden = s.crews === 2; $("rebuild-rover").disabled = !active || s.metal < 22;
    $("repair").disabled = !active || s.base.hp >= s.base.maxHp || s.metal < 18;
    $("pause").disabled = !active; $("pause").textContent = paused ? "▶ 继续" : "Ⅱ 暂停";
    $("speed").disabled = !active; $("speed").textContent = `${speed}×`;
    $("save").disabled = !ready || fatal || resetting;
    $("begin").disabled = !ready || fatal || resetting;
    $("new-game").disabled = !ready && !fatal || resetting;
    $("pause-label").hidden = !paused || !active || Boolean(document.querySelector("dialog[open]"));
    document.body.dataset.danger = String(s.base.hp < s.base.maxHp * 0.4 || s.base.x - frontX(s) < 3);
    document.querySelectorAll("[data-mode]").forEach(button => { button.classList.toggle("active", button.dataset.mode === mode); button.disabled = !active; });
    $("barrage-cost").textContent = s.barrageReady > s.tick ? `冷却 ${Math.ceil((s.barrageReady - s.tick) * STEP_SECONDS)} 秒` : "4 燃料 / 范围伤害";
    $("selection-kind").textContent = modeNames[mode];
    const mine = selected && mineAt(selected, world.tile(selected));
    const tower = selected && s.towers.find(t => samePoint(t, selected));
    $("selection-name").textContent = selected ? `${tower ? WEAPONS[tower.kind].name : mine?.name ?? terrainNames[world.tile(selected)?.type] ?? "远方地形"} · ${selected.x}, ${selected.y}` : "先派采矿车，再在西侧布防。";
    $("selection-detail").textContent = mode !== "inspect" ? modeHints[mode] : mine
        ? `剩余 ${mine.total - (s.mined[keyOf(mine)] ?? 0)} 燃晶 · 运回后获得金属及一半数量的燃料。`
        : tower ? `${Math.ceil(tower.hp)} 耐久 · ${tower.packing ? "打包中，请让主车留在附近" : `射程 ${WEAPONS[tower.kind].range + (elevated(world.tile(tower)) ? 1 : 0)} 格`}` : modeHints.inspect;
    renderRoster();
    if (ready) { radarPoints = drawRadar($("radar"), s, world); view.update(s, selected, mode, isStopped()); }
    if (!$("welcome").open) decisions();
}
function decisions() {
    const s = state();
    if (s.status !== "playing") {
        $("upgrade-dialog").close();
        const won = s.status === "won";
        $("ending-label").textContent = won ? "EVACUATION COMPLETE / 撤离成功" : "CORE OFFLINE / 核心熄灭";
        $("ending-title").textContent = won ? "你保住了，这座移动的家。" : "最后一盏灯，熄灭了。";
        $("ending-text").textContent = s.log[0].text;
        const summary = document.createElement("small");
        summary.textContent = `击退 ${s.kills} 只虫群 · 运回 ${s.delivered} 金属 · 损失 ${s.lostRovers} 辆矿车 · 遗留 / 损毁 ${s.abandoned} 座炮塔`;
        $("ending-score").replaceChildren(document.createTextNode(`${s.highestX} 格`), summary);
        $("continue").hidden = !won;
        if (!$("ending").open) $("ending").showModal();
    } else if (s.pendingUpgrade) {
        if ($("upgrade-dialog").open) return;
        $("upgrade-options").replaceChildren(...Object.entries(UPGRADES).filter(([id]) => !s.upgrades.includes(id)).map(([id, option]) => {
            const button = document.createElement("button"); button.className = "upgrade-choice";
            const title = document.createElement("strong"), text = document.createElement("span"); title.textContent = option.name; text.textContent = option.detail;
            button.append(title, text); button.addEventListener("click", () => { if (command({ type: "upgrade", upgrade: id })) $("upgrade-dialog").close(); });
            return button;
        }));
        $("upgrade-dialog").showModal();
    } else $("upgrade-dialog").close();
}
async function restart() {
    if (resetting) return;
    if (fatal) { const url = new URL(location.href); url.searchParams.set("new", "1"); location.assign(url); return; }
    paused = true; resetting = true; render();
    try {
        if (saving) await saving;
        game = new FortressSimulation(world, createRun());
        await world.load(state().base); terrainReservation.update({ cpuBytes: world.stats.bytes });
        await checkpoint();
        mode = "inspect"; selected = undefined; accumulated = 0; rosterKey = undefined;
        follow(); $("ending").close(); $("upgrade-dialog").close(); $("welcome").close(); paused = false;
    } catch (error) { fail(error); }
    finally { resetting = false; render(); }
}
function frame({ dtS }) {
    if (!ready) return;
    if (isStopped()) { accumulated = 0; return; }
    accumulated = Math.min(0.8, accumulated + Math.min(0.25, dtS) * speed);
    let stepped = false;
    try {
        while (accumulated >= STEP_SECONDS) {
            if (!world.readyAt(state().base)) { void loadTerrain(); break; }
            const before = keyOf(state().base);
            if (!game.step()) { accumulated = 0; break; }
            accumulated -= STEP_SECONDS; stepped = true;
            if (keyOf(state().base) !== before && distance(map.getCameraTargetTile(), state().base) > 4) follow();
            if (state().status !== "playing" || state().pendingUpgrade) break;
        }
        if (stepped) {
            effects(); render();
            if (state().status !== "playing" || state().pendingUpgrade) void checkpoint().catch(fail);
        }
        if (!saving && state().tick - savedTick >= 25) void checkpoint().catch(fail);
    } catch (error) { fail(error); }
}

document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => selectMode(button.dataset.mode)));
$("advance").addEventListener("click", advance);
$("mine-nearest").addEventListener("click", nearestMine);
$("recall").addEventListener("click", () => command({ type: "recall" }));
$("rebuild-rover").addEventListener("click", () => command({ type: "replace-rover" }));
$("repair").addEventListener("click", () => command({ type: "repair" }));
$("pause").addEventListener("click", pause);
$("speed").addEventListener("click", () => { speed = speed === 1 ? 2 : 1; render(); });
$("follow").addEventListener("click", follow);
$("save").addEventListener("click", async () => { paused = true; render(); try { if (saving) await saving; await checkpoint(); } catch (error) { fail(error); } });
$("sound").addEventListener("click", async () => { audioStarted = true; try { await sound.toggle(); $("sound").textContent = sound.enabled ? "音效 开" : "音效 关"; } catch (error) { notice(`音效启动失败：${error.message}`); } });
$("help").addEventListener("click", () => { paused = true; $("welcome").showModal(); $("begin").textContent = "返回战场 →"; render(); });
$("begin").addEventListener("click", () => {
    $("welcome").close(); paused = false; accumulated = 0; render();
    if (!audioStarted) { audioStarted = true; void sound.toggle().then(() => { $("sound").textContent = "音效 开"; }).catch(error => notice(error.message)); }
});
$("new-game").addEventListener("click", restart);
$("again").addEventListener("click", restart);
$("continue").addEventListener("click", () => { if (command({ type: "continue" })) { $("ending").close(); paused = false; render(); } });
for (const id of ["welcome", "upgrade-dialog", "ending"]) $(id).addEventListener("cancel", event => event.preventDefault());
$("radar").addEventListener("click", event => {
    if (!ready || !radarPoints.length) return;
    const bounds = $("radar").getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * $("radar").width, y = (event.clientY - bounds.top) / bounds.height * $("radar").height;
    const point = radarPoints.reduce((best, p) => Math.hypot(p.screenX - x, p.screenY - y) < Math.hypot(best.screenX - x, best.screenY - y) ? p : best);
    selectPoint(point);
});
document.addEventListener("keydown", event => {
    if (!ready || document.querySelector("dialog[open]") || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const shortcuts = { m: "move", "1": "mine", "2": "gun", "3": "mortar", q: "barrage", x: "salvage" };
    if (shortcuts[key]) selectMode(shortcuts[key]);
    else if (key === "f") follow();
    else if (key === "r") command({ type: "recall" });
    else if (key === "v") command({ type: "repair" });
    else if (key === "escape") { mode = "inspect"; render(); }
    else if (event.code === "Space") { event.preventDefault(); pause(); }
});
document.addEventListener("visibilitychange", () => {
    if (document.hidden && ready) { paused = true; accumulated = 0; render(); void checkpoint().catch(fail); }
});

async function initialize() {
    const fast = query.get("quality") === "fast";
    map = new engine.HexMap({
        element: "#world", size: TILE_SIZE, texturesBaseUrl: "textures/", maxPixelRatio: 1.5,
        gridVisible: true, gridWidth: 0.025, gridOpacity: 0.15, gridColor: 0xccc6a4,
        pointerColor: 0xeec17a, selectorColor: 0xf19652,
        treeModel: "Assets/models/oak", treesPerTile: 4, treeScale: 0.9, grassEnabled: false,
        mountainHeight: 44, waterColorShallow: 0x557d7e, waterColorDeep: 0x29485b, waterWaveAmplitude: 0.6,
        renderDistance: 1550, horizonFogStart: 950, horizonFogEnd: 1500, horizonFogColor: 0x7c8e91,
        lodNearDistance: 450, lodFarDistance: 950, vegetationRenderDistance: 1050,
        ...(fast ? { terrainShaderQuality: "fast", antialias: false, maxPixelRatio: 1, treesPerTile: 0, skyVisible: false } : {})
    });
    map.on("error", fail);
    map.on("contextlost", () => { paused = true; accumulated = 0; notice("图形上下文中断，战斗已暂停。"); render(); });
    source = new engine.ProceduralWorldSource({ seed: SEED, chunkSize: 24, workerCount: 2,
        workerUrl: new URL("../js/world-generator.worker.mjs", import.meta.url), workCoordinator: map.workCoordinator });
    world = new CombatWorld(source, engine);
    game = new FortressSimulation(world);
    checkpoints = new GenerationCheckpointCoordinator({
        worldId: "emberwake-fortress", descriptor: source.descriptor,
        store: new IndexedDbGenerationCheckpointStore({ databaseName: "emberwake-fortress-generations-v1", openTimeoutMs: 15000 }),
        operationTimeoutMs: 15000, orphanGraceMs: 60000,
        withWorldState: async operation => {
            if (capturing) throw new Error("作战状态捕获不可重入。");
            capturing = true;
            try { return await operation(); }
            finally { capturing = false; }
        },
        participants: [{ id: "fortress", version: 1, required: true,
            capture(context) { context.signal.throwIfAborted(); savedTick = state().tick; return game.snapshot(); },
            restore(context, snapshot) { context.signal.throwIfAborted(); game = new FortressSimulation(world, snapshot); savedTick = state().tick; }
        }]
    });
    const recovered = query.has("new") ? undefined : await checkpoints.recover();
    await world.load(state().base);
    await map.loadWorld({ source, initialTile: state().base, loadRadius: 1, retentionRadius: 2, maxResidentChunks: 25,
        frameBudgetMs: 3, maxMountsPerFrame: 1, adaptiveStreaming: false });
    terrainAccount = map.createResourceAccount("emberwake-combat-window");
    terrainReservation = terrainAccount.acquireRequired("packed-terrain", { cpuBytes: world.stats.bytes }, true);
    view = createBattleView(map, engine, world);
    await map.registerWorldRenderLayer(view.layer);
    map.on("click", selectPoint);
    map.on("hover", point => { if (mode !== "inspect" && (!selected || !samePoint(selected, point))) { selected = { x: point.x, y: point.y }; render(); } });
    map.on("frame", frame);
    const camera = map.getCamera(), target = map.getCameraTarget();
    camera.position.set(target.x + 80, target.y + 650, target.z + 400); camera.lookAt(target);
    if (!recovered) await checkpoint();
    if (query.has("new")) { const url = new URL(location.href); url.searchParams.delete("new"); history.replaceState(null, "", url); }
    ready = true;
    $("begin").textContent = recovered ? "继续远征 →" : "展开要塞 →";
    $("welcome-status").textContent = recovered ? `已恢复 ${clock(timeSeconds(state()))} 的完整战场。继续前可以先查看局势。` : "主车、两辆矿车与 38 金属已就绪。战场会在你开始后推进。";
    $("save-status").textContent = `已保存 ${clock(savedTick * STEP_SECONDS)} · 点击保存`;
    render();
}
void navigator.locks.request("emberwake-fortress", { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("另一个标签页正在指挥要塞。请关闭那个标签页后刷新。");
    await initialize();
    await new Promise(() => {}); // The browser owns this lock for the document's lifetime.
}).catch(async error => {
    fail(error); $("begin").disabled = true; $("new-game").disabled = false;
    checkpoints?.dispose();
    try { if (map) await map.disposeAsync(); }
    finally { world?.dispose(); terrainAccount?.dispose(); source?.dispose(); await sound.dispose(); }
});

window.getEmberwakeDiagnostics = () => ({
    ready, paused, fatal, mode, saving: Boolean(saving), terrainLoading,
    state: game?.snapshot(), selected: selected && { ...selected }, checkpoints: checkpoints?.stats,
    streaming: map?.worldStreamingStats, resources: map?.resourceBudget.stats, navigation: world?.stats,
    mines: ready ? world.mines(state()).map(mine => ({ ...mine, screen: view.project(mine) })) : [],
    targets: ready ? world.nearby(state().base, 4).filter(point => !samePoint(point, state().base)).map(point => ({ ...point, screen: view.project(point) })) : [],
    enemies: ready ? state().enemies.map(enemy => ({ id: enemy.id, x: enemy.x, y: enemy.y, screen: view.project(enemy) })) : []
});

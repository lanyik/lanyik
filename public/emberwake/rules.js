// Application rules. The world renderer owns no expedition state.
export const TURN_LIMIT = 120;
export const DEFAULT_SEED = "emberwake-13";
export const HOME = Object.freeze({ x: 0, y: 0 });
export const UPGRADES = Object.freeze({
    turbine: { name: "越岭涡轮", detail: "山地、丘陵与雪地不再额外消耗燃料。" },
    solar: { name: "集光风帆", detail: "每次充能恢复 10 燃料，仍消耗 3 小时。" },
    tank: { name: "扩容燃料舱", detail: "容量提升至 64，并立即获得 16 燃料。" }
});

export const keyOf = point => `${point.x},${point.y}`;
export const samePoint = (a, b) => a.x === b.x && a.y === b.y;

export function hash(seed, x = 0, y = 0) {
    let value = 2166136261;
    for (const char of `${seed}:${x}:${y}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    value ^= value >>> 16;
    value = Math.imul(value, 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
}

// The foundation uses flat-top columns with even columns shifted down.
export function distance(a, b) {
    const dq = a.x - b.x;
    const dr = a.y - Math.ceil(a.x / 2) - b.y + Math.ceil(b.x / 2);
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function beacons(seed) {
    const direction = hash(seed) % 2 ? 1 : -1;
    const shift = hash(seed, 7, 9) % 5 - 2;
    return [
        { x: 10 * direction, y: -3 + shift, name: "苔原之眼", message: "第一束光穿过了云层。有人在远方回应。" },
        { x: 21 * direction, y: 5 + shift, name: "候鸟电台", message: "电台里传来旧日的歌声。失散的船队还在。" },
        { x: 33 * direction, y: -2 + shift, name: "长夜灯塔", message: "三座信标已经连线。带着归航坐标，回家吧。" }
    ].map((point, index) => ({ ...point, kind: "beacon", id: `beacon-${index}`, index }));
}

export function siteAt(seed, point, network = beacons(seed)) {
    if (samePoint(point, HOME)) return { ...HOME, kind: "home", id: "home", name: "浮岛母港" };
    const beacon = network.find(item => samePoint(item, point));
    if (beacon) return beacon;
    const value = hash(seed, point.x, point.y) % 37;
    if (value < 3) return { ...point, kind: "supply", id: keyOf(point), name: "漂流补给站" };
    if (value === 3) return { ...point, kind: "relic", id: keyOf(point), name: "旧世界回声" };
    return undefined;
}

export function createExpedition(seed = DEFAULT_SEED) {
    if (typeof seed !== "string" || !seed.trim() || seed.length > 64) throw new Error("航图种子须为 1–64 个字符。");
    return {
        seed, position: { ...HOME }, turn: 0, fuel: 36, status: "playing",
        lit: [], collected: [], visited: [keyOf(HOME)], upgrades: [], pendingUpgrade: false,
        relics: 0, log: ["最后一艘信使艇已就绪。点亮三座信标，在 120 小时内返回母港。"]
    };
}

export const capacity = state => state.upgrades.includes("tank") ? 64 : 48;
export const chargeAmount = state => state.upgrades.includes("solar") ? 10 : 6;
export const score = state => state.lit.length * 300 + state.relics * 120
    + state.visited.length * 5 + (state.status === "won" ? (TURN_LIMIT - state.turn) * 10 + 500 : 0);

export function flightCost(state, tile) {
    if (!tile || typeof tile.type !== "string") throw new Error("目的地地形尚未加载。");
    return 1 + (!state.upgrades.includes("turbine")
        && (tile.modifiers?.includes("hill") || tile.type === "snow" || tile.type === "mountain") ? 1 : 0);
}

function note(state, message) { state.log = [message, ...state.log].slice(0, 5); }
function advance(state, hours) {
    state.turn = Math.min(TURN_LIMIT, state.turn + hours);
    if (state.lit.length === 3 && samePoint(state.position, HOME)) {
        state.status = "won";
        note(state, "母港收到全部信号。黑夜降临前，失散的船队找到了回家的路。");
    } else if (state.turn >= TURN_LIMIT) {
        state.status = "lost";
        state.pendingUpgrade = false;
        note(state, "风暴吞没了航线。你的信号留在了长夜里。下一次，再飞远一点。");
    }
}

/** Pure, atomic transition: rejected actions never modify the input snapshot. */
export function act(current, action) {
    if (current.status !== "playing") throw new Error("本次航行已经结束，请开启新航程。");
    if (current.pendingUpgrade && action.type !== "upgrade") throw new Error("请先选择信标提供的飞艇改装。");
    const state = structuredClone(current);
    switch (action.type) {
        case "move": {
            if (!Number.isSafeInteger(action.to?.x) || !Number.isSafeInteger(action.to?.y)
                || distance(state.position, action.to) !== 1) throw new Error("每次只能飞向相邻六角格。");
            const cost = flightCost(state, action.tile);
            if (state.fuel < cost) throw new Error("燃料不足。展开太阳帆充能，或在当前位置获取补给。");
            state.fuel -= cost;
            state.position = { x: action.to.x, y: action.to.y };
            const key = keyOf(state.position);
            if (!state.visited.includes(key)) state.visited.push(key);
            const site = siteAt(state.seed, state.position);
            if (site && !state.collected.includes(site.id)) note(state, `抵达${site.name}。${site.kind === "beacon"
                ? "可以接通信号。" : site.kind === "home" ? "连接三座信标后，在这里完成返航。" : "可以停靠交互。"}`);
            advance(state, 1);
            break;
        }
        case "charge":
            if (state.fuel === capacity(state)) throw new Error("燃料舱已满，无需充能。");
            state.fuel = Math.min(capacity(state), state.fuel + chargeAmount(state));
            note(state, `太阳帆完成充能。消耗 3 小时，恢复最多 ${chargeAmount(state)} 燃料。`);
            advance(state, 3);
            break;
        case "interact": {
            const site = siteAt(state.seed, state.position);
            if (!site) throw new Error("当前位置没有可停靠的信号。请前往补给站、回声或信标。");
            if (site.kind === "home") throw new Error("点亮全部信标后，返回这里即可完成航程。");
            if (state.collected.includes(site.id)) throw new Error("这处站点已经访问过了。");
            if (site.kind === "beacon") {
                state.lit.push(site.id);
                state.fuel = Math.min(capacity(state), state.fuel + 24);
                state.pendingUpgrade = true;
                note(state, `${site.message} 信标补充了 24 燃料。`);
            } else if (site.kind === "supply") {
                state.fuel = Math.min(capacity(state), state.fuel + 16);
                note(state, "找到一箱密封燃料。补充 16 燃料，补给站已清空。");
            } else {
                state.relics += 1;
                state.fuel = Math.min(capacity(state), state.fuel + 6);
                note(state, "打捞到一段旧世界的声音。回声 +1，燃料 +6。");
            }
            state.collected.push(site.id);
            advance(state, site.kind === "supply" ? 1 : 2);
            break;
        }
        case "upgrade":
            if (!state.pendingUpgrade || !Object.hasOwn(UPGRADES, action.upgrade)
                || state.upgrades.includes(action.upgrade)) throw new Error("请选择尚未安装的改装。");
            state.upgrades.push(action.upgrade);
            state.pendingUpgrade = false;
            if (action.upgrade === "tank") state.fuel = Math.min(capacity(state), state.fuel + 16);
            note(state, `已安装${UPGRADES[action.upgrade].name}。下一段航线，准备就绪。`);
            break;
        default: throw new Error("未知航行动作。");
    }
    return state;
}

/** Checksum verification is owned by the checkpoint service; these are game invariants. */
export function validateExpedition(state, seed) {
    const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
    const uniqueStrings = (value, limit) => Array.isArray(value) && value.length <= limit
        && value.every(entry => typeof entry === "string") && new Set(value).size === value.length;
    if (!state || state.seed !== seed || !integer(state.position?.x, -TURN_LIMIT, TURN_LIMIT)
        || !integer(state.position?.y, -TURN_LIMIT, TURN_LIMIT) || !integer(state.turn, 0, TURN_LIMIT)
        || !uniqueStrings(state.upgrades, 3) || state.upgrades.some(id => !Object.hasOwn(UPGRADES, id))
        || !integer(state.fuel, 0, capacity(state)) || !["playing", "won", "lost"].includes(state.status)
        || !uniqueStrings(state.lit, 3) || state.lit.some(id => !beacons(seed).some(site => site.id === id))
        || !uniqueStrings(state.collected, TURN_LIMIT) || !uniqueStrings(state.visited, TURN_LIMIT + 1)
        || !state.visited.includes(keyOf(state.position)) || typeof state.pendingUpgrade !== "boolean"
        || !integer(state.relics, 0, TURN_LIMIT) || !Array.isArray(state.log) || state.log.length > 5
        || state.log.some(message => typeof message !== "string" || message.length > 200)
        || state.lit.some(id => !state.collected.includes(id))
        || state.upgrades.length + Number(state.pendingUpgrade) > state.lit.length
        || (state.status === "playing" && state.turn >= TURN_LIMIT)
        || (state.status === "lost" && state.turn !== TURN_LIMIT)
        || (state.status === "won" && (state.lit.length !== 3 || !samePoint(state.position, HOME)))) {
        throw new Error("航行存档不符合当前规则，无法恢复。请开启新航程。");
    }
    return structuredClone(state);
}

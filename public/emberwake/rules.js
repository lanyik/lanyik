export const SEED = "emberwake-13";
export const STEP_SECONDS = 0.2;
export const LIMITS = Object.freeze({ enemies: 72, towers: 8, rovers: 2, route: 80 });
export const WEAPONS = Object.freeze({
    gun: { name: "速射机炮", cost: 16, refund: 12, hp: 42, range: 4, damage: 3, interval: 4 },
    mortar: { name: "震荡迫击炮", cost: 26, refund: 20, hp: 34, range: 6, damage: 6, interval: 12 }
});
export const UPGRADES = Object.freeze({
    firepower: { name: "双联火控", detail: "主炮和所有炮塔伤害 +2。薄弱防线也能撕开虫群。" },
    logistics: { name: "重载采矿车", detail: "矿车容量 20 → 28，强化履带更快穿过山地和丘陵。每次冒险带回更多资源。" },
    armor: { name: "复合装甲", detail: "主车最大耐久 +60，并立即修复 60 耐久。为撤离多争取一点时间。" }
});
export const keyOf = point => `${point.x},${point.y}`;
export const samePoint = (a, b) => a.x === b.x && a.y === b.y;
export const frontX = state => -10 + state.tick * STEP_SECONDS * 0.14;
export const timeSeconds = state => state.tick * STEP_SECONDS;
export const waveApproach = wave => ["西侧追击", "北侧突袭", "东侧拦截", "南侧突袭"][(wave - 1) % 4];
export function hash(x, y, salt = 0) {
    let value = Math.imul(x + 131, 374761393) ^ Math.imul(y - 97, 668265263) ^ Math.imul(salt + 11, 1274126177);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
}
export function distance(a, b) {
    const q = a.x - b.x;
    const r = a.y - Math.ceil(a.x / 2) - b.y + Math.ceil(b.x / 2);
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}
export const passable = tile => Boolean(tile && tile.type !== "sea" && !tile.modifiers?.includes("lake"));
export const elevated = tile => tile?.type === "mountain" || tile?.modifiers?.includes("hill");
export function mineAt(point, tile) {
    if (!passable(tile) || tile.type === "coastal") return undefined;
    if (!samePoint(point, { x: 3, y: 0 }) && !samePoint(point, { x: 4, y: -2 }) && hash(point.x, point.y) % 29 !== 0) return undefined;
    return { x: point.x, y: point.y, total: elevated(tile) ? 42 : 32, name: elevated(tile) ? "富集晶矿" : "燃晶矿脉" };
}
const movingUnit = (id, point, hp) => ({ id, x: point.x, y: point.y, hp, maxHp: hp, path: [], progress: 0, cooldown: 0 });
export function createRun() {
    return {
        seed: SEED, tick: 0, nextId: 1, status: "playing", goal: 48, highestX: 0,
        base: { ...movingUnit(0, { x: 0, y: 0 }, 160), paid: false },
        metal: 38, fuel: 14, crews: 2, rovers: [], towers: [], enemies: [], bombs: [], mined: {},
        wave: 0, nextWave: 60, heat: 0, barrageReady: 0, kills: 0, delivered: 0, lostRovers: 0,
        abandoned: 0, nextUpgrade: 16, pendingUpgrade: false, upgrades: [],
        log: [{ tick: 0, text: "先派矿车，再在西侧架炮。虫潮将在 12 秒后出现。" }]
    };
}

/** Fixed-step, camera-independent application simulation. No browser or renderer dependencies. */
export class FortressSimulation {
    constructor(world, snapshot = createRun()) {
        this.world = world;
        this.state = validateRun(snapshot);
        this.events = [];
    }
    emit(type, data = {}) {
        if (this.events.length < 256) this.events.push({ type, tick: this.state.tick, ...data });
    }
    drainEvents() { const events = this.events; this.events = []; return events; }
    note(text) {
        this.state.log.unshift({ tick: this.state.tick, text });
        this.state.log.length = Math.min(5, this.state.log.length);
    }
    snapshot() { return structuredClone(this.state); }
    route(unit, target) {
        const from = unit.progress > 0 && unit.path.length ? unit.path[0] : unit;
        if (samePoint(from, target)) return unit.progress > 0 ? [{ x: from.x, y: from.y }] : [];
        const path = this.world.path(from, target);
        if (!path.length || path.length + (unit.progress > 0 ? 1 : 0) > LIMITS.route) return undefined;
        return unit.progress > 0 ? [{ x: from.x, y: from.y }, ...path] : path;
    }
    assertTarget(point, range) {
        if (!Number.isSafeInteger(point?.x) || !Number.isSafeInteger(point?.y)
            || distance(this.state.base, point) > range) throw new Error(`目标必须在主车 ${range} 格以内。`);
        if (point.x <= frontX(this.state)) throw new Error("吞噬带内无法执行地面作业。");
        if (!passable(this.world.tile(point))) throw new Error("深海和湖泊无法通行，请沿陆地或浅滩绕行。");
    }
    command(action) {
        const s = this.state;
        if (action.type === "continue" && s.status === "won") {
            s.goal += 48; s.status = "playing"; this.note("新的地平线已经打开。继续带着要塞向东。"); return;
        }
        if (s.status !== "playing") throw new Error("本次远征已结束。");
        if (s.pendingUpgrade && action.type !== "upgrade") throw new Error("请先选择突破封锁线获得的改装。");
        const point = action.point;
        switch (action.type) {
            case "move": {
                this.assertTarget(point, 10);
                const path = this.route(s.base, point);
                if (!path?.length) throw new Error("这条局部路线不可达，请另选陆地点位。");
                if (s.fuel < 1 && !s.base.paid) throw new Error("燃料不足。让采矿车把燃晶运回主车。");
                s.base.path = path;
                this.note(`要塞向 ${point.x}, ${point.y} 转移。矿车会追赶主车，固定炮塔需要另行回收。`);
                break;
            }
            case "stop":
                s.base.path = s.base.progress > 0 ? s.base.path.slice(0, 1) : [];
                break;
            case "mine": {
                this.assertTarget(point, 8);
                if (s.rovers.length >= s.crews) throw new Error("没有空闲矿车。可以先召回正在作业的矿车。");
                const mine = mineAt(point, this.world.tile(point));
                if (!mine || (s.mined[keyOf(point)] ?? 0) >= mine.total) throw new Error("这里没有可开采的燃晶。");
                const path = this.world.path(s.base, point);
                if (!path.length || path.length > LIMITS.route) throw new Error("矿车无法在局部路线范围内到达这片矿区。");
                s.rovers.push({ ...movingUnit(s.nextId++, s.base, 28), path, job: "outbound", cargo: 0, mine: { x: point.x, y: point.y }, work: 0 });
                this.note("矿车已出发。只有运回主车，矿物和燃料才会入库。");
                break;
            }
            case "recall": {
                const targets = s.rovers.filter(rover => action.id === undefined || rover.id === action.id);
                if (!targets.length) throw new Error("没有需要召回的矿车。");
                const routes = targets.map(rover => this.route(rover, s.base));
                if (routes.some(route => !route)) throw new Error("矿车暂时无法返回主车，请向矿区靠近后召回。");
                targets.forEach((rover, index) => { rover.job = "returning"; rover.path = routes[index]; });
                this.note("召回指令已发出。矿车保留已装载货物，立即撤离。");
                break;
            }
            case "build": {
                this.assertTarget(point, 4);
                const weapon = WEAPONS[action.kind];
                if (!Object.hasOwn(WEAPONS, action.kind)) throw new Error("未知炮塔型号。");
                if (s.towers.length >= LIMITS.towers) throw new Error("最多同时部署 8 座炮塔。");
                if (samePoint(s.base, point) || s.towers.some(tower => samePoint(tower, point))) throw new Error("这个位置已经被占用。");
                if (s.metal < weapon.cost) throw new Error(`部署${weapon.name}需要 ${weapon.cost} 金属。`);
                s.metal -= weapon.cost;
                s.towers.push({ id: s.nextId++, x: point.x, y: point.y, kind: action.kind, hp: weapon.hp, maxHp: weapon.hp, cooldown: 0, packing: 0 });
                s.heat = Math.min(100, s.heat + 4);
                this.emit("build", { point });
                this.note(`${weapon.name}已展开。${elevated(this.world.tile(point)) ? "高地加成：射程 +1。" : "在高地部署可额外增加 1 格射程。"}`);
                break;
            }
            case "salvage": {
                this.assertTarget(point, 4);
                const tower = s.towers.find(item => samePoint(item, point));
                if (!tower || tower.packing) throw new Error("请选择一座尚未打包的己方炮塔。");
                tower.packing = 15;
                this.note("炮塔开始打包，3 秒内无法射击。主车必须留在 4 格回收范围内。");
                break;
            }
            case "barrage":
                if (!Number.isSafeInteger(point?.x) || !Number.isSafeInteger(point?.y) || distance(s.base, point) > 10) throw new Error("炮击目标必须在 10 格以内。");
                if (s.tick < s.barrageReady) throw new Error("轨道炮正在冷却。");
                if (s.fuel < 4) throw new Error("轨道炮需要 4 燃料；这也是主车撤离的燃料。");
                s.fuel -= 4; s.barrageReady = s.tick + 60; s.heat = Math.min(100, s.heat + 10);
                s.bombs.push({ x: point.x, y: point.y, impact: s.tick + 6 });
                break;
            case "repair":
                if (s.base.hp >= s.base.maxHp) throw new Error("主车装甲完好。");
                if (s.metal < 18) throw new Error("维修需要 18 金属。");
                s.metal -= 18; s.base.hp = Math.min(s.base.maxHp, s.base.hp + 40);
                this.emit("repair", { point: { x: s.base.x, y: s.base.y } });
                this.note("紧急维修完成：装甲 +40，金属 −18。");
                break;
            case "replace-rover":
                if (s.crews >= LIMITS.rovers) throw new Error("两辆矿车均在编制中。");
                if (s.metal < 22) throw new Error("重建矿车需要 22 金属。");
                s.metal -= 22; s.crews++; this.note("新矿车已装配完成。");
                break;
            case "upgrade":
                if (!s.pendingUpgrade || !Object.hasOwn(UPGRADES, action.upgrade) || s.upgrades.includes(action.upgrade)) throw new Error("请选择尚未安装的改装。");
                s.upgrades.push(action.upgrade); s.pendingUpgrade = false;
                if (action.upgrade === "armor") { s.base.maxHp += 60; s.base.hp = Math.min(s.base.maxHp, s.base.hp + 60); }
                this.note(`封锁线突破。已安装${UPGRADES[action.upgrade].name}。`);
                break;
            default: throw new Error("未知作战指令。");
        }
    }
    move(unit, speed, isBase = false) {
        if (!unit.path.length) return;
        const s = this.state;
        const next = unit.path[0];
        const tile = this.world.tile(next);
        if (!passable(tile)) throw new Error("权威路线离开了已采样的可通行区域。");
        if (isBase && !unit.paid) {
            if (s.fuel < 1) { unit.path = []; unit.progress = 0; this.note("主车燃料耗尽，正在等待矿车补给。"); return; }
            s.fuel--; unit.paid = true;
        }
        const terrain = tile.type === "mountain" ? 1.7 : elevated(tile) || tile.type === "coastal" ? 1.3 : 1;
        unit.progress += speed * STEP_SECONDS / terrain;
        if (unit.progress >= 1) {
            unit.x = next.x; unit.y = next.y; unit.path.shift(); unit.progress = 0;
            if (isBase) unit.paid = false;
        }
    }
    spawnWave() {
        const s = this.state;
        s.wave++;
        const count = Math.min(22, 5 + Math.floor(s.wave * 1.5) + Math.floor(s.heat / 20));
        let spawned = 0;
        const candidates = this.world.nearby(s.base, 10).filter(point => {
            const d = distance(point, s.base);
            const approach = (s.wave - 1) % 4;
            const lane = approach === 0 ? point.x < s.base.x - 3 : approach === 2 ? point.x > s.base.x + 3
                : Math.abs(point.x - s.base.x) <= 5 && (approach === 1 ? point.y < s.base.y - 3 : point.y > s.base.y + 3);
            return d >= 6 && d <= 9 && lane && point.x > frontX(s) - 1;
        }).sort((a, b) => hash(a.x, a.y, s.wave) - hash(b.x, b.y, s.wave));
        for (const point of candidates) {
            if (spawned >= count || s.enemies.length >= LIMITS.enemies) break;
            const path = this.world.path(point, s.base);
            if (!path.length || path.length > 22) continue;
            const kind = s.wave >= 3 && spawned % 6 === 0 ? "brute" : spawned % 3 === 2 ? "hunter" : "swarm";
            const hp = kind === "brute" ? 38 : kind === "hunter" ? 8 : 10 + Math.floor(s.wave / 4);
            s.enemies.push({ ...movingUnit(s.nextId++, point, hp), kind, path, repath: s.tick + spawned % 10 });
            spawned++;
        }
        s.nextWave = s.tick + Math.round(Math.max(14, 21 - s.heat / 12) / STEP_SECONDS);
        this.note(`第 ${s.wave} 波虫潮：${waveApproach(s.wave)}，${spawned} 个目标接近。`);
        this.emit("wave", { count: spawned });
    }
    damage(entity, amount) {
        if (entity.hp <= 0) return;
        entity.hp = Math.max(0, entity.hp - amount);
    }
    shoot(tower, weapon) {
        const s = this.state;
        if (tower.cooldown > 0 || tower.hp <= 0 || tower.packing) return;
        const range = weapon.range + (tower.id !== 0 && elevated(this.world.tile(tower)) ? 1 : 0);
        let target;
        let best = Infinity;
        for (const enemy of s.enemies) {
            const d = distance(tower, enemy);
            if (enemy.hp > 0 && d <= range && d < best) { target = enemy; best = d; }
        }
        if (!target) return;
        tower.cooldown = weapon.interval;
        const damage = weapon.damage + (s.upgrades.includes("firepower") ? 2 : 0);
        this.emit("shot", { from: { x: tower.x, y: tower.y }, to: { x: target.x, y: target.y } });
        if (tower.kind === "mortar") {
            for (const enemy of s.enemies) if (distance(enemy, target) <= 1) this.damage(enemy, damage);
            this.emit("blast", { point: { x: target.x, y: target.y }, size: 1 });
        } else this.damage(target, damage);
    }
    step() {
        const s = this.state;
        if (s.status !== "playing" || s.pendingUpgrade) return false;
        s.tick++;
        s.base.cooldown = Math.max(0, s.base.cooldown - 1);
        this.move(s.base, 1.25, true);
        s.highestX = Math.max(s.highestX, s.base.x);
        const mining = s.rovers.filter(rover => rover.job === "mining").length;
        s.heat = Math.max(0, Math.min(100, s.heat + (s.base.path.length ? -0.18 : 0.025) + mining * 0.11));
        for (const rover of s.rovers) {
            if (rover.hp <= 0) continue;
            if (rover.job === "returning" && s.tick % 5 === rover.id % 5) {
                const path = this.route(rover, s.base); if (path) rover.path = path;
            }
            this.move(rover, s.upgrades.includes("logistics") ? 2.25 : 1.8);
            if (rover.path.length) continue;
            if (rover.job === "outbound") rover.job = "mining";
            if (rover.job === "mining") {
                const mine = mineAt(rover.mine, this.world.tile(rover.mine));
                const key = keyOf(rover.mine);
                rover.work++;
                if (mine && (s.mined[key] ?? 0) < mine.total && rover.work >= 3) {
                    rover.work = 0; s.mined[key] = (s.mined[key] ?? 0) + 1; rover.cargo++;
                }
                if (!mine || (s.mined[key] ?? 0) >= mine.total || rover.cargo >= (s.upgrades.includes("logistics") ? 28 : 20)) {
                    rover.job = "returning";
                    rover.path = this.route(rover, s.base) ?? [];
                }
            }
            if (rover.job === "returning" && distance(rover, s.base) <= 1) {
                const fuel = Math.floor(rover.cargo / 2);
                s.metal += rover.cargo; s.fuel += fuel; s.delivered += rover.cargo;
                this.note(`矿车安全归队：金属 +${rover.cargo}，燃料 +${fuel}。`);
                this.emit("delivery", { point: { x: s.base.x, y: s.base.y }, amount: rover.cargo });
                rover.job = "docked";
            }
        }
        s.rovers = s.rovers.filter(rover => rover.job !== "docked");
        if (s.tick >= s.nextWave) this.spawnWave();
        for (const bomb of s.bombs) if (bomb.impact <= s.tick) {
            for (const enemy of s.enemies) if (distance(enemy, bomb) <= 2) this.damage(enemy, 26);
            this.emit("blast", { point: { x: bomb.x, y: bomb.y }, size: 2.5 });
        }
        s.bombs = s.bombs.filter(bomb => bomb.impact > s.tick);
        this.shoot(s.base, { range: 4, damage: 2, interval: 5 });
        for (const tower of s.towers) {
            if (tower.hp <= 0) continue;
            tower.cooldown = Math.max(0, tower.cooldown - 1);
            if (tower.packing && distance(tower, s.base) <= 4) {
                tower.packing--;
                if (!tower.packing) { s.metal += WEAPONS[tower.kind].refund; tower.recovered = true; this.emit("pack", { point: { x: tower.x, y: tower.y } }); }
            } else this.shoot(tower, WEAPONS[tower.kind]);
        }
        s.towers = s.towers.filter(tower => !tower.recovered);
        for (const enemy of s.enemies) {
            if (enemy.hp <= 0) continue;
            enemy.cooldown = Math.max(0, enemy.cooldown - 1);
            let target = s.base;
            let best = distance(enemy, s.base);
            for (const candidate of [...s.towers, ...s.rovers]) {
                const d = distance(enemy, candidate) * (enemy.kind === "hunter" && "cargo" in candidate ? 0.65 : 1);
                if (candidate.hp > 0 && d < best) { best = d; target = candidate; }
            }
            if (distance(enemy, target) <= 1) {
                enemy.path = []; enemy.progress = 0;
                if (!enemy.cooldown) { this.damage(target, enemy.kind === "brute" ? 9 : 3); enemy.cooldown = 5; }
            } else {
                if (s.tick >= enemy.repath || !enemy.path.length) {
                    const path = this.route(enemy, target); if (path) enemy.path = path;
                    enemy.repath = s.tick + 10;
                }
                this.move(enemy, enemy.kind === "hunter" ? 1.8 : enemy.kind === "brute" ? 0.7 : 1.1);
            }
        }
        for (const entity of [s.base, ...s.towers, ...s.rovers]) if (entity.x <= frontX(s)) this.damage(entity, entity.id === 0 ? 2.4 : 5);
        for (const enemy of s.enemies) if (enemy.hp <= 0) {
            s.kills++; s.metal += enemy.kind === "brute" ? 3 : 1;
            this.emit("death", { point: { x: enemy.x, y: enemy.y }, size: enemy.kind === "brute" ? 1 : 0.5 });
        }
        s.enemies = s.enemies.filter(enemy => enemy.hp > 0 && distance(enemy, s.base) <= 19 && enemy.x > frontX(s) - 3);
        for (const rover of s.rovers) if (rover.hp <= 0 || distance(rover, s.base) > 17) {
            s.crews--; s.lostRovers++;
            this.note(`一辆矿车失联，损失 ${rover.cargo} 金属。可以花费 22 金属重建。`);
            this.emit("death", { point: { x: rover.x, y: rover.y } });
        }
        s.rovers = s.rovers.filter(rover => rover.hp > 0 && distance(rover, s.base) <= 17);
        for (const tower of s.towers) if (tower.hp <= 0 || distance(tower, s.base) > 17) { s.abandoned++; this.emit("death", { point: { x: tower.x, y: tower.y } }); }
        s.towers = s.towers.filter(tower => tower.hp > 0 && distance(tower, s.base) <= 17);
        if (s.tick % 50 === 0) for (const key of Object.keys(s.mined)) if (Number(key.split(",")[0]) < frontX(s) - 2) delete s.mined[key];
        if (s.base.hp <= 0) {
            s.status = "lost"; this.note("核心失守。下次撤离时，给矿车和防线留一点时间。");
        } else if (s.base.x >= s.goal) {
            s.status = "won"; this.note("主车穿过撤离线。你保住了这座会行走的家。");
        } else if (s.highestX >= s.nextUpgrade && s.upgrades.length < Object.keys(UPGRADES).length) {
            s.nextUpgrade += 16; s.pendingUpgrade = true;
        }
        return true;
    }
}

export function validateRun(s) {
    const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
    const point = p => p && integer(p.x, -1000000, 1000000) && integer(p.y, -1000000, 1000000);
    const hp = unit => point(unit) && integer(unit.id) && Number.isFinite(unit.hp) && unit.hp >= 0
        && integer(unit.maxHp, 1, 10000) && unit.hp <= unit.maxHp && integer(unit.cooldown, 0, 100);
    const moving = unit => hp(unit) && Number.isFinite(unit.progress) && unit.progress >= 0 && unit.progress < 1
        && Array.isArray(unit.path) && unit.path.length <= LIMITS.route && unit.path.every((p, i) => point(p) && distance(i ? unit.path[i - 1] : unit, p) === 1);
    if (!s || s.seed !== SEED || !integer(s.tick) || !integer(s.nextId, 1) || !moving(s.base) || s.base.id !== 0
        || typeof s.base.paid !== "boolean" || !["playing", "won", "lost"].includes(s.status)
        || !integer(s.goal, 48, 1000000) || !integer(s.highestX) || !integer(s.metal) || !integer(s.fuel)
        || !integer(s.crews, 0, LIMITS.rovers) || !Array.isArray(s.rovers) || s.rovers.length > s.crews
        || s.rovers.some(r => !moving(r) || !["outbound", "mining", "returning"].includes(r.job) || !point(r.mine) || !integer(r.cargo, 0, 28) || !integer(r.work, 0, 3))
        || !Array.isArray(s.towers) || s.towers.length > LIMITS.towers
        || s.towers.some(t => !hp(t) || !Object.hasOwn(WEAPONS, t.kind) || !integer(t.packing, 0, 15))
        || !Array.isArray(s.enemies) || s.enemies.length > LIMITS.enemies
        || s.enemies.some(e => !moving(e) || !["swarm", "hunter", "brute"].includes(e.kind) || !integer(e.repath))
        || !Array.isArray(s.bombs) || s.bombs.length > 1 || s.bombs.some(b => !point(b) || !integer(b.impact, s.tick + 1, s.tick + 6))
        || !s.mined || Object.getPrototypeOf(s.mined) !== Object.prototype || Object.entries(s.mined).some(([key, value]) => !/^-?\d+,-?\d+$/.test(key) || !integer(value, 0, 42))
        || !integer(s.wave) || !integer(s.nextWave) || !Number.isFinite(s.heat) || s.heat < 0 || s.heat > 100
        || !integer(s.barrageReady) || !integer(s.kills) || !integer(s.delivered) || !integer(s.lostRovers) || !integer(s.abandoned)
        || !integer(s.nextUpgrade, 16) || typeof s.pendingUpgrade !== "boolean" || !Array.isArray(s.upgrades)
        || s.upgrades.some(id => !Object.hasOwn(UPGRADES, id)) || new Set(s.upgrades).size !== s.upgrades.length
        || !Array.isArray(s.log) || !s.log.length || s.log.length > 5 || s.log.some(line => !integer(line.tick, 0, s.tick) || typeof line.text !== "string" || line.text.length > 200)
        || (s.status === "lost" && s.base.hp > 0) || (s.status === "won" && s.base.x < s.goal)) throw new Error("要塞存档不符合当前规则，无法恢复。");
    const ids = [s.base, ...s.rovers, ...s.towers, ...s.enemies].map(unit => unit.id);
    if (new Set(ids).size !== ids.length || ids.some(id => id >= s.nextId)) throw new Error("要塞存档包含无效单位标识。");
    return structuredClone(s);
}

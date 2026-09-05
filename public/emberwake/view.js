import * as THREE from "../js/vendor/three.module.js";
import { distance, frontX, hash, keyOf, LIMITS, passable } from "./rules.js";

export const TILE_SIZE = 36;
const COLORS = { gold: 0xeec17a, orange: 0xf19652, mint: 0x91dfcd, red: 0xf96963, dark: 0x26363a, steel: 0x62756d };

export function createBattleView(map, engine, world) {
    const root = new THREE.Group();
    root.name = "emberwake-fortress";
    const geometries = new Set();
    const materials = new Set();
    const instances = [];
    const account = map.createResourceAccount("emberwake-battle");
    const geo = value => { geometries.add(value); return value; };
    const mat = (color, emissive = color, basic = false) => {
        const material = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.32, roughness: 0.85, metalness: 0.08 });
        materials.add(material); return material;
    };
    const steel = mat(COLORS.steel), dark = mat(COLORS.dark), gold = mat(COLORS.gold), orange = mat(COLORS.orange);
    const mint = mat(COLORS.mint, 0x195b48), red = mat(COLORS.red, 0x6b1713), black = mat(0x101c23);
    const glow = mat(0xffd196, 0, true), health = mat(0x8fdbb4, 0, true);
    const box = geo(new THREE.BoxGeometry(1, 1, 1));
    const sphere = geo(new THREE.IcosahedronGeometry(1, 1));
    const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 8));
    const crystal = geo(new THREE.OctahedronGeometry(1));
    const torus = geo(new THREE.TorusGeometry(1, 0.035, 4, 48));
    const mesh = (geometry, material, parent, position, scale) => {
        const object = new THREE.Mesh(geometry, material);
        object.position.set(...position); object.scale.set(...scale); parent.add(object); return object;
    };
    const instanced = (geometry, material, capacity) => {
        const object = new THREE.InstancedMesh(geometry, material, capacity);
        object.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.count = 0;
        root.add(object); instances.push(object); return object;
    };
    function vehicle(isBase) {
        const group = new THREE.Group(); root.add(group);
        const scale = isBase ? 1 : 0.46;
        const body = new THREE.Group(); group.add(body); body.scale.setScalar(scale);
        for (const side of [-1, 1]) {
            mesh(box, black, body, [side * 22, 8, 0], [12, 15, 64]);
            mesh(box, steel, body, [side * 22, 15, 0], [14, 4, 66]);
            for (const z of [-23, -8, 8, 23]) {
                const wheel = mesh(cylinder, dark, body, [side * 28, 8, z], [6, 2, 6]);
                wheel.rotation.z = Math.PI / 2;
            }
        }
        mesh(box, steel, body, [0, 15, 0], [38, 18, 54]);
        mesh(box, isBase ? dark : gold, body, [0, 28, -9], [28, 12, 23]);
        mesh(box, mint, body, [0, 29, -21], [22, 3, 1]);
        mesh(box, orange, body, [0, 25, 18], [32, 3, 17]);
        const cargo = mesh(crystal, mint, body, [0, 33, 14], [9, 12, 9]);
        cargo.visible = !isBase;
        const weapon = new THREE.Group(); weapon.position.y = 33; body.add(weapon);
        if (isBase) {
            mesh(cylinder, dark, weapon, [0, 0, 0], [12, 8, 12]);
            mesh(box, gold, weapon, [0, 3, 0], [16, 8, 17]);
            for (const x of [-5, 5]) mesh(box, dark, weapon, [x, 3, 17], [4, 4, 28]);
            for (const x of [-13, 13]) {
                mesh(cylinder, dark, body, [x, 32, 22], [3, 26, 3]);
                mesh(cylinder, glow, body, [x, 46, 22], [2, 2, 2]);
            }
            mesh(box, dark, body, [-18, 45, -14], [1, 28, 1]);
            mesh(box, gold, body, [-12, 56, -14], [12, 7, 1]);
        } else {
            mesh(box, dark, body, [0, 12, 36], [13, 10, 18]);
            const drill = mesh(cylinder, orange, body, [0, 12, 45], [7, 12, 7]); drill.rotation.x = Math.PI / 2;
        }
        const hp = mesh(box, health, group, [0, isBase ? 72 : 42, 0], [isBase ? 48 : 28, 2.3, 3]);
        return { group, body, weapon, cargo, hp, id: undefined };
    }
    const base = vehicle(true);
    const rovers = Array.from({ length: LIMITS.rovers }, () => vehicle(false));
    function turret() {
        const group = new THREE.Group(); root.add(group);
        mesh(cylinder, dark, group, [0, 3, 0], [16, 6, 16]);
        mesh(cylinder, steel, group, [0, 12, 0], [7, 20, 7]);
        for (const x of [-1, 1]) for (const z of [-1, 1]) mesh(box, dark, group, [x * 11, 4, z * 11], [7, 7, 7]);
        const weapon = new THREE.Group(); weapon.position.y = 23; group.add(weapon);
        mesh(box, gold, weapon, [0, 0, 0], [18, 9, 18]);
        const gun = new THREE.Group(); weapon.add(gun);
        for (const x of [-5, 5]) mesh(box, dark, gun, [x, 1, 17], [4, 4, 27]);
        const mortar = mesh(cylinder, orange, weapon, [0, 8, 9], [7, 23, 7]); mortar.rotation.x = 0.7;
        const hp = mesh(box, health, group, [0, 47, 0], [30, 2, 3]);
        return { group, weapon, gun, mortar, hp };
    }
    const towers = Array.from({ length: LIMITS.towers }, turret);
    const enemyBodies = instanced(sphere, red, LIMITS.enemies);
    const enemyLegs = instanced(box, dark, LIMITS.enemies * 6);
    const enemyEyes = instanced(box, glow, LIMITS.enemies);
    const enemyHealth = instanced(box, red, LIMITS.enemies);
    const mineCapacity = 1 + 3 * 11 * 12;
    const ore = instanced(crystal, mint, mineCapacity * 4);
    const oreBases = instanced(cylinder, dark, mineCapacity);
    const route = instanced(sphere, gold, LIMITS.route);
    const ashMaterial = mat(0x271d27); ashMaterial.transparent = true; ashMaterial.opacity = 0.78;
    const ash = instanced(geo(new THREE.CylinderGeometry(1, 1, 1, 6)), ashMaterial, 625);
    const embers = instanced(crystal, red, 40);
    const particles = instanced(sphere, glow, 120);
    const reticle = mesh(torus, gold, root, [0, 0, 0], [30, 30, 30]); reticle.rotation.x = -Math.PI / 2;
    const bombRing = mesh(torus, red, root, [0, 0, 0], [126, 126, 126]); bombRing.rotation.x = -Math.PI / 2;
    const rangeRing = mesh(torus, gold, root, [0, 0, 0], [230, 230, 230]); rangeRing.rotation.x = -Math.PI / 2;
    const ringMaterial = gold.clone(); materials.add(ringMaterial); ringMaterial.transparent = true; ringMaterial.opacity = 0.35; rangeRing.material = ringMaterial;
    const shotPositions = new Float32Array(96 * 6);
    const shotGeometry = geo(new THREE.BufferGeometry());
    shotGeometry.setAttribute("position", new THREE.BufferAttribute(shotPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const shotMaterial = new THREE.LineBasicMaterial({ color: 0xffd69a, transparent: true, opacity: 0.95 }); materials.add(shotMaterial);
    const shotLines = new THREE.LineSegments(shotGeometry, shotMaterial); shotLines.frustumCulled = false; root.add(shotLines);
    account.acquireRequired("battle-models", engine.estimateObject3DResourceCost([root]), true);

    let host, state, selected;
    let mode = "inspect", elapsed = 0, paused = true;
    let renderedTick = -1, surfaceRevision = -1;
    const heights = new Map(), shots = [], bursts = [];
    const dummy = new THREE.Object3D();
    const target = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
    function center(point, output = new THREE.Vector3()) {
        const key = keyOf(point);
        let height = heights.get(key);
        if (height === undefined) {
            height = map.surface.getTileCenterHeight(point.x, point.y);
            if (heights.size >= 2048) heights.clear();
            heights.set(key, height);
        }
        const location = engine.getHexCenter(point.x, point.y, TILE_SIZE);
        return output.set(location.x, height, location.y);
    }
    function unitCenter(unit, output = target) {
        center(unit, output);
        if (unit.path?.length) { center(unit.path[0], to); output.lerp(to, unit.progress); }
        return output;
    }
    function put(object, index, position, x, y, z, rotation = 0) {
        dummy.position.copy(position); dummy.scale.set(x, y, z); dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix(); object.setMatrixAt(index, dummy.matrix);
    }
    function aim(weapon, unit, bodyAngle = 0) {
        let closest;
        for (const enemy of state.enemies) if (!closest || distance(unit, enemy) < distance(unit, closest)) closest = enemy;
        if (closest && distance(unit, closest) < 7) {
            center(unit, from); center(closest, to);
            weapon.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) - bodyAngle;
        } else weapon.rotation.y = 0;
    }
    function showVehicle(model, unit, dt) {
        model.group.visible = Boolean(unit);
        if (!unit) { model.id = undefined; return; }
        unitCenter(unit);
        if (model.id !== unit.id) { model.group.position.copy(target); model.id = unit.id; }
        model.group.position.lerp(target, 1 - Math.exp(-dt * 18));
        if (unit.path.length) {
            center(unit, from); center(unit.path[0], to);
            model.body.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        }
        model.hp.scale.x = (unit.id === 0 ? 48 : 28) * unit.hp / unit.maxHp;
        if (unit.id === 0) aim(model.weapon, unit, model.body.rotation.y);
        else { model.cargo.visible = unit.cargo > 0; model.cargo.scale.setScalar(5 + unit.cargo * 0.3); }
        model.body.position.y = unit.path.length ? Math.sin(elapsed * 19) * 0.5 : 0;
    }
    function staticObjects() {
        let crystals = 0, deposits = 0;
        for (const mine of world.mines(state, 11)) {
            if (mine.x <= frontX(state)) continue;
            center(mine, target); target.y += 2;
            put(oreBases, deposits++, target, 15, 4, 15);
            const left = mine.total - (state.mined[keyOf(mine)] ?? 0);
            for (let i = 0; i < Math.min(4, Math.ceil(left / 10)); i++) {
                center(mine, target); target.x += Math.cos(i * 2.4) * 10; target.z += Math.sin(i * 2.4) * 10; target.y += 12 + i * 2;
                put(ore, crystals++, target, 6, 14 + i * 2, 6, hash(mine.x, i) % 6);
            }
        }
        ore.count = crystals; oreBases.count = deposits;
        route.count = state.base.path.length;
        state.base.path.forEach((point, index) => { center(point, target); target.y += 7; put(route, index, target, 2.5, 2.5, 2.5); });
        let count = 0, fire = 0;
        const edge = Math.floor(frontX(state));
        for (let x = state.base.x - 12; x <= Math.min(edge, state.base.x + 12); x++) for (let y = state.base.y - 12; y <= state.base.y + 12; y++) {
            center({ x, y }, target); target.y += 4; put(ash, count++, target, 35.7, 1, 35.7, Math.PI / 6);
        }
        ash.count = count;
        if (Math.abs(edge - state.base.x) < 15) for (let y = state.base.y - 12; y <= state.base.y + 12; y++) {
            center({ x: edge, y }, target); target.x += (frontX(state) - edge) * TILE_SIZE * 1.5; target.y += 12;
            put(embers, fire++, target, 3, 14, 3);
        }
        embers.count = fire;
    }
    function frame({ dtS }) {
        if (!host || !state) return;
        const dt = Math.min(0.1, dtS);
        if (!paused) elapsed += dt;
        if (surfaceRevision !== map.surface.revision) { heights.clear(); surfaceRevision = map.surface.revision; renderedTick = -1; }
        if (renderedTick !== state.tick) { staticObjects(); renderedTick = state.tick; }
        showVehicle(base, state.base, dt);
        rovers.forEach((model, index) => showVehicle(model, state.rovers[index], dt));
        towers.forEach((model, index) => {
            const unit = state.towers[index]; model.group.visible = Boolean(unit);
            if (!unit) return;
            center(unit, model.group.position); model.gun.visible = unit.kind === "gun"; model.mortar.visible = unit.kind === "mortar";
            model.group.scale.y = unit.packing ? 0.35 + unit.packing / 15 * 0.65 : 1;
            model.hp.scale.x = 30 * unit.hp / unit.maxHp; aim(model.weapon, unit);
        });
        let legs = 0;
        state.enemies.forEach((enemy, index) => {
            unitCenter(enemy); target.y += 7;
            const size = enemy.kind === "brute" ? 1.8 : enemy.kind === "hunter" ? 0.7 : 1;
            const angle = enemy.path.length ? Math.atan2(to.x - target.x, to.z - target.z) : 0;
            put(enemyBodies, index, target, 10 * size, 8 * size, 12 * size, angle);
            from.copy(target); from.y += 11 * size; put(enemyHealth, index, from, 19 * size * enemy.hp / enemy.maxHp, 1.2, 2);
            from.copy(target); from.y += 4; put(enemyEyes, index, from, 10 * size, 2, 3, angle);
            for (let side = -1; side <= 1; side += 2) for (let leg = 0; leg < 3; leg++) {
                from.copy(target); from.x += side * 11 * size; from.z += (leg - 1) * 9 * size;
                from.y += Math.sin(elapsed * 13 + leg + side + enemy.id) * 2 - 4;
                put(enemyLegs, legs++, from, 15 * size, 2.2 * size, 2.2 * size, side * 0.6 + Math.sin(elapsed * 13 + leg) * 0.2);
            }
        });
        enemyBodies.count = enemyEyes.count = enemyHealth.count = state.enemies.length; enemyLegs.count = legs;
        reticle.visible = Boolean(selected);
        if (selected) { center(selected, reticle.position); reticle.position.y += 6; }
        rangeRing.visible = mode !== "inspect";
        if (rangeRing.visible) { center(state.base, rangeRing.position); rangeRing.position.y += 5; rangeRing.scale.setScalar((mode === "gun" || mode === "mortar" || mode === "salvage" ? 4 : mode === "mine" ? 8 : 10) * 55); }
        bombRing.visible = state.bombs.length > 0;
        if (state.bombs.length) { center(state.bombs[0], bombRing.position); bombRing.position.y += 9; bombRing.scale.setScalar(115 + Math.sin(elapsed * 20) * 8); }
        let segment = 0;
        for (let i = shots.length - 1; i >= 0; i--) {
            const shot = shots[i]; shot.life -= dt;
            if (shot.life <= 0) { shots.splice(i, 1); continue; }
            center(shot.from, from); center(shot.to, to); from.y += 30; to.y += 10;
            shotPositions.set([from.x, from.y, from.z, to.x, to.y, to.z], segment++ * 6);
        }
        shotGeometry.setDrawRange(0, segment * 2); shotGeometry.attributes.position.needsUpdate = true;
        let debris = 0;
        for (let i = bursts.length - 1; i >= 0; i--) {
            const burst = bursts[i]; burst.age += dt;
            if (burst.age > 0.8) { bursts.splice(i, 1); continue; }
            for (let j = 0; j < 10 && debris < 120; j++) {
                center(burst.point, target);
                const angle = j * 2.4; const travel = burst.age * 90 * burst.size;
                target.x += Math.cos(angle) * travel; target.z += Math.sin(angle) * travel;
                target.y += 8 + Math.sin(burst.age / 0.8 * Math.PI) * 35;
                const scale = (1 - burst.age / 0.8) * 8 * burst.size;
                put(particles, debris++, target, scale, scale, scale);
            }
        }
        particles.count = debris;
        for (const object of instances) { object.instanceMatrix.needsUpdate = true; object.computeBoundingSphere(); }
        host.invalidateVisibility();
    }
    map.on("frame", frame);
    return {
        layer: {
            id: "emberwake-battle", initialize(value) { host = value; host.addObject(root); },
            mountChunk() {}, unmountChunk() {},
            surfaceChanged() { heights.clear(); renderedTick = -1; },
            unloadWorld() { host = undefined; },
            dispose() {
                map.off("frame", frame); instances.forEach(object => object.dispose());
                geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
                account.dispose(); heights.clear(); host = undefined;
            }
        },
        update(value, targetPoint, tool, isPaused) { state = value; selected = targetPoint; mode = tool; paused = isPaused; renderedTick = -1; },
        effects(events) {
            for (const event of events) {
                if (event.type === "shot" && shots.length < 96) shots.push({ ...event, life: 0.16 });
                if (["blast", "death", "build", "delivery", "repair", "pack"].includes(event.type) && bursts.length < 12) bursts.push({ point: event.point, age: 0, size: event.size ?? (event.type === "death" ? 0.5 : 0.4) });
            }
        },
        project(point) {
            center(point, target); target.y += 10;
            const camera = map.getCamera();
            // World-layer matrixWorld carries the exact origin translation.
            root.updateWorldMatrix(true, false);
            target.applyMatrix4(root.matrixWorld).project(camera);
            const bounds = document.querySelector("#world").getBoundingClientRect();
            return { x: bounds.left + (target.x + 1) / 2 * bounds.width, y: bounds.top + (1 - target.y) / 2 * bounds.height,
                visible: Math.abs(target.x) < 1 && Math.abs(target.y) < 1 && Math.abs(target.z) < 1 };
        }
    };
}

export function drawRadar(canvas, state, world) {
    const ctx = canvas.getContext("2d"), cx = canvas.width / 2, cy = canvas.height / 2;
    const scale = 8.3;
    const locate = point => ({ x: cx + (point.x - state.base.x) * scale,
        y: cy + (point.y - state.base.y + (point.x % 2 === 0 ? 0.5 : 0) - (state.base.x % 2 === 0 ? 0.5 : 0)) * scale * 1.1547 });
    const points = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let x = state.base.x - 12; x <= state.base.x + 12; x++) for (let y = state.base.y - 10; y <= state.base.y + 10; y++) {
        const point = { x, y }, p = locate(point);
        ctx.fillStyle = x <= frontX(state) ? "#99495470" : passable(world.tile(point)) ? "#91b09e25" : "#71a7c344";
        ctx.fillRect(p.x - 2.4, p.y - 2.4, 4.8, 4.8); points.push({ ...point, screenX: p.x, screenY: p.y });
    }
    const dot = (point, color, size) => { const p = locate(point); ctx.fillStyle = color; ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size); };
    for (const mine of world.mines(state, 11)) dot(mine, "#91dfcd", 4);
    for (const tower of state.towers) dot(tower, "#eec17a", 5);
    for (const rover of state.rovers) dot(rover, "#cbe9dc", 4);
    for (const enemy of state.enemies) dot(enemy, "#ff756b", enemy.kind === "brute" ? 6 : 4);
    dot(state.base, "#fff0bd", 8);
    ctx.font = "9px sans-serif"; ctx.fillStyle = "#edc987"; ctx.textAlign = "right"; ctx.fillText("撤离方向 →", canvas.width - 6, 13);
    return points;
}

export function createBattleAudio() {
    let context, enabled = false, lastShot = 0;
    return {
        get enabled() { return enabled; },
        async toggle() {
            if (!context) context = new AudioContext();
            await context.resume(); enabled = !enabled; return enabled;
        },
        play(events) {
            if (!enabled || context.state !== "running") return;
            for (const event of events) {
                if (!["shot", "blast", "wave", "delivery"].includes(event.type)) continue;
                if (event.type === "shot" && context.currentTime - lastShot < 0.08) continue;
                const oscillator = context.createOscillator(), gain = context.createGain();
                const start = context.currentTime, length = event.type === "wave" ? 0.4 : event.type === "blast" ? 0.22 : 0.07;
                const frequency = event.type === "delivery" ? 660 : event.type === "wave" ? 180 : event.type === "blast" ? 90 : 160;
                oscillator.type = event.type === "delivery" ? "sine" : "triangle";
                oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.4, start + length);
                gain.gain.setValueAtTime(0.045, start); gain.gain.exponentialRampToValueAtTime(0.001, start + length);
                oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(start + length);
                oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
                if (event.type === "shot") lastShot = start;
            }
        },
        dispose() { enabled = false; return context?.close(); }
    };
}

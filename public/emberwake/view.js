import * as THREE from "../js/vendor/three.module.js";
import { HOME, beacons, keyOf, samePoint, siteAt } from "./rules.js";

const SIZE = 36;
const MAX_LOCAL_SITES = 441;

/** Fixed-size presentation, published through the foundation's layer owner. */
export function createFlightView(map, engine) {
    const account = map.createResourceAccount("emberwake-presentation");
    const root = new THREE.Group();
    root.name = "emberwake-flight";
    const geometries = new Set();
    const materials = new Set();
    const geometry = value => { geometries.add(value); return value; };
    const material = (color, emissive = 0x000000) => {
        const value = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.72, metalness: 0.15 });
        materials.add(value);
        return value;
    };
    const gold = material(0xefc77f, 0x3e2d0e);
    const dark = material(0x273944);
    const linen = material(0xf2dfb4);
    const mint = material(0x91d5b0, 0x214c34);
    const blue = material(0x98bdf5, 0x213756);
    const muted = material(0x50666b);
    const sphere = geometry(new THREE.SphereGeometry(1, 16, 10));
    const box = geometry(new THREE.BoxGeometry(1, 1, 1));
    const crystal = geometry(new THREE.OctahedronGeometry(1));
    const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 6));
    const ring = geometry(new THREE.TorusGeometry(1, 0.065, 5, 36));
    const mesh = (geo, mat, parent, position, scale) => {
        const object = new THREE.Mesh(geo, mat);
        object.position.set(...position);
        object.scale.set(...scale);
        parent.add(object);
        return object;
    };

    const ship = new THREE.Group();
    ship.scale.setScalar(1.45);
    const hull = new THREE.Group();
    ship.add(hull);
    root.add(ship);
    mesh(sphere, linen, hull, [0, 14, 0], [12, 12, 24]);
    mesh(sphere, gold, hull, [0, 14, 0], [12.3, 12.3, 4]);
    mesh(box, dark, hull, [0, -4, 2], [9, 5, 17]);
    mesh(box, gold, hull, [0, -1, 2], [10, 1, 18]);
    mesh(box, gold, hull, [0, 16, 22], [2, 16, 8]);
    mesh(box, gold, hull, [0, 13, 21], [25, 1, 7]);
    for (const x of [-5, 5]) for (const z of [-5, 9]) mesh(box, dark, hull, [x, 3, z], [0.65, 10, 0.65]);
    const propeller = mesh(box, gold, hull, [0, -4, -9], [17, 1, 1]);
    const shipRing = mesh(ring, gold, root, [0, 0, 0], [26, 26, 26]);
    shipRing.rotation.x = -Math.PI / 2;

    const towers = new THREE.Group();
    root.add(towers);
    const towerObjects = [HOME, {}, {}, {}].map((_, index) => {
        const group = new THREE.Group();
        const height = index === 0 ? 21 : 33;
        mesh(cylinder, dark, group, [0, 3, 0], [15, 6, 15]);
        mesh(cylinder, gold, group, [0, height / 2, 0], [3, height, 3]);
        const light = mesh(crystal, gold, group, [0, height + 8, 0], [9, 12, 9]);
        const halo = mesh(ring, gold, group, [0, height + 8, 0], [17, 17, 17]);
        halo.rotation.x = Math.PI / 2;
        towers.add(group);
        return { group, light, halo };
    });
    const supplies = new THREE.InstancedMesh(crystal, mint, MAX_LOCAL_SITES);
    const relics = new THREE.InstancedMesh(crystal, blue, MAX_LOCAL_SITES);
    const trail = new THREE.InstancedMesh(sphere, gold, 49);
    const selectedRing = mesh(ring, gold, root, [0, 0, 0], [29, 29, 29]);
    selectedRing.rotation.x = -Math.PI / 2;
    for (const object of [supplies, relics, trail]) {
        object.count = 0;
        object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(object);
    }
    selectedRing.visible = false;
    account.acquireRequired("flight-models", engine.estimateObject3DResourceCost([root]), true);

    let host;
    let latestState;
    let latestRoute = [];
    let destination;
    let initializedPosition = false;
    let elapsed = 0;
    const target = new THREE.Vector3();
    const delta = new THREE.Vector3();
    const dummy = new THREE.Object3D();
    const center = point => {
        const horizontal = engine.getHexCenter(point.x, point.y, SIZE);
        return new THREE.Vector3(horizontal.x, map.surface.getTileCenterHeight(point.x, point.y), horizontal.y);
    };
    const instance = (object, index, point, scale, elevation) => {
        dummy.position.copy(center(point));
        dummy.position.y += elevation;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        object.setMatrixAt(index, dummy.matrix);
    };
    const refresh = () => {
        if (!host || !latestState) return;
        const state = latestState;
        target.copy(center(state.position));
        target.y += 65;
        if (!initializedPosition || state.turn === 0) { ship.position.copy(target); initializedPosition = true; }
        shipRing.position.copy(center(state.position));
        shipRing.position.y += 4;
        [HOME, ...beacons(state.seed)].forEach((point, index) => {
            const tower = towerObjects[index];
            tower.group.position.copy(center(point));
            const lit = index === 0 || state.lit.includes(point.id);
            tower.light.material = lit ? mint : gold;
            tower.halo.material = lit ? mint : muted;
        });
        let supplyCount = 0;
        let relicCount = 0;
        const collected = new Set(state.collected);
        const network = beacons(state.seed);
        for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
            const point = { x: state.position.x + dx, y: state.position.y + dy };
            const site = siteAt(state.seed, point, network);
            if (!site || collected.has(site.id)) continue;
            if (site.kind === "supply") instance(supplies, supplyCount++, point, 7, 19);
            if (site.kind === "relic") instance(relics, relicCount++, point, 8, 22);
        }
        supplies.count = supplyCount;
        relics.count = relicCount;
        trail.count = latestRoute.length;
        latestRoute.forEach((point, index) => instance(trail, index, point, 2.5, 14));
        for (const object of [supplies, relics, trail]) {
            object.instanceMatrix.needsUpdate = true;
            object.computeBoundingSphere();
        }
        selectedRing.visible = Boolean(destination && !samePoint(destination, state.position));
        if (selectedRing.visible) { selectedRing.position.copy(center(destination)); selectedRing.position.y += 8; }
        host.invalidateVisibility();
    };
    const frame = ({ dtS }) => {
        if (!host || !latestState) return;
        elapsed += dtS;
        delta.copy(target).sub(ship.position);
        if (delta.lengthSq() > 1) hull.rotation.y = Math.atan2(-delta.x, -delta.z);
        ship.position.lerp(target, 1 - Math.exp(-dtS * 9));
        hull.position.y = Math.sin(elapsed * 1.8) * 1.8;
        propeller.rotation.z += dtS * 16;
        host.invalidateVisibility();
        // Everything is attached to the world-scoped host; changing the camera
        // or floating origin never changes the authoritative tile position.
    };
    map.on("frame", frame);
    const layer = {
        id: "emberwake-flight",
        initialize(nextHost) { host = nextHost; host.addObject(root); refresh(); },
        mountChunk() {},
        unmountChunk() {},
        surfaceChanged() { refresh(); },
        unloadWorld() { host = undefined; initializedPosition = false; },
        dispose() {
            map.off("frame", frame);
            for (const item of [supplies, relics, trail]) item.dispose();
            for (const item of geometries) item.dispose();
            for (const item of materials) item.dispose();
            account.dispose();
            host = undefined;
        }
    };
    return {
        layer,
        update(state, route, selected) { latestState = state; latestRoute = route; destination = selected; refresh(); },
        get shipPosition() { return { x: ship.position.x, y: ship.position.y, z: ship.position.z }; }
    };
}

export function drawRadar(canvas, state, selected, engine) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const scale = 6.6;
    const origin = engine.getHexCenter(state.position.x, state.position.y, scale);
    const visited = new Set(state.visited);
    const collected = new Set(state.collected);
    const network = beacons(state.seed);
    const points = [];
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    for (const radius of [35, 70, 105]) {
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#b3cccc15"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-115, 0); ctx.lineTo(115, 0); ctx.moveTo(0, -108); ctx.lineTo(0, 108);
    ctx.strokeStyle = "#b3cccc15"; ctx.stroke();
    for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
        const point = { x: state.position.x + dx, y: state.position.y + dy };
        const center = engine.getHexCenter(point.x, point.y, scale);
        const x = center.x - origin.x;
        const y = center.y - origin.y;
        if (Math.hypot(x, y) > 106) continue;
        const site = siteAt(state.seed, point, network);
        const active = site && !collected.has(site.id);
        ctx.fillStyle = active ? ({ home: "#edc987", beacon: "#edc987", supply: "#a4d6ae", relic: "#98bbf3" })[site.kind]
            : visited.has(keyOf(point)) ? "#a1bab480" : "#809a9f30";
        ctx.beginPath(); ctx.arc(x, y, active ? 3.4 : 1.2, 0, Math.PI * 2); ctx.fill();
        if (selected && samePoint(selected, point)) {
            ctx.strokeStyle = "#edc987"; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
        }
        points.push({ ...point, screenX: x + width / 2, screenY: y + height / 2 });
    }
    ctx.fillStyle = "#f3e2b9";
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8ca4a8"; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("N", 0, -108);
    ctx.restore();
    return points;
}

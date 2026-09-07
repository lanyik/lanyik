import { describe, expect, test } from "vitest";
import { CombatSimulation, MAX_ENEMIES, type MovementInput } from "../src/core/CombatSimulation";
import { MAX_COMBAT_CHUNKS, RegionalWorld } from "../src/core/RegionalWorld";

const movementAt = (step: number): MovementInput => {
    const angle = step / 150;
    return { x: Math.cos(angle), z: Math.sin(angle), active: true };
};

describe("CombatSimulation", () => {
    test("continuously spawns enemies and resolves automatic combat in fixed steps", () => {
        const combat = new CombatSimulation("combat-loop");
        for (let step = 0; step < 900; step += 1) combat.step(movementAt(step));
        const snapshot = combat.getSnapshot();
        expect(snapshot.elapsedMs).toBe(18_000);
        expect(snapshot.livingEnemies).toBeGreaterThan(0);
        expect(snapshot.livingEnemies).toBeLessThanOrEqual(MAX_ENEMIES);
        expect(snapshot.kills).toBeGreaterThan(0);
        expect(snapshot.player.x).not.toBe(0);
        expect(combat.getRenderState().enemies.count).toBe(snapshot.livingEnemies);
    });

    test("replays combat and loot state exactly for the same seed and inputs", () => {
        const first = new CombatSimulation("replay", { x: 12.5, z: -9.25 });
        const second = new CombatSimulation("replay", { x: 12.5, z: -9.25 });
        for (let step = 0; step < 1_200; step += 1) {
            const input = movementAt(step);
            first.step(input);
            second.step(input);
        }
        expect(first.getSnapshot()).toEqual(second.getSnapshot());
        const firstRender = first.getRenderState();
        const secondRender = second.getRenderState();
        expect(Array.from(firstRender.enemies.ids.slice(0, firstRender.enemies.count)))
            .toEqual(Array.from(secondRender.enemies.ids.slice(0, secondRender.enemies.count)));
        expect(Array.from(firstRender.loot.itemIds.slice(0, firstRender.loot.count)))
            .toEqual(Array.from(secondRender.loot.itemIds.slice(0, secondRender.loot.count)));
    });

    test("collects XP, allocates a level point, and atomically equips dropped loot", () => {
        const combat = new CombatSimulation("progression-loop");
        for (let step = 0; step < 3_500 && !combat.gameOver; step += 1) {
            const render = combat.getRenderState();
            let targetX: number | undefined;
            let targetZ: number | undefined;
            if (render.loot.count > 0) {
                targetX = render.loot.x[0];
                targetZ = render.loot.z[0];
            } else if (render.experience.count > 0) {
                let nearest = Infinity;
                for (let index = 0; index < render.experience.count; index += 1) {
                    const dx = render.experience.x[index] - render.player.x;
                    const dz = render.experience.z[index] - render.player.z;
                    const distance = dx * dx + dz * dz;
                    if (distance < nearest) {
                        nearest = distance;
                        targetX = render.experience.x[index];
                        targetZ = render.experience.z[index];
                    }
                }
            }
            const angle = step / 130;
            const dx = targetX === undefined ? Math.cos(angle) : targetX - render.player.x;
            const dz = targetZ === undefined ? Math.sin(angle) : targetZ - render.player.z;
            combat.step({ x: dx, z: dz, active: true });
            const snapshot = combat.getSnapshot();
            if (snapshot.player.level > 1 && snapshot.player.inventory.length > 0) break;
        }

        const before = combat.getSnapshot();
        expect(before.gameOver).toBe(false);
        expect(before.player.level).toBeGreaterThan(1);
        expect(before.player.unspentAttributePoints).toBeGreaterThan(0);
        expect(before.player.inventory.length).toBeGreaterThan(0);

        const item = before.player.inventory[0];
        const previous = before.player.equipment[item.slot];
        expect(combat.equip(item.id).ok).toBe(true);
        const equipped = combat.getSnapshot();
        expect(equipped.player.equipment[item.slot]?.id).toBe(item.id);
        expect(equipped.player.inventory.some(candidate => candidate.id === previous?.id)).toBe(Boolean(previous));

        const damage = equipped.player.stats.damage;
        const health = equipped.player.health;
        const points = equipped.player.unspentAttributePoints;
        expect(combat.allocateAttribute("might").ok).toBe(true);
        const allocated = combat.getSnapshot();
        expect(allocated.player.stats.damage).toBeGreaterThan(damage);
        expect(allocated.player.health).toBe(health);
        expect(allocated.player.unspentAttributePoints).toBe(points - 1);
    });

    test("exposes explicit failures for invalid commands and input", () => {
        const combat = new CombatSimulation("commands");
        expect(combat.allocateAttribute("might")).toEqual({ ok: false, message: "没有可分配的属性点" });
        expect(combat.equip(404)).toEqual({ ok: false, message: "背包中没有这件装备" });
        expect(combat.discard(404)).toEqual({ ok: false, message: "背包中没有这件装备" });
        expect(() => combat.step({ x: NaN, z: 0, active: true })).toThrow("finite");
    });

    test("keeps fresh threats ahead and releases old entities during sustained straight travel", () => {
        const combat = new CombatSimulation("forward-pressure");
        const initial = combat.getRenderState().enemies;
        const oldIds = new Set(initial.ids.slice(0, initial.count));
        let checkpointsWithThreats = 0;
        for (let tick = 0; tick < 2500 && !combat.gameOver; tick += 1) {
            combat.step({ x: 1, z: 0, active: true });
            if (tick < 600 || tick % 200 !== 0) continue;
            const { player, enemies } = combat.getRenderState();
            let ahead = 0;
            for (let index = 0; index < enemies.count; index += 1) {
                if (enemies.x[index] > player.x && enemies.x[index] < player.x + 14
                    && Math.abs(enemies.z[index] - player.z) < 10) ahead += 1;
            }
            if (ahead > 0) checkpointsWithThreats += 1;
            expect(combat.getSnapshot().chunks.total).toBe(MAX_COMBAT_CHUNKS);
            expect(enemies.count).toBeLessThanOrEqual(MAX_ENEMIES);
        }
        expect(checkpointsWithThreats).toBeGreaterThanOrEqual(4);
        const { enemies } = combat.getRenderState();
        expect(Array.from(enemies.ids.slice(0, enemies.count)).filter(id => oldIds.has(id))).toHaveLength(0);
    });

    test("opens a world chest once and commits its equipment and coins", () => {
        const combat = new CombatSimulation("chest-walk");
        const initial = combat.getRenderState();
        let nearest = -1;
        let distance = Infinity;
        for (let index = 0; index < initial.chests.count; index += 1) {
            const candidate = Math.hypot(initial.chests.x[index], initial.chests.z[index]);
            if (candidate < distance) { nearest = index; distance = candidate; }
        }
        expect(nearest).toBeGreaterThanOrEqual(0);
        const x = initial.chests.x[nearest];
        const z = initial.chests.z[nearest];
        for (let tick = 0; tick < 800 && combat.getSnapshot().openedChests === 0; tick += 1) {
            const { player } = combat.getRenderState();
            combat.step({ x: x - player.x, z: z - player.z, active: true });
        }
        const opened = combat.getSnapshot();
        expect(opened.openedChests).toBe(1);
        expect(opened.player.gold).toBeGreaterThan(0);
        expect(opened.player.inventory.length).toBeGreaterThan(0);
        for (let tick = 0; tick < 80; tick += 1) combat.step({ x: 0, z: 0, active: false });
        expect(combat.getSnapshot().openedChests).toBe(1);
        expect(combat.equip(opened.player.inventory[0].id).ok).toBe(true);
    });

    test("freezes the static ring and updates returning middle-ring enemies only on their scheduled ticks", () => {
        const combat = new CombatSimulation("lod-motion");
        const world = new RegionalWorld("lod-motion", { x: 0, z: 0 });
        let lowUpdates = 0;
        let staticChecks = 0;
        for (let tick = 0; tick < 600; tick += 1) {
            const before = combat.getRenderState().enemies;
            const positions = new Map(Array.from({ length: before.count }, (_, index) =>
                [before.ids[index], { x: before.x[index], z: before.z[index] }] as const));
            combat.step({ x: 1, z: 0, active: true });
            const player = combat.getRenderState().player;
            world.synchronize(player.x, player.z, combat.tick);
            const after = combat.getRenderState().enemies;
            for (let index = 0; index < after.count; index += 1) {
                const previous = positions.get(after.ids[index]);
                if (!previous) continue;
                const lod = world.lodAt(previous.x, previous.z);
                if (lod === "static") {
                    expect(after.x[index]).toBe(previous.x);
                    expect(after.z[index]).toBe(previous.z);
                    staticChecks += 1;
                }
                if (lod === "low" && (after.x[index] !== previous.x || after.z[index] !== previous.z)) {
                    expect(combat.tick % 10).toBe(after.ids[index] % 10);
                    lowUpdates += 1;
                }
            }
        }
        expect(staticChecks).toBeGreaterThan(100);
        expect(lowUpdates).toBeGreaterThan(0);
    });
});

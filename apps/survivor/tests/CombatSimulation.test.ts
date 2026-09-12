import { ticksForSeconds } from "../src/core/GameConfig";
import { enemySamples } from "./helpers/EntitySamples";
import { describe, expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import type { MovementInput } from "../src/core/CombatState";
import { GAME_CONFIG, MAX_ENEMIES } from "../src/core/GameConfig";
import { MAX_COMBAT_CHUNKS, type RegionalWorld } from "../src/core/RegionalWorld";

const movementAt = (step: number): MovementInput => {
    const angle = step / ticksForSeconds(3);
    return { x: Math.cos(angle), z: Math.sin(angle), active: true };
};

describe("CombatSimulation", () => {
    test("stationary ticks reuse region and chest presentation data, then publish changed residency", () => {
        const combat = new CombatSimulation("region-presentation-cache");
        const fixture = combat as unknown as { world: RegionalWorld; playerX: number; playerZ: number;
            autoCast: boolean; attackCooldown: number; refreshChests(): void };
        fixture.autoCast = false; fixture.attackCooldown = 1000;
        const regionCreation = vi.spyOn(fixture.world, "regionAtHex"), chestRefresh = vi.spyOn(fixture, "refreshChests");
        const nearby = combat.getSnapshot().nearbyRegions;
        combat.step({ x: 0, z: 0, active: false });
        expect(combat.getSnapshot().nearbyRegions).toBe(nearby);
        expect(regionCreation).not.toHaveBeenCalled();
        expect(chestRefresh).not.toHaveBeenCalled();
        fixture.playerX += 60;
        combat.step({ x: 0, z: 0, active: false });
        expect(combat.getSnapshot().nearbyRegions).not.toBe(nearby);
        expect(chestRefresh).toHaveBeenCalledOnce();
        const expected = [...fixture.world.chunks.values()].filter(chunk => chunk.chest && !chunk.chestOpened);
        expect(combat.getRenderState().chests.count).toBe(expected.length);
        combat.dispose();
    });

    test("resolves automatic combat against resident enemies in fixed steps", () => {
        const combat = new CombatSimulation("combat-loop");
        for (let step = 0; step < ticksForSeconds(18); step += 1) combat.step(movementAt(step));
        const snapshot = combat.getSnapshot();
        expect(snapshot.elapsedMs).toBe(18_000);
        expect(snapshot.livingEnemies).toBeGreaterThan(0);
        expect(snapshot.livingEnemies).toBeLessThanOrEqual(MAX_ENEMIES);
        expect(snapshot.kills).toBeGreaterThan(0);
        expect(snapshot.player.x).not.toBe(0);
        expect(combat.getRenderState().entities.enemies.count).toBe(snapshot.livingEnemies);
    });

    test("replays combat and loot state exactly for the same seed and inputs", () => {
        const first = new CombatSimulation("replay", { x: 12.5, z: -9.25 });
        const second = new CombatSimulation("replay", { x: 12.5, z: -9.25 });
        for (let step = 0; step < ticksForSeconds(24); step += 1) {
            const input = movementAt(step);
            first.step(input);
            second.step(input);
        }
        expect(first.getSnapshot()).toEqual(second.getSnapshot());
        const firstRender = first.getRenderState();
        const secondRender = second.getRenderState();
        expect(enemySamples(firstRender)).toEqual(enemySamples(secondRender));
        const firstLoot = firstRender.entities, secondLoot = secondRender.entities;
        expect(Array.from(firstLoot.loot.slots.slice(0, firstLoot.loot.count), slot => firstLoot.item.id[slot]))
            .toEqual(Array.from(secondLoot.loot.slots.slice(0, secondLoot.loot.count), slot => secondLoot.item.id[slot]));
    });

    test("collects XP, allocates a level point, and atomically equips dropped loot", () => {
        const combat = new CombatSimulation("progression-loop");
        for (let step = 0; step < ticksForSeconds(70) && !combat.gameOver; step += 1) {
            const render = combat.getRenderState();
            let targetX: number | undefined;
            let targetZ: number | undefined;
            if (render.entities.loot.count > 0) {
                targetX = render.entities.position.x[render.entities.loot.slots[0]];
                targetZ = render.entities.position.z[render.entities.loot.slots[0]];
            } else if (render.entities.experience.count > 0) {
                let nearest = Infinity;
                for (let index = 0; index < render.entities.experience.count; index += 1) {
                    const dx = render.entities.position.x[render.entities.experience.slots[index]] - render.player.x;
                    const dz = render.entities.position.z[render.entities.experience.slots[index]] - render.player.z;
                    const distance = dx * dx + dz * dz;
                    if (distance < nearest) {
                        nearest = distance;
                        targetX = render.entities.position.x[render.entities.experience.slots[index]];
                        targetZ = render.entities.position.z[render.entities.experience.slots[index]];
                    }
                }
            }
            const angle = step / ticksForSeconds(2.6);
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

        const item = before.player.inventory.find(item => item.type === "equipment")!;
        const previous = before.player.equipment[item.value];
        expect(combat.equip(item.id).ok).toBe(true);
        const equipped = combat.getSnapshot();
        expect(equipped.player.equipment[item.value]?.id).toBe(item.id);
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
        expect(() => combat.step({ x: NaN, z: 0, active: true })).toThrow("finite");
    });

    test("keeps fresh threats ahead and releases old entities during sustained straight travel", () => {
        const combat = new CombatSimulation("forward-pressure");
        const initial = enemySamples(combat.getRenderState());
        const oldIds = new Set(initial.map(enemy => enemy.id));
        let checkpointsWithThreats = 0;
        for (let tick = 0; tick < ticksForSeconds(50) && !combat.gameOver; tick += 1) {
            combat.step({ x: 1, z: 0, active: true });
            if (tick < ticksForSeconds(12) || tick % ticksForSeconds(4) !== 0) continue;
            const state = combat.getRenderState(), player = state.player, enemies = enemySamples(state);
            let ahead = 0;
            for (let index = 0; index < enemies.length; index += 1) {
                if (enemies[index].x > player.x && enemies[index].x < player.x + 14
                    && Math.abs(enemies[index].z - player.z) < 10) ahead += 1;
            }
            if (ahead > 0) checkpointsWithThreats += 1;
            expect(combat.getSnapshot().chunks.total).toBe(MAX_COMBAT_CHUNKS);
            expect(enemies.length).toBeLessThanOrEqual(MAX_ENEMIES);
        }
        expect(checkpointsWithThreats).toBeGreaterThanOrEqual(4);
        const enemies = enemySamples(combat.getRenderState());
        expect(Array.from(enemies.map(enemy => enemy.id)).filter(id => oldIds.has(id))).toHaveLength(0);
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
        for (let tick = 0; tick < ticksForSeconds(16) && combat.getSnapshot().openedChests === 0; tick += 1) {
            const { player } = combat.getRenderState();
            combat.step({ x: x - player.x, z: z - player.z, active: true });
        }
        const opened = combat.getSnapshot();
        expect(opened.openedChests).toBe(1);
        expect(opened.player.gold).toBeGreaterThan(0);
        expect(opened.player.inventory.length).toBeGreaterThan(0);
        for (let tick = 0; tick < ticksForSeconds(1.6); tick += 1) combat.step({ x: 0, z: 0, active: false });
        expect(combat.getSnapshot().openedChests).toBe(1);
        expect(combat.equip(opened.player.inventory[0].id).ok).toBe(true);
    });

    test("visible distant residents move continuously; only actors beyond the sleep distance freeze", () => {
        const combat = new CombatSimulation("lod-motion");
        let lowUpdates = 0;
        let staticChecks = 0;
        for (let tick = 0; tick < ticksForSeconds(5); tick += 1) {
            const before = enemySamples(combat.getRenderState());
            const positions = new Map(Array.from({ length: before.length }, (_, index) =>
                [before[index].id, { x: before[index].x, z: before[index].z }] as const));
            combat.step({ x: 1, z: 0, active: true });
            const player = combat.getRenderState().player;
            const after = enemySamples(combat.getRenderState());
            for (let index = 0; index < after.length; index += 1) {
                const previous = positions.get(after[index].id);
                if (!previous) continue;
                const distance = Math.hypot(previous.x - player.x, previous.z - player.z);
                if (distance > GAME_CONFIG.enemies.sleepDistance) {
                    expect(after[index].x).toBe(previous.x);
                    expect(after[index].z).toBe(previous.z);
                    staticChecks += 1;
                }
                if (distance > 22 && distance < 29 && (after[index].x !== previous.x || after[index].z !== previous.z)) {
                    expect(Math.hypot(after[index].x - previous.x, after[index].z - previous.z)).toBeLessThan(.03);
                    lowUpdates += 1;
                }
            }
        }
        expect(staticChecks).toBeGreaterThan(100);
        expect(lowUpdates).toBeGreaterThan(0);
    });
});

import { describe, expect, test } from "vitest";
import { CombatSimulation, MAX_ENEMIES, type MovementInput } from "../src/core/CombatSimulation";

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
});

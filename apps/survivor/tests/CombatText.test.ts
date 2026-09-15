import { hitEnemy } from "./helpers/settleCombat";
import type { CombatResolution } from "../src/core/CombatResolution";
import { expect, test, vi } from "vitest";
import { CombatText, CombatTextKind as Kind, COMBAT_TEXT_CAPACITY } from "../src/core/CombatText";
import { ticksForSeconds } from "../src/core/GameConfig";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { RenderFrame } from "../src/worker/RenderFrame";
import type { CombatWorld } from "../src/core/CombatWorld";
import type { DerivedStats } from "../src/core/CombatStats";
import type { DeterministicRandom } from "../src/core/DeterministicRandom";

test("rapid hits merge only by full victim handle and kind, expire on simulation time and stay bounded", () => {
    const text = new CombatText(), b = text.buffer;
    text.add(1, Kind.EnemyDamage, 5, 2, 3, 0);
    text.add(1, Kind.EnemyDamage, 7, 2, 3, 2);
    text.add(1, Kind.EnemyCritical, 20, 2, 3, 2);
    text.add(65537, Kind.EnemyDamage, 9, 2, 3, 2);
    expect(b.count).toBe(3); expect(b.value[0]).toBe(12); expect(b.started[0]).toBe(0);
    text.add(1, Kind.EnemyDamage, 3, 2, 3, ticksForSeconds(.1));
    expect(b.count).toBe(4);
    text.advance(ticksForSeconds(.95)); expect(b.count).toBe(3);
    text.advance(ticksForSeconds(2)); expect(b.count).toBe(0);
    for (let i = 0; i < 1000; i++) text.add(i, Kind.EnemyDamage, i, 2, 3, 300);
    expect(b.count).toBe(COMBAT_TEXT_CAPACITY);
    expect(Math.min(...b.value)).toBe(744);
    text.advance(300 + ticksForSeconds(.95)); expect(b.count).toBe(0);
});

test("critical overkill reports actual lost health after death and remains isolated across Worker transfer", () => {
    const combat = new CombatSimulation("combat-text-facts");
    const fixture = combat as unknown as { entities: CombatWorld };
    const e = fixture.entities, slot = e.enemies.slots[0], x = e.position.x[slot];
    e.vitals.health[slot] = 1;
    // Repeat the deterministic impacts if the enemy dodges.
    for (let i = 0; i < 20 && e.vitals.health[slot] > 0; i++) hitEnemy(combat, slot, 10000, true);
    const packet = new RenderFrame().write(combat.getRenderState());
    const received = structuredClone(packet, { transfer: [packet.buffer] });
    const read = new RenderFrame(received.buffer).read(received).combatText;
    const index = Array.from(read.kind.subarray(0, read.count)).indexOf(Kind.EnemyCritical);
    expect(index).toBeGreaterThanOrEqual(0); expect(read.value[index]).toBe(1); expect(read.x[index]).toBe(x);
    e.combatText.advance(1000);
    expect(e.combatText.buffer.count).toBe(0); expect(read.value[index]).toBe(1);
    expect(e.position.x.byteLength).toBeGreaterThan(0);
});

test("incoming feedback follows dodge, shield, block, critical damage and reflected health loss", () => {
    for (const outcome of [Kind.Dodge, Kind.Shield, Kind.Block, Kind.PlayerCritical]) {
        const combat = new CombatSimulation("incoming-feedback");
        const f = combat as unknown as { resolution: CombatResolution; entities: CombatWorld; random: DeterministicRandom; stats: DerivedStats; health: number; resolveImpacts(): void };
        const slot = f.entities.enemies.slots[0], b = f.entities.combatText.buffer;
        const chance = vi.spyOn(f.random, "chance").mockReturnValue(false);
        if (outcome === Kind.Dodge) chance.mockReturnValueOnce(true);
        if (outcome === Kind.Block) chance.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true);
        if (outcome === Kind.PlayerCritical) chance.mockReturnValueOnce(false).mockReturnValueOnce(true).mockReturnValueOnce(false);
        f.resolution.shieldCooldown = outcome === Kind.Shield ? 0 : 1;
        f.health = 10; f.entities.vitals.health[slot] = 2; f.stats = { ...f.stats, thorns: 1 };
        f.entities.impacts.add(f.entities.world.ids[slot], f.entities.world.ids[f.entities.player], outcome === Kind.Block ? 1 : 10000);
        f.resolveImpacts();
        expect(b.kind[0]).toBe(outcome);
        expect(f.health).toBe(outcome === Kind.PlayerCritical ? 0 : 10);
        if (outcome === Kind.PlayerCritical) {
            expect(b.value[0]).toBe(10); expect(b.kind[1]).toBe(Kind.Reflection); expect(b.value[1]).toBe(2);
        } else expect(b.value[0]).toBe(0);
        chance.mockRestore(); combat.dispose();
    }
});

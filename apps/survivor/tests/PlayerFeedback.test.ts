import { expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import { CombatEventKind, EffectCause, Prevention } from "../src/core/CombatEvents";
import { combatFeedback } from "../src/core/CombatFeedback";
import { SkillSystem } from "../src/core/SkillSystem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { RenderFrame } from "../src/worker/RenderFrame";
import type { RegionalWorld } from "../src/core/RegionalWorld";

test("only completed health loss emits hurt; prevention and sacrifice stay silent", () => {
    const e = new CombatWorld(0, 0), source = e.world.ids[e.player];
    for (const [kind, cause, amount] of [[CombatEventKind.Prevented, EffectCause.Attack, 0], [CombatEventKind.Damage, EffectCause.Sacrifice, 5], [CombatEventKind.Damage, EffectCause.Attack, 0]]) {
        e.events.add(e, kind, cause, source, e.player, amount, 7, false, Prevention.Shield);
        e.events.drain((events, i) => combatFeedback(e, events, i));
        expect(e.feedback.hurtTick).toBe(-1);
    }
    e.events.add(e, CombatEventKind.Damage, EffectCause.Attack, source, e.player, 4, 8);
    e.events.drain((events, i) => combatFeedback(e, events, i));
    expect(e.feedback.hurtTick).toBe(8);
});

test("cast windup is projected without playing release audio; interruption clears it", () => {
    const simulation = new CombatSimulation("hero-cast", { x: 0, z: 0 }, undefined, undefined, "homestead");
    const e = new CombatWorld(0, 0), skills = new SkillSystem(e), random = new DeterministicRandom(1);
    const stats = simulation.getSnapshot().player.stats;
    e.vitals.health[e.player] = 100; e.vitals.mana[e.player] = 1000;
    expect(skills.cast("pulse", 10, stats, 1, random)).toBe(true);
    skills.writePresentation(e.feedback, 10); expect(e.feedback.castPhase).toBe(1); expect(e.feedback.castTick).toBe(-1);
    skills.advanceCasting(11, random, true, () => {});
    skills.writePresentation(e.feedback, 11); expect(e.feedback.castPhase).toBe(0); expect(e.feedback.castTick).toBe(-1);
    skills.advanceCasting(1000, random, false, () => {});
    expect(skills.cast("pulse", 1000, stats, 1, random)).toBe(true);
    skills.advanceCasting(1040, random, false, () => {});
    expect(e.feedback.castTick).toBe(1040);
    simulation.dispose();
});

test("presentation packets own their mailbox snapshot and restoring a character clears transient cues", () => {
    const simulation = new CombatSimulation("hero-transfer", { x: 0, z: 0 }, undefined, undefined, "homestead");
    const fixture = simulation as unknown as { entities: CombatWorld }, feedback = fixture.entities.feedback;
    const checkpoint = simulation.checkpoint(); feedback.attackTick = 11; feedback.hurtTick = 12;
    const packet = new RenderFrame().write(simulation.getRenderState());
    feedback.hurtTick = 13; expect(packet.player.feedback.hurtTick).toBe(12);
    const transferred = structuredClone(packet, { transfer: [packet.buffer] });
    expect(new RenderFrame(transferred.buffer).read(transferred).player.feedback.attackTick).toBe(11);
    simulation.restore(checkpoint);
    expect(simulation.getRenderState().player.feedback.hurtTick).toBe(-1);
    expect(simulation.getRenderState().player.feedback.attackTick).toBe(-1);
    simulation.dispose();
});

test("automatic shots only cue after projectile admission, and experience only cues on arrival", () => {
    const simulation = new CombatSimulation("hero-release");
    const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; fireWeapon(): void; advanceExperience(): void };
    const { entities: e, world } = fixture;
    try {
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        const x = e.position.x[e.player], z = e.position.z[e.player];
        e.spawnEnemy({ x: x + 2, z, kind: 0, elite: false, boss: false, level: 1, region: world.regionAt(x, z) }, world.chunks.get("0,0")!);
        const admit = vi.spyOn(e, "spawnProjectile").mockReturnValueOnce(false);
        fixture.fireWeapon(); expect(e.feedback.attackTick).toBe(-1);
        admit.mockRestore(); fixture.fireWeapon();
        expect(e.feedback.attackTick).toBe(0); expect(e.feedback.attackHeading).toBeCloseTo(Math.PI / 2);
        e.spawnExperience(x + 1, z, 1); fixture.advanceExperience(); expect(e.feedback.pickupTick).toBe(-1);
        for (let i = 0; i < 100 && e.experience.count; i++) fixture.advanceExperience();
        expect(e.experience.count).toBe(0); expect(e.feedback.pickupTick).toBe(0);
    } finally { vi.restoreAllMocks(); simulation.dispose(); }
});

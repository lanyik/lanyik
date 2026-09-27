import { expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import { CombatEventKind, EffectCause, Prevention } from "../src/core/CombatEvents";
import { combatFeedback } from "../src/core/CombatFeedback";
import { SkillSystem } from "../src/core/SkillSystem";
import { initialSkillRanks, nodeIndex } from "../src/core/SkillBuild";
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
    skills.writePresentation(e.feedback, 10); expect(e.feedback.castPhase).toBe(1); expect(e.feedback.castTick).toBe(-1); expect(e.feedback.castLocksMovement).toBe(false);
    skills.advanceCasting(11, random, true, () => {});
    skills.writePresentation(e.feedback, 11); expect(e.feedback.castPhase).toBe(0); expect(e.feedback.castTick).toBe(-1);
    skills.advanceCasting(1000, random, false, () => {});
    expect(skills.cast("pulse", 1000, stats, 1, random)).toBe(true);
    skills.advanceCasting(1040, random, false, () => {});
    expect(e.feedback.castTick).toBe(1040);
    simulation.dispose();
});

test("stationary casts project their real movement lock through windup, channel, recovery and interruption", () => {
    const simulation = new CombatSimulation("hero-lock", { x: 0, z: 0 }, undefined, undefined, "homestead");
    try {
        const e = new CombatWorld(0, 0), skills = new SkillSystem(e), random = new DeterministicRandom(1), ranks = initialSkillRanks();
        const stats = { ...simulation.getSnapshot().player.stats, castSpeed: 0 };
        for (const [id, rank] of Object.entries({ fireball: 10, "fireball.power": 5, fireray: 3, firewall: 1 })) ranks[nodeIndex(id)] = rank;
        skills.points = 19; expect(skills.commitBuild(ranks, 0, 20, false, 0)).toBeNull();
        expect(skills.equip("fireray", 0, 20)).toBe(true);
        e.vitals.health[e.player] = 100; e.vitals.mana[e.player] = 1000;
        expect(skills.cast("fireray", 10, stats, 20, random)).toBe(true);
        skills.writePresentation(e.feedback, 45);
        expect(e.feedback.castPhase).toBe(1); expect(e.feedback.castLocksMovement).toBe(true);
        skills.advanceCasting(46, random, false, () => {}); skills.writePresentation(e.feedback, 46);
        expect(e.feedback.castPhase).toBe(2); expect(e.feedback.castLocksMovement).toBe(true);
        skills.writePresentation(e.feedback, 286);
        expect(e.feedback.castPhase).toBe(3); expect(e.feedback.castLocksMovement).toBe(false);
        skills.advanceCasting(1000, random, false, () => {}); skills.advanceOngoing(1000, random, () => {});
        expect(skills.cast("fireray", 1000, stats, 20, random)).toBe(true);
        skills.advanceCasting(1036, random, false, () => {}); skills.advanceCasting(1040, random, true, () => {});
        skills.writePresentation(e.feedback, 1040);
        expect(e.feedback.castPhase).toBe(0); expect(e.feedback.castLocksMovement).toBe(false);
    } finally { simulation.dispose(); }
});

test("presentation packets own their mailbox snapshot and restoring a character clears transient cues", () => {
    const simulation = new CombatSimulation("hero-transfer", { x: 0, z: 0 }, undefined, undefined, "homestead");
    const fixture = simulation as unknown as { entities: CombatWorld }, feedback = fixture.entities.feedback;
    const checkpoint = simulation.checkpoint(), state = simulation.getRenderState();
    feedback.attackTick = 11; feedback.hurtTick = 12; feedback.castLocksMovement = true;
    const packet = new RenderFrame().write(state);
    feedback.hurtTick = 13; feedback.castLocksMovement = false; expect(packet.player.feedback.hurtTick).toBe(12);
    const transferred = structuredClone(packet, { transfer: [packet.buffer] });
    const received = new RenderFrame(transferred.buffer).read(transferred).player.feedback;
    expect(received.attackTick).toBe(11); expect(received.castLocksMovement).toBe(true);
    simulation.restore(checkpoint);
    expect(simulation.getRenderState().player.feedback.hurtTick).toBe(-1);
    expect(simulation.getRenderState().player.feedback.attackTick).toBe(-1);
    expect(simulation.getRenderState().player.feedback.castLocksMovement).toBe(false);
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

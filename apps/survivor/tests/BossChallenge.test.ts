import { afterEach, expect, test, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import { CombatRewards } from "../src/core/CombatRewards";
import { CombatEvents, CombatEventKind, EffectCause } from "../src/core/CombatEvents";
import { CHALLENGE_IDS, CHALLENGE_ARENA, CHALLENGE_SPAWN, ChallengeTerrain, createChallengeScroll, challengeSpawns, type ChallengeId } from "../src/core/BossChallenge";
import { HomesteadTerrain } from "../src/core/Homestead";
import { EMPTY_SPIRIT_REALM } from "../src/core/SpiritRealm";
import { BASE_LOOT_PROFILE } from "../src/core/Loot";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { createStarterEquipment } from "../src/core/Equipment";
import { validateCharacterCheckpoint, type CharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import { IndexedDBCharacterRepository } from "../src/app/CharacterRepository";
import { defeatEnemy, hitEnemy } from "./helpers/settleCombat";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";

afterEach(() => vi.unstubAllGlobals());
const idle = { x: 0, z: 0, active: false };
const entities = (sim: CombatSimulation) => (sim as unknown as { entities: CombatWorld }).entities;
function home(id: ChallengeId = "rift-lord", count = 2): CombatSimulation {
    const sim = new CombatSimulation("challenge-fixture", { x: 0, z: 0 }, EMPTY_SPIRIT_REALM, new HomesteadTerrain(), "homestead");
    const cp = sim.checkpoint();
    sim.restore({ ...cp, nextItemId: 3, skills: { ...cp.skills, points: 9 }, player: { ...cp.player, level: 10, inventory: [createChallengeScroll(2, id, count)] } });
    return sim;
}
function restore(cp: CharacterCheckpoint): CombatSimulation {
    const sim = new CombatSimulation(cp.seed, cp.origin, cp.player.spiritRealm, cp.location === "homestead" ? new HomesteadTerrain() : new ChallengeTerrain(), cp.location);
    sim.restore(cp); return sim;
}

test.each(CHALLENGE_IDS)("%s consumes one scroll, fixes the entry level and builds a complete themed encounter", id => {
    const start = home(id), before = start.checkpoint(), entry = start.checkpoint(id), run = restore(entry), e = entities(run);
    expect(start.checkpoint()).toEqual(before); // preparing travel does not spend anything before persistence succeeds
    expect(entry.player.inventory[0]).toMatchObject({ type: "scroll", value: id, size: 1 });
    expect(run.getSnapshot()).toMatchObject({ livingEnemies: 61, region: { level: 10 }, player: CHALLENGE_SPAWN });
    expect(run.getRenderState().chests.count).toBe(0);
    const spawns = challengeSpawns(id, 10);
    const first = e.enemies.slots[0];
    expect(e.enemy.kind[first]).toBe(spawns[0].kind); expect(e.enemy.boss[first]).toBe(1);
    expect([...e.enemies.slots.subarray(0, 61)].every(slot => e.enemy.level[slot] === 10)).toBe(true);
    expect(() => run.teleport(CHALLENGE_ARENA.x + 25, CHALLENGE_ARENA.z)).not.toThrow();
    expect(run.getSnapshot().player).toMatchObject(CHALLENGE_SPAWN);
    start.dispose(); run.dispose();
});

test("challenge strength is applied to health and damage, while the enclosing terrain sweeps large moves", () => {
    const start = home(), run = restore(start.checkpoint("rift-lord")), e = entities(run), slots = e.enemies.slots;
    // Lv.10 caster lord: base health 40 * (1 + .20 * 9) * boss 16 * instance 1.5.
    expect(e.vitals.maxHealth[slots[0]]).toBeCloseTo(2688);
    expect(e.enemy.damage[slots[0]]).toBeCloseTo(26 * 1.99 * 1.693 * 1.8 * 1.5);
    // The second follower is an ordinary goblin, without elite multipliers.
    expect(e.vitals.maxHealth[slots[2]]).toBeCloseTo(28 * 2.62 * 1.3);
    expect(e.enemy.damage[slots[2]]).toBeCloseTo(20 * 1.945 * 1.693 * 1.3);
    const terrain = new ChallengeTerrain();
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const p = terrain.move(CHALLENGE_ARENA.x, CHALLENGE_ARENA.z, Math.cos(angle) * 100, Math.sin(angle) * 100, .3, true);
        expect(terrain.isClear(p.x, p.z, .3)).toBe(true); expect(Math.hypot(p.x - CHALLENGE_ARENA.x, p.z - CHALLENGE_ARENA.z)).toBeGreaterThan(23);
    }
    start.dispose(); run.dispose();
});

test("leaving and re-entering preserves defeated enemies, injuries, experience and ground items without spending again", () => {
    const start = home(), run = restore(start.checkpoint("rift-lord")), e = entities(run);
    hitEnemy(run, e.enemies.slots[1], 10); defeatEnemy(run, e.enemies.slots[0]);
    expect(e.experienceValue[e.experience.slots[0]]).toBeCloseTo(1269);
    const before = run.checkpoint(), atHome = restore(run.checkpoint("homestead"));
    expect(atHome.getSnapshot().livingEnemies).toBe(0);
    const returned = restore(atHome.checkpoint("rift-lord"));
    expect(returned.checkpoint().challenges).toEqual(before.challenges);
    expect(returned.getSnapshot().livingEnemies).toBe(60);
    expect(returned.getSnapshot().player.inventory).toEqual(before.player.inventory);
    start.dispose(); run.dispose(); atHome.dispose(); returned.dispose();
});

test("only clearing every enemy produces the center chest; a full bag cannot consume the guaranteed three-star prize", () => {
    const start = home(), run = restore(start.checkpoint("rift-lord")), e = entities(run);
    while (e.enemies.count > 1) defeatEnemy(run, e.enemies.slots[e.enemies.count - 1]);
    expect(run.getRenderState().chests.count).toBe(0);
    defeatEnemy(run, e.enemies.slots[0]);
    expect(run.getRenderState().chests).toMatchObject({ count: 1 });
    expect(run.getRenderState().chests.x[0]).toBe(CHALLENGE_ARENA.x); expect(run.getRenderState().chests.z[0]).toBe(CHALLENGE_ARENA.z);
    const state = run.checkpoint(), high = state.nextItemId;
    run.restore({ ...state, nextItemId: high + 80, player: { ...state.player, inventory: Array.from({ length: 80 }, (_, index) => ({ ...createStarterEquipment(), id: high + index })) } });
    run.teleport(CHALLENGE_ARENA.x, CHALLENGE_ARENA.z);
    const blocked = run.checkpoint(); run.step(idle);
    expect(run.getSnapshot().challenges["rift-lord"]!.claimed).toBe(false);
    expect(run.checkpoint().random).toBe(blocked.random); expect(run.checkpoint().nextItemId).toBe(blocked.nextItemId);
    const full = run.checkpoint(); run.restore({ ...full, player: { ...full.player, inventory: [], autoRecycle: { ...full.player.autoRecycle, equipment: "rainbow" } } });
    run.step(idle);
    expect(run.getSnapshot().player.inventory).toContainEqual(expect.objectContaining({ type: "equipment", stars: 3, rarity: "rainbow", itemLevel: 10 }));
    expect(run.getRenderState().chests.count).toBe(0); expect(run.getSnapshot().challenges["rift-lord"]!.claimed).toBe(true);
    const returned = restore(run.checkpoint("homestead"));
    expect(() => returned.checkpoint("rift-lord")).toThrow(/卷轴/);
    const claimed = returned.checkpoint();
    returned.restore({ ...claimed, nextItemId: claimed.nextItemId + 1,
        player: { ...claimed.player, inventory: [...claimed.player.inventory, createChallengeScroll(claimed.nextItemId, "rift-lord")] } });
    const next = restore(returned.checkpoint("rift-lord"));
    expect(next.getSnapshot().challenges["rift-lord"]).toMatchObject({ round: 2, remaining: 61, claimed: false });
    expect(next.getSnapshot().player.inventory.some(item => item.type === "scroll")).toBe(false);
    expect(next.getSnapshot().player.experience).toBe(claimed.player.experience);
    expect(next.checkpoint().challenges["rift-lord"]!.experience).toEqual([]);
    start.dispose(); run.dispose(); returned.dispose(); next.dispose();
});

test("scrolls roll independently without equipment drops and cover each boss", () => {
    const simulation = new CombatSimulation("scroll-probability", { x: 0, z: 0 }, EMPTY_SPIRIT_REALM, new HomesteadTerrain(), "homestead");
    const { entities: e, rewards } = simulation as unknown as { entities: CombatWorld; rewards: CombatRewards };
    const events = new CombatEvents();
    const seen = new Set<string>(), random = new DeterministicRandom(123);
    for (let i = 0; i < 32; i++) {
        const slot = e.spawnEnemy(challengeSpawns("rift-lord", 1)[2], { resident: true });
        events.add(e, CombatEventKind.Defeat, EffectCause.Attack, e.world.ids[e.player], slot, 0, i);
        const before = random.state;
        events.drain((events, index) => rewards.grant(events, index, random, 1, { ...BASE_LOOT_PROFILE, normalDropChance: 0, qualities: [0, 0, 0, 0, 0, 1] }));
        const items = [...rewards.groundItems.values()];
        expect(items.some(item => item.type === "equipment")).toBe(false);
        expect(items.filter(item => item.type === "scroll")).toHaveLength(1);
        seen.add(items.find(item => item.type === "scroll")!.value);
        expect(random.state).not.toBe(before);
        e.remove(slot); for (const query of [e.loot, e.experience]) while (query.count) e.remove(query.slots[0]); rewards.groundItems.clear();
    }
    expect([...seen].sort()).toEqual([...CHALLENGE_IDS].sort());
    simulation.dispose();
});

test("committed kills override older slots, survive worker replacement and never replay XP or scroll consumption", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const start = home(), original = start.checkpoint(), repo = new IndexedDBCharacterRepository();
    await repo.save("manual-1", original);
    const entry = start.checkpoint("rift-lord"); await repo.save("auto", entry);
    const transport = new LoopbackCombatTransport(undefined, repo);
    await transport.start(entry.seed, entry.origin, entry);
    defeatEnemy(transport.simulation, entities(transport.simulation).enemies.slots[0]);
    const published = await transport.advance({ steps: 0, commands: [], input: idle });
    expect(published.snapshot!.livingEnemies).toBe(60);
    const durable = await repo.resolve(original);
    expect(durable.location).toBe("rift-lord"); expect(durable.player.inventory[0].size).toBe(1);
    expect(durable.challenges["rift-lord"]!.enemies[0].health).toBe(0);
    expect(durable.challenges["rift-lord"]!.experience[0].value).toBeCloseTo(1269);
    const staleSave = await repo.save("auto", original); expect(staleSave.checkpoint).toEqual(durable);
    transport.dispose();
    const reopened = new IndexedDBCharacterRepository(); expect(await reopened.resolve(original)).toEqual(durable);
    const returned = restore(await reopened.resolve(original)); expect(returned.getSnapshot().livingEnemies).toBe(60);
    expect(returned.checkpoint().challenges).toEqual(durable.challenges);
    returned.dispose(); start.dispose(); reopened.close();
});

test("invalid challenge records, unknown scrolls and duplicate ground IDs are rejected", () => {
    const start = home(), state = start.checkpoint("rift-lord"), run = state.challenges["rift-lord"]!;
    expect(() => validateCharacterCheckpoint({ ...state, challenges: { "rift-lord": { ...run, claimed: true } } })).toThrow(/副本/);
    expect(() => validateCharacterCheckpoint({ ...state, challenges: { "rift-lord": { ...run, enemies: run.enemies.slice(1) } } })).toThrow(/副本/);
    expect(() => validateCharacterCheckpoint({ ...state, challenges: { "rift-lord": { ...run, loot: [{ ...CHALLENGE_SPAWN, item: state.player.inventory[0] }] } } })).toThrow(/物品/);
    start.dispose();
});

test("reward persistence is a publication barrier and a storage failure stops uncommitted play", async () => {
    const start = home(), entry = start.checkpoint("rift-lord");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const transport = new LoopbackCombatTransport(undefined, { save: async (slot, checkpoint) => { await gate; return { slot, checkpoint, savedAt: 1, generator: 1 }; }, close() {} });
    await transport.start(entry.seed, entry.origin, entry);
    defeatEnemy(transport.simulation, entities(transport.simulation).enemies.slots[0]);
    let published = false;
    const advancing = transport.advance({ steps: 0, input: idle, commands: [] }).then(() => { published = true; });
    await Promise.resolve(); expect(published).toBe(false);
    release(); await advancing; expect(published).toBe(true); transport.dispose();
    const failing = new LoopbackCombatTransport(undefined, { save: async () => { throw new Error("disk full"); }, close() {} });
    await failing.start(entry.seed, entry.origin, entry);
    defeatEnemy(failing.simulation, entities(failing.simulation).enemies.slots[0]);
    await expect(failing.advance({ steps: 0, input: idle, commands: [] })).rejects.toThrow("disk full");
    expect(() => failing.simulation.step(idle)).toThrow(/closed/); failing.dispose(); start.dispose();
});

test("a defeated player's durable recovery heals the player without resetting killed enemies", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const start = home(), entry = start.checkpoint("rift-lord"), repo = new IndexedDBCharacterRepository();
    const transport = new LoopbackCombatTransport(undefined, repo); await transport.start(entry.seed, entry.origin, entry);
    const sim = transport.simulation, e = entities(sim), enemy = e.enemies.slots[0];
    defeatEnemy(sim, enemy);
    e.vitality.damage(0, e.world.ids[e.player], e.vitals.health[e.player], sim.tick, EffectCause.Attack);
    e.vitality.defeat(0, e.world.ids[e.player], sim.tick, EffectCause.Attack);
    (sim as unknown as { resolveImpacts(): void }).resolveImpacts();
    expect(sim.gameOver).toBe(true);
    await transport.advance({ steps: 0, input: idle, commands: [] });
    const resumed = restore(await repo.resolve(entry));
    expect(resumed.gameOver).toBe(false); expect(resumed.getSnapshot().livingEnemies).toBe(60);
    expect(resumed.getSnapshot().player).toMatchObject(CHALLENGE_SPAWN);
    expect(resumed.getSnapshot().player.health).toBe(resumed.getSnapshot().player.stats.maxHealth);
    resumed.dispose(); transport.dispose(); start.dispose();
});

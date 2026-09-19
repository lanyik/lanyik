import { afterEach, expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { HOMESTEAD, HomesteadTerrain } from "../src/core/Homestead";
import { createHomesteadMap } from "../src/adapters/HomesteadMap";
import { CombatSession } from "../src/app/CombatSession";
import type { CombatView } from "../src/app/CombatView";
import type { CharacterRepository } from "../src/app/CharacterRepository";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";

afterEach(() => vi.unstubAllGlobals());

test("home is a finite safe map with solid buildings and boundaries", () => {
    const terrain = new HomesteadTerrain(), map = createHomesteadMap();
    expect(map).toMatchObject({ w: 64, h: 64, wrapX: false, wrapY: false });
    expect(terrain.isClear(HOMESTEAD.spawn.x, HOMESTEAD.spawn.z, .3)).toBe(true);
    for (const building of HOMESTEAD.buildings) expect(terrain.isClear(building.x, building.z, .3)).toBe(false);
    const edge = terrain.move(2, 30, -10, 0, .3, true);
    expect(edge.x).toBeGreaterThanOrEqual(HOMESTEAD.minX + .3);
    const combat = new CombatSimulation("safe-home", { x: 0, z: 0 }, undefined, terrain, "homestead");
    const before = combat.getSnapshot().player;
    for (let i = 0; i < 600; i++) combat.step({ x: 0, z: 0, active: false });
    combat.castSkill("frost"); combat.teleport(-1, -1);
    const snapshot = combat.getSnapshot();
    expect(snapshot.world.location).toBe("homestead");
    expect(snapshot.livingEnemies).toBe(0); expect(snapshot.nearbyRegions).toEqual([]);
    expect(snapshot.player).toMatchObject({ x: before.x, z: before.z, health: before.health, mana: before.mana });
    combat.dispose();
});

test("roundtrip rests at home and preserves wilderness position, growth, equipment and exploration", () => {
    const wilds = new CombatSimulation("roundtrip");
    wilds.teleport(8, 0);
    const checkpoint = wilds.checkpoint();
    wilds.restore({ ...checkpoint, player: { ...checkpoint.player, health: 10, mana: 2, gold: 1234 } });
    const arrival = wilds.checkpoint("homestead");
    expect(arrival.player).toMatchObject({ ...HOMESTEAD.spawn, gold: 1234, health: wilds.getSnapshot().player.stats.maxHealth, mana: wilds.getSnapshot().player.stats.maxMana });
    expect(wilds.getSnapshot().player.health).toBe(10);
    const home = new CombatSimulation(arrival.seed, arrival.origin, undefined, new HomesteadTerrain(), "homestead");
    home.restore(arrival); home.teleport(48, 65);
    const savedHome = home.checkpoint();
    expect(savedHome.player).toMatchObject({ x: 48, z: 65 });
    expect(savedHome.wildsPosition).toEqual({ x: 8, z: 0 });
    const departure = home.checkpoint("wilds"), returned = new CombatSimulation(departure.seed, departure.origin);
    returned.restore(departure);
    expect(returned.getSnapshot().player).toMatchObject({ x: 8, z: 0, gold: 1234, equipment: checkpoint.player.equipment });
    expect(returned.explorationSnapshot).toEqual(checkpoint.exploration);
    for (const simulation of [wilds, home, returned]) simulation.dispose();
});

function sessionFixture(repository?: CharacterRepository) {
    vi.stubGlobal("document", { hidden: false });
    const clients: LoopbackCombatTransport[] = [];
    const view: CombatView = { workerActivity: [], load: vi.fn(async () => ({ x: 0, z: 0 })), reset() {}, render() {}, clearMovement() {},
        readMovement: () => ({ x: 0, z: 0, active: false }), dispose: async () => {} };
    const session = new CombatSession(view, () => { const client = new LoopbackCombatTransport(); clients.push(client); return client; }, repository);
    return { session, view, clients };
}

test("travel commits queued commands before replacing authority and retains pause through repeated journeys", async () => {
    const { session, clients, view } = sessionFixture();
    await session.start("journey", "homestead");
    session.dispatch({ type: "toggle-pause" }); await session.settled;
    session.dispatch({ type: "set-auto-recycle", itemType: "orb", maximum: "magic" });
    for (const destination of ["wilds", "homestead", "wilds"] as const) {
        const old = clients.at(-1)!;
        await Promise.all([session.travel(destination), session.travel(destination)]);
        expect(old.closed).toBe(true);
        expect(session.getSnapshot()).toMatchObject({ status: "ready", paused: true, travelling: false,
            combat: { world: { location: destination }, player: { autoRecycle: { orb: "magic" } } } });
    }
    expect(view.load).toHaveBeenCalledTimes(4);
    await session.dispose(); expect(clients.every(client => client.closed)).toBe(true);
});

test("failed persistence keeps the current home and authority available for retry", async () => {
    const { session, clients, view } = sessionFixture({ list: async () => [], save: async () => { throw new Error("disk full"); }, close() {} });
    await session.start("save-failure", "homestead"); await session.travel("wilds");
    expect(session.getSnapshot()).toMatchObject({ status: "ready", travelling: false, travelError: "disk full", combat: { world: { location: "homestead" } } });
    expect(view.load).toHaveBeenCalledTimes(1); expect(clients[0].closed).toBe(false);
    await session.dispose();
});

test("a delayed travel save cannot replace a subsequently started world", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { session, clients } = sessionFixture({ list: async () => [], save: async (slot, checkpoint) => {
        await gate; return { slot, savedAt: 1, checkpoint, generator: 1 };
    }, close() {} });
    await session.start("old", "homestead");
    const travelling = session.travel("wilds"); await session.settled;
    await session.start("new", "homestead");
    release(); await travelling;
    expect(clients).toHaveLength(2);
    expect(session.getSnapshot()).toMatchObject({ status: "ready", seed: "new", travelling: false, combat: { world: { location: "homestead" } } });
    await session.dispose();
});

test("failed destination loading retries the same character and destination", async () => {
    const { session, clients, view } = sessionFixture();
    await session.start("retry-travel", "homestead");
    vi.mocked(view.load).mockRejectedValueOnce(new Error("world load failed"));
    await session.travel("wilds");
    expect(session.getSnapshot()).toMatchObject({ status: "failed", travelling: false, error: "world load failed" });
    expect(clients[0].closed).toBe(true);
    await session.retry();
    expect(session.getSnapshot()).toMatchObject({ status: "ready", combat: { world: { location: "wilds" }, player: { x: 0, z: 0 } } });
    await session.dispose();
});

test("closing while a travel write is pending cannot start another authority", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { session, clients } = sessionFixture({ list: async () => [], save: async (slot, checkpoint) => {
        await gate; return { slot, savedAt: 1, checkpoint, generator: 1 };
    }, close() {} });
    await session.start("close-travel", "homestead");
    const travelling = session.travel("wilds"); await session.settled;
    await session.dispose(); release(); await travelling;
    expect(clients).toHaveLength(1); expect(clients[0].closed).toBe(true);
});

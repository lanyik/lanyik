import { expect, test, vi } from "vitest";
import { RegionalWorld, MAX_COMBAT_CHUNKS } from "../src/core/RegionalWorld";
import { OPEN_TERRAIN } from "../src/core/CombatTerrain";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { ProjectileWorkerPool } from "../src/worker/ProjectileWorkerPool";
import { CombatWorkerHost } from "../src/worker/CombatWorkerHost";
import { MemorySpiritRepository } from "./helpers/MemorySpiritRepository";
import type { Exploration } from "../src/core/Exploration";
import type { CombatResponse } from "../src/worker/CombatProtocol";

const origin = { x: 0, z: 0 };
const deferred = () => {
    let resolve!: () => void;
    return { promise: new Promise<void>(done => { resolve = done; }), resume: () => resolve() };
};
const layout = (world: RegionalWorld) => [...world.chunks.values()].map(({ key, spawns, chest, band, spawned, chestOpened }) =>
    ({ key, spawns, chest, band, spawned, chestOpened }));

test("required generation yields once per chunk and publishes only a complete deterministic window", async () => {
    const world = new RegionalWorld("stream", origin, OPEN_TERRAIN, true), immediate = new RegionalWorld("stream", origin);
    let yields = 0;
    await world.prepareRequired(0, 0, async () => {
        yields++;
        expect(world.chunks.size).toBe(0);
        expect(world.preparation).toEqual({ prepared: yields, pending: MAX_COMBAT_CHUNKS - yields });
        expect(() => world.synchronize(0, 0)).toThrow(/preparing/);
    });
    expect(yields).toBe(81);
    world.synchronize(0, 0); immediate.synchronize(0, 0);
    expect(layout(world)).toEqual(layout(immediate));
    const before = layout(world);
    for (let tick = 1; tick <= 9; tick++) {
        expect(world.prepareAhead(4, 0, .1, 0)).toBe(true);
        expect(world.preparation.prepared).toBe(tick);
        expect(layout(world)).toEqual(before);
    }
    expect(world.prepareAhead(5, 0, .1, 0)).toBe(false);
    await world.prepareRequired(6.01, 0, async () => { throw new Error("Already prepared"); });
    world.synchronize(6.01, 0); immediate.synchronize(6.01, 0);
    expect(layout(world)).toEqual(layout(immediate));
    expect(world.preparation).toEqual({ pending: 0, prepared: 0 });
    world.dispose(); immediate.dispose();
});

test("diagonal travel, reversal and far jumps retain bounded preparation and existing spawn state", async () => {
    const world = new RegionalWorld("directions", origin, OPEN_TERRAIN, true), immediate = new RegionalWorld("directions", origin);
    await world.prepareRequired(0, 0, async () => {}); world.synchronize(0, 0); immediate.synchronize(0, 0);
    world.chunks.get("0,0")!.spawned.fill(1); immediate.chunks.get("0,0")!.spawned.fill(1);
    for (let index = 0; index < 17; index++) world.prepareAhead(4, 4, 1, 1);
    expect(world.preparation).toEqual({ pending: 0, prepared: 17 });
    world.prepareAhead(-4, -4, -1, -1);
    expect(world.preparation).toEqual({ pending: 16, prepared: 1 });
    for (const [x, z, missing] of [[-6.1, -6.1, 16], [600, -600, 81], [0, 0, 81]]) {
        const before = layout(world); let yields = 0;
        expect(() => world.synchronize(x, z)).toThrow(/not been prepared/);
        expect(layout(world)).toEqual(before);
        await world.prepareRequired(x, z, async () => {
            yields++;
            expect(world.chunks.size).toBe(81);
            expect(world.preparation.prepared + world.preparation.pending).toBeLessThanOrEqual(81);
            expect(layout(world)).toEqual(before);
        });
        expect(yields).toBe(missing);
        world.synchronize(x, z); immediate.synchronize(x, z);
        expect(layout(world)).toEqual(layout(immediate));
    }
    world.dispose(); immediate.dispose();
});

test("disposal and generation failure never publish partial or late regional results", async () => {
    const pause = deferred(), world = new RegionalWorld("cancel", origin, OPEN_TERRAIN, true);
    const pending = world.prepareRequired(0, 0, () => pause.promise);
    const rejected = expect(pending).rejects.toThrow(/closed/);
    world.dispose(); pause.resume(); await rejected;
    expect(world.preparation).toEqual({ pending: 0, prepared: 0 }); expect(world.chunks.size).toBe(0);
    const failed = new RegionalWorld("failure", origin, { ...OPEN_TERRAIN, isClear: () => { throw new Error("terrain failure"); } }, true);
    await expect(failed.prepareRequired(0, 0, async () => {})).rejects.toThrow("terrain failure");
    expect(failed.chunks.size).toBe(0); failed.dispose();
});

test("scheduled simulation matches immediate ticks and commits teleport only after all required jobs", async () => {
    let yieldTask = async () => {};
    const combat = new CombatSimulation("streamed-combat", origin, undefined, OPEN_TERRAIN, "wilds", "streamed-combat", () => yieldTask());
    const immediate = new CombatSimulation("streamed-combat"), pool = new ProjectileWorkerPool([]);
    expect(() => combat.checkpoint()).toThrow();
    await combat.initialize();
    expect(combat.getSnapshot()).toEqual(immediate.getSnapshot());
    for (let tick = 0; tick < 180; tick++) {
        const input = { x: 1, z: .4, active: true };
        await combat.step(input, pool); immediate.step(input);
    }
    expect(combat.checkpoint()).toEqual(immediate.checkpoint());
    expect(combat.getSnapshot()).toEqual(immediate.getSnapshot());
    for (const sim of [combat, immediate]) (sim as unknown as { exploration: Exploration }).exploration.discover(360, 0);
    const pause = deferred(), before = combat.getSnapshot(); let yields = 0;
    yieldTask = () => ++yields === 1 ? pause.promise : Promise.resolve();
    const pending = combat.teleportAsync(360, 0);
    expect(combat.getSnapshot()).toBe(before);
    expect(() => combat.checkpoint()).toThrow();
    expect(() => combat.step({ x: 0, z: 0, active: false }, pool)).toThrow(/awaiting/);
    pause.resume(); await pending; immediate.teleport(360, 0);
    expect(yields).toBe(81);
    expect(combat.checkpoint()).toEqual(immediate.checkpoint());
    expect(combat.getSnapshot()).toEqual(immediate.getSnapshot());
    combat.dispose(); immediate.dispose(); pool.dispose();
});

test("Worker disposal owns an initializing simulation and suppresses its late response", async () => {
    const pause = deferred(), entered = deferred(), dispose = vi.fn();
    const messages: CombatResponse[] = [];
    const host = new CombatWorkerHost(message => messages.push(message), new MemorySpiritRepository(),
        (seed, start, realm, location) => new CombatSimulation(seed, start, realm, { ...OPEN_TERRAIN, dispose }, location, seed,
            () => { entered.resume(); return pause.promise; }));
    const pending = host.receive({ type: "init", id: 1, seed: "dispose-loading", start: origin, ports: [] });
    await entered.promise; expect(messages).toEqual([]);
    host.dispose(); pause.resume(); await pending;
    expect(dispose).toHaveBeenCalledTimes(1); expect(messages).toEqual([]);
});

test("saved positions prepare only their target window; dash ticks remain identical across a boundary", async () => {
    const source = new CombatSimulation("stream-restore");
    (source as unknown as { exploration: Exploration }).exploration.discover(360, 0);
    source.teleport(360, 0);
    const saved = source.checkpoint(); source.dispose();
    const checkpoint = { ...saved, player: { ...saved.player, x: 365.9 },
        skills: { ...saved.skills, dashUntil: saved.tick + 30, dashX: 1, dashZ: 0 } };
    let yields = 0;
    const scheduled = new CombatSimulation("stream-restore", origin, undefined, OPEN_TERRAIN, "wilds", "stream-restore", async () => { yields++; });
    const immediate = new CombatSimulation("stream-restore"), pool = new ProjectileWorkerPool([]);
    try {
        await scheduled.initialize(checkpoint); immediate.restore(checkpoint);
        expect(yields).toBe(81);
        expect(scheduled.checkpoint()).toEqual(immediate.checkpoint());
        const input = { x: 0, z: 0, active: false };
        for (let tick = 0; tick < 35; tick++) { await scheduled.step(input, pool); immediate.step(input); }
        expect(yields).toBeGreaterThan(81);
        expect(scheduled.checkpoint()).toEqual(immediate.checkpoint());
        expect(scheduled.getSnapshot()).toEqual(immediate.getSnapshot());
    } finally { scheduled.dispose(); immediate.dispose(); pool.dispose(); }
});

test("default Worker initialization yields real tasks and accounts for the wait separately", async () => {
    const messages: CombatResponse[] = [];
    const host = new CombatWorkerHost(message => messages.push(message), new MemorySpiritRepository());
    try {
        const pending = host.receive({ type: "init", id: 1, seed: "stream-tasks", start: origin, ports: [] });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(messages).toEqual([]);
        await pending;
        expect(messages).toHaveLength(1);
        const message = messages[0]; expect(message.type).toBe("state");
        if (message.type !== "state") throw new Error(message.message);
        expect(message.update.stats.generationYieldMs).toBeGreaterThan(0);
        expect(message.update.stats.executeMs).toBeLessThan(message.update.stats.batchMs);
        expect(message.update.stats.simulationYieldMs).toBe(0);
        expect(message.update.tick).toBe(0);
    } finally { host.dispose(); }
});

test.each(["init", "teleport", "crossing", "ahead"] as const)("%s generation failure closes its owner once and never publishes incomplete state", async phase => {
    const seed = `failed-${phase}`, source = new CombatSimulation(seed);
    (source as unknown as { exploration: Exploration }).exploration.discover(360, 0);
    const saved = source.checkpoint(); source.dispose();
    const checkpoint = { ...saved, player: { ...saved.player, x: phase === "crossing" ? 5.99 : phase === "ahead" ? 3.1 : 0 } };
    let failing = phase === "init";
    const dispose = vi.fn(), messages: CombatResponse[] = [], repository = new MemorySpiritRepository();
    const close = vi.spyOn(repository, "close");
    const host = new CombatWorkerHost(message => messages.push(message), repository,
        (seed, start, realm, location) => new CombatSimulation(seed, start, realm, { ...OPEN_TERRAIN, dispose }, location, seed,
            async () => { if (failing) throw new Error("generation task failed"); }));
    await host.receive({ type: "init", id: 1, seed, start: origin, checkpoint, ports: [] });
    if (phase !== "init") {
        expect(messages.map(message => message.type)).toEqual(["state"]);
        messages.length = 0; failing = true;
        await host.receive({ type: "advance", id: 2, batch: { steps: phase === "teleport" ? 0 : 1,
            input: { x: 1, z: 0, active: true }, commands: phase === "teleport" ? [{ type: "teleport", x: 360, z: 0 }] : [] } });
    }
    expect(messages).toEqual([{ type: "error", id: phase === "init" ? 1 : 2, message: "generation task failed" }]);
    expect(dispose).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    host.dispose();
    await host.receive({ type: "advance", id: 3, batch: { steps: 0, commands: [], input: { x: 0, z: 0, active: false } } });
    expect(messages).toHaveLength(1);
    expect(dispose).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
});

test.each(["teleport", "crossing", "ahead"] as const)("disposal while %s generation is suspended suppresses late completion", async phase => {
    const seed = `cancel-${phase}`, source = new CombatSimulation(seed);
    (source as unknown as { exploration: Exploration }).exploration.discover(360, 0);
    const saved = source.checkpoint(); source.dispose();
    const checkpoint = { ...saved, player: { ...saved.player, x: phase === "crossing" ? 5.99 : phase === "ahead" ? 3.1 : 0 } };
    const pause = deferred(), entered = deferred(), dispose = vi.fn(), messages: CombatResponse[] = [];
    let hold = false;
    const host = new CombatWorkerHost(message => messages.push(message), new MemorySpiritRepository(),
        (seed, start, realm, location) => new CombatSimulation(seed, start, realm, { ...OPEN_TERRAIN, dispose }, location, seed,
            () => { if (!hold) return Promise.resolve(); entered.resume(); return pause.promise; }));
    await host.receive({ type: "init", id: 1, seed, start: origin, checkpoint, ports: [] });
    expect(messages.map(message => message.type)).toEqual(["state"]);
    messages.length = 0; hold = true;
    const pending = host.receive({ type: "advance", id: 2, batch: { steps: phase === "teleport" ? 0 : 1,
        input: { x: 1, z: 0, active: true }, commands: phase === "teleport" ? [{ type: "teleport", x: 360, z: 0 }] : [] } });
    await entered.promise; expect(messages).toEqual([]);
    host.dispose(); pause.resume(); await pending;
    expect(messages).toEqual([]); expect(dispose).toHaveBeenCalledTimes(1);
});

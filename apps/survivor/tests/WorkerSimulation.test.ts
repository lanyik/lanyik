import { MAX_STEP_BATCH } from "../src/worker/CombatProtocol";
import { MemorySpiritRepository } from "./helpers/MemorySpiritRepository";
import { afterEach, expect, test, vi } from "vitest";
import { MessageChannel, type Worker } from "node:worker_threads";
import { ProjectileBatch, resolveProjectileRange } from "../src/core/ProjectileBatch";
import { ProjectileWorkerPool } from "../src/worker/ProjectileWorkerPool";
import { RenderFrame } from "../src/worker/RenderFrame";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld, Faction } from "../src/core/CombatWorld";
import { advanceProjectiles } from "../src/core/CombatSystems";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { CombatWorkerHost } from "../src/worker/CombatWorkerHost";
import { WORKER_TIMEOUT_MS, type CombatResponse, type QueryRequest } from "../src/worker/CombatProtocol";
import { startNodeWorker } from "./helpers/nodeWorker";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";
import { workerBudget } from "../src/worker/WorkerBudget";
import { EffectKind } from "../src/core/CombatEffects";
import { prepareProjectileFixture } from "./helpers/ProjectileFixture";
import { OPEN_TERRAIN } from "../src/core/CombatTerrain";

const workers: Worker[] = [], pools: ProjectileWorkerPool[] = [];
afterEach(async () => { vi.useRealTimers(); for (const pool of pools.splice(0)) pool.dispose(); await Promise.all(workers.splice(0).map(worker => worker.terminate())); });

async function createPool(): Promise<ProjectileWorkerPool> {
    const ports: MessagePort[] = [];
    for (let i = 0; i < 2; i++) {
        const worker = await startNodeWorker(new URL("../src/worker/Projectile.worker.ts", import.meta.url));
        workers.push(worker);
        const channel = new MessageChannel();
        worker.postMessage({ port: channel.port2 }, [channel.port2]);
        ports.push(channel.port1 as unknown as MessagePort);
    }
    const pool = new ProjectileWorkerPool(ports); pools.push(pool); return pool;
}

test("real query threads match serial hits, misses, hostile targets and ties; commit order remains identical", async () => {
    const regions = new RegionalWorld("worker-collisions", { x: 0, z: 0 }); regions.synchronize(0, 0);
    const makeWorld = () => {
        const e = new CombatWorld(0, 0, { ...OPEN_TERRAIN, height: x => x >= 3 ? 2 : 0,
            traceAttack: (sx, _sy, _sz, ex) => sx < 5 && ex >= 5 ? (5 - sx) / (ex - sx) : Infinity }),
            region = regions.regionAt(0, 0), home = regions.chunks.get("0,0")!;
        for (let i = 0; i < 640; i++) e.spawnEnemy({ x: 4 + (i % 16) * .005, z: 0, kind: (i % 4) as 0 | 1 | 2 | 3, level: 1, elite: false, boss: false, region }, home);
        for (let i = 0; i < 128; i++) e.spawnProjectile(e.world.ids[e.player], i >= 5 ? Faction.Player : Faction.Enemy,
            i % 7 ? 0 : 100, 0, 1000, 0, i + 1, i % 7 ? 1 : .01, { height: i % 3 === 0 ? 7 : i % 3 === 1 ? 3.2 : .8, velocityY: -3 });
        return e;
    };
    const serial = makeWorld(), parallel = makeWorld(), pool = await createPool();
    advanceProjectiles(serial); await advanceProjectiles(parallel, pool);
    expect(pool.parallelBatches).toBe(1);
    expect(pool.workerActivity).toHaveLength(2);
    expect(pool.waitMs).toBeGreaterThan(0);
    for (const worker of pool.workerActivity) {
        expect(worker.completed).toBe(1);
        expect(worker.busy).toBe(false);
        expect(worker.lastTaskMs).toBeGreaterThan(0);
    }
    expect(parallel.projectileBatch.targets).toEqual(serial.projectileBatch.targets);
    expect(parallel.projectiles).toEqual(serial.projectiles);
    expect(parallel.impacts).toEqual(serial.impacts);
    expect(parallel.position).toEqual(serial.position);
    expect(parallel.world.ids).toEqual(serial.world.ids);
    expect(serial.impacts.count).toBeGreaterThan(0); expect(serial.impacts.count).toBeLessThan(100);
    // Recycled handles and empty batches cannot inherit a previous result.
    const batch = new ProjectileBatch(); batch.count = 2; batch.enemyCount = 2;
    batch.enemyIds.set([9002, 9001]); batch.enemyX.fill(2); batch.enemyRadius.fill(.5);
    batch.endX.fill(4); batch.targets.fill(123);
    prepareProjectileFixture(batch);
    resolveProjectileRange(batch, 1, 2); resolveProjectileRange(batch, 0, 1);
    expect(Array.from(batch.targets.slice(0, 2))).toEqual([9001, 9001]);
    batch.enemyCount = 0; prepareProjectileFixture(batch); await pool.resolve(batch);
    expect(Array.from(batch.targets.slice(0, 2))).toEqual([0, 0]);
    expect(pool.localBatches).toBe(1);
});

test("async fixed ticks produce exactly the same snapshots and render bytes as serial replay", async () => {
    const serial = new CombatSimulation("worker-replay"), parallel = new CombatSimulation("worker-replay"), pool = await createPool();
    for (let tick = 0; tick < 150; tick++) {
        const input = { x: 1, z: tick % 30 < 15 ? 1 : -1, active: true };
        serial.step(input); await parallel.step(input, pool);
    }
    expect(parallel.getSnapshot()).toEqual(serial.getSnapshot());
    expect(parallel.drainNotices()).toEqual(serial.drainNotices());
    const a = new RenderFrame().write(serial.getRenderState()), b = new RenderFrame().write(parallel.getRenderState());
    expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
    expect(a.player).toEqual(b.player);
});

test("the phase barrier waits for both disjoint results even when the second range finishes first", async () => {
    const replies: (() => void)[] = [];
    const ports = Array.from({ length: 2 }, () => {
        const port = { onmessage: (_event: MessageEvent) => {}, close: () => {},
            postMessage(request: QueryRequest, transfer: Transferable[]) {
                const cloned = structuredClone(request, { transfer });
                replies.push(() => {
                    resolveProjectileRange(new ProjectileBatch(cloned.buffer), cloned.begin, cloned.end);
                    const data = structuredClone({ id: cloned.id, buffer: cloned.buffer }, { transfer: [cloned.buffer] });
                    port.onmessage({ data } as MessageEvent);
                });
            } };
        return port as unknown as MessagePort;
    });
    const pool = new ProjectileWorkerPool(ports); pools.push(pool);
    const batch = new ProjectileBatch(); batch.count = 128; batch.enemyCount = 640;
    batch.enemyIds.fill(100); batch.enemyX.fill(2); batch.enemyRadius.fill(.5); batch.endX.fill(4); batch.targets.fill(123);
    prepareProjectileFixture(batch);
    let committed = false;
    const result = pool.resolve(batch).then(() => { committed = true; });
    expect(replies).toHaveLength(2);
    replies[1](); await Promise.resolve(); await Promise.resolve();
    expect(committed).toBe(false);
    expect(batch.targets[0]).toBe(123); expect(batch.targets[127]).toBe(100);
    replies[0](); await result;
    expect(batch.targets.every(target => target === 100)).toBe(true);
});

test("render buffers alternate across transfer boundaries without detaching ECS or the current frame", async () => {
    const transport = new LoopbackCombatTransport();
    const initial = await transport.start("buffer-ownership", { x: 0, z: 0 });
    const ecs = transport.simulation.getRenderState().entities.position.x;
    const batch = { steps: 1, commands: [], input: { x: 1, z: 0, active: true } };
    const first = await transport.advance(batch);
    expect(initial.render.buffer.byteLength).toBe(RenderFrame.bytes);
    const prior = new RenderFrame(first.render.buffer).read(first.render).player.x;
    const second = await transport.advance(batch);
    expect(initial.render.buffer.byteLength).toBe(0);
    expect(first.render.buffer.byteLength).toBe(RenderFrame.bytes);
    expect(new RenderFrame(first.render.buffer).read(first.render).player.x).toBe(prior);
    expect(new RenderFrame(second.render.buffer).read(second.render).player.x).toBeGreaterThan(prior);
    expect(ecs.byteLength).toBeGreaterThan(0);
    const snapshot = await transport.advance({ ...batch, steps: 0 });
    expect(snapshot.snapshot!.tick).toBe(2);
    transport.dispose();
});

test("far-world chest and effect positions survive transfer without moving their gameplay locations", () => {
    const origin = 2 ** 25;
    const combat = new CombatSimulation("review-coordinates", { x: origin, z: origin });
    const fixture = combat as unknown as { entities: CombatWorld; world: RegionalWorld; playerX: number; playerZ: number; openNearbyChest(): void };
    const chunk = [...fixture.world.chunks.values()].find(value => value.band === "near" && value.chest)!;
    const chest = chunk.chest!;
    const { effects } = fixture.entities;
    effects.add(EffectKind.Lightning, 1, origin + .3, -origin - .7, .45, 1, origin + .9, -origin - .2);
    const packet = new RenderFrame().write(combat.getRenderState());
    const transferred = structuredClone(packet, { transfer: [packet.buffer] });
    const state = new RenderFrame(transferred.buffer).read(transferred);
    expect(state.effects.x[0]).toBe(origin + .3);
    expect(state.effects.z[0]).toBe(-origin - .7);
    expect(state.effects.endX[0]).toBe(origin + .9);
    expect(state.effects.endZ[0]).toBe(-origin - .2);
    const index = Array.from(state.chests.x.subarray(0, state.chests.count)).indexOf(chest.x);
    expect(index).toBeGreaterThanOrEqual(0);
    fixture.playerX = state.chests.x[index]; fixture.playerZ = state.chests.z[index];
    fixture.openNearbyChest();
    expect(chunk.chestOpened).toBe(true);
    expect(combat.getRenderState().chests.count).toBe(state.chests.count - 1);
    combat.dispose();
});

test("a missing collision response times out and releases pending lanes", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const port = { postMessage: vi.fn(), close } as unknown as MessagePort;
    const pool = new ProjectileWorkerPool([port]); pools.push(pool);
    const batch = new ProjectileBatch(); batch.count = 128; batch.enemyCount = 640;
    prepareProjectileFixture(batch);
    const failure = expect(pool.resolve(batch)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS);
    await failure;
    expect(close).toHaveBeenCalledOnce();
});

test("authority rejects out-of-order requests and oversized batches before advancing", async () => {
    for (const invalid of [{ id: 3, steps: 1 }, { id: 2, steps: MAX_STEP_BATCH + 1 }]) {
        const responses: CombatResponse[] = [];
        const host = new CombatWorkerHost(message => responses.push(message), new MemorySpiritRepository());
        await host.receive({ type: "init", id: 1, seed: "protocol", start: { x: 0, z: 0 }, ports: [] });
        await host.receive({ type: "advance", id: invalid.id, batch: { steps: invalid.steps, commands: [], input: { x: 0, z: 0, active: false } } });
        expect(responses.at(-1)?.type).toBe("error");
        await host.receive({ type: "init", id: 1, seed: "closed", start: { x: 0, z: 0 }, ports: [] });
        expect(responses).toHaveLength(2);
    }
});

test("terrain, authority and query workers share one explicit CPU budget", () => {
    expect(workerBudget(2)).toEqual({ terrain: 1, queries: 0 });
    expect(workerBudget(4)).toEqual({ terrain: 1, queries: 0 });
    expect(workerBudget(8)).toEqual({ terrain: 2, queries: 0 });
    expect(workerBudget(8, true)).toEqual({ terrain: 2, queries: 2 });
    expect(workerBudget(4, true)).toEqual({ terrain: 1, queries: 0 });
    expect(() => workerBudget(0)).toThrow();
});

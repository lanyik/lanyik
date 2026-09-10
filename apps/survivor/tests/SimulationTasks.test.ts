import { expect, test, vi } from "vitest";
import { SimulationTasks } from "../src/core/SimulationTasks";
import { EntityWorld } from "../src/core/EntityWorld";
import { CombatSimulation } from "../src/core/CombatSimulation";

function deferred<T>() {
    let resolve!: (value: T) => void, reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

test("required work holds the tick barrier; deferred work commits only at a later boundary", async () => {
    const tasks = new SimulationTasks(() => true), required = deferred<void>(), pending = deferred<number>();
    tasks.commitReady(0, 4);
    const apply = vi.fn(() => undefined);
    const stamp = tasks.submit({ key: "perception", entity: 1, maxAgeTicks: 5, execute: () => pending.promise, commit: apply })!;
    const barrier = tasks.require(() => required.promise);
    expect(() => tasks.commitReady(1, 4)).toThrow(/awaiting required/);
    required.resolve(); await barrier;
    tasks.commitReady(1, 4); tasks.commitReady(2, 4);
    expect(apply).not.toHaveBeenCalled();
    pending.resolve(17); await pending.promise;
    expect(apply).not.toHaveBeenCalled();
    tasks.commitReady(3, 4);
    expect(apply).toHaveBeenCalledExactlyOnceWith(17, stamp, 3);
    tasks.commitReady(4, 4);
    expect(tasks.stats).toMatchObject({ committed: 1, pending: 0 });
});

test("obsolete results cannot overwrite newer requests and cancelled work still consumes capacity until settled", async () => {
    const tasks = new SimulationTasks(() => true, 2), old = deferred<number>(), recent = deferred<number>();
    const values: number[] = [], signals: AbortSignal[] = [];
    const request = (job: ReturnType<typeof deferred<number>>) => tasks.submit({ key: "route", entity: 1, maxAgeTicks: 10,
        execute: signal => { signals.push(signal); return job.promise; }, commit: value => { values.push(value); } });
    request(old); request(recent);
    expect(signals[0].aborted).toBe(true);
    expect(request(deferred<number>())).toBeUndefined();
    expect(tasks.stats.pending).toBe(2);
    recent.resolve(2); await recent.promise; tasks.commitReady(1, 0);
    old.resolve(1); await old.promise; tasks.commitReady(2, 0);
    expect(values).toEqual([2]);
    expect(tasks.stats).toMatchObject({ pending: 0, committed: 1, discarded: 1, rejected: 1 });
});

test("world revision, entity generation, age and disposal invalidate results without committing them", async () => {
    for (const reason of ["world", "entity", "age", "dispose"] as const) {
        const world = new EntityWorld(1), slot = world.create(1), handle = world.ids[slot];
        const tasks = new SimulationTasks(id => world.resolve(id) >= 0), pending = deferred<number>();
        const apply = vi.fn(() => undefined); let signal!: AbortSignal;
        tasks.submit({ key: "route", entity: handle, maxAgeTicks: 2, execute: value => { signal = value; return pending.promise; }, commit: apply });
        if (reason === "entity") { world.destroy(handle); world.create(1); }
        if (reason === "dispose") tasks.dispose();
        else tasks.commitReady(reason === "age" ? 3 : 1, reason === "world" ? 1 : 0);
        expect(signal.aborted).toBe(true);
        pending.resolve(1); await pending.promise;
        if (reason !== "dispose") tasks.commitReady(4, reason === "world" ? 1 : 0);
        expect(apply).not.toHaveBeenCalled(); expect(tasks.stats.pending).toBe(0);
    }
});

test("current executor failures surface at the authority boundary and cancelled failures are discarded", async () => {
    const tasks = new SimulationTasks(() => true), first = deferred<void>(), stale = deferred<void>();
    tasks.submit({ key: "route", entity: 1, maxAgeTicks: 3, execute: () => first.promise, commit: () => undefined });
    first.reject(new Error("executor failed")); await Promise.resolve();
    expect(() => tasks.commitReady(1, 0)).toThrow("executor failed");
    tasks.submit({ key: "route", entity: 1, maxAgeTicks: 3, execute: () => stale.promise, commit: () => undefined });
    tasks.cancel("route", 1); stale.reject(new Error("old executor failed")); await Promise.resolve();
    expect(() => tasks.commitReady(2, 0)).not.toThrow();
    tasks.dispose(); expect(() => tasks.submit({ key: "route", entity: 1, maxAgeTicks: 2, execute: async () => 1, commit: () => undefined })).toThrow(/closed/);
});

test("the production simulation keeps ticking while deferred results wait and applies them at its boundary", async () => {
    const simulation = new CombatSimulation("deferred-boundary"), pending = deferred<number>();
    const commits: number[] = [];
    simulation.tasks.submit({ key: "perception", entity: simulation.getRenderState().entities.ids[0], maxAgeTicks: 5,
        execute: () => pending.promise, commit: (_value, _stamp, tick) => { commits.push(tick); } });
    simulation.step({ x: 0, z: 0, active: false }); simulation.step({ x: 0, z: 0, active: false });
    expect(simulation.tick).toBe(2); expect(commits).toEqual([]);
    pending.resolve(1); await pending.promise;
    simulation.step({ x: 0, z: 0, active: false }); expect(commits).toEqual([3]);
    simulation.dispose();
});

test("deferred commits cannot reenter the tick boundary", async () => {
    const tasks = new SimulationTasks(() => true), job = deferred<number>();
    tasks.submit({ key: "route", entity: 1, maxAgeTicks: 3, execute: () => job.promise, commit: () => {
        expect(() => tasks.commitReady(2, 0)).toThrow(/committing results/);
        expect(() => tasks.assertCanStep()).toThrow(/committing results/);
    } });
    job.resolve(1); await job.promise; tasks.commitReady(1, 0);
    expect(() => tasks.commitReady(2, 0)).not.toThrow(); expect(tasks.stats.committed).toBe(1);
});

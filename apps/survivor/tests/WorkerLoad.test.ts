import { expect, test } from "vitest";
import { TaskActivity } from "../src/worker/TaskActivity";
import { WorkerLoadSampler, type NamedWorkerActivity } from "../src/app/WorkerLoadSampler";

test("occupancy includes unfinished work once, then decays to zero while paused", () => {
    let now = 0;
    const activity = new TaskActivity(0, () => now), sampler = new WorkerLoadSampler();
    const read = (): NamedWorkerActivity[] => [{ ...activity.snapshot, key: "simulation", label: "Simulation" }];
    expect(sampler.sample(now, read())[0].sampled).toBe(false);
    now = 250; activity.begin(); now = 1000;
    expect(sampler.sample(now, read())[0]).toMatchObject({ occupancy: .75, tasksPerSecond: 0 });
    now = 1250; activity.end(); now = 2000;
    expect(sampler.sample(now, read())[0]).toMatchObject({ occupancy: .25, tasksPerSecond: 1, lastTaskMs: 1000 });
    now = 3000;
    expect(sampler.sample(now, read())[0]).toMatchObject({ occupancy: 0, tasksPerSecond: 0, lastTaskMs: 1000 });
    expect(sampler.sample(4000, [])).toEqual([]);
    expect(sampler.sample(5000, read())[0].sampled).toBe(false);
});

test("a replaced worker and delayed query reports cannot produce negative or overfull percentages", () => {
    const sampler = new WorkerLoadSampler();
    const read = (busyMs: number, completed: number): NamedWorkerActivity[] => [{ id: 0, busy: false, busyMs, completed, lastTaskMs: 1, key: "query-0", label: "Query" }];
    sampler.sample(0, read(100, 2));
    expect(sampler.sample(1000, read(0, 0))[0]).toMatchObject({ sampled: false, occupancy: 0 });
    expect(sampler.sample(2000, read(1500, 1))[0]).toMatchObject({ sampled: true, occupancy: 1, tasksPerSecond: 1 });
});

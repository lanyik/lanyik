import { describe, expect, test } from "vitest";

import { RuntimeWorkCoordinator } from "../../src/runtime/RuntimeWorkCoordinator";

describe("RuntimeWorkCoordinator", () => {
    test("aggregates frame and worker queues with application telemetry", () => {
        const coordinator = new RuntimeWorkCoordinator({
            defaultMaxPendingTasks: 4,
            defaultMaxPendingWeight: 8
        });
        const frame = coordinator.createQueue<string>("frame");
        const worker = coordinator.createQueue<string>("worker");
        frame.enqueue("mount", { weight: 2 });
        worker.enqueue("terrain", { weight: 3 });
        const detach = coordinator.registerTelemetry("application", () => ({ pendingTasks: 2, busyTasks: 1 }));

        expect(coordinator.stats).toMatchObject({
            pendingTasks: 4,
            pendingWeight: 7,
            busyTasks: 1
        });
        expect(Object.keys(coordinator.stats.domains)).toEqual(["frame", "worker", "application"]);
        detach();
        expect(coordinator.stats.pendingTasks).toBe(2);
        coordinator.dispose();
        expect(coordinator.signal.aborted).toBe(true);
        expect(frame.take()).toBeUndefined();
        expect(worker.take()).toBeUndefined();
    });

    test("makes detach idempotent and sanitizes invalid telemetry", () => {
        const coordinator = new RuntimeWorkCoordinator();
        const first = coordinator.registerTelemetry("streaming", () => ({ pendingTasks: 1 }));
        first();
        const second = coordinator.registerTelemetry("streaming", () => ({
            pendingTasks: Number.NaN,
            pendingWeight: -4,
            busyTasks: 2
        }));

        first();
        expect(coordinator.stats).toMatchObject({ pendingTasks: 0, pendingWeight: 0, busyTasks: 2 });
        expect(Object.keys(coordinator.stats.domains)).toEqual(["streaming"]);
        second();
        expect(coordinator.stats.domains).toEqual({});
    });
});

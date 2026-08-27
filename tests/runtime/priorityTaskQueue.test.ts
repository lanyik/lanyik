import { describe, expect, test, vi } from "vitest";

import { PriorityTaskQueue, WorkQueueBackpressureError } from "../../src/runtime/PriorityTaskQueue";

describe("PriorityTaskQueue", () => {
    test("uses shared lanes and promotes old background work against starvation", () => {
        let now = 0;
        const queue = new PriorityTaskQueue<string>({ now: () => now, starvationMs: 100 });
        queue.enqueue("background", { lane: "background" });
        now = 450;
        queue.enqueue("visible", { lane: "visible" });
        expect(queue.stats.starvationPromotions).toBe(4);
        expect(queue.take()).toBe("background");
        expect(queue.take()).toBe("visible");
    });

    test("keeps lane precedence independent from domain-specific priority magnitude", () => {
        const queue = new PriorityTaskQueue<string>();
        queue.enqueue("critical", { lane: "critical", priority: Number.MAX_VALUE });
        queue.enqueue("background", { lane: "background", priority: -Number.MAX_VALUE });
        expect(queue.take()).toBe("critical");
        expect(queue.take()).toBe("background");
    });

    test("gives overdue work a FIFO deadline even against endless extreme priorities", () => {
        let now = 0;
        const queue = new PriorityTaskQueue<string>({ now: () => now, starvationMs: 100 });
        queue.enqueue("old-background", { lane: "background", priority: Number.MAX_VALUE });
        now = 501;
        queue.enqueue("fresh-critical", { lane: "critical", priority: -Number.MAX_VALUE });
        expect(queue.take()).toBe("old-background");
        expect(queue.take()).toBe("fresh-critical");
    });

    test("sheds the least important work by task and weight limits", () => {
        const shed = vi.fn();
        const queue = new PriorityTaskQueue<string>({ maxPendingTasks: 2, maxPendingWeight: 3 });
        queue.enqueue("visible", { lane: "visible", weight: 2 });
        queue.enqueue("prefetch", { lane: "prefetch", weight: 1, cancelled: shed });
        queue.enqueue("background", { lane: "background", weight: 1, cancelled: shed });
        expect(queue.values).toEqual(["visible", "prefetch"]);
        expect(shed).toHaveBeenCalledOnce();
        expect(shed.mock.calls[0][0]).toBeInstanceOf(WorkQueueBackpressureError);
        expect(queue.stats.shedTasks).toBe(1);
    });

    test("propagates abort and keyed replacement without executing stale work", () => {
        const cancelled = vi.fn();
        const controller = new AbortController();
        const queue = new PriorityTaskQueue<string>();
        queue.enqueue("stale", { key: "mount", signal: controller.signal, cancelled });
        queue.enqueue("latest", { key: "mount" });
        controller.abort();
        expect(queue.take()).toBe("latest");
        expect(queue.take()).toBeUndefined();
        expect(cancelled).toHaveBeenCalledOnce();
    });

    test("rejects an impossible task without evicting admitted work", () => {
        const rejected = vi.fn();
        const queue = new PriorityTaskQueue<string>({ maxPendingTasks: 3, maxPendingWeight: 3 });
        queue.enqueue("existing", { key: "asset", lane: "visible", weight: 2 });

        expect(queue.enqueue("oversized", {
            key: "asset",
            lane: "critical",
            weight: 4,
            cancelled: rejected
        })).toBeUndefined();

        expect(queue.take()).toBe("existing");
        expect(rejected.mock.calls[0][0]).toBeInstanceOf(WorkQueueBackpressureError);
        expect(queue.stats.shedTasks).toBe(1);
    });

    test("does not let aged background work evict newly admitted critical work", () => {
        let now = 0;
        const shed = vi.fn();
        const queue = new PriorityTaskQueue<string>({
            now: () => now,
            starvationMs: 100,
            maxPendingTasks: 1
        });
        queue.enqueue("old-background", { lane: "background", cancelled: shed });
        now = 1_000;
        queue.enqueue("fresh-critical", { lane: "critical" });

        expect(queue.take()).toBe("fresh-critical");
        expect(shed).toHaveBeenCalledOnce();
        expect(shed.mock.calls[0][0]).toBeInstanceOf(WorkQueueBackpressureError);
    });
});

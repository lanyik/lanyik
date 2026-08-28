import { describe, expect, test, vi } from "vitest";

import { LifecycleDrainTimeoutError, LifecycleScope } from "../../src/runtime/LifecycleScope";
import { deferred } from "../helpers/deferred";

describe("LifecycleScope", () => {
    test("rejects late publication and drains tracked work after close", async () => {
        const pending = deferred<number>();
        const scope = new LifecycleScope("world-1");
        const observer = vi.fn();
        const release = vi.fn();
        const task = scope.track(pending.promise);

        const settled = scope.close();
        expect(scope.signal.aborted).toBe(true);
        expect(scope.stats.state).toBe("closing");
        pending.resolve(42);
        expect(await task).toBe(42);
        expect(scope.publish(42, observer, release)).toBe(false);
        await settled;

        expect(observer).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledWith(42);
        expect(scope.stats).toMatchObject({
            state: "closed",
            pendingTasks: 0,
            completedTasks: 1,
            rejectedPublications: 1
        });
    });

    test("propagates cancellation to operations and is idempotent", async () => {
        const scope = new LifecycleScope("worker-session");
        const task = scope.run(signal => new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }));
        const first = scope.close();
        const second = scope.close();
        await expect(task).rejects.toMatchObject({ name: "AbortError" });
        await Promise.all([first, second]);
        expect(scope.stats.cancelledTasks).toBe(1);
        expect(scope.stats.state).toBe("closed");
    });

    test("bounds shutdown when a producer ignores cancellation", async () => {
        vi.useFakeTimers();
        try {
            const errors: Error[] = [];
            const scope = new LifecycleScope("hung-layer", {
                drainTimeoutMs: 25,
                error: error => { errors.push(error); }
            });
            void scope.track(new Promise<void>(() => undefined));

            const settled = scope.close();
            await vi.advanceTimersByTimeAsync(25);
            await settled;

            expect(scope.stats).toMatchObject({
                state: "closed",
                pendingTasks: 0,
                detachedTasks: 1,
                drainTimedOut: true
            });
            expect(errors).toHaveLength(1);
            expect(errors[0]).toBeInstanceOf(LifecycleDrainTimeoutError);
        } finally {
            vi.useRealTimers();
        }
    });
});

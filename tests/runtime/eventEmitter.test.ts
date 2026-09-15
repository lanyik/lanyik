import { describe, expect, test, vi } from "vitest";
import { EventEmitter } from "../../src/index";

describe("EventEmitter", () => {
    test("can clear event listeners", () => {
        const emitter = new EventEmitter();
        const first = vi.fn();
        const second = vi.fn();
        emitter.on("first", first).on("second", second).removeAllListeners("first");
        emitter.emit("first");
        emitter.emit("second");
        emitter.removeAllListeners();
        emitter.emit("second");
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });

    test("binds event names to payloads and snapshots listeners during dispatch", () => {
        const emitter = new EventEmitter<{
            ready: void;
            value: { count: number };
            error: Error;
        }>();
        const observed: number[] = [];
        const second = vi.fn(({ count }: { count: number }) => { observed.push(count * 2); });
        emitter.on("value", ({ count }) => {
            observed.push(count);
            emitter.off("value", second);
        });
        emitter.on("value", second);

        emitter.emit("ready");
        emitter.emit("value", { count: 3 });
        emitter.emit("value", { count: 4 });

        expect(observed).toEqual([3, 6, 4]);
        expect(emitter.listenerCount("value")).toBe(1);
        if (false) {
            // @ts-expect-error value events require their mapped payload.
            emitter.emit("value");
            // @ts-expect-error unknown event names are rejected.
            emitter.on("missing", () => undefined);
        }
    });

    test("throws an error event when no observer is registered", () => {
        const emitter = new EventEmitter<{ error: Error }>();
        const failure = new Error("unhandled event failure");
        expect(() => emitter.emit("error", failure)).toThrow(failure);

        const listener = vi.fn();
        emitter.on("error", listener);
        expect(() => emitter.emit("error", failure)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(failure);
    });
});

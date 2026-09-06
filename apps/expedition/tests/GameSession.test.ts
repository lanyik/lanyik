import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../src/app/GameSession";
import type { WorldSelection, WorldView } from "../src/app/WorldView";

function deferred() {
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function createWorld() {
    const loads: ReturnType<typeof deferred>[] = [];
    const world: WorldView = {
        load: vi.fn(() => {
            const pending = deferred();
            loads.push(pending);
            return pending.promise;
        }),
        dispose: vi.fn(async () => {})
    };
    return { world, loads };
}

async function readySession() {
    const fixture = createWorld();
    const session = new GameSession(fixture.world);
    const start = session.start("first");
    fixture.loads[0].resolve();
    await start;
    return { ...fixture, session };
}

describe("GameSession", () => {
    it.each(["resolve", "reject"] as const)("ignores a superseded load that finishes with %s", async completion => {
        const { world, loads } = createWorld();
        const session = new GameSession(world);
        const first = session.start("first");
        const second = session.start("second");
        loads[1].resolve();
        await second;
        session.frame(0);
        session.frame(100);
        const winningSnapshot = session.getSnapshot();
        if (completion === "resolve") loads[0].resolve();
        else loads[0].reject(new Error("Old worker failed"));
        await first;
        expect(session.getSnapshot()).toBe(winningSnapshot);
        expect(winningSnapshot).toMatchObject({ status: "ready", seed: "second", tick: 1 });
    });

    it("stops time on load failure and permits an explicit new load", async () => {
        const { session, loads } = await readySession();
        session.frame(0);
        session.frame(100);
        const failed = session.start("broken");
        session.frame(5000);
        expect(() => session.dispatch({ type: "set-paused", paused: false })).toThrow("not ready");
        loads[1].reject(new Error("Worker unavailable"));
        await failed;
        expect(session.getSnapshot()).toMatchObject({ status: "failed", tick: 1, error: "Worker unavailable" });
        session.frame(6000);
        expect(session.getSnapshot().tick).toBe(1);
        const retry = session.start("recovered");
        loads[2].resolve();
        await retry;
        expect(session.getSnapshot()).toMatchObject({ status: "ready", tick: 0, error: undefined, speed: 1 });
    });

    it("keeps explicit pause through visibility changes and rebases time after backgrounding", async () => {
        const { session } = await readySession();
        session.frame(0);
        session.frame(50);
        session.setHidden(true);
        session.frame(5000);
        session.setHidden(false);
        session.frame(10_000);
        session.frame(10_050);
        expect(session.getSnapshot().tick).toBe(1);
        session.dispatch({ type: "set-paused", paused: true });
        session.setHidden(true);
        session.setHidden(false);
        session.frame(20_000);
        session.frame(20_100);
        expect(session.getSnapshot()).toMatchObject({ tick: 1, paused: true });
        session.dispatch({ type: "set-paused", paused: false });
        session.frame(30_000);
        session.frame(30_100);
        expect(session.getSnapshot().tick).toBe(2);
    });

    it("caches published snapshots between ticks and takes ownership of selection data", async () => {
        const { session } = await readySession();
        const changed = vi.fn();
        session.subscribe(changed);
        const before = session.getSnapshot();
        session.frame(0);
        session.frame(50);
        expect(session.getSnapshot()).toBe(before);
        expect(changed).not.toHaveBeenCalled();
        session.frame(100);
        expect(changed).toHaveBeenCalledTimes(1);
        const modifiers = ["wood"];
        session.select({ x: -2, y: 3, terrain: "land" as WorldSelection["terrain"], modifiers });
        modifiers.push("hill");
        expect(session.getSnapshot().selection?.modifiers).toEqual(["wood"]);
        expect(Object.isFrozen(session.getSnapshot().selection?.modifiers)).toBe(true);
    });

    it("cannot publish a pending world after an asynchronous map error or disposal", async () => {
        const { world, loads } = createWorld();
        const session = new GameSession(world);
        const start = session.start("pending");
        session.fail(new Error("Terrain asset failed"));
        loads[0].resolve();
        await start;
        expect(session.getSnapshot()).toMatchObject({ status: "failed", error: "Terrain asset failed" });
        const retry = session.start("another");
        const changed = vi.fn();
        session.subscribe(changed);
        const closing = session.dispose();
        expect(session.dispose()).toBe(closing);
        await closing;
        loads[1].resolve();
        await retry;
        session.select({ x: 0, y: 0, terrain: "land" as WorldSelection["terrain"], modifiers: [] });
        expect(session.getSnapshot().status).toBe("closed");
        expect(changed).toHaveBeenCalledTimes(1);
        expect(world.dispose).toHaveBeenCalledTimes(1);
        await expect(session.start("late")).rejects.toThrow("closed");
    });
});

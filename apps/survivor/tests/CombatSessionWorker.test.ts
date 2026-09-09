import { afterEach, expect, test, vi } from "vitest";
import { CombatSession } from "../src/app/CombatSession";
import type { CombatView } from "../src/app/CombatView";
import type { CombatAdvance } from "../src/worker/CombatProtocol";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";

class HeldTransport extends LoopbackCombatTransport {
    public readonly calls: CombatAdvance[] = [];
    public release: (() => void) | undefined;
    public override async advance(batch: CombatAdvance) {
        this.calls.push(batch);
        await new Promise<void>(resolve => { this.release = resolve; });
        if (this.closed) throw new Error("Closed");
        return super.advance(batch);
    }
}

afterEach(() => vi.unstubAllGlobals());
function view(): CombatView {
    vi.stubGlobal("document", { hidden: false });
    return { load: async () => ({ x: 0, z: 0 }), readMovement: () => ({ x: 1, z: 0, active: true }),
        render: vi.fn(), clearMovement: vi.fn(), dispose: async () => {} };
}

test("slow workers cannot block rendering or grow tick queues; pause acknowledges the final committed tick", async () => {
    const transport = new HeldTransport(), presentation = view();
    const session = new CombatSession(presentation, () => transport);
    await session.start("backpressure"); session.frame(0); session.frame(20);
    for (let i = 2; i <= 100; i++) session.frame(i * 20);
    expect(transport.calls).toHaveLength(1);
    expect(session.diagnostics.pendingSteps).toBe(13);
    expect(session.diagnostics.droppedSteps).toBe(86);
    expect(presentation.render).toHaveBeenCalledTimes(102);
    session.dispatch({ type: "sort-inventory" });
    session.dispatch({ type: "toggle-autocast" });
    transport.release!();
    await vi.waitFor(() => expect(transport.calls).toHaveLength(2));
    expect(transport.calls[1].commands.map(command => command.type)).toEqual(["sort-inventory", "toggle-autocast"]);
    session.dispatch({ type: "toggle-pause" });
    expect(session.getSnapshot().paused).toBe(false);
    transport.release!();
    await vi.waitFor(() => expect(transport.calls).toHaveLength(3));
    expect(transport.calls[2].steps).toBe(0);
    expect(session.getSnapshot().paused).toBe(false);
    transport.release!(); await session.settled;
    expect(session.getSnapshot().paused).toBe(true);
    expect(session.getSnapshot().combat!.tick).toBe(14);
    session.frame(10000);
    expect(transport.calls).toHaveLength(3);
    expect(Object.isFrozen(session.getSnapshot().combat!.player)).toBe(true);
    await session.dispose();
});

test("replacement discards stale results and terminates the old owner; idle worker failures end the current session", async () => {
    const clients: HeldTransport[] = [], failures: ((error: Error) => void)[] = [];
    const session = new CombatSession(view(), onFailure => {
        failures.push(onFailure); const client = new HeldTransport(); clients.push(client); return client;
    });
    await session.start("old"); session.frame(0); session.frame(20);
    await session.start("new");
    expect(clients[0].closed).toBe(true);
    clients[0].release!();
    failures[0](new Error("stale error"));
    await Promise.resolve();
    expect(session.getSnapshot().status).toBe("ready");
    expect(session.getSnapshot().seed).toBe("new");
    expect(session.getSnapshot().combat!.tick).toBe(0);
    failures[1](new Error("query worker crashed"));
    expect(session.getSnapshot().status).toBe("failed");
    expect(session.getSnapshot().error).toBe("query worker crashed");
    expect(clients[1].closed).toBe(true);
    await session.dispose();
});

test("hiding discards unsent ticks and excessive commands fail with bounded memory", async () => {
    const transport = new HeldTransport(), session = new CombatSession(view(), () => transport);
    await session.start(); session.frame(0); session.frame(20); session.frame(200);
    session.setHidden(true);
    expect(session.diagnostics.pendingSteps).toBe(0);
    for (let i = 0; i < 65; i++) session.dispatch({ type: "sort-inventory" });
    expect(session.getSnapshot().status).toBe("failed");
    expect(session.getSnapshot().error).toMatch(/queue exhausted/);
    expect(transport.closed).toBe(true);
    transport.release!(); await session.dispose();
});

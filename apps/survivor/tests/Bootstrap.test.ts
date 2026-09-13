import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
const mocks = vi.hoisted(() => ({ view: vi.fn(), render: vi.fn(), unmount: vi.fn(), start: vi.fn(async () => {}) }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: mocks.render, unmount: mocks.unmount }) }));
vi.mock("../src/presentation/App", () => ({ App: () => null }));
vi.mock("../src/adapters/HexCombatView", () => ({ HexCombatView: class { constructor() { return mocks.view(); } } }));
vi.mock("../src/app/CombatSession", () => ({ CombatSession: class {
    constructor(private readonly view: { dispose(): Promise<void> }) {}
    start = mocks.start;
    observeLongFrames() { return () => {}; }
    getSnapshot() { return { status: "loading" }; }
    setHidden() {}
    dispose() { return this.view.dispose(); }
} }));
import { bootstrap } from "../src/app/bootstrap";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup() {
    vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => ({}), hidden: false }));
    const records = new Map<string, string>();
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: { getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => { records.set(key, value); } } }));
    vi.stubGlobal("navigator", { hardwareConcurrency: 4, userAgent: "bootstrap-test" });
}
function home() {
    const root = mocks.render.mock.calls.at(-1)![0] as ReactElement<{ children: ReactElement<{ start(seed: string): Promise<void>; error?: string; blocked: boolean }> }>;
    return root.props.children.props;
}

test("home creates no graphics; failed launch remains retryable and repeated start is coalesced", async () => {
    setup();
    const dispose = vi.fn(async () => {}), disconnect = vi.fn();
    mocks.view.mockImplementationOnce(() => { throw new Error("Error creating WebGL context."); })
        .mockReturnValue({ onFrame: () => disconnect, attachRegionMap: vi.fn(), dispose });
    const app = bootstrap();
    expect(mocks.view).not.toHaveBeenCalled();
    await home().start("seed");
    expect(home().error).toBe("Error creating WebGL context.");
    expect(app.runtimeLog.export()).toContain("launch-failed");
    expect(app.runtimeLog.export()).toContain("Error creating WebGL context.");
    const retry = home().start("seed"); void home().start("seed"); await retry;
    expect(mocks.start).toHaveBeenCalledTimes(1); expect(mocks.view).toHaveBeenCalledTimes(2);
    const closing = app.dispose(); expect(app.dispose()).toBe(closing); await closing;
    expect(disconnect).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
    expect(mocks.unmount).toHaveBeenCalledTimes(1);
});

test("window, promise and context errors persist; disposal detaches diagnostic listeners", async () => {
    setup(); const app = bootstrap();
    window.dispatchEvent(Object.assign(new Event("error"), { error: new Error("window fixture") }));
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("promise fixture") }));
    document.dispatchEvent(new Event("webglcontextlost"));
    const report = JSON.parse(app.runtimeLog.export());
    expect(report.entries.map((entry: { event: string }) => entry.event)).toEqual(["page-start", "window-error", "unhandled-rejection", "webgl-context-lost"]);
    await app.dispose();
    const after = app.runtimeLog.export();
    window.dispatchEvent(Object.assign(new Event("error"), { message: "after dispose" }));
    document.dispatchEvent(new Event("webglcontextlost"));
    expect(JSON.parse(app.runtimeLog.export()).entries).toEqual(JSON.parse(after).entries);
});
test("invalid host options fail visibly when starting without creating graphics resources", async () => {
    setup();
    const app = bootstrap({ collisionQueries: "true" } as unknown as Parameters<typeof bootstrap>[0]);
    await home().start("seed");
    expect(mocks.view).not.toHaveBeenCalled(); expect(home().error).toContain("Survivor options");
    await app.dispose();
});
test("cleanup failure blocks launching over a partially released view", async () => {
    setup();
    mocks.view.mockReturnValue({ onFrame: () => { throw new Error("Frame hookup failed"); }, dispose: async () => { throw new Error("Release failed"); } });
    const app = bootstrap(); await home().start("seed");
    expect(home().error).toContain("Frame hookup failed"); expect(home().error).toContain("Release failed"); expect(home().blocked).toBe(true);
    await home().start("seed"); expect(mocks.view).toHaveBeenCalledTimes(1);
    await expect(app.dispose()).rejects.toThrow("Release failed");
});

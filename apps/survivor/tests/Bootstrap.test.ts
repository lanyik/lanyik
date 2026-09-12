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
    setHidden() {}
    dispose() { return this.view.dispose(); }
} }));
import { bootstrap } from "../src/app/bootstrap";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test("synchronous graphics failure renders an actionable error before a session exists, then retries once", async () => {
    vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => ({}), hidden: false }));
    vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", { hardwareConcurrency: 4 });
    const dispose = vi.fn(async () => {}), disconnect = vi.fn();
    mocks.view.mockImplementationOnce(() => { throw new Error("Error creating WebGL context."); })
        .mockReturnValue({ onFrame: () => disconnect, attachRegionMap: vi.fn(), dispose });
    const app = bootstrap();
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    const failure = mocks.render.mock.calls[0][0] as ReactElement<{ "data-state": string; children: ReactElement }>;
    expect(failure.props["data-state"]).toBe("failed");
    type Element = ReactElement<{ children: Element | Element[]; onClick?: () => void }>;
    const content = ((failure.props.children as Element).props.children as Element).props.children as Element[];
    expect(content[1].props.children).toBe("Error creating WebGL context.");
    content[2].props.onClick!(); content[2].props.onClick!();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.view).toHaveBeenCalledTimes(2);
    const closing = app.dispose(); expect(app.dispose()).toBe(closing); await closing;
    expect(disconnect).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
    expect(mocks.unmount).toHaveBeenCalledTimes(1);
});

test("invalid host options fail visibly without creating graphics resources", async () => {
    vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => ({}), hidden: false }));
    vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    const app = bootstrap({ collisionQueries: "true" } as unknown as Parameters<typeof bootstrap>[0]);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.render.mock.calls[0][0].props["data-state"]).toBe("failed");
    await app.dispose();
});

test("cleanup failure stays visible and cannot retry over a partially released view", async () => {
    vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => ({}), hidden: false }));
    vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", { hardwareConcurrency: 4 });
    mocks.view.mockReturnValue({ onFrame: () => { throw new Error("Frame hookup failed"); }, dispose: async () => { throw new Error("Release failed"); } });
    const app = bootstrap();
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    type Element = ReactElement<{ children: Element | Element[] | string; onClick?: () => void }>;
    const root = mocks.render.mock.calls[0][0] as Element;
    const panel = (root.props.children as Element).props.children as Element;
    const children = panel.props.children as Element[];
    expect(children[1].props.children).toContain("Frame hookup failed");
    expect(children[1].props.children).toContain("Release failed");
    expect(children[2].props.onClick).toBeUndefined();
    await expect(app.dispose()).rejects.toThrow("Release failed");
});

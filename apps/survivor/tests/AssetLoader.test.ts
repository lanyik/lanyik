import { afterEach, expect, test, vi } from "vitest";
import { AssetLoader } from "../src/presentation/AssetLoader";

afterEach(() => vi.unstubAllGlobals());

test("asset cancellation closes images decoded after abort and aborts pending requests", async () => {
    const controller = new AbortController(), loader = new AssetLoader(controller.signal);
    const closed = vi.fn();
    let finish!: (bitmap: ImageBitmap) => void;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
        expect(options.signal).toBe(loader.signal);
        return { ok: true, blob: async () => new Blob() };
    }));
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve; })));
    const loading = loader.texture("/actor.png");
    await vi.waitFor(() => expect(finish).toBeDefined());
    controller.abort(new DOMException("World replaced", "AbortError"));
    const rejection = expect(loading).rejects.toMatchObject({ name: "AbortError" });
    await rejection;
    expect(closed).not.toHaveBeenCalled();
    finish({ close: closed } as unknown as ImageBitmap);
    await Promise.resolve();
    expect(loader.signal.aborted).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    loader.dispose();
});

test("owned textures close decoded pixels on disposal and retain the requested orientation", async () => {
    const loader = new AssetLoader(new AbortController().signal), closed = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob() })));
    const decode = vi.fn(async () => ({ close: closed })); vi.stubGlobal("createImageBitmap", decode);
    const texture = await loader.texture("/effects.png", true);
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ imageOrientation: "flipY", premultiplyAlpha: "none" }));
    loader.dispose();
    expect(closed).not.toHaveBeenCalled();
    texture.dispose(); expect(closed).toHaveBeenCalledTimes(1);
});

test("a failed bounded batch cancels siblings and never starts queued assets", async () => {
    const loader = new AssetLoader(new AbortController().signal), started: number[] = [];
    let fail!: () => void;
    const loading = loader.parallel([0, 1, 2, 3], 2, async item => {
        started.push(item);
        if (item === 0) await new Promise<void>((_resolve, reject) => { fail = () => reject(new Error("Bad actor")); });
        else await new Promise<void>((_resolve, reject) => loader.signal.addEventListener("abort", () => reject(loader.signal.reason), { once: true }));
    });
    expect(started).toEqual([0, 1]);
    const rejection = expect(loading).rejects.toThrow("Bad actor"); fail(); await rejection;
    expect(started).toEqual([0, 1]); expect(loader.signal.aborted).toBe(true);
    loader.dispose();
});

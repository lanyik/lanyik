import { afterEach, expect, test, vi } from "vitest";
import { HexMap } from "../../src/HexMap";
import { ModelAssetCache } from "../../src/helpers/models";
import { WorldChunkScheduler } from "../../src/rendering/WorldChunkScheduler";
import { FrameTaskScheduler } from "../../src/rendering/FrameTaskScheduler";
import { RuntimeWorkCoordinator } from "../../src/runtime/RuntimeWorkCoordinator";

vi.mock("../../src/rendering/HexMapRendererHost", () => ({
    HexMapRendererHost: class { constructor() { throw new Error("WebGL context unavailable"); } }
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("renderer construction failure releases resources allocated before WebGL initialization", () => {
    class Canvas {}
    vi.stubGlobal("HTMLCanvasElement", Canvas);
    vi.stubGlobal("document", { querySelector: () => new Canvas() });
    vi.stubGlobal("window", { removeEventListener: vi.fn() });
    const modelAssets = vi.spyOn(ModelAssetCache.prototype, "dispose");
    const chunks = vi.spyOn(WorldChunkScheduler.prototype, "dispose");
    const frames = vi.spyOn(FrameTaskScheduler.prototype, "dispose");
    const work = vi.spyOn(RuntimeWorkCoordinator.prototype, "dispose");
    expect(() => new HexMap({ element: "canvas" })).toThrow("WebGL context unavailable");
    expect(modelAssets).toHaveBeenCalledOnce();
    expect(chunks).toHaveBeenCalledOnce();
    expect(frames).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledOnce();
});

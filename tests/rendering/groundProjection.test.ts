import { expect, test, vi } from "vitest";
import { Color, WebGLRenderTarget, type WebGLRenderer } from "three";
import { GroundProjection } from "../../src/rendering/GroundProjection";
import { WorldRenderLayerRegistry } from "../../src/rendering/WorldRenderLayer";

test("projection restores the renderer on failure and keeps logical bounds independent of terrain height", () => {
    const projection = new GroundProjection(64, 32), previousTarget = new WebGLRenderTarget(1, 1);
    projection.setCenter(-40, 12, 34);
    expect(projection.bounds.toArray()).toEqual([-72 * 34, -20 * 34, 64 * 34, 64 * 34]);
    const renderer = { autoClear: false, getRenderTarget: () => previousTarget, getClearAlpha: () => .5,
        getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
        getClearColor: (color: Color) => color.setRGB(.1, .2, .3), setRenderTarget: vi.fn(), setClearColor: vi.fn(),
        render: () => { throw new Error("draw failed"); } };
    expect(() => projection.render(renderer as unknown as WebGLRenderer)).toThrow("draw failed");
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget, 2, 1);
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(new Color().setRGB(.1, .2, .3), .5);
    expect(renderer.autoClear).toBe(false);
    const registry = new WorldRenderLayerRegistry();
    const first = { id: "first", groundProjection: projection, mountChunk() {}, unmountChunk() {}, dispose() {} };
    registry.register(first);
    expect(() => registry.register({ ...first, id: "second" })).toThrow("already registered");
    expect(registry.projectionLayer).toBe(first);
    registry.unregister(first.id);
    expect(registry.projectionLayer).toBeUndefined();
    projection.dispose(); previousTarget.dispose();
});

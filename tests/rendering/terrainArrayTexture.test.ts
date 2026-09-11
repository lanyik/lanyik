import { afterEach, expect, test, vi } from "vitest";
import { ImageLoader } from "three";
import { copyTerrainArrayPixels, loadTerrainArrayTexture, terrainArrayLayout } from "../../src/rendering/TerrainArrayTexture";

afterEach(() => vi.restoreAllMocks());

test("image failure and invalid image dimensions reject readiness; disposal ignores late results", async () => {
    let loaded: (image: HTMLImageElement) => void = () => {}, failed: () => void = () => {};
    vi.spyOn(ImageLoader.prototype, "load").mockImplementation((_url, onLoad, _progress, onError) => {
        loaded = onLoad!; failed = () => onError!(new Event("error"));
        return {} as HTMLImageElement;
    });
    const atlas = { image: "missing.png", width: 4, height: 4, cellSize: 4, cellSpacing: 1, textures: {} };
    const failure = loadTerrainArrayTexture(atlas, "/");
    const rejected = expect(failure.ready).rejects.toThrow("load failed");
    failed(); await rejected; failure.texture.dispose();
    const mismatch = loadTerrainArrayTexture(atlas, "/");
    const invalid = expect(mismatch.ready).rejects.toThrow("descriptor");
    loaded({ width: 3, height: 4 } as HTMLImageElement); await invalid; mismatch.texture.dispose();
    const disposed = loadTerrainArrayTexture(atlas, "/");
    disposed.texture.dispose(); await disposed.ready;
    loaded({ width: 4, height: 4 } as HTMLImageElement);
    expect(disposed.texture.version).toBe(0);
});

test("atlas layers exclude gutters and adjacent colours, preserving bottom-up source orientation", () => {
    const atlas = { image: "test", width: 8, height: 8, cellSize: 4, cellSpacing: 1, textures: {} };
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        pixels.set([x, y, Math.floor(y / 4) * 2 + Math.floor(x / 4), 255], (y * 8 + x) * 4);
    }
    const output = new Uint8Array(4 * 2 * 2 * 4);
    copyTerrainArrayPixels(atlas, pixels, output);
    expect(terrainArrayLayout(atlas)).toEqual({ size: 2, columns: 2, layers: 4 });
    expect(Array.from(output.subarray(0, 16))).toEqual([1, 2, 0, 255, 2, 2, 0, 255, 1, 1, 0, 255, 2, 1, 0, 255]);
    for (let layer = 0; layer < 4; layer++) for (let pixel = 0; pixel < 4; pixel++) expect(output[layer * 16 + pixel * 4 + 2]).toBe(layer);
    expect(() => terrainArrayLayout({ ...atlas, width: 7 })).toThrow();
    expect(() => copyTerrainArrayPixels(atlas, pixels, new Uint8Array(4))).toThrow();
});

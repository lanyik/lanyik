import { DEFAULT_HEX_MAP_OPTIONS, resolveHexMapOptions } from "../../src/HexMapOptions";
import { afterEach, expect, test, vi } from "vitest";
import { Land } from "../../src/enums";
import { copyTerrainArrayPixels, loadTerrainArrayTexture, terrainArrayLayout, terrainAtlasCellIndices } from "../../src/rendering/TerrainArrayTexture";
import { deferred } from "../helpers/deferred";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const atlas = { image: "terrain.png", width: 4, height: 4, cellSize: 4, cellSpacing: 1, textures: {} };

test("surface data preserves low-alpha normal channels byte-for-byte without image decoding", async () => {
    const data = Uint8Array.from([128, 217, 190, 0, 255, 128, 200, 1, 29, 138, 175, 32, 128, 128, 255, 255]);
    const request = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => data.buffer });
    vi.stubGlobal("fetch", request);
    const result = loadTerrainArrayTexture({ ...atlas, surfaceBuffer: "surface.bin" }, "/", 8, undefined, "surface");
    await result.ready;
    expect(request.mock.calls[0][0]).toBe("/surface.bin");
    expect(Array.from(result.texture.image.data!)).toEqual(Array.from(data));
    expect(result.texture.colorSpace).toBe("");
    result.texture.dispose();
});

test("malformed and cancelled surface buffers never upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    const invalid = loadTerrainArrayTexture({ ...atlas, surfaceBuffer: "surface.bin" }, "/", 8, undefined, "surface");
    await expect(invalid.ready).rejects.toThrow("byte length");
    expect(invalid.texture.version).toBe(0);
    invalid.texture.dispose();
    const bytes = deferred<ArrayBuffer>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => bytes.promise }));
    const cancelled = loadTerrainArrayTexture({ ...atlas, surfaceBuffer: "surface.bin" }, "/", 8, undefined, "surface");
    await Promise.resolve();
    cancelled.texture.dispose();
    await expect(cancelled.ready).rejects.toMatchObject({ name: "AbortError" });
    bytes.resolve(new ArrayBuffer(16));
    await Promise.resolve();
    expect(cancelled.texture.version).toBe(0);
});

test("HTTP errors and invalid decoded dimensions reject readiness", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const failure = loadTerrainArrayTexture(atlas, "/", DEFAULT_HEX_MAP_OPTIONS.terrainTextureAnisotropy);
    await expect(failure.ready).rejects.toThrow("HTTP 404");
    failure.texture.dispose();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
    const bitmap = { width: 3, height: 4, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const mismatch = loadTerrainArrayTexture(atlas, "/", DEFAULT_HEX_MAP_OPTIONS.terrainTextureAnisotropy);
    await expect(mismatch.ready).rejects.toThrow("descriptor");
    expect(bitmap.close).toHaveBeenCalledOnce();
    mismatch.texture.dispose();
});

test("session cancellation aborts the request and settles readiness even while decoding is pending", async () => {
    const decoding = deferred<ImageBitmap>();
    const decodeStarted = deferred<void>();
    const fetchImage = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });
    vi.stubGlobal("fetch", fetchImage);
    vi.stubGlobal("createImageBitmap", () => { decodeStarted.resolve(); return decoding.promise; });
    const controller = new AbortController();
    const result = loadTerrainArrayTexture(atlas, "/", DEFAULT_HEX_MAP_OPTIONS.terrainTextureAnisotropy, controller.signal);
    await decodeStarted.promise;
    controller.abort();
    await expect(result.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImage.mock.calls[0][1].signal?.aborted).toBe(true);
    const bitmap = { width: 4, height: 4, close: vi.fn() };
    decoding.resolve(bitmap as unknown as ImageBitmap);
    await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(result.texture.version).toBe(0);
    result.texture.dispose();
});

test("disposing a pending owner rejects readiness and aborts its outstanding request", async () => {
    const fetchImage = vi.fn((_url: string, _options: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchImage);
    const result = loadTerrainArrayTexture(atlas, "/", DEFAULT_HEX_MAP_OPTIONS.terrainTextureAnisotropy);
    result.texture.dispose();
    await expect(result.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImage.mock.calls[0][1].signal?.aborted).toBe(true);
});

test("the complete atlas palette rejects missing, fractional and out-of-bounds mappings", () => {
    const textures = Object.fromEntries(Object.values(Land).map(type => [type, { cellX: 0, cellY: 0 }]));
    expect(terrainAtlasCellIndices({ ...atlas, textures })[Land.land]).toBe(0);
    expect(() => terrainAtlasCellIndices(atlas)).toThrow("sea");
    for (const cell of [{ cellX: -1, cellY: 0 }, { cellX: .5, cellY: 0 }, { cellX: 1, cellY: 0 }, { cellX: 0, cellY: 1 }]) {
        expect(() => terrainAtlasCellIndices({ ...atlas, textures: { ...textures, sand: cell } })).toThrow("sand");
    }
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


test("terrain anisotropy has one public default and rejects non-positive or non-integer requests", () => {
    expect(resolveHexMapOptions({ element: "canvas" }).terrainTextureAnisotropy).toBe(8);
    expect(resolveHexMapOptions({ element: "canvas", terrainTextureAnisotropy: 4 }).terrainTextureAnisotropy).toBe(4);
    for (const value of [0, -1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => resolveHexMapOptions({ element: "canvas", terrainTextureAnisotropy: value }))
            .toThrow("terrainTextureAnisotropy must be a positive safe integer");
    }
});

import { afterEach, expect, test, vi } from "vitest";
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector2 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ActorModels } from "../src/presentation/ActorModels";
import { AssetLoader } from "../src/presentation/AssetLoader";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test("cancelling a partially loaded model set disposes its decoded textures and geometry", async () => {
    const controller = new AbortController(), released: ReturnType<typeof vi.fn>[] = [], images: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(async () => {
        const geometry = new BufferGeometry(), material = new MeshStandardMaterial();
        for (const resource of [geometry, material]) {
            const dispose = vi.fn(); released.push(dispose); resource.addEventListener("dispose", dispose);
        }
        return { scene: new Group().add(new Mesh(geometry, material)) } as never;
    });
    let waiting = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, { signal }: { signal: AbortSignal }) => {
        if (url.endsWith("RiftSpider-normal.png")) {
            waiting = true;
            return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        }
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0), blob: async () => new Blob() };
    }));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
        const close = vi.fn(); images.push(close); return { width: 2, height: 2, close };
    }));
    const loading = ActorModels.load(8, new Vector2(), controller.signal);
    await vi.waitFor(() => expect(waiting).toBe(true));
    expect(images.length).toBeGreaterThan(0); expect(released.length).toBeGreaterThan(0);
    const rejection = expect(loading).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("Closed", "AbortError")); await rejection;
    for (const dispose of [...released, ...images]) expect(dispose).toHaveBeenCalledTimes(1);
});

test("a stalled GLTF decoder does not retain completed assets after cancellation", async () => {
    const controller = new AbortController(), textures: ReturnType<typeof vi.fn>[] = [];
    let finish!: (value: Awaited<ReturnType<GLTFLoader["parseAsync"]>>) => void;
    vi.spyOn(AssetLoader.prototype, "bytes").mockResolvedValue(new ArrayBuffer(0));
    vi.spyOn(AssetLoader.prototype, "texture").mockImplementation(async () => {
        const texture = new Texture(), dispose = vi.fn(); texture.addEventListener("dispose", dispose); textures.push(dispose); return texture;
    });
    vi.spyOn(GLTFLoader.prototype, "parseAsync")
        .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
        .mockImplementation(async () => ({ scene: new Group().add(new Mesh()) }) as never);
    const loading = ActorModels.load(8, new Vector2(), controller.signal);
    await vi.waitFor(() => expect(textures.length).toBeGreaterThan(0));
    const rejection = expect(loading).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("Closed", "AbortError")); await rejection;
    for (const dispose of textures) expect(dispose).toHaveBeenCalledTimes(1);
    const geometry = new BufferGeometry(), material = new MeshStandardMaterial(), released = vi.fn();
    geometry.addEventListener("dispose", released); material.addEventListener("dispose", released);
    finish({ scene: new Group().add(new Mesh(geometry, material)) } as never);
    await Promise.resolve(); expect(released).toHaveBeenCalledTimes(2);
});

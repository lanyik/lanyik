import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, MirroredRepeatWrapping, SRGBColorSpace, NoColorSpace } from "three";
import { Land } from "../enums";
import type { TerrainAtlas } from "../objects/TerrainMesh";

/** Each source cell becomes an isolated layer, including its own complete mip chain. */
export function terrainArrayLayout(atlas: TerrainAtlas): { size: number; columns: number; layers: number } {
    const { width, height, cellSize, cellSpacing } = atlas;
    if (![width, height, cellSize].every(value => Number.isSafeInteger(value) && value > 0)
        || !Number.isSafeInteger(cellSpacing) || cellSpacing < 0 || cellSpacing * 2 >= cellSize
        || width % cellSize !== 0 || height % cellSize !== 0) throw new RangeError("Invalid terrain atlas dimensions");
    return { size: cellSize - cellSpacing * 2, columns: width / cellSize, layers: width / cellSize * (height / cellSize) };
}

export function copyTerrainArrayPixels(atlas: TerrainAtlas, pixels: Uint8ClampedArray, output: Uint8Array): void {
    const { size, columns, layers } = terrainArrayLayout(atlas);
    if (pixels.length !== atlas.width * atlas.height * 4 || output.length !== size * size * layers * 4) {
        throw new RangeError("Terrain atlas pixel dimensions do not match its descriptor");
    }
    for (let layer = 0; layer < layers; layer++) {
        const x = layer % columns * atlas.cellSize + atlas.cellSpacing;
        const y = Math.floor(layer / columns) * atlas.cellSize + atlas.cellSpacing;
        for (let row = 0; row < size; row++) {
            // DataArrayTexture has no image flip: preserve the original bottom-up cell UVs.
            const start = ((y + size - row - 1) * atlas.width + x) * 4;
            output.set(pixels.subarray(start, start + size * 4), (layer * size * size + row * size) * 4);
        }
    }
}

/** Validate the complete material palette before allocating or starting any asset requests. */
export function terrainAtlasCellIndices(atlas: TerrainAtlas): Record<Land, number> {
    const { columns, layers } = terrainArrayLayout(atlas);
    const rows = layers / columns;
    const indices = {} as Record<Land, number>;
    for (const type of Object.values(Land)) {
        const cell = atlas.textures?.[type];
        if (!cell || !Number.isSafeInteger(cell.cellX) || !Number.isSafeInteger(cell.cellY)
            || cell.cellX < 0 || cell.cellX >= columns || cell.cellY < 0 || cell.cellY >= rows) {
            throw new RangeError(`Terrain atlas requires a valid cell for ${type}`);
        }
        indices[type] = cell.cellY * columns + cell.cellX;
    }
    return indices;
}

export function loadTerrainArrayTexture(atlas: TerrainAtlas, baseUrl: string, anisotropy: number, signal?: AbortSignal, channel: "color" | "surface" = "color"): { texture: DataArrayTexture; ready: Promise<void> } {
    const { size, layers } = terrainArrayLayout(atlas);
    const image = channel === "surface" ? atlas.surfaceBuffer : atlas.image;
    if (!image) throw new TypeError("Terrain surface channel requires surfaceBuffer");
    const pixels = new Uint8Array(size * size * layers * 4);
    const texture = new DataArrayTexture(pixels, size, size, layers);
    texture.name = `terrain-${channel}-layers`;
    texture.colorSpace = channel === "color" ? SRGBColorSpace : NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = texture.wrapT = MirroredRepeatWrapping;
    texture.anisotropy = anisotropy;
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    const dispose = () => controller.abort(new DOMException("Terrain atlas disposed", "AbortError"));
    texture.addEventListener("dispose", dispose);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    let rejectAbort: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    const decode = async () => {
        controller.signal.throwIfAborted();
        const response = await fetch(baseUrl + image, { signal: controller.signal });
        if (!response.ok) throw new Error(`Terrain atlas image load failed: ${image} (HTTP ${response.status})`);
        if (channel === "surface") {
            const data = new Uint8Array(await response.arrayBuffer());
            controller.signal.throwIfAborted();
            if (data.length !== pixels.length) throw new RangeError("Terrain surface byte length does not match its descriptor");
            pixels.set(data); texture.needsUpdate = true;
            return;
        }
        const source = await createImageBitmap(await response.blob());
        try {
            controller.signal.throwIfAborted();
            if (source.width !== atlas.width || source.height !== atlas.height) throw new RangeError("Terrain atlas image does not match its descriptor");
            const canvas = document.createElement("canvas");
            canvas.width = atlas.width; canvas.height = atlas.height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("Terrain atlas decoding requires a 2D canvas");
            context.drawImage(source, 0, 0);
            copyTerrainArrayPixels(atlas, context.getImageData(0, 0, atlas.width, atlas.height).data, pixels);
            texture.needsUpdate = true;
        } finally { source.close(); }
    };
    // Bitmap decoding cannot itself be interrupted. Readiness still settles on cancellation,
    // and a late decoder result is closed without uploading it.
    const ready = Promise.race([decode(), aborted]).finally(() => {
        signal?.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", onAbort);
        texture.removeEventListener("dispose", dispose);
    });
    return { texture, ready };
}

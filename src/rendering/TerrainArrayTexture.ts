import { DataArrayTexture, ImageLoader, LinearFilter, LinearMipmapLinearFilter, MirroredRepeatWrapping } from "three";
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

export function loadTerrainArrayTexture(atlas: TerrainAtlas, baseUrl: string): { texture: DataArrayTexture; ready: Promise<void> } {
    const { size, layers } = terrainArrayLayout(atlas);
    const pixels = new Uint8Array(size * size * layers * 4);
    const texture = new DataArrayTexture(pixels, size, size, layers);
    texture.name = "terrain-material-layers";
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = texture.wrapT = MirroredRepeatWrapping;
    texture.anisotropy = 8;
    let disposed = false;
    const ready = new Promise<void>((resolve, reject) => {
        texture.addEventListener("dispose", () => { disposed = true; resolve(); });
        new ImageLoader().setPath(baseUrl).load(atlas.image, source => {
            if (disposed) return;
            try {
                if (source.width !== atlas.width || source.height !== atlas.height) throw new RangeError("Terrain atlas image does not match its descriptor");
                const canvas = document.createElement("canvas");
                canvas.width = atlas.width; canvas.height = atlas.height;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) throw new Error("Terrain atlas decoding requires a 2D canvas");
                context.drawImage(source, 0, 0);
                copyTerrainArrayPixels(atlas, context.getImageData(0, 0, atlas.width, atlas.height).data, pixels);
                texture.needsUpdate = true;
                resolve();
            } catch (error) { reject(error); }
        }, undefined, () => {
            if (!disposed) reject(new Error(`Terrain atlas image load failed: ${atlas.image}`));
        });
    });
    return { texture, ready };
}

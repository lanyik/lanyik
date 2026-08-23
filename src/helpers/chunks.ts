import { Object3D } from "three";

import { Point } from "../interfaces";
import { getHexCenter } from "./helpers";

export const WORLD_CHUNK_SIZE = 12;
export const WORLD_CHUNK_METADATA = "hexWorldChunk";

export type WorldChunkKind = "land" | "water" | "grass";

export interface WorldChunkBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export interface WorldChunkMetadata {
    chunkX: number;
    chunkY: number;
    kind: WorldChunkKind;
    bounds: WorldChunkBounds;
}

export function getWorldChunkKey(x: number, y: number, chunkSize = WORLD_CHUNK_SIZE): string {
    return `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`;
}

export function groupTilesByWorldChunk<T extends Point>(
    tiles: readonly T[],
    chunkSize = WORLD_CHUNK_SIZE
): Map<string, T[]> {
    const chunks = new Map<string, T[]>();
    for (const tile of tiles) {
        const key = getWorldChunkKey(tile.x, tile.y, chunkSize);
        const chunk = chunks.get(key) ?? [];
        chunk.push(tile);
        chunks.set(key, chunk);
    }
    return chunks;
}

export function getWorldChunkBounds(
    tiles: readonly Point[],
    size: number,
    minY: number,
    maxY: number
): WorldChunkBounds {
    if (tiles.length === 0) throw new Error("Cannot compute bounds for an empty world chunk");

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const tile of tiles) {
        const center = getHexCenter(tile.x, tile.y, size);
        minX = Math.min(minX, center.x - size);
        maxX = Math.max(maxX, center.x + size);
        minZ = Math.min(minZ, center.y - size);
        maxZ = Math.max(maxZ, center.y + size);
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function tagWorldChunk(
    object: Object3D,
    chunkKey: string,
    kind: WorldChunkKind,
    bounds: WorldChunkBounds
): void {
    const [chunkX, chunkY] = chunkKey.split(",").map(Number);
    object.userData[WORLD_CHUNK_METADATA] = { chunkX, chunkY, kind, bounds } satisfies WorldChunkMetadata;
}

export function getWorldChunkMetadata(object: Object3D): WorldChunkMetadata | undefined {
    return object.userData[WORLD_CHUNK_METADATA] as WorldChunkMetadata | undefined;
}

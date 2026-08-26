import { Object3D } from "three";

import { Point } from "../interfaces";
import { getHexCenter } from "./helpers";

export const WORLD_CHUNK_SIZE = 12;
export const WORLD_CHUNK_METADATA = "hexWorldChunk";

export type BuiltinWorldChunkKind = "land" | "water" | "grass" | "forest";
export type WorldChunkKind = BuiltinWorldChunkKind | (string & {});
export type WorldChunkLod = 0 | 1 | 2;

export interface WorldChunkBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export interface WorldChunkMetadata {
    id: string;
    key: string;
    chunkX: number;
    chunkY: number;
    kind: WorldChunkKind;
    bounds: WorldChunkBounds;
}

export interface WorldChunkLodDistances {
    near: number;
    far: number;
    vegetation: number;
    hysteresis: number;
}

export const DEFAULT_WORLD_CHUNK_LOD_DISTANCES: Readonly<WorldChunkLodDistances> = Object.freeze({
    near: 900,
    far: 1650,
    vegetation: 1450,
    hysteresis: 120
});

export function getWorldChunkKey(x: number, y: number, chunkSize = WORLD_CHUNK_SIZE): string {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("chunkSize must be a positive integer");
    }
    return `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`;
}

export function groupTilesByWorldChunk<T extends Point>(
    tiles: readonly T[],
    chunkSize = WORLD_CHUNK_SIZE
): Map<string, T[]> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("chunkSize must be a positive integer");
    }
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

export function getWorldChunkOrigin(chunkKey: string, size: number): Point {
    const [chunkX, chunkY] = chunkKey.split(",").map(Number);
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
        throw new TypeError(`invalid world chunk key "${chunkKey}"`);
    }
    return getHexCenter(chunkX * WORLD_CHUNK_SIZE, chunkY * WORLD_CHUNK_SIZE, size);
}

export function localizeWorldChunkBounds(bounds: WorldChunkBounds, origin: Point): WorldChunkBounds {
    return {
        minX: bounds.minX - origin.x,
        maxX: bounds.maxX - origin.x,
        minY: bounds.minY,
        maxY: bounds.maxY,
        minZ: bounds.minZ - origin.y,
        maxZ: bounds.maxZ - origin.y
    };
}

export function tagWorldChunk(
    object: Object3D,
    chunkKey: string,
    kind: WorldChunkKind,
    bounds: WorldChunkBounds,
    id = `${kind}:${chunkKey}`
): void {
    const [chunkX, chunkY] = chunkKey.split(",").map(Number);
    object.userData[WORLD_CHUNK_METADATA] = {
        id,
        key: chunkKey,
        chunkX,
        chunkY,
        kind,
        bounds
    } satisfies WorldChunkMetadata;
}

export function getWorldChunkMetadata(object: Object3D): WorldChunkMetadata | undefined {
    return object.userData[WORLD_CHUNK_METADATA] as WorldChunkMetadata | undefined;
}

//Selects a stable LOD with a dead band around each threshold. The dead band is
//important while orbiting: without it, a chunk sitting on a boundary can be
//rebuilt between two subdivision levels every other frame.
export function resolveWorldChunkLod(
    distance: number,
    kind: WorldChunkKind,
    previous: WorldChunkLod | undefined,
    distances: WorldChunkLodDistances = DEFAULT_WORLD_CHUNK_LOD_DISTANCES
): WorldChunkLod | null {
    const decorative = kind === "grass" || kind === "forest";
    const hiddenBeyond = decorative ? distances.vegetation : Infinity;
    if (distance > hiddenBeyond + (previous === undefined ? 0 : distances.hysteresis)) return null;

    const near = distances.near;
    const far = decorative ? distances.vegetation : distances.far;
    const h = previous === undefined ? 0 : distances.hysteresis;

    if (previous === 0 && distance <= near + h) return 0;
    if (previous === 1) {
        if (distance < near - h) return 0;
        if (distance <= far + h) return 1;
    }
    if (previous === 2 && distance >= far - h) return 2;

    if (distance <= near) return 0;
    if (distance <= far) return 1;
    return decorative ? null : 2;
}

import { MapInfo, Point, TileInfo } from "../interfaces";
import { getNeighbors, Neighbor } from "./neighbors";

export function positiveModulo(value: number, modulus: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
        throw new RangeError("positiveModulo requires a finite value and a positive finite modulus");
    }
    return ((value % modulus) + modulus) % modulus;
}

export function normalizeMapCoordinates(map: MapInfo, x: number, y: number): Point | null {
    if (map.infinite) {
        return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
    }
    if (map.w <= 0 || map.h <= 0) return null;

    let normalizedX = x;
    let normalizedY = y;

    if (map.wrapX) normalizedX = positiveModulo(normalizedX, map.w);
    else if (normalizedX < 0 || normalizedX >= map.w) return null;

    if (map.wrapY) normalizedY = positiveModulo(normalizedY, map.h);
    else if (normalizedY < 0 || normalizedY >= map.h) return null;

    return { x: normalizedX, y: normalizedY };
}

export function getMapTile(map: MapInfo, x: number, y: number): TileInfo | undefined {
    const normalized = normalizeMapCoordinates(map, x, y);
    if (!normalized) return undefined;
    return map.tileAt?.(normalized.x, normalized.y) ?? map.data[normalized.x]?.[normalized.y];
}

export function getMapNeighbors(map: MapInfo, x: number, y: number): Neighbor[] {
    const seen = new Set<string>();
    const neighbors: Neighbor[] = [];

    for (const neighbor of getNeighbors(x, y)) {
        const normalized = normalizeMapCoordinates(map, neighbor.x, neighbor.y);
        if (!normalized) continue;
        const key = `${normalized.x},${normalized.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        neighbors.push({ ...normalized, direction: neighbor.direction });
    }

    return neighbors;
}

//A flat-top offset grid can repeat by a pure horizontal translation only when
//its column count is even: after an odd number of columns the stagger parity is
//inverted and the first/last rows no longer meet. World generation enforces
//this invariant for wrapX maps.
export function assertWrappableMap(map: MapInfo): void {
    if (!Number.isInteger(map.w) || !Number.isInteger(map.h) || map.w <= 0 || map.h <= 0) {
        throw new RangeError("map width and height must be positive integers");
    }
    if (!map.data || typeof map.data !== "object") {
        throw new TypeError("map data must be an object");
    }
    if (map.tileAt !== undefined && typeof map.tileAt !== "function") {
        throw new TypeError("map tileAt must be a function when provided");
    }
    if (map.forEachTile !== undefined && typeof map.forEachTile !== "function") {
        throw new TypeError("map forEachTile must be a function when provided");
    }
    if (map.wrapX !== undefined && typeof map.wrapX !== "boolean") {
        throw new TypeError("wrapX must be a boolean when provided");
    }
    if (map.wrapY !== undefined && typeof map.wrapY !== "boolean") {
        throw new TypeError("wrapY must be a boolean when provided");
    }
    if (map.infinite !== undefined && typeof map.infinite !== "boolean") {
        throw new TypeError("infinite must be a boolean when provided");
    }
    if (map.infinite && (map.wrapX || map.wrapY)) {
        throw new RangeError("infinite maps cannot use finite-axis wrapping");
    }
    if (map.wrapX && map.w % 2 !== 0) {
        throw new RangeError("wrapX requires an even map width");
    }
}

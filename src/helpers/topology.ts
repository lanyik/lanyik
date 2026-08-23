import { MapInfo, Point, TileInfo } from "../interfaces";
import { getNeighbors, Neighbor } from "./neighbors";

export function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

export function normalizeMapCoordinates(map: MapInfo, x: number, y: number): Point | null {
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
    return normalized ? map.data[normalized.x]?.[normalized.y] : undefined;
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
    if (map.wrapX && map.w % 2 !== 0) {
        throw new RangeError("wrapX requires an even map width");
    }
}

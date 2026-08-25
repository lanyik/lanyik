import { MapInfo, Point, TileInfo } from "../interfaces";

export interface MapTileEntry extends Point {
    tile: TileInfo;
}

//Iterates only materialized cells. This matters for sparse streaming worlds:
//their logical extent is unbounded, while resident data stays proportional to
//the camera window. It is also faster than probing every missing cell in a
//partially-populated finite map.
export function forEachMapTile(
    map: MapInfo,
    visit: (tile: TileInfo, x: number, y: number) => void
): void {
    if (map.forEachTile) {
        map.forEachTile(visit);
        return;
    }
    for (const xKey of Object.keys(map.data)) {
        const x = Number(xKey);
        if (!Number.isInteger(x)) continue;
        const column = map.data[x];
        if (!column) continue;
        for (const yKey of Object.keys(column)) {
            const y = Number(yKey);
            const tile = column[y];
            if (!Number.isInteger(y) || !tile) continue;
            visit(tile, x, y);
        }
    }
}

export function getMaterializedMapTiles(map: MapInfo): MapTileEntry[] {
    const result: MapTileEntry[] = [];
    forEachMapTile(map, (tile, x, y) => result.push({ x, y, tile }));
    return result;
}

import { MapInfo, Point } from "../interfaces";
import { getMapNeighbors, getMapTile, normalizeMapCoordinates } from "./topology";

//----------------------------------------------------------------------------------
//Flood-fills outward from (x, y) along hex neighbors up to `range` steps,
//returning every in-bounds, existing tile within that hex distance (the
//origin itself included, at range 0). This is a plain BFS rather than a
//Euclidean-distance circle - hex grids don't have a single-formula "distance"
//in offset coordinates without converting to cube coordinates first, and BFS
//gets the same ring-shaped result for free by construction. Used by
//FogOfWar.recompute() to turn each unit's {x, y, viewRange} into the set of
//tiles it currently reveals.
//----------------------------------------------------------------------------------
export function tilesWithinRange(map: MapInfo, x: number, y: number, range: number): Point[] {
    const origin = normalizeMapCoordinates(map, x, y);
    if (!Number.isFinite(range) || range < 0 || !origin || !getMapTile(map, origin.x, origin.y)) return [];
    const wholeRange = Math.floor(range);

    const visited = new Set<string>([`${origin.x},${origin.y}`]);
    const result: Point[] = [origin];
    let frontier: Point[] = [origin];

    for (let step = 0; step < wholeRange; step++) {
        const next: Point[] = [];
        for (const tile of frontier) {
            for (const n of getMapNeighbors(map, tile.x, tile.y)) {
                const key = `${n.x},${n.y}`;
                if (visited.has(key)) continue;
                visited.add(key);
                //MapInfo.infinite means coordinates are unbounded, not that
                //every coordinate is materialized. Missing cells neither
                //become visible nor bridge disconnected sparse regions.
                if (!getMapTile(map, n.x, n.y)) continue;
                next.push({ x: n.x, y: n.y });
                result.push({ x: n.x, y: n.y });
            }
        }
        frontier = next;
    }

    return result;
}

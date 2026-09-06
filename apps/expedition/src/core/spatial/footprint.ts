import { BUILDINGS, type BuildingId } from "../../content/buildings";
import type { TilePosition } from "../../content/minerals";

export type Rotation = 0 | 1 | 2 | 3 | 4 | 5;
export const tileKey = (tile: TilePosition): string => `${tile.x},${tile.y}`;

export function hexDistance(a: TilePosition, b: TilePosition): number {
    const q = a.x - b.x;
    const r = a.y - Math.ceil(a.x / 2) - b.y + Math.ceil(b.x / 2);
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/** The map uses even-q offset columns; axial rotation also works at negative columns. */
export function buildingFootprint(kind: BuildingId, anchor: TilePosition, rotation: Rotation): readonly TilePosition[] {
    if (!Number.isSafeInteger(anchor.x) || !Number.isSafeInteger(anchor.y)) throw new RangeError("Unsafe building coordinates");
    if (!Number.isInteger(rotation) || rotation < 0 || rotation > 5) throw new RangeError("Building rotation must be 0–5");
    const definition = BUILDINGS[kind];
    if (!definition) throw new TypeError("Unknown building type");
    const anchorR = anchor.y - Math.ceil(anchor.x / 2);
    return Object.freeze(definition.footprint.map(([localQ, localR]) => {
        let q = localQ;
        let r = localR;
        for (let step = 0; step < rotation; step += 1) [q, r] = [-r, q + r];
        const x = anchor.x + q;
        const y = anchorR + r + Math.ceil(x / 2);
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new RangeError("Unsafe building footprint");
        return Object.freeze({ x, y });
    }));
}

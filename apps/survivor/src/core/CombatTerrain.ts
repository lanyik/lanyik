/** Gameplay terrain is injected; isolated combat arenas use OPEN_TERRAIN explicitly. */
export interface CombatTerrain {
    height(x: number, z: number): number;
    /** Normalized first solid contact, or Infinity. Water and foliage are not solid attack cover. */
    traceAttack(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, radius: number): number;
    isClear(x: number, z: number, radius: number): boolean;
    move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean): { readonly x: number; readonly z: number };
    dispose(): void;
}
const openPosition = { x: 0, z: 0 };
export const OPEN_TERRAIN: CombatTerrain = {
    height: () => 0,
    traceAttack: (_sx, sy, _sz, _ex, ey, _ez, radius) => sy <= radius ? 0 : ey <= radius ? (sy - radius) / (sy - ey) : Infinity,
    isClear: () => true,
    move(x, z, dx, dz) { openPosition.x = x + dx; openPosition.z = z + dz; return openPosition; },
    dispose() {}
};

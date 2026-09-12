/** Gameplay terrain is injected; isolated combat arenas use OPEN_TERRAIN explicitly. */
export interface CombatTerrain {
    isClear(x: number, z: number, radius: number): boolean;
    move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean): { readonly x: number; readonly z: number };
    dispose(): void;
}
const openPosition = { x: 0, z: 0 };
export const OPEN_TERRAIN: CombatTerrain = {
    isClear: () => true,
    move(x, z, dx, dz) { openPosition.x = x + dx; openPosition.z = z + dz; return openPosition; },
    dispose() {}
};

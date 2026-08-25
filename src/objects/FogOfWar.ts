import { MapInfo, Point } from "../interfaces";
import { tilesWithinRange } from "../helpers/fog";
import { assertWrappableMap, getMapTile, normalizeMapCoordinates } from "../helpers/topology";

//----------------------------------------------------------------------------------
//Civ-style three-state fog of war:
// - Unseen:    never viewed by any unit - HexMap.setTileFog() replaces the tile
//              with the war-fog texture and hides every feature on it (grass,
//              trees, city, unit).
// - Explored:  viewed at some point in the past, but outside every unit's
//              current view range - terrain/features stay visible, just darker.
// - Visible:   currently inside some unit's view range - rendered normally.
//----------------------------------------------------------------------------------
export enum FogState {
    Unseen = 0,
    Explored = 1,
    Visible = 2
}

export interface FogViewer extends Point {
    viewRange: number;
}

export interface FogChange extends Point {
    state: FogState;
}

//----------------------------------------------------------------------------------
//Framework-agnostic (no three.js/DOM dependency) fog-of-war state tracker - one
//array of per-tile state, recomputed from a list of viewers (units) each time
//someone moves. Deliberately doesn't know about HexMap/Unit/rendering at all;
//GameEngine owns wiring recompute()'s output into HexMap.setTileFog() and each
//Unit's own visibility.
//----------------------------------------------------------------------------------
export class FogOfWar {
    private state: Uint8Array;
    private visible = new Set<number>();
    private lastCandidates = 0;

    constructor(private map: MapInfo) {
        assertWrappableMap(map);
        this.state = new Uint8Array(map.w * map.h); // defaults to 0 = Unseen
    }

    private index(x: number, y: number): number {
        return x * this.map.h + y;
    }

    public getState(x: number, y: number): FogState {
        const normalized = normalizeMapCoordinates(this.map, x, y);
        if (!normalized || !getMapTile(this.map, normalized.x, normalized.y)) return FogState.Unseen;
        return this.state[this.index(normalized.x, normalized.y)] as FogState;
    }

    //Every existing tile, at its current state - used once at startup to sync
    //a renderer whose own default (see HexMap.setTileFog()) doesn't necessarily
    //match this class's all-Unseen initial state.
    public allTiles(): FogChange[] {
        const tiles: FogChange[] = [];
        for (let x = 0; x < this.map.w; x++) {
            for (let y = 0; y < this.map.h; y++) {
                if (!getMapTile(this.map, x, y)) continue;
                tiles.push({ x, y, state: this.state[this.index(x, y)] as FogState });
            }
        }
        return tiles;
    }

    //Recomputes which tiles are currently visible from `viewers` (typically
    //every unit's {x, y, viewRange}) and updates state accordingly: tiles now
    //visible -> Visible; tiles that *were* Visible but no longer are ->
    //Explored (remembered, but dimmed); everything else is untouched (an
    //Unseen tile stays Unseen until it's actually been seen at least once).
    //Returns only the tiles whose state actually changed, so callers can push
    //a cheap incremental update to the renderer instead of touching every tile.
    public recompute(viewers: FogViewer[]): FogChange[] {
        const nowVisible = new Set<number>();
        for (const viewer of viewers) {
            for (const tile of tilesWithinRange(this.map, viewer.x, viewer.y, viewer.viewRange)) {
                nowVisible.add(this.index(tile.x, tile.y));
            }
        }

        const changes: FogChange[] = [];
        for (const idx of this.visible) {
            if (nowVisible.has(idx)) continue;
            this.state[idx] = FogState.Explored;
            changes.push({ x: Math.floor(idx / this.map.h), y: idx % this.map.h, state: FogState.Explored });
        }
        for (const idx of nowVisible) {
            if (this.state[idx] === FogState.Visible) continue;
            this.state[idx] = FogState.Visible;
            changes.push({ x: Math.floor(idx / this.map.h), y: idx % this.map.h, state: FogState.Visible });
        }
        this.lastCandidates = this.visible.size + nowVisible.size;
        this.visible = nowVisible;
        return changes;
    }

    public get lastRecomputeCandidateCount(): number {
        return this.lastCandidates;
    }
}

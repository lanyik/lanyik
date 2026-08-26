import { MapInfo, Point } from "../interfaces";
import { tilesWithinRange } from "../helpers/fog";
import { FogStateStore } from "../helpers/fogStateStore";
import { forEachMapTile } from "../helpers/mapData";
import { assertWrappableMap, normalizeMapCoordinates } from "../helpers/topology";

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
    private readonly state: FogStateStore;
    private visible = new Map<string, Point>();
    private lastCandidates = 0;

    constructor(private map: MapInfo) {
        assertWrappableMap(map);
        this.state = new FogStateStore(map);
    }

    public getState(x: number, y: number): FogState {
        const normalized = normalizeMapCoordinates(this.map, x, y);
        if (!normalized) return FogState.Unseen;
        //Sparse streaming may evict the tile after it was explored. Fog memory
        //belongs to the logical world, not current render/source residency.
        return this.state.get(normalized.x, normalized.y) ?? FogState.Unseen;
    }

    //Every existing tile, at its current state - used once at startup to sync
    //a renderer whose own default (see HexMap.setTileFog()) doesn't necessarily
    //match this class's all-Unseen initial state.
    public allTiles(): FogChange[] {
        const tiles: FogChange[] = [];
        forEachMapTile(this.map, (_tile, x, y) => {
            tiles.push({ x, y, state: this.state.get(x, y) ?? FogState.Unseen });
        });
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
        const nowVisible = new Map<string, Point>();
        for (const viewer of viewers) {
            for (const tile of tilesWithinRange(this.map, viewer.x, viewer.y, viewer.viewRange)) {
                nowVisible.set(`${tile.x},${tile.y}`, tile);
            }
        }

        const changes: FogChange[] = [];
        for (const [key, tile] of this.visible) {
            if (nowVisible.has(key)) continue;
            this.state.set(tile.x, tile.y, FogState.Explored);
            changes.push({ ...tile, state: FogState.Explored });
        }
        for (const tile of nowVisible.values()) {
            if (this.state.get(tile.x, tile.y) === FogState.Visible) continue;
            this.state.set(tile.x, tile.y, FogState.Visible);
            changes.push({ ...tile, state: FogState.Visible });
        }
        this.lastCandidates = this.visible.size + nowVisible.size;
        this.visible = nowVisible;
        return changes;
    }

    public get lastRecomputeCandidateCount(): number {
        return this.lastCandidates;
    }
}

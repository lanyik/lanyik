import { HexMap, HexMapOptions } from "./HexMap";
import { setOptions } from "./helpers/setoptions";
import { Unit } from "./objects/Unit";
import { FogOfWar, FogState, FogViewer } from "./objects/FogOfWar";

import { Point, MapInfo, UnitPlacement, TileInfo } from "./interfaces";
import { Land } from "./enums";

import { PathFinder } from "./helpers/pathfinder";
import { EventEmitter } from "./EventEmitter";
import type { GameEngineEventMap } from "./EventMaps";
import { assertWrappableMap, normalizeMapCoordinates } from "./helpers/topology";
import { forEachMapTile } from "./helpers/mapData";
import { StaticWorldSource } from "./world/WorldSource";
import { Vector3 } from "three";

export interface GameEngineOptions extends HexMapOptions {
    preventCellClick?: boolean;

    //Fog of war (see objects/FogOfWar.ts), default true: every unit reveals
    //tiles within its own viewRange (from its Assets/units/.../info.json);
    //tiles outside every unit's current range fall back to darkened
    //("Explored") if seen before, or the war-fog texture ("Unseen") if not.
    //Set to false to leave every tile permanently Visible, the old behavior.
    fogOfWar?: boolean;
    unitAnimationDistance?: number;
    farUnitUpdateInterval?: number;
}

//----------------------------------------------------------------------------------
//Optional convenience layer on top of HexMap: wires unit selection, click-to-move
//pathfinding and hover route preview. Unlike the old GameEngine, this one does not
//fetch map/unit data itself (no axios dependency) - the caller loads its own JSON
//(see public/index.html) and passes it to init(). This keeps HTTP fetching out of the
//library, while still giving consumers a batteries-included game loop if they want
//it (as opposed to using bare HexMap + Unit + PathFinder directly).
//----------------------------------------------------------------------------------
export class GameEngine extends EventEmitter<GameEngineEventMap> {

    private _map:HexMap;
    private _mapData!:MapInfo;
    private _unitsList:{ [key:string]:Unit } = {};
    private _units:Unit[] = [];
    private _currentUnit:Unit | undefined;
    private _fog:FogOfWar | undefined;
    private initRevision = 0;
    private readonly cameraTarget = new Vector3();
    private readonly farUnitElapsed = new Map<Unit, number>();
    private readonly fogViewers: FogViewer[] = [];

    private options = {
        preventCellClick: true,
        fogOfWar: true,
        unitAnimationDistance: 3000,
        farUnitUpdateInterval: 0.25
    };

    constructor(options:GameEngineOptions) {
        super();
        setOptions(this, options);
        if (!Number.isFinite(this.options.unitAnimationDistance) || this.options.unitAnimationDistance < 0) {
            throw new RangeError("unitAnimationDistance must be a non-negative finite number");
        }
        if (!Number.isFinite(this.options.farUnitUpdateInterval) || this.options.farUnitUpdateInterval <= 0) {
            throw new RangeError("farUnitUpdateInterval must be a positive finite number");
        }
        this._map = new HexMap(options);
        this._map.on("click", payload => this.cellClick(payload));
        this._map.on("hover", payload => this.cellHover(payload));
        this._map.on("surfacechange", () => {
            for (const unit of this._units) unit.refreshSurface();
        });
        this._map.on("frame", ({ dtS }) => {
            const target = this._map.getCameraTarget(this.cameraTarget);
            for (const unit of this._units) {
                unit.alignToWorldReference(target.x, target.z);
                const dx = unit.unit.position.x - target.x;
                const dz = unit.unit.position.z - target.z;
                if (unit.moving || Math.hypot(dx, dz) <= this.options.unitAnimationDistance) {
                    unit.update(dtS);
                    this.farUnitElapsed.delete(unit);
                    continue;
                }
                const elapsed = (this.farUnitElapsed.get(unit) ?? 0) + dtS;
                if (elapsed >= this.options.farUnitUpdateInterval) {
                    unit.update(elapsed);
                    this.farUnitElapsed.set(unit, 0);
                } else {
                    this.farUnitElapsed.set(unit, elapsed);
                }
            }
        });
    }

    public async init(mapData:MapInfo, unitsData:UnitPlacement[] = []):Promise<void> {
        const revision = ++this.initRevision;
        assertWrappableMap(mapData);
        const placements = this.validatePlacements(mapData, unitsData);
        this.clearUnits();
        this._currentUnit = undefined;
        this._fog = undefined;
        this.clearMapUnitMarkers(mapData);
        this._mapData = mapData;
        await this._map.loadWorld({ source: new StaticWorldSource(mapData) });
        if (revision !== this.initRevision) return;

        await this._map.preloadModelAssets(placements.map(unit => unit.type));
        if (revision !== this.initRevision) return;

        const units = placements.map(unitInfo => new Unit({
            ...unitInfo,
            size: this._map.size,
            mapWidth: mapData.w,
            mapHeight: mapData.h,
            wrapX: mapData.wrapX === true,
            wrapY: mapData.wrapY === true,
            surface: this._map.surface,
            modelAssets: this._map.modelAssetCache
        }));
        try {
            await Promise.all(units.map(unit => unit.setUnit()));
        } catch (reason) {
            for (const unit of units) unit.dispose();
            throw reason;
        }
        if (revision !== this.initRevision) {
            for (const unit of units) unit.dispose();
            return;
        }

        for (const unit of units) {
            unit.on("start_move", payload => this.emit("start_move", payload));
            unit.on("end_move", payload => this.emit("end_move", payload));
            //Fog recomputes per cell the unit actually passes through (see
            //Unit's "cell_enter"/viewPosition), NOT on start_move - position
            //jumps to the destination the moment a move starts, so a
            //start_move recompute would reveal the whole route instantly
            //instead of progressively as the unit travels it.
            unit.on("cell_enter", payload => {
                this.emit("cell_enter", payload);
                this.recomputeFog();
            });
            unit.on("end_move", () => this.recomputeFog());
            this._map.add(unit.unit);
            this._unitsList[unit.id] = unit;
            this._units.push(unit);
            this.fogViewers.push({ ...unit.viewPosition, viewRange: unit.viewRange });
            this._mapData.data[unit.position.x][unit.position.y].unit = unit.id;
        }

        if (this.options.fogOfWar) {
            this._fog = new FogOfWar(mapData);
            // FogOfWar itself starts all-Unseen, but HexMap defaults every
            // tile to Visible until told otherwise (see setTileFog()) - push
            // the Unseen state through once so the two actually agree before
            // recomputeFog() reveals whatever's within a unit's view range.
            this._map.setTilesFog(this._fog.allTiles());
            this.recomputeFog();
        }
    }

    private validatePlacements(map: MapInfo, units: readonly UnitPlacement[]): UnitPlacement[] {
        const ids = new Set<string>();
        const occupied = new Set<string>();
        return units.map(placement => {
            if (!placement.id || typeof placement.id !== "string") {
                throw new TypeError("unit id must be a non-empty string");
            }
            if (!placement.type || typeof placement.type !== "string") {
                throw new TypeError(`unit "${placement.id}" type must be a non-empty model path`);
            }
            if (ids.has(placement.id)) throw new Error(`duplicate unit id "${placement.id}"`);
            ids.add(placement.id);

            const normalized = normalizeMapCoordinates(map, placement.x, placement.y);
            if (!normalized || !map.data[normalized.x]?.[normalized.y]) {
                throw new RangeError(`unit "${placement.id}" is outside the map or on a missing tile`);
            }
            const key = `${normalized.x},${normalized.y}`;
            if (occupied.has(key)) throw new Error(`multiple units occupy tile ${key}`);
            occupied.add(key);
            return { ...placement, ...normalized };
        });
    }

    private clearUnits(): void {
        for (const unit of this._units) {
            const tile = this._mapData?.data[unit.position.x]?.[unit.position.y];
            if (tile?.unit === unit.id) delete tile.unit;
            unit.dispose();
        }
        this._unitsList = {};
        this._units = [];
        this.fogViewers.length = 0;
        this.farUnitElapsed.clear();
    }

    private clearMapUnitMarkers(map: MapInfo): void {
        forEachMapTile(map, tile => {
            if (tile.unit) delete tile.unit;
        });
    }

    //Recomputes which tiles are currently visible from every unit's own
    //{x, y, viewRange} (see FogOfWar.recompute()), pushes only the tiles whose
    //state actually changed into HexMap.setTileFog(), and hides/shows each
    //unit's own model - a unit always sees its own tile, so this never hides
    //a unit standing still, only ones that have moved out of view (there's no
    //ownership/faction concept yet, so every unit in _unitsList reveals fog
    //the same way "friendly" units would). Uses viewPosition, not position:
    //during a moveTo() animation position is already the destination, while
    //viewPosition tracks the cell the model is actually passing through.
    private recomputeFog():void {
        if (!this._fog) return;

        const units = this._units;
        for (let index = 0; index < units.length; index += 1) {
            const unit = units[index];
            const position = unit.viewPosition;
            const viewer = this.fogViewers[index] ??= { ...position, viewRange: unit.viewRange };
            viewer.x = position.x;
            viewer.y = position.y;
            viewer.viewRange = unit.viewRange;
        }
        const changes = this._fog.recompute(this.fogViewers);
        this._map.setTilesFog(changes);

        for (const unit of units) {
            unit.unit.visible = this._fog.getState(unit.viewPosition.x, unit.viewPosition.y) === FogState.Visible;
        }
    }

    private cellHover(payload:{x:number,y:number,tile:TileInfo}):void {
        this._map.cleanRoutePath();
        if (this._currentUnit && !this._currentUnit.moving) {
            const path = this.findPath(this._currentUnit.position, payload);
            if (path.length > 0) this._map.drawRoutePath(path);
        }
        this.emit("hover", payload);
    }

    private cellClick({ x, y }:{x:number,y:number}):void {
        const cellCoords:Point = { x, y };
        const unitID = this._mapData.data[x][y].unit;

        if (unitID) {
            if (!this.options.preventCellClick) {
                this.emit("click", cellCoords);
            }
            this._currentUnit = this._unitsList[unitID];
            this.emit("unitClick", cellCoords);
        } else {
            if (this._currentUnit) {
                const path = this.findPath(this._currentUnit.position, cellCoords);
                if (path.length > 0) {
                    const from = this._currentUnit.position;
                    if (this._currentUnit.moveTo(path)) {
                        delete this._mapData.data[from.x][from.y].unit;
                        this._mapData.data[x][y].unit = this._currentUnit.id;
                    }
                }
            }
            this._currentUnit = undefined;
            this.emit("click", cellCoords);
        }
    }

    public get currentUnit():Unit | undefined {
        return this._currentUnit;
    }

    public get map():HexMap {
        return this._map;
    }

    public get fogOfWar():FogOfWar | undefined {
        return this._fog;
    }

    //Terrain restrictions come from the unit's own info.json flags (see
    //Unit.terrain - e.g. the viking boat is coastal-only), not a global table,
    //so each unit type routes over exactly the tiles it may enter. Defaults to
    //the currently selected unit; without any unit every terrain is allowed.
    public findPath(start:Point, stop:Point, unit:Unit | undefined = this._currentUnit):Point[] {
        const restrictions:{ [key in Land]:boolean } = unit ? unit.terrain : {
            sea: true,
            coastal: true,
            land: true,
            sand: true,
            tundra: true,
            snow: true,
            mountain: true
        };

        //Tiles still under war fog (Unseen - never viewed by any unit) are
        //off-limits for routing: the player doesn't know what's there, so the
        //pathfinder must not "know" either. Explored tiles (seen before, now
        //dimmed) stay routable. With fogOfWar disabled there's no fog tracker
        //and no veto - the old behavior.
        const fog = this._fog;
        const pathFinder = new PathFinder(this._mapData, restrictions, (x, y) => {
            if (fog && fog.getState(x, y) === FogState.Unseen) return false;
            if (x === start.x && y === start.y) return true;
            const occupyingUnit = this._mapData.data[x]?.[y]?.unit;
            return !occupyingUnit || occupyingUnit === unit?.id;
        });
        return pathFinder.find(start.x, start.y, stop.x, stop.y);
    }

    public dispose(): void {
        this.initRevision += 1;
        this.clearUnits();
        this._currentUnit = undefined;
        this._fog = undefined;
        this._map.dispose();
        this.removeAllListeners();
    }
}

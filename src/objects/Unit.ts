import { wait } from "../helpers/helpers";
import { setOptions } from "../helpers/setoptions";
import { loadModel } from "../helpers/models";

import { Point } from "../interfaces";

import { getHexCenter } from "../helpers/helpers";
import { AnimationAction, AnimationClip, AnimationMixer, CurvePath, LoopOnce, Object3D, Vector3, LineCurve3 } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Land, UnitActions } from "../enums";
import { EventEmitter } from "../EventEmitter";
import type { WorldSurfaceAnchor } from "../world/WorldSurfaceView";

//----------------------------------------------------------------------------------
//Emits "start_move" when a moveTo() animation begins and "end_move" when the unit
//reaches its destination - consumers subscribe via unit.on("start_move", ...) /
//unit.on("end_move", ...), or GameEngine relays them to its own emitter.
//
//`type` is a model folder path (model.glb + info.json) - the same folder +
//info.json convention as Forest.ts/TerrainMesh's city models (see
//helpers/models.ts), and just as self-sufficient (no hidden prefix joined onto
//it): info.json holds both the model's own offset/rotation/scale fine-tuning
//*and* this unit's gameplay stats (movement/health/actions/etc.), merged into
//`options` in one go. glTF/.glb only - three.js's own docs recommend it over
//FBX, and Blender's exporter handles it well, so there's no reason to carry a
//second loader/format for units specifically.
//----------------------------------------------------------------------------------
export class Unit extends EventEmitter {

    private needAnimate = false;
    private _unit!:Object3D;
    private _action:UnitActions | undefined;
    private animationMixer: AnimationMixer | undefined;
    private animationAction: AnimationAction | undefined;
    private animationClips: AnimationClip[] = [];
    private pathFraction:number = 0;
    private pointsPath!:CurvePath<Vector3>;
    private movementToken = 0;
    //Path currently being animated + the cell the model is nearest to right
    //now. moveTo() sets options.x/y to the *destination* immediately (so game
    //logic like "which tile holds this unit" is stable), which means position
    //is wrong as a fog-of-war viewpoint for the whole duration of the
    //animation - viewPosition below tracks the actual animated location
    //instead, and "cell_enter" fires as it crosses into each new cell.
    private movePath:Point[] | null = null;
    private _viewCell:Point | null = null;
    private alignedCopyX = Number.NaN;
    private alignedCopyY = Number.NaN;
    private alignedTileX = Number.NaN;
    private alignedTileY = Number.NaN;

    private options = {
        animateFrameRate: 50,        //Framerate: how much per second run animate function
        animateSpeed: 1,             //Animate speed: how much seconds spend to move from 1 cell to second cell
        size: 40,                    //Map size to calculate unit position on map
        type: "Assets/units/viking_boat", //Model folder path (model.glb + info.json), same convention as city.model/treeModel
        x: 0,
        y: 0,
        actions: new Array<UnitActions>(),
        id: "new id",
        viewRange: 0, //Hex tiles seen around this unit (see FogOfWar.ts) - overridden by the model's own info.json
        //Terrain the unit may enter, overridden by the model's own info.json
        //(e.g. the viking boat sets coastal only) - default deny, so a unit
        //whose info.json omits a terrain type never routes across it.
        sea: false,
        coastal: false,
        land: false,
        sand: false,
        tundra: false,
        snow: false,
        mountain: false,
        mapWidth: 0,
        mapHeight: 0,
        wrapX: false,
        wrapY: false,
        surface: undefined as WorldSurfaceAnchor | undefined
    };

    constructor(options:object = {}) {
        super();
        //Merge options with default options
        setOptions(this, options);
    }

    public async setUnit():Promise<void> {
        const { scene, animations, info, fixup } = await loadModel(this.options.type);
        //Merge gameplay stats (movement/health/actions/...) from info.json with current options
        setOptions(this, info);

        //Model's own offset/rotation/scale fine-tuning (info.json) applies to a
        //child, not this._unit itself - moveTo()/animation() drive this._unit's
        //position/quaternion directly for path movement, so it must stay a plain
        //placement transform (hex position only), not also carry the asset fixup.
        const model = cloneSkeleton(scene);
        model.applyMatrix4(fixup);
        this.animationClips = animations;
        this.animationMixer = animations.length > 0 ? new AnimationMixer(model) : undefined;

        this._unit = new Object3D();
        this._unit.add(model);

        //Get center of hexagon
        let position:Point = getHexCenter(this.options.x, this.options.y, this.options.size);
        //Set 3D model center to current hexagon
        this._unit.position.set(
            position.x,
            this.options.surface?.getWorldHeight(position.x, position.y) ?? 0,
            position.y
        );
        if (!this.activate(UnitActions.idle) && animations.length > 0) this.playClip(animations[0]);
    }
    //----------------------------------------------------------------------------------------------------------
    //RETURN CURRENT 3D Object
    //----------------------------------------------------------------------------------------------------------
    public get unit() {
        if (!this._unit) throw new Error("Unit.setUnit() must complete before accessing unit");
        return this._unit;
    }

    public get actions() {
        return this.options.actions;
    }

    public get position():Point {
        return { x: this.options.x, y: this.options.y }
    }

    public get id():string {
        return this.options.id;
    }

    public get viewRange():number {
        return this.options.viewRange;
    }

    //Which Land types this unit may enter (its info.json terrain flags) -
    //feeds PathFinder so a route never crosses a tile the unit can't reach.
    public get terrain():{ [key in Land]:boolean } {
        return {
            [Land.sea]: this.options.sea,
            [Land.coastal]: this.options.coastal,
            [Land.land]: this.options.land,
            [Land.sand]: this.options.sand,
            [Land.tundra]: this.options.tundra,
            [Land.snow]: this.options.snow,
            [Land.mountain]: this.options.mountain
        };
    }

    //Where the unit actually is *right now* - the cell nearest the animated
    //model while a moveTo() is in flight, its resting position otherwise. Use
    //this (not position, which jumps to the destination the moment moveTo()
    //is called) as the fog-of-war viewpoint, so tiles reveal as the unit
    //passes them instead of the whole route lighting up at once.
    public get viewPosition():Point {
        return this._viewCell ?? this.position;
    }
    public set position(position:Point) {
        if (this.needAnimate) throw new Error("Cannot set a unit position while it is moving");
        this.options.y = position.y;
        this.options.x = position.x;
        if (this._unit) {
            const center = getHexCenter(position.x, position.y, this.options.size);
            this._unit.position.set(
                center.x,
                this.options.surface?.getWorldHeight(center.x, center.y) ?? 0,
                center.y
            );
        }
    }

    public activate(action:UnitActions): boolean {
        if (!this.options.actions.includes(action)) return false;
        const clip = this.animationClips.find(candidate => candidate.name.toLowerCase() === action.toLowerCase());
        if (!clip) return false;
        this._action = action;
        this.playClip(clip, action === UnitActions.death);
        return true;
    }

    private playClip(clip: AnimationClip, playOnce = false): void {
        if (!this.animationMixer) return;
        const next = this.animationMixer.clipAction(clip);
        if (next === this.animationAction && next.isRunning()) return;
        this.animationAction?.fadeOut(0.15);
        next.reset().fadeIn(0.15);
        if (playOnce) {
            next.setLoop(LoopOnce, 1);
            next.clampWhenFinished = true;
        }
        next.play();
        this.animationAction = next;
    }

    public update(deltaSeconds: number): void {
        if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.animationMixer?.update(deltaSeconds);
    }

    public get moving(): boolean {
        return this.needAnimate;
    }

    public moveTo(path:Point[]): boolean {
        if (this.needAnimate || path.length < 2) return false;

        const route = path.map(point => ({ ...point }));

        //Get last point and save as the canonical logical position.
        this.options.x = route[route.length - 1].x;
        this.options.y = route[route.length - 1].y;

        const pointsPath = new CurvePath<Vector3>();
        const points = createContinuousHexPath(route, this.options.size, {
            mapWidth: this.options.mapWidth,
            mapHeight: this.options.mapHeight,
            wrapX: this.options.wrapX,
            wrapY: this.options.wrapY
        }, this.unit.position, this.options.surface);
        for (let i = 1; i < points.length; i++) {
            pointsPath.add(new LineCurve3(points[i - 1], points[i]));
        }

        this.pointsPath = pointsPath;
        this.movePath = route;
        this._viewCell = route[0];
        this.pathFraction = 0;
        this.needAnimate = true;
        this.activate(UnitActions.walk);
        const token = ++this.movementToken;
        this.emit("start_move", { id: this.id, from: route[0], to: this.position, path: route });
        void this.animation(route.length - 1, token);
        return true;
    }

    private async animation(segmentCount:number, token: number):Promise<void> {
        const frameRate = Number.isFinite(this.options.animateFrameRate) && this.options.animateFrameRate > 0
            ? this.options.animateFrameRate : 50;
        const secondsPerCell = Number.isFinite(this.options.animateSpeed) && this.options.animateSpeed > 0
            ? this.options.animateSpeed : 1;
        const fractionStep = 1 / (segmentCount * secondsPerCell * frameRate);
        const forward = new Vector3(0, 0, 1);

        while (this.needAnimate && token === this.movementToken) {
            this.pathFraction = Math.min(1, this.pathFraction + fractionStep);
            const newPosition = this.pointsPath.getPoint(this.pathFraction);
            newPosition.y = this.options.surface?.getWorldHeight(newPosition.x, newPosition.z) ?? 0;
            const tangent = this.pointsPath.getTangent(this.pathFraction);
            tangent.y = 0;
            tangent.normalize();
            this.unit.position.copy(newPosition);
            if (tangent.lengthSq() > 0) this.unit.quaternion.setFromUnitVectors(forward, tangent);

            if (this.movePath && this._viewCell) {
                const cellIndex = Math.min(
                    this.movePath.length - 1,
                    Math.round(this.pathFraction * (this.movePath.length - 1))
                );
                const cell = this.movePath[cellIndex];
                if (cell && (cell.x !== this._viewCell.x || cell.y !== this._viewCell.y)) {
                    this._viewCell = cell;
                    this.emit("cell_enter", { id: this.id, cell });
                }
            }

            if (this.pathFraction >= 1) break;
            await wait(Math.max(1, Math.floor(1000 / frameRate)));
        }

        if (token !== this.movementToken) return;
        this.pathFraction = 0;
        this.needAnimate = false;
        this.movePath = null;
        this._viewCell = null;
        this.activate(UnitActions.idle);
        this.emit("end_move", { id: this.id, position: this.position });
    }

    public alignToWorldReference(referenceX: number, referenceZ: number): void {
        if (this.needAnimate || !this._unit) return;
        const center = getHexCenter(this.options.x, this.options.y, this.options.size);
        const periodX = this.options.wrapX ? this.options.mapWidth * this.options.size * 1.5 : 0;
        const periodY = this.options.wrapY ? this.options.mapHeight * this.options.size * Math.sqrt(3) : 0;
        const copyX = periodX > 0 ? Math.round((referenceX - center.x) / periodX) : 0;
        const copyY = periodY > 0 ? Math.round((referenceZ - center.y) / periodY) : 0;
        if (copyX === this.alignedCopyX && copyY === this.alignedCopyY
            && this.options.x === this.alignedTileX && this.options.y === this.alignedTileY) return;
        center.x += copyX * periodX;
        center.y += copyY * periodY;
        this._unit.position.set(
            center.x,
            this.options.surface?.getWorldHeight(center.x, center.y) ?? 0,
            center.y
        );
        this.alignedCopyX = copyX;
        this.alignedCopyY = copyY;
        this.alignedTileX = this.options.x;
        this.alignedTileY = this.options.y;
    }

    public refreshSurface(): void {
        if (!this._unit) return;
        this._unit.position.y = this.options.surface?.getWorldHeight(
            this._unit.position.x,
            this._unit.position.z
        ) ?? 0;
    }

    public dispose(): void {
        this.needAnimate = false;
        this.movementToken += 1;
        this.movePath = null;
        this._viewCell = null;
        this._unit?.removeFromParent();
        if (this.animationMixer && this._unit?.children[0]) {
            this.animationMixer.stopAllAction();
            this.animationMixer.uncacheRoot(this._unit.children[0]);
        }
        this.animationMixer = undefined;
        this.animationAction = undefined;
        this.animationClips = [];
        this.removeAllListeners();
    }
}

export interface UnitWorldTopology {
    mapWidth?: number;
    mapHeight?: number;
    wrapX?: boolean;
    wrapY?: boolean;
}

export function createContinuousHexPath(
    path: readonly Point[],
    size: number,
    topology: UnitWorldTopology = {},
    start?: Vector3,
    surface?: WorldSurfaceAnchor
): Vector3[] {
    const periodX = topology.wrapX && topology.mapWidth ? topology.mapWidth * size * 1.5 : 0;
    const periodY = topology.wrapY && topology.mapHeight ? topology.mapHeight * size * Math.sqrt(3) : 0;
    const points: Vector3[] = [];

    for (let index = 0; index < path.length; index++) {
        if (index === 0 && start) {
            const first = start.clone();
            first.y = surface?.getWorldHeight(first.x, first.z) ?? 0;
            points.push(first);
            continue;
        }
        const center = getHexCenter(path[index].x, path[index].y, size);
        const previous = points[index - 1];
        if (previous && periodX > 0) center.x += Math.round((previous.x - center.x) / periodX) * periodX;
        if (previous && periodY > 0) center.y += Math.round((previous.z - center.y) / periodY) * periodY;
        points.push(new Vector3(
            center.x,
            surface?.getWorldHeight(center.x, center.y) ?? 0,
            center.y
        ));
    }
    return points;
}

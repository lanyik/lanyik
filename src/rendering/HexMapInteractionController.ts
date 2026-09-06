import { Camera, Object3D, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { WorldSurfaceView } from "../world/WorldSurfaceView";
import { MapInfo, Point, TileInfo } from "../interfaces";
import { pickTile, screenToSurface } from "../helpers/picking";

export interface HexMapInteractionControllerOptions {
    canvas: HTMLCanvasElement;
    camera: Camera;
    controls: OrbitControls;
    pointer: Object3D;
    size: number;
    map(): MapInfo | undefined;
    surface(): WorldSurfaceView | undefined;
    logicalGround(point: Vector3): void;
    tile(x: number, y: number): TileInfo | undefined;
    select(x: number, y: number): void;
    hover(x: number, y: number, tile: TileInfo): void;
    click(x: number, y: number, tile: TileInfo): void;
}

export interface HexMapInteractionStats {
    readonly disposed: boolean;
    readonly movementKeys: readonly string[];
    readonly hoveredTile: Point | null;
}

// Owns browser input listeners and analytic tile picking. It deliberately has
// no world mutation API: all selections/events are sent back through the host
// callbacks, keeping DOM lifetime separate from HexMap's world lifetime.
export class HexMapInteractionController {
    private readonly movementKeys = new Set<string>();
    private mouseDownAt: Point | undefined;
    private hovered: Point | undefined;
    private addedCanvasTabIndex = false;
    private disposed = false;

    constructor(private readonly options: HexMapInteractionControllerOptions) {
        if (!Number.isFinite(options.size) || options.size <= 0) {
            throw new RangeError("interaction hex size must be positive and finite");
        }
        if (!options.canvas.hasAttribute("tabindex")) {
            options.canvas.tabIndex = 0;
            this.addedCanvasTabIndex = true;
        }
        options.canvas.addEventListener("keydown", this.onKeyDown);
        options.canvas.addEventListener("keyup", this.onKeyUp);
        options.canvas.addEventListener("blur", this.clearMovementKeys);
        options.canvas.addEventListener("mousedown", this.onMouseDown);
        options.canvas.addEventListener("contextmenu", this.onContextMenu);
        window.addEventListener("blur", this.clearMovementKeys);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("mouseup", this.onMouseUp);
    }

    public update(dtSeconds: number): void {
        if (this.disposed || !this.options.controls.enablePan || dtSeconds <= 0 || this.movementKeys.size === 0) return;
        const forwardAmount = Number(this.movementKeys.has("KeyW")) - Number(this.movementKeys.has("KeyS"));
        const rightAmount = Number(this.movementKeys.has("KeyD")) - Number(this.movementKeys.has("KeyA"));
        if (forwardAmount === 0 && rightAmount === 0) return;

        const { camera, controls } = this.options;
        const forward = controls.target.clone().sub(camera.position);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        else forward.normalize();
        const right = new Vector3(-forward.z, 0, forward.x);
        const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
        if (movement.lengthSq() > 1) movement.normalize();

        const viewDistance = camera.position.distanceTo(controls.target);
        const speed = Math.min(900, Math.max(140, viewDistance * 0.9));
        movement.multiplyScalar(speed * dtSeconds);
        camera.position.add(movement);
        controls.target.add(movement);
    }

    public reset(): void {
        this.mouseDownAt = undefined;
        this.hovered = undefined;
        this.movementKeys.clear();
        this.options.pointer.visible = false;
    }

    public get hoveredTile(): Point | null {
        return this.hovered ? { ...this.hovered } : null;
    }

    public get stats(): Readonly<HexMapInteractionStats> {
        return {
            disposed: this.disposed,
            movementKeys: [...this.movementKeys].sort(),
            hoveredTile: this.hoveredTile
        };
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const { canvas } = this.options;
        canvas.removeEventListener("keydown", this.onKeyDown);
        canvas.removeEventListener("keyup", this.onKeyUp);
        canvas.removeEventListener("blur", this.clearMovementKeys);
        canvas.removeEventListener("mousedown", this.onMouseDown);
        canvas.removeEventListener("contextmenu", this.onContextMenu);
        window.removeEventListener("blur", this.clearMovementKeys);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("mouseup", this.onMouseUp);
        if (this.addedCanvasTabIndex && canvas.getAttribute("tabindex") === "0") {
            canvas.removeAttribute("tabindex");
        }
        this.reset();
    }

    private onContextMenu = (event: Event): void => event.preventDefault();

    private onKeyDown = (event: KeyboardEvent): void => {
        if (!this.options.controls.enablePan || !this.isMovementKey(event.code) || this.isTextInput(event.target)
            || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        this.movementKeys.add(event.code);
        event.preventDefault();
    };

    private onKeyUp = (event: KeyboardEvent): void => {
        if (!this.isMovementKey(event.code)) return;
        this.movementKeys.delete(event.code);
        event.preventDefault();
    };

    private clearMovementKeys = (): void => { this.movementKeys.clear(); };

    private onMouseDown = (event: MouseEvent): void => {
        this.options.canvas.focus({ preventScroll: true });
        this.mouseDownAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : undefined;
    };

    private onPointerMove = (event: PointerEvent): void => {
        const picked = this.pick(event.clientX, event.clientY);
        if (!picked) {
            this.clearHover();
            return;
        }
        if (this.hovered?.x === picked.x && this.hovered.y === picked.y) return;
        const tile = this.options.tile(picked.x, picked.y);
        if (!tile) {
            this.clearHover();
            return;
        }
        this.hovered = { x: picked.x, y: picked.y };
        this.options.pointer.visible = true;
        this.options.hover(picked.x, picked.y, tile);
    };

    private onMouseUp = (event: MouseEvent): void => {
        if (event.button !== 0) return;
        const downAt = this.mouseDownAt;
        this.mouseDownAt = undefined;
        if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) return;
        const picked = this.pick(event.clientX, event.clientY);
        if (!picked) return;
        const tile = this.options.tile(picked.x, picked.y);
        if (!tile) return;
        this.options.select(picked.x, picked.y);
        this.options.click(picked.x, picked.y, tile);
    };

    public pick(clientX: number, clientY: number) {
        const surface = this.options.surface();
        if (!surface) return null;
        const ground = screenToSurface(clientX, clientY, this.options.canvas, this.options.camera,
            surface, this.options.logicalGround);
        if (!ground) return null;
        const map = this.options.map();
        return pickTile(
            ground,
            this.options.size,
            map?.infinite ? undefined : map?.w,
            map?.infinite ? undefined : map?.h,
            map?.wrapX,
            map?.wrapY
        );
    }

    private clearHover(): void {
        this.options.pointer.visible = false;
        this.hovered = undefined;
    }

    private isMovementKey(code: string): boolean {
        return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
    }

    private isTextInput(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        return target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement
            || target.isContentEditable;
    }
}

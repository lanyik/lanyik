import { Camera, Object3D, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { SurfacePickResult } from "../world/semantic/SurfacePickingService";
import { surfaceToWorld } from "../world/semantic/SurfaceLattice";

export interface SurfaceHexMapInteractionControllerOptions {
    readonly canvas: HTMLCanvasElement;
    readonly camera: Camera;
    readonly controls: OrbitControls;
    readonly pointer: Object3D;
    readonly hexSize: number;
    readonly heightScale: number;
    readonly pick: (clientX: number, clientY: number) => Promise<Readonly<SurfacePickResult> | undefined>;
    readonly hover: (result: Readonly<SurfacePickResult>) => void;
    readonly click: (result: Readonly<SurfacePickResult>) => void;
    readonly error: (error: Error) => void;
}

interface ClientPoint {
    readonly x: number;
    readonly y: number;
}

function asError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

export class SurfaceHexMapInteractionController {
    private readonly movementKeys = new Set<string>();
    private mouseDownAt: ClientPoint | undefined;
    private hovered: Readonly<{ x: number; y: number }> | undefined;
    private pendingHover: ClientPoint | undefined;
    private hoverFrame: number | undefined;
    private pickGeneration = 0;
    private readonly addedCanvasTabIndex: boolean;
    private disposed = false;

    constructor(private readonly options: SurfaceHexMapInteractionControllerOptions) {
        if (!options || !(options.canvas instanceof HTMLCanvasElement)
            || !Number.isFinite(options.hexSize) || options.hexSize <= 0
            || !Number.isFinite(options.heightScale) || options.heightScale <= 0) {
            throw new TypeError("surface interaction options are invalid");
        }
        this.addedCanvasTabIndex = !options.canvas.hasAttribute("tabindex");
        if (this.addedCanvasTabIndex) options.canvas.tabIndex = 0;
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
        if (this.disposed || dtSeconds <= 0 || this.movementKeys.size === 0) return;
        const forwardAmount = Number(this.movementKeys.has("KeyW")) - Number(this.movementKeys.has("KeyS"));
        const rightAmount = Number(this.movementKeys.has("KeyD")) - Number(this.movementKeys.has("KeyA"));
        if (forwardAmount === 0 && rightAmount === 0) return;

        const { camera, controls, hexSize } = this.options;
        const forward = controls.target.clone().sub(camera.position);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        else forward.normalize();
        const right = new Vector3(-forward.z, 0, forward.x);
        const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
        if (movement.lengthSq() > 1) movement.normalize();

        const viewDistance = camera.position.distanceTo(controls.target);
        const speed = Math.min(hexSize * 120, Math.max(hexSize * 8, viewDistance * 0.9));
        movement.multiplyScalar(speed * dtSeconds);
        camera.position.add(movement);
        controls.target.add(movement);
    }

    public reset(): void {
        this.pickGeneration += 1;
        this.mouseDownAt = undefined;
        this.pendingHover = undefined;
        this.hovered = undefined;
        this.movementKeys.clear();
        this.options.pointer.visible = false;
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
        if (this.hoverFrame !== undefined) cancelAnimationFrame(this.hoverFrame);
        if (this.addedCanvasTabIndex && canvas.getAttribute("tabindex") === "0") {
            canvas.removeAttribute("tabindex");
        }
        this.reset();
    }

    private readonly onContextMenu = (event: Event): void => event.preventDefault();

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (!this.isMovementKey(event.code)) return;
        this.movementKeys.add(event.code);
        event.preventDefault();
    };

    private readonly onKeyUp = (event: KeyboardEvent): void => {
        if (!this.isMovementKey(event.code)) return;
        this.movementKeys.delete(event.code);
        event.preventDefault();
    };

    private readonly clearMovementKeys = (): void => { this.movementKeys.clear(); };

    private readonly onMouseDown = (event: MouseEvent): void => {
        this.options.canvas.focus({ preventScroll: true });
        this.mouseDownAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : undefined;
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        if (!this.contains(event.clientX, event.clientY)) {
            this.clearHover();
            return;
        }
        this.pendingHover = { x: event.clientX, y: event.clientY };
        if (this.hoverFrame !== undefined) return;
        this.hoverFrame = requestAnimationFrame(() => {
            this.hoverFrame = undefined;
            const point = this.pendingHover;
            this.pendingHover = undefined;
            if (point) void this.publishHover(point);
        });
    };

    private readonly onMouseUp = (event: MouseEvent): void => {
        if (event.button !== 0) return;
        const downAt = this.mouseDownAt;
        this.mouseDownAt = undefined;
        if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) return;
        void this.publishClick({ x: event.clientX, y: event.clientY });
    };

    private async publishHover(point: ClientPoint): Promise<void> {
        const generation = ++this.pickGeneration;
        try {
            const result = await this.options.pick(point.x, point.y);
            if (this.disposed || generation !== this.pickGeneration) return;
            if (!result) {
                this.clearHover();
                return;
            }
            this.positionPointer(result);
            if (this.hovered?.x === result.x && this.hovered.y === result.y) return;
            this.hovered = Object.freeze({ x: result.x, y: result.y });
            this.options.hover(result);
        } catch (reason) {
            if (!this.disposed && generation === this.pickGeneration) this.options.error(asError(reason));
        }
    }

    private async publishClick(point: ClientPoint): Promise<void> {
        try {
            const result = await this.options.pick(point.x, point.y);
            if (this.disposed || !result) return;
            this.positionPointer(result);
            this.options.click(result);
        } catch (reason) {
            if (!this.disposed) this.options.error(asError(reason));
        }
    }

    private positionPointer(result: Readonly<SurfacePickResult>): void {
        const center = surfaceToWorld(result.x, result.y, this.options.hexSize);
        this.options.pointer.position.set(
            center.x,
            result.height * this.options.heightScale + this.options.hexSize * 0.08,
            center.z
        );
        this.options.pointer.visible = true;
    }

    private clearHover(): void {
        this.pickGeneration += 1;
        this.hovered = undefined;
        this.options.pointer.visible = false;
    }

    private contains(clientX: number, clientY: number): boolean {
        const rect = this.options.canvas.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right
            && clientY >= rect.top && clientY <= rect.bottom;
    }

    private isMovementKey(code: string): boolean {
        return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
    }
}

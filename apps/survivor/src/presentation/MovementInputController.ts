import { Vector3, type Camera } from "three";
import type { MovementInput } from "../core/CombatSimulation";

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

/** Window-level key ownership keeps movement stable when HUD buttons receive focus. */
export class MovementInputController {
    private readonly pressed = new Set<string>();
    private readonly forward = new Vector3();
    private focused = document.hasFocus();
    private enabled = false;

    constructor(private readonly canvas: HTMLCanvasElement) {
        window.addEventListener("keydown", this.keyDown);
        window.addEventListener("keyup", this.keyUp);
        window.addEventListener("blur", this.windowBlur);
        window.addEventListener("focus", this.windowFocus);
        canvas.addEventListener("pointerdown", this.focusCanvas);
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) this.clear();
    }

    public read(camera: Camera): MovementInput {
        camera.getWorldDirection(this.forward);
        const planarLength = Math.hypot(this.forward.x, this.forward.z);
        if (!this.enabled || !this.focused || document.hidden || planarLength <= 1e-9) {
            return { x: 0, z: 0, active: false };
        }
        const forward = Number(this.pressed.has("KeyW")) - Number(this.pressed.has("KeyS"));
        const right = Number(this.pressed.has("KeyD")) - Number(this.pressed.has("KeyA"));
        const active = forward !== 0 || right !== 0;
        return {
            x: (this.forward.x * forward - this.forward.z * right) / planarLength,
            z: (this.forward.z * forward + this.forward.x * right) / planarLength,
            active
        };
    }

    public clear = (): void => { this.pressed.clear(); };

    public dispose(): void {
        this.clear();
        window.removeEventListener("keydown", this.keyDown);
        window.removeEventListener("keyup", this.keyUp);
        window.removeEventListener("blur", this.windowBlur);
        window.removeEventListener("focus", this.windowFocus);
        this.canvas.removeEventListener("pointerdown", this.focusCanvas);
    }

    private readonly focusCanvas = (): void => { this.canvas.focus({ preventScroll: true }); };
    private readonly windowBlur = (): void => { this.focused = false; this.clear(); };
    private readonly windowFocus = (): void => { this.focused = true; };
    private readonly keyDown = (event: KeyboardEvent): void => {
        if (!this.enabled || !MOVEMENT_KEYS.has(event.code) || event.isComposing
            || event.ctrlKey || event.metaKey || event.altKey || this.isTextInput(event.target)) return;
        this.pressed.add(event.code);
        event.preventDefault();
    };
    private readonly keyUp = (event: KeyboardEvent): void => {
        if (!MOVEMENT_KEYS.has(event.code)) return;
        this.pressed.delete(event.code);
        event.preventDefault();
    };
    private isTextInput(target: EventTarget | null): boolean {
        return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
    }
}

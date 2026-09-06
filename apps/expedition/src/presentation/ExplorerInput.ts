import { Vector3, type Camera } from "three";
import type { MovementInput } from "../core/exploration/Explorer";

/** Canvas owns manual walking; window key-up/blur prevents held keys surviving UI focus changes. */
export class ExplorerInput {
    private readonly keys = new Set<string>();
    private readonly forward = new Vector3();
    private enabled = false;
    private focused = document.hasFocus();
    constructor(private readonly canvas: HTMLCanvasElement) {
        canvas.addEventListener("keydown", this.keyDown);
        canvas.addEventListener("blur", this.clear);
        window.addEventListener("keyup", this.keyUp);
        window.addEventListener("blur", this.windowBlur);
        window.addEventListener("focus", this.windowFocus);
    }
    public setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.clear(); }
    public read(camera: Camera): MovementInput {
        camera.getWorldDirection(this.forward);
        const length = Math.hypot(this.forward.x, this.forward.z);
        const forward = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
        const right = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
        return { x: (this.forward.x * forward - this.forward.z * right) / length,
            z: (this.forward.z * forward + this.forward.x * right) / length,
            sprint: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"), active: this.enabled && this.focused && !document.hidden };
    }
    public clear = (): void => { this.keys.clear(); };
    public dispose(): void {
        this.clear();
        this.canvas.removeEventListener("keydown", this.keyDown);
        this.canvas.removeEventListener("blur", this.clear);
        window.removeEventListener("keyup", this.keyUp);
        window.removeEventListener("blur", this.windowBlur);
        window.removeEventListener("focus", this.windowFocus);
    }
    private windowBlur = (): void => { this.focused = false; this.clear(); };
    private windowFocus = (): void => { this.focused = true; };
    private keyDown = (event: KeyboardEvent): void => {
        if (!this.enabled || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        if (!["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) return;
        this.keys.add(event.code);
        event.preventDefault();
    };
    private keyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
}

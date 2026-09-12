import type { CombatRenderState, MovementInput } from "../core/CombatState";
import type { WorkerActivitySnapshot } from "three-hex-map";

export interface CombatStart {
    readonly x: number;
    readonly z: number;
}

export interface CombatView {
    readonly workerActivity: readonly WorkerActivitySnapshot[];
    load(seed: string): Promise<CombatStart>;
    /** Clear the previous run before loading or creating its replacement simulation. */
    reset(): void;
    readMovement(): MovementInput;
    render(state: CombatRenderState, alpha: number, timestampMs: number): void;
    clearMovement(): void;
    dispose(): Promise<void>;
}

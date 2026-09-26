import type { CombatRenderState, MovementInput } from "../core/CombatState";
import type { WorkerActivitySnapshot } from "three-hex-map";
import type { WorldLocation } from "../core/Homestead";

export interface CombatStart {
    readonly x: number;
    readonly z: number;
}

export interface CombatView {
    readonly workerActivity: readonly WorkerActivitySnapshot[];
    load(seed: string, position?: CombatStart, location?: WorldLocation): Promise<CombatStart>;
    /** Clear the previous run before loading or creating its replacement simulation. */
    reset(): void;
    readMovement(): MovementInput;
    render(state: CombatRenderState, alpha: number, timestampMs: number): void;
    clearMovement(): void;
    /** Presentation may finish a terminal death pose after the simulation clock stops. */
    setPresentationActive(active: boolean): void;
    dispose(): Promise<void>;
}

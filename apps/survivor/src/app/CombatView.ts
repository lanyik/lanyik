import type { CombatRenderState, MovementInput } from "../core/CombatState";

export interface CombatStart {
    readonly x: number;
    readonly z: number;
}

export interface CombatView {
    load(seed: string): Promise<CombatStart>;
    readMovement(): MovementInput;
    render(state: CombatRenderState, alpha: number, timestampMs: number): void;
    clearMovement(): void;
    dispose(): Promise<void>;
}

import type { Land } from "three-hex-map";

export interface WorldSelection {
    readonly x: number;
    readonly y: number;
    readonly terrain: Land;
    readonly modifiers: readonly string[];
}

export interface WorldView {
    load(seed: string): Promise<void>;
    dispose(): Promise<void>;
}

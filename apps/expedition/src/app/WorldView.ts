import type { Land } from "three-hex-map";
import type { MineralNode, TilePosition } from "../content/minerals";
import type { LandingSurvey } from "../scenarios/landingSurvey";

export interface WorldSelection {
    readonly x: number;
    readonly y: number;
    readonly terrain: Land;
    readonly modifiers: readonly string[];
    readonly mineral?: MineralNode;
}

export interface WorldView {
    load(seed: string): Promise<LandingSurvey>;
    focus(position: TilePosition): void;
    dispose(): Promise<void>;
}

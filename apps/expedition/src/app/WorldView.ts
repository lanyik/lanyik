import type { Land } from "three-hex-map";
import type { MineralNode, TilePosition } from "../content/minerals";
import type { LandingSurvey } from "../scenarios/landingSurvey";
import type { ConstructionWorld, IndustrySnapshot, Placement } from "../core/construction/Industry";
import type { ExplorerSnapshot, GroundPoint, MovementInput } from "../core/exploration/Explorer";

export interface WorldSelection {
    readonly x: number;
    readonly y: number;
    readonly terrain: Land;
    readonly modifiers: readonly string[];
    readonly mineral?: MineralNode;
}

export interface WorldView extends ConstructionWorld {
    load(seed: string): Promise<LandingSurvey>;
    focus(position: TilePosition): void;
    showIndustry(state: IndustrySnapshot): void;
    showPlacement(placement: Placement | undefined): void;
    readMovement(): MovementInput;
    clearMovement(): void;
    showExplorer(state: ExplorerSnapshot | undefined, point?: GroundPoint): void;
    dispose(): Promise<void>;
}

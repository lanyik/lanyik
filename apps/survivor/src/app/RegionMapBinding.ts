import type { CombatSnapshot } from "../core/CombatState";

/** Presentation lifetime; terrain ownership stays with the world adapter. */
export interface RegionMapBinding {
    update(combat: CombatSnapshot): void;
    setExpanded(expanded: boolean): void;
    dispose(): void;
}
export type AttachRegionMap = (canvas: HTMLCanvasElement) => RegionMapBinding;

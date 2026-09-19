import type { CombatSnapshot } from "../core/CombatState";
import type { RegionInfo } from "../core/RegionalWorld";

export interface MapDestination { readonly x: number; readonly z: number; readonly region: RegionInfo }
export interface RegionMapControls {
    onExpandedChange(expanded: boolean): void;
    onDestinationChange(destination: MapDestination | undefined): void;
    onNavigate(destination: MapDestination): void;
}

/** Presentation lifetime; terrain ownership stays with the world adapter. */
export interface RegionMapBinding {
    update(combat: CombatSnapshot): void;
    setExpanded(expanded: boolean): void;
    recenter(): void;
    navigate(): void;
    dispose(): void;
}
export type AttachRegionMap = (canvas: HTMLCanvasElement, controls: RegionMapControls) => RegionMapBinding;

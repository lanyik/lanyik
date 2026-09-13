import type { Point, TileInfo } from "./interfaces";
import type { WebGlContextStats } from "./rendering/HexMapRendererHost";
import type { WorldSurfaceView } from "./world/WorldSurfaceView";

export interface HexMapTileEvent extends Point {
    tile: TileInfo;
}

export interface HexMapFrameEvent {
    t: number;
    dtS: number;
    cpuFrameMs: number | undefined;
    gpuFrameMs: number | undefined;
}

export interface HexMapFrameStartEvent { readonly t: number; readonly dtS: number }
/** Current main-loop time; GPU measurements arrive asynchronously from earlier draws. */
export interface HexMapFrameEndEvent extends HexMapFrameEvent {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly cpuFrameMs: number;
    readonly frameTaskMs: number;
    readonly gpuSupported: boolean;
    readonly gpuSampleAgeMs: number | undefined;
}

export interface HexMapSurfaceChangeEvent {
    revision: number;
    surface: WorldSurfaceView;
}

export interface UnitStartMoveEvent {
    id: string;
    from: Point;
    to: Point;
    path: readonly Point[];
}

export interface UnitCellEnterEvent {
    id: string;
    cell: Point;
}

export interface UnitEndMoveEvent {
    id: string;
    position: Point;
}

export interface HexMapEventMap {
    loadstart: void;
    load: void;
    error: Error;
    frame: HexMapFrameEvent;
    beforeframe: HexMapFrameStartEvent;
    afterframe: HexMapFrameEndEvent;
    contextlost: Readonly<WebGlContextStats>;
    contextrestored: Readonly<WebGlContextStats>;
    surfacechange: HexMapSurfaceChangeEvent;
    click: HexMapTileEvent;
    hover: HexMapTileEvent;
}

export interface UnitEventMap {
    start_move: UnitStartMoveEvent;
    cell_enter: UnitCellEnterEvent;
    end_move: UnitEndMoveEvent;
}

export interface GameEngineEventMap extends UnitEventMap {
    hover: HexMapTileEvent;
    click: Point;
    unitClick: Point;
}

export type HexMapEventName = keyof HexMapEventMap;
export type UnitEventName = keyof UnitEventMap;
export type GameEngineEventName = keyof GameEngineEventMap;

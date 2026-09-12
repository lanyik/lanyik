import type { CombatCommand } from "../core/CombatCommand";
import type { CombatNotice, CombatSnapshot, MovementInput } from "../core/CombatState";
import type { RenderPacket } from "./RenderFrame";
import type { WorkerActivitySnapshot } from "three-hex-map";
import { GAME_CONFIG, MAX_CATCH_UP_TICKS } from "../core/GameConfig";

export const MAX_STEP_BATCH = MAX_CATCH_UP_TICKS;
export const MAX_COMMAND_BATCH = GAME_CONFIG.workers.maxCommands;
export const WORKER_TIMEOUT_MS = GAME_CONFIG.workers.timeoutMs;

export interface CombatAdvance {
    readonly steps: number;
    readonly input: MovementInput;
    readonly commands: readonly CombatCommand[];
}
export interface CombatWorkerStats {
    readonly steps: number;
    readonly simulationMs: number;
    readonly queries: readonly WorkerActivitySnapshot[];
    readonly queryWorkers: number;
    readonly parallelBatches: number;
    readonly localBatches: number;
    readonly batchMs: number;
    readonly executeMs: number;
    readonly queryWaitMs: number;
    readonly frameBytes: number;
}
export interface CombatUpdate {
    readonly tick: number;
    readonly gameOver: boolean;
    readonly render: RenderPacket;
    readonly snapshot?: CombatSnapshot;
    readonly notices: readonly CombatNotice[];
    readonly stats: CombatWorkerStats;
}
export type CombatRequest =
    | { readonly type: "init"; readonly id: number; readonly seed: string; readonly start: { readonly x: number; readonly z: number }; readonly ports: MessagePort[] }
    | { readonly type: "advance"; readonly id: number; readonly batch: CombatAdvance; readonly recycle?: ArrayBuffer };
export type CombatResponse =
    | { readonly type: "state"; readonly id: number; readonly update: CombatUpdate }
    | { readonly type: "error"; readonly id: number; readonly message: string };

export interface QueryRequest { readonly id: number; readonly begin: number; readonly end: number; readonly buffer: ArrayBuffer }
export type QueryResponse = { readonly id: number; readonly buffer: ArrayBuffer } | { readonly id: number; readonly error: string };

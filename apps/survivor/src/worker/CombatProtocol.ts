import type { CombatCommand } from "../core/CombatCommand";
import type { CombatNotice, CombatSnapshot, MovementInput } from "../core/CombatState";
import type { RenderPacket } from "./RenderFrame";
import type { WorkerActivitySnapshot } from "three-hex-map";

export const MAX_STEP_BATCH = 13;
export const MAX_COMMAND_BATCH = 64;
export const WORKER_TIMEOUT_MS = 15_000;

export interface CombatAdvance {
    readonly steps: number;
    readonly input: MovementInput;
    readonly commands: readonly CombatCommand[];
}
export interface CombatWorkerStats {
    readonly queries: readonly WorkerActivitySnapshot[];
    readonly queryWorkers: number;
    readonly parallelBatches: number;
    readonly localBatches: number;
    readonly batchMs: number;
    readonly executeMs: number;
    readonly queryWaitMs: number;
    readonly deferred: { readonly pending: number; readonly ready: number; readonly committed: number; readonly discarded: number; readonly rejected: number };
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

import type { CombatAdvance, CombatUpdate, CombatWorkerStats } from "../worker/CombatProtocol";
import type { WorkerActivitySnapshot } from "three-hex-map";

export interface CombatTransport {
    start(seed: string, start: { readonly x: number; readonly z: number }): Promise<CombatUpdate>;
    advance(batch: CombatAdvance): Promise<CombatUpdate>;
    dispose(): void;
    readonly stats: Readonly<{ workers: number; pending: number; completed: number; roundTripMs: number; receiveMs: number; simulation?: CombatWorkerStats; activity?: WorkerActivitySnapshot }>;
}
export type CombatTransportFactory = (onFailure: (error: Error) => void) => CombatTransport;

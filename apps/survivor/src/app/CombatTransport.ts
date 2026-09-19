import type { CombatAdvance, CombatUpdate, CombatWorkerStats } from "../worker/CombatProtocol";
import type { WorkerActivitySnapshot } from "three-hex-map";
import type { CharacterCheckpoint } from "../core/CharacterCheckpoint";
import type { WorldLocation } from "../core/Homestead";

export interface CombatTransport {
    start(seed: string, start: { readonly x: number; readonly z: number }, checkpoint?: CharacterCheckpoint, location?: WorldLocation): Promise<CombatUpdate>;
    advance(batch: CombatAdvance): Promise<CombatUpdate>;
    dispose(): void;
    readonly stats: Readonly<{ workers: number; pending: number; completed: number; roundTripMs: number; receiveMs: number; simulation?: CombatWorkerStats; activity?: WorkerActivitySnapshot }>;
}
export type CombatTransportFactory = (onFailure: (error: Error) => void) => CombatTransport;

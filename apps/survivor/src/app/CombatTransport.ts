import type { CombatAdvance, CombatUpdate, CombatWorkerStats } from "../worker/CombatProtocol";

export interface CombatTransport {
    start(seed: string, start: { readonly x: number; readonly z: number }): Promise<CombatUpdate>;
    advance(batch: CombatAdvance): Promise<CombatUpdate>;
    dispose(): void;
    readonly stats: Readonly<{ workers: number; pending: number; completed: number; roundTripMs: number; simulation?: CombatWorkerStats }>;
}
export type CombatTransportFactory = (onFailure: (error: Error) => void) => CombatTransport;

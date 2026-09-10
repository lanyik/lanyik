import type { CombatTransport } from "../../src/app/CombatTransport";
import { CombatSimulation } from "../../src/core/CombatSimulation";
import { CombatWorkerHost } from "../../src/worker/CombatWorkerHost";
import type { CombatAdvance, CombatRequest, CombatUpdate } from "../../src/worker/CombatProtocol";

/** Unit-test transport: exercise the real protocol and transfer ownership without browser globals. */
export class LoopbackCombatTransport implements CombatTransport {
    public simulation!: CombatSimulation;
    public closed = false;
    private sequence = 0;
    private currentBuffer: ArrayBuffer | undefined;
    private recycle: ArrayBuffer | undefined;
    private pending: { resolve: (update: CombatUpdate) => void; reject: (reason: Error) => void } | undefined;
    private readonly host: CombatWorkerHost;
    constructor() {
        this.host = new CombatWorkerHost((message, transfers) => {
            const reply = structuredClone(message, { transfer: transfers });
            const pending = this.pending!; this.pending = undefined;
            if (reply.type === "error") pending.reject(new Error(reply.message));
            else { this.recycle = this.currentBuffer; this.currentBuffer = reply.update.render.buffer; pending.resolve(reply.update); }
        }, (seed, start) => this.simulation = new CombatSimulation(seed, start));
    }
    public get stats() { return { workers: 0, pending: Number(Boolean(this.pending)), completed: this.sequence, roundTripMs: 0, receiveMs: 0 }; }
    public start(seed: string, start: { x: number; z: number }) { return this.send({ type: "init", id: ++this.sequence, seed, start, ports: [] }); }
    public advance(batch: CombatAdvance) {
        const recycle = this.recycle; this.recycle = undefined;
        return this.send({ type: "advance", id: ++this.sequence, batch, recycle });
    }
    private send(request: CombatRequest): Promise<CombatUpdate> {
        const cloned = structuredClone(request, { transfer: request.type === "advance" && request.recycle ? [request.recycle] : [] });
        return new Promise((resolve, reject) => { this.pending = { resolve, reject }; void this.host.receive(cloned); });
    }
    public dispose(): void { this.closed = true; this.host.dispose(); this.pending?.reject(new Error("Closed")); this.pending = undefined; }
}

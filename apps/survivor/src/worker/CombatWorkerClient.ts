import type { CombatTransport } from "../app/CombatTransport";
import { TaskActivity } from "./TaskActivity";
import { WORKER_TIMEOUT_MS, type CombatAdvance, type CombatRequest, type CombatResponse, type CombatUpdate, type CombatWorkerStats } from "./CombatProtocol";

/** Main-thread owner of every combat Worker, including query workers connected by MessagePorts. */
export class CombatWorkerClient implements CombatTransport {
    private readonly activity = new TaskActivity(0);
    private authority: Worker | undefined;
    private readonly workers: Worker[] = [];
    private pending: { id: number; resolve: (update: CombatUpdate) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
    private sequence = 0;
    private currentBuffer: ArrayBuffer | undefined;
    private recycle: ArrayBuffer | undefined;
    private closed = false;
    private simulationStats: CombatWorkerStats | undefined;
    private receiveMs = 0;

    constructor(private readonly queryWorkers: number, private readonly onFailure: (error: Error) => void) {
        if (!Number.isInteger(queryWorkers) || queryWorkers < 0 || queryWorkers > 2) throw new Error("Invalid collision Worker count");
    }
    public get stats() {
        const activity = this.activity.snapshot;
        return Object.freeze({ workers: this.workers.length, pending: Number(Boolean(this.pending)),
            completed: activity.completed, roundTripMs: activity.lastTaskMs, receiveMs: this.receiveMs, simulation: this.simulationStats,
            activity: this.authority ? activity : undefined });
    }

    public async start(seed: string, start: { readonly x: number; readonly z: number }): Promise<CombatUpdate> {
        if (this.closed || this.authority) throw new Error("Combat Worker client cannot start twice");
        const ports: MessagePort[] = [];
        try {
            this.authority = this.own(new Worker(new URL("./Combat.worker.ts", import.meta.url), { type: "module", name: "survivor-simulation" }));
            this.authority.onmessage = (event: MessageEvent<CombatResponse>) => this.receive(event.data);
            for (let i = 0; i < this.queryWorkers; i++) {
                const worker = this.own(new Worker(new URL("./Projectile.worker.ts", import.meta.url), { type: "module", name: `survivor-collision-${i}` }));
                const channel = new MessageChannel();
                ports.push(channel.port1);
                worker.postMessage({ port: channel.port2 }, [channel.port2]);
            }
            return await this.request({ type: "init", id: ++this.sequence, seed, start, ports }, ports);
        } catch (reason) {
            for (const port of ports) port.close();
            this.dispose(); throw reason;
        }
    }
    public advance(batch: CombatAdvance): Promise<CombatUpdate> {
        if (this.closed || !this.authority || this.pending) return Promise.reject(new Error("Combat transport is closed or busy"));
        const recycle = this.recycle; this.recycle = undefined;
        return this.request({ type: "advance", id: ++this.sequence, batch, recycle }, recycle ? [recycle] : []);
    }
    private own(worker: Worker): Worker {
        this.workers.push(worker);
        worker.onerror = event => { event.preventDefault(); this.fail(new Error(event.message || "Combat Worker failed to load")); };
        worker.onmessageerror = () => this.fail(new Error("Combat Worker message could not be decoded"));
        return worker;
    }
    private request(message: CombatRequest, transfer: Transferable[]): Promise<CombatUpdate> {
        if (this.closed || !this.authority || this.pending) return Promise.reject(new Error("Combat transport is closed or busy"));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.fail(new Error("Combat Worker timed out")), WORKER_TIMEOUT_MS);
            this.pending = { id: message.id, resolve, reject, timer };
            this.activity.begin();
            try { this.authority!.postMessage(message, transfer); }
            catch (reason) { this.fail(reason instanceof Error ? reason : new Error(String(reason))); }
        });
    }
    private receive(message: CombatResponse): void {
        const started = performance.now();
        if (this.closed) return;
        const pending = this.pending;
        if (!pending || message.id !== pending.id) { this.fail(new Error("Combat response sequence mismatch")); return; }
        if (message.type === "error") { this.fail(new Error(message.message)); return; }
        clearTimeout(pending.timer); this.pending = undefined;
        this.activity.end();
        this.recycle = this.currentBuffer; this.currentBuffer = message.update.render.buffer;
        this.simulationStats = message.update.stats;
        this.receiveMs = performance.now() - started;
        pending.resolve(message.update);
    }
    private fail(error: Error): void { if (!this.closed) { this.close(error); this.onFailure(error); } }
    private close(error: Error): void {
        this.closed = true;
        for (const worker of this.workers) worker.terminate();
        this.workers.length = 0; this.authority = undefined;
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
        this.currentBuffer = this.recycle = undefined;
    }
    public dispose(): void { this.close(new DOMException("Combat session closed", "AbortError")); }
}

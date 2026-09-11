import { ProjectileBatch, resolveProjectileRange, type ProjectileExecutor } from "../core/ProjectileBatch";
import { WORKER_TIMEOUT_MS, type QueryRequest, type QueryResponse } from "./CombatProtocol";
import { TaskActivity } from "./TaskActivity";
import { GAME_CONFIG } from "../core/GameConfig";

// Below this work estimate, dispatch costs more than the numerical query itself.
export const PARALLEL_COLLISION_PAIRS = GAME_CONFIG.workers.parallelCollisionPairs;

class QueryLane {
    public readonly activity: TaskActivity;
    private buffer: ArrayBuffer | undefined = new ArrayBuffer(ProjectileBatch.bytes);
    private sequence = 0;
    private pending: { id: number; resolve: (buffer: ArrayBuffer) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
    constructor(private readonly port: MessagePort, id: number) {
        this.activity = new TaskActivity(id);
        port.onmessage = (event: MessageEvent<QueryResponse>) => {
            const pending = this.pending;
            if (!pending) return;
            if (event.data.id !== pending.id) { this.dispose(new Error("Collision response sequence mismatch")); return; }
            this.pending = undefined; clearTimeout(pending.timer);
            this.activity.end();
            if ("error" in event.data) pending.reject(new Error(event.data.error));
            else { this.buffer = event.data.buffer; pending.resolve(this.buffer); }
        };
        port.onmessageerror = () => this.dispose(new Error("Collision response could not be decoded"));
    }
    public run(batch: ProjectileBatch, begin: number, end: number): Promise<void> {
        if (this.pending || !this.buffer) return Promise.reject(new Error("Collision lane already busy or closed"));
        const buffer = this.buffer; this.buffer = undefined;
        batch.copyRangeTo(buffer, begin, end);
        const id = ++this.sequence;
        return new Promise<ArrayBuffer>((resolve, reject) => {
            const timer = setTimeout(() => this.dispose(new Error("Collision Worker timed out")), WORKER_TIMEOUT_MS);
            this.pending = { id, resolve, reject, timer };
            this.activity.begin();
            const request: QueryRequest = { id, begin, end, buffer };
            try { this.port.postMessage(request, [buffer]); }
            catch (reason) { this.dispose(reason instanceof Error ? reason : new Error(String(reason))); }
        }).then(result => {
            const outputs = new ProjectileBatch(result).targets;
            batch.targets.set(outputs.subarray(begin, end), begin);
        });
    }
    public dispose(error = new Error("Collision lane closed")): void {
        this.port.close(); this.buffer = undefined;
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
    }
}

/** A bounded fork/join executor; no lane writes live ECS state or resolves damage. */
export class ProjectileWorkerPool implements ProjectileExecutor {
    private readonly lanes: QueryLane[];
    public parallelBatches = 0;
    public localBatches = 0;
    public waitMs = 0;
    constructor(ports: readonly MessagePort[]) { this.lanes = ports.map((port, id) => new QueryLane(port, id)); }
    public get size(): number { return this.lanes.length; }
    public get workerActivity() { return this.lanes.map(lane => lane.activity.snapshot); }
    public async resolve(batch: ProjectileBatch): Promise<void> {
        let pairs = 0;
        for (let shot = 0; shot < batch.count; shot++) pairs += batch.candidateCounts[shot];
        if (this.lanes.length === 0 || pairs < PARALLEL_COLLISION_PAIRS) {
            this.localBatches++; resolveProjectileRange(batch); return;
        }
        this.parallelBatches++;
        let cursor = 0, assignedPairs = 0;
        const pending = this.lanes.map((lane, index) => {
            const begin = cursor, boundary = pairs * (index + 1) / this.lanes.length;
            // Partition the actual broad-phase candidates, including one check per hostile bolt.
            while (cursor < batch.count && (index === this.lanes.length - 1 || assignedPairs < boundary)) {
                assignedPairs += batch.candidateCounts[cursor];
                cursor++;
            }
            return lane.run(batch, begin, cursor);
        });
        const started = performance.now();
        try { await Promise.all(pending); }
        finally { this.waitMs += performance.now() - started; }
    }
    public dispose(): void { for (const lane of this.lanes) lane.dispose(); }
}

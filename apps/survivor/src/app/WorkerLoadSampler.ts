import type { WorkerActivitySnapshot } from "three-hex-map";

export interface NamedWorkerActivity extends WorkerActivitySnapshot { readonly key: string; readonly label: string }
export interface WorkerLoad extends NamedWorkerActivity {
    readonly occupancy: number;
    readonly tasksPerSecond: number;
    readonly sampled: boolean;
}

/** One bounded baseline per live Worker; no history or timers. */
export class WorkerLoadSampler {
    private previous = new Map<string, WorkerActivitySnapshot>();
    private sampledAt: number | undefined;
    public sample(now: number, workers: readonly NamedWorkerActivity[]): readonly WorkerLoad[] {
        const elapsed = this.sampledAt === undefined ? 0 : now - this.sampledAt;
        const result = workers.map(worker => {
            const before = this.previous.get(worker.key);
            const sampled = elapsed > 0 && before !== undefined && worker.busyMs >= before.busyMs && worker.completed >= before.completed;
            return Object.freeze({ ...worker, sampled,
                occupancy: sampled ? Math.min(1, Math.max(0, (worker.busyMs - before.busyMs) / elapsed)) : 0,
                tasksPerSecond: sampled ? (worker.completed - before.completed) * 1000 / elapsed : 0 });
        });
        this.sampledAt = now; this.previous = new Map(workers.map(worker => [worker.key, worker]));
        return Object.freeze(result);
    }
}

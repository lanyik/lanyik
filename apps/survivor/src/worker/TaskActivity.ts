import type { WorkerActivitySnapshot } from "three-hex-map";

/** Monotonic occupied time, including an outstanding request, sampled without polling the Worker. */
export class TaskActivity {
    private startedAt: number | undefined;
    private busyMs = 0;
    private completed = 0;
    private lastTaskMs = 0;
    constructor(private readonly id: number, private readonly now = () => performance.now()) {}
    public begin(): void { this.startedAt = this.now(); }
    public end(): void {
        this.lastTaskMs = Math.max(0, this.now() - this.startedAt!);
        this.busyMs += this.lastTaskMs; this.completed++; this.startedAt = undefined;
    }
    public get snapshot(): WorkerActivitySnapshot {
        return { id: this.id, busy: this.startedAt !== undefined, completed: this.completed, lastTaskMs: this.lastTaskMs,
            busyMs: this.busyMs + (this.startedAt === undefined ? 0 : Math.max(0, this.now() - this.startedAt)) };
    }
}

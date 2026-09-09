import { CombatSimulation } from "../core/CombatSimulation";
import { applyCombatCommand } from "../core/CombatCommand";
import { MAX_COMMAND_BATCH, MAX_STEP_BATCH, type CombatRequest, type CombatResponse, type CombatUpdate } from "./CombatProtocol";
import { ProjectileWorkerPool } from "./ProjectileWorkerPool";
import { RenderFrame } from "./RenderFrame";

type SimulationFactory = (seed: string, start: { x: number; z: number }) => CombatSimulation;

/** Owns all authoritative state. Async query work completes before any next command or tick. */
export class CombatWorkerHost {
    private simulation: CombatSimulation | undefined;
    private pool: ProjectileWorkerPool | undefined;
    private frame: RenderFrame | undefined;
    private sequence = 0;
    private lastSnapshotTick = -Infinity;
    private busy = false;
    private closed = false;

    constructor(private readonly send: (message: CombatResponse, transfers: Transferable[]) => void,
        private readonly createSimulation: SimulationFactory = (seed, start) => new CombatSimulation(seed, start)) {}

    public async receive(request: CombatRequest): Promise<void> {
        if (this.closed) return;
        try {
            if (this.busy || request.id !== this.sequence + 1) throw new Error("Combat requests must be serial and ordered");
            this.sequence = request.id; this.busy = true;
            const started = performance.now();
            let forceSnapshot = false;
            if (request.type === "init") {
                if (this.simulation) throw new Error("Combat Worker already initialized");
                if (request.ports.length > 2) throw new Error("Collision Worker budget exceeded");
                this.pool = new ProjectileWorkerPool(request.ports);
                this.simulation = this.createSimulation(request.seed, request.start);
                // One frame remains here while the other is owned by the presentation thread.
                this.frame = new RenderFrame();
                forceSnapshot = true;
            } else if (request.type === "advance") {
                const { batch } = request;
                if (!this.simulation || !this.pool) throw new Error("Combat Worker is not initialized");
                if (!Number.isInteger(batch.steps) || batch.steps < 0 || batch.steps > MAX_STEP_BATCH
                    || batch.commands.length > MAX_COMMAND_BATCH) throw new Error("Combat batch exceeds its budget");
                if (request.recycle) {
                    if (this.frame) throw new Error("Unexpected render buffer return");
                    this.frame = new RenderFrame(request.recycle);
                }
                for (const command of batch.commands) applyCombatCommand(this.simulation, command);
                for (let step = 0; step < batch.steps && !this.simulation.gameOver; step++) await this.simulation.step(batch.input, this.pool);
                forceSnapshot = batch.commands.length > 0 || batch.steps === 0;
            } else throw new Error("Unknown combat request");
            if (this.closed) return;
            const simulation = this.simulation!, pool = this.pool!;
            const notices = simulation.drainNotices();
            const publish = forceSnapshot || simulation.gameOver || notices.length > 0 || simulation.tick - this.lastSnapshotTick >= 5;
            if (publish) this.lastSnapshotTick = simulation.tick;
            const frame = this.frame;
            if (!frame) throw new Error("Presentation did not return its render buffer");
            const update: CombatUpdate = { tick: simulation.tick, gameOver: simulation.gameOver,
                render: frame.write(simulation.getRenderState()), snapshot: publish ? simulation.getSnapshot() : undefined, notices,
                stats: { queries: pool.workerActivity, queryWorkers: pool.size, parallelBatches: pool.parallelBatches, localBatches: pool.localBatches,
                    computeMs: performance.now() - started, frameBytes: RenderFrame.bytes } };
            this.frame = request.type === "init" ? new RenderFrame() : undefined;
            this.send({ type: "state", id: request.id, update }, [update.render.buffer]);
        } catch (reason) {
            this.send({ type: "error", id: request.id, message: reason instanceof Error ? reason.message : String(reason) }, []);
            this.dispose();
        } finally { this.busy = false; }
    }

    public dispose(): void { this.closed = true; this.pool?.dispose(); this.pool = undefined; this.simulation = undefined; this.frame = undefined; }
}

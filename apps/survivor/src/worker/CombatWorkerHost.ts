import { CombatSimulation } from "../core/CombatSimulation";
import { applyCombatCommand } from "../core/CombatCommand";
import { MAX_COMMAND_BATCH, MAX_STEP_BATCH, type CombatRequest, type CombatResponse, type CombatUpdate } from "./CombatProtocol";
import { ProjectileWorkerPool } from "./ProjectileWorkerPool";
import { RenderFrame } from "./RenderFrame";
import { GAME_CONFIG, ticksPerUpdate } from "../core/GameConfig";
import type { SpiritRealm } from "../core/SpiritRealm";
import type { SpiritRepository } from "./SpiritRepository";
import { ProceduralCombatTerrain } from "../adapters/ProceduralCombatTerrain";
const SNAPSHOT_TICKS = ticksPerUpdate(GAME_CONFIG.timing.snapshotHz);

type SimulationFactory = (seed: string, start: { x: number; z: number }, realm: SpiritRealm) => CombatSimulation;

/** Owns all authoritative state. Async query work completes before any next command or tick. */
export class CombatWorkerHost {
    private simulation: CombatSimulation | undefined;
    private pool: ProjectileWorkerPool | undefined;
    private frame: RenderFrame | undefined;
    private sequence = 0;
    private lastSnapshotTick = -Infinity;
    private busy = false;
    private closed = false;
    private savedRevision = 0;

    constructor(private readonly send: (message: CombatResponse, transfers: Transferable[]) => void,
        private readonly progress: SpiritRepository,
        private readonly createSimulation: SimulationFactory = (seed, start, realm) => new CombatSimulation(seed, start, realm, new ProceduralCombatTerrain(seed))) {}

    public async receive(request: CombatRequest): Promise<void> {
        if (this.closed) return;
        try {
            if (this.busy || request.id !== this.sequence + 1) throw new Error("Combat requests must be serial and ordered");
            this.sequence = request.id; this.busy = true;
            const started = performance.now();
            const waitBefore = this.pool?.waitMs ?? 0;
            let forceSnapshot = false;
            let steps = 0, simulationMs = 0, persistenceMs = 0;
            if (request.type === "init") {
                if (this.simulation) throw new Error("Combat Worker already initialized");
                if (request.ports.length > GAME_CONFIG.workers.collisionMax) throw new Error("Collision Worker budget exceeded");
                this.pool = new ProjectileWorkerPool(request.ports);
                const loading = performance.now(), realm = await this.progress.load();
                persistenceMs += performance.now() - loading;
                if (this.closed) return;
                this.savedRevision = realm.revision;
                this.simulation = this.createSimulation(request.seed, request.start, realm);
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
                const tickBefore = this.simulation.tick, simulationStarted = performance.now();
                for (let step = 0; step < batch.steps && !this.simulation.gameOver; step++) await this.simulation.step(batch.input, this.pool);
                steps = this.simulation.tick - tickBefore;
                simulationMs = performance.now() - simulationStarted;
                forceSnapshot = batch.commands.length > 0 || batch.steps === 0;
            } else throw new Error("Unknown combat request");
            if (this.closed) return;
            const simulation = this.simulation!, pool = this.pool!;
            if (simulation.spiritProgress.revision !== this.savedRevision) {
                const saving = performance.now();
                await this.progress.save(simulation.spiritProgress);
                persistenceMs += performance.now() - saving;
                this.savedRevision = simulation.spiritProgress.revision;
                if (this.closed) return;
            }
            const notices = simulation.drainNotices();
            const publish = forceSnapshot || simulation.gameOver || notices.length > 0 || simulation.tick - this.lastSnapshotTick >= SNAPSHOT_TICKS;
            if (publish) this.lastSnapshotTick = simulation.tick;
            const frame = this.frame;
            if (!frame) throw new Error("Presentation did not return its render buffer");
            const render = frame.write(simulation.getRenderState()), snapshot = publish ? simulation.getSnapshot() : undefined;
            const batchMs = performance.now() - started, queryWaitMs = pool.waitMs - waitBefore;
            const update: CombatUpdate = { tick: simulation.tick, gameOver: simulation.gameOver, render, snapshot, notices,
                stats: { queries: pool.workerActivity, queryWorkers: pool.size, parallelBatches: pool.parallelBatches, localBatches: pool.localBatches,
                    steps, simulationMs, batchMs, executeMs: Math.max(0, batchMs - queryWaitMs - persistenceMs), queryWaitMs,
                    frameBytes: RenderFrame.bytes } };
            this.frame = request.type === "init" ? new RenderFrame() : undefined;
            this.send({ type: "state", id: request.id, update }, [update.render.buffer]);
        } catch (reason) {
            if (this.closed) return;
            this.send({ type: "error", id: request.id, message: reason instanceof Error ? reason.message : String(reason) }, []);
            this.dispose();
        } finally { this.busy = false; }
    }

    public dispose(): void {
        this.closed = true; this.pool?.dispose(); this.simulation?.dispose();
        this.progress.close();
        this.pool = undefined; this.simulation = undefined; this.frame = undefined;
    }
}

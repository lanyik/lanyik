import { CombatSimulation } from "../core/CombatSimulation";
import { applyCombatCommand } from "../core/CombatCommand";
import { MAX_COMMAND_BATCH, MAX_STEP_BATCH, type CombatRequest, type CombatResponse, type CombatUpdate } from "./CombatProtocol";
import { ProjectileWorkerPool } from "./ProjectileWorkerPool";
import { RenderFrame } from "./RenderFrame";
import { GAME_CONFIG, ticksPerUpdate } from "../core/GameConfig";
import type { SpiritRealm } from "../core/SpiritRealm";
import type { SpiritRepository } from "./SpiritRepository";
import { ProceduralCombatTerrain } from "../adapters/ProceduralCombatTerrain";
import type { CharacterCheckpoint } from "../core/CharacterCheckpoint";
import { HomesteadTerrain, type WorldLocation } from "../core/Homestead";
import { ChallengeTerrain, isChallenge } from "../core/BossChallenge";
import type { CharacterRepository } from "../app/CharacterRepository";
const SNAPSHOT_TICKS = ticksPerUpdate(GAME_CONFIG.timing.snapshotHz);

type SimulationFactory = (seed: string, start: { x: number; z: number }, realm: SpiritRealm, location: WorldLocation) => CombatSimulation;

/** Owns all authoritative state. Async query work completes before any next command or tick. */
export class CombatWorkerHost {
    private simulation: CombatSimulation | undefined;
    private pool: ProjectileWorkerPool | undefined;
    private frame: RenderFrame | undefined;
    private sequence = 0;
    private lastSnapshotTick = -Infinity;
    private lastExplorationRevision = -1;
    private busy = false;
    private closed = false;
    private savedRevision = 0;
    private savedChallengeRevision = 0;
    private generationYieldMs = 0;
    private generationChannel?: MessageChannel;
    private resumeGeneration?: () => void;
    private readonly yieldWorld = async (): Promise<void> => {
        const started = performance.now();
        if (!this.generationChannel) {
            this.generationChannel = new MessageChannel();
            this.generationChannel.port1.onmessage = () => {
                const resume = this.resumeGeneration; this.resumeGeneration = undefined; resume?.();
            };
        }
        await new Promise<void>(resolve => {
            this.resumeGeneration = resolve;
            this.generationChannel!.port2.postMessage(null);
        });
        this.generationYieldMs += performance.now() - started;
    };

    constructor(private readonly send: (message: CombatResponse, transfers: Transferable[]) => void,
        private readonly progress: SpiritRepository,
        private readonly createSimulation: SimulationFactory = (seed, start, realm, location) => new CombatSimulation(seed, start, realm,
            location === "homestead" ? new HomesteadTerrain() : isChallenge(location) ? new ChallengeTerrain() : new ProceduralCombatTerrain(seed), location, crypto.randomUUID(), this.yieldWorld),
        private readonly characters?: Pick<CharacterRepository, "save" | "close">) {}

    public async receive(request: CombatRequest): Promise<void> {
        if (this.closed) return;
        try {
            if (this.busy || request.id !== this.sequence + 1) throw new Error("Combat requests must be serial and ordered");
            this.sequence = request.id; this.busy = true;
            const started = performance.now();
            const waitBefore = this.pool?.waitMs ?? 0;
            const generationWaitBefore = this.generationYieldMs;
            let forceSnapshot = false;
            let steps = 0, simulationMs = 0, simulationYieldMs = 0, persistenceMs = 0;
            if (request.type === "init") {
                if (this.simulation) throw new Error("Combat Worker already initialized");
                if (request.ports.length > GAME_CONFIG.workers.collisionMax) throw new Error("Collision Worker budget exceeded");
                this.pool = new ProjectileWorkerPool(request.ports);
                const loading = performance.now(), realm = await this.progress.load();
                persistenceMs += performance.now() - loading;
                if (this.closed) return;
                this.savedRevision = realm.revision;
                if (isChallenge(request.location ?? "") && !request.checkpoint) throw new Error("挑战副本必须使用卷轴开启或恢复已保存进度");
                this.simulation = this.createSimulation(request.seed, request.start, realm, request.checkpoint?.location ?? request.location ?? "wilds");
                await this.simulation.initialize(request.checkpoint);
                if (this.closed) return;
                this.savedChallengeRevision = this.simulation.challengeRevision;
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
                for (const command of batch.commands) {
                    if (command.type === "teleport") await this.simulation.teleportAsync(command.x, command.z);
                    else applyCombatCommand(this.simulation, command);
                    if (this.closed) return;
                }
                const tickBefore = this.simulation.tick, simulationStarted = performance.now();
                const simulationYieldBefore = this.generationYieldMs;
                for (let step = 0; step < batch.steps && !this.simulation.gameOver; step++) await this.simulation.step(batch.input, this.pool);
                steps = this.simulation.tick - tickBefore;
                simulationMs = performance.now() - simulationStarted;
                simulationYieldMs = this.generationYieldMs - simulationYieldBefore;
                forceSnapshot = batch.commands.length > 0 || batch.steps === 0;
            } else throw new Error("Unknown combat request");
            if (this.closed) return;
            const simulation = this.simulation!, pool = this.pool!;
            if (this.characters && simulation.challengeRevision !== this.savedChallengeRevision) {
                const saving = performance.now();
                // Commit the complete reward transaction before publishing it. A killed enemy can never be resurrected by an older slot.
                await this.characters.save("auto", simulation.checkpoint(undefined, undefined, undefined, true));
                persistenceMs += performance.now() - saving;
                this.savedChallengeRevision = simulation.challengeRevision;
                if (this.closed) return;
            }
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
            const generationYieldMs = this.generationYieldMs - generationWaitBefore;
            let checkpoint: CharacterCheckpoint | undefined, checkpointError: string | undefined;
            if (request.type === "advance" && request.batch.checkpoint) {
                let terrain;
                try {
                    if (request.batch.travelPoint && request.batch.travel) terrain = request.batch.travel === "wilds" ? new ProceduralCombatTerrain(simulation.getSnapshot().world.seed)
                        : request.batch.travel === "homestead" ? new HomesteadTerrain() : new ChallengeTerrain();
                    checkpoint = simulation.checkpoint(request.batch.travel, request.batch.travelPoint, terrain);
                } catch (error) { checkpointError = error instanceof Error ? error.message : String(error); }
                finally { terrain?.dispose(); }
            }
            const discovery = simulation.explorationSnapshot;
            const exploration = discovery.revision !== this.lastExplorationRevision ? discovery : undefined;
            this.lastExplorationRevision = discovery.revision;
            const update: CombatUpdate = { tick: simulation.tick, gameOver: simulation.gameOver, render, snapshot, notices,
                checkpoint, checkpointError, exploration,
                stats: { queries: pool.workerActivity, queryWorkers: pool.size, parallelBatches: pool.parallelBatches, localBatches: pool.localBatches,
                    steps, simulationMs, simulationYieldMs, batchMs, executeMs: Math.max(0, batchMs - queryWaitMs - generationYieldMs - persistenceMs), queryWaitMs, generationYieldMs,
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
        if (this.closed) return;
        this.closed = true; this.pool?.dispose(); this.simulation?.dispose();
        this.generationChannel?.port1.close(); this.generationChannel?.port2.close();
        this.generationChannel = undefined;
        this.resumeGeneration?.(); this.resumeGeneration = undefined;
        this.progress.close();
        this.characters?.close();
        this.pool = undefined; this.simulation = undefined; this.frame = undefined;
    }
}

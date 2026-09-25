import type { CombatCommand } from "../core/CombatCommand";
import type { CombatNotice, CombatSnapshot, CombatRenderState, MovementInput } from "../core/CombatState";
import { COMBAT_STEP_MS, FixedStepClock } from "../core/FixedStepClock";
import type { CombatStart, CombatView } from "./CombatView";
import { compareEquipment } from "../core/EquipmentEvaluation";
import type { Equipment } from "../core/Equipment";
import type { CombatTransport, CombatTransportFactory } from "./CombatTransport";
import { MAX_COMMAND_BATCH, MAX_STEP_BATCH, type CombatUpdate } from "../worker/CombatProtocol";
import { RenderFrame } from "../worker/RenderFrame";
import { WorkerLoadSampler, type WorkerLoad, type NamedWorkerActivity } from "./WorkerLoadSampler";
import { FramePerformance, InputFeedback, type RuntimePerformanceSnapshot } from "./FramePerformance";
import type { HexMapFrameEndEvent } from "three-hex-map";
import { GAME_CONFIG } from "../core/GameConfig";
import { shareSnapshot } from "./ShareSnapshot";
import { validateCharacterCheckpoint, type CharacterCheckpoint } from "../core/CharacterCheckpoint";
import type { CharacterRepository, CharacterSave, SaveSlot } from "./CharacterRepository";
import type { RuntimeLog } from "./RuntimeLog";
import type { ExplorationSnapshot } from "../core/Exploration";
import type { WorldLocation } from "../core/Homestead";
import { isChallenge } from "../core/BossChallenge";

type SessionStatus = "loading" | "ready" | "failed" | "closed";

interface VisibleNotice extends CombatNotice {
    readonly expiresAt: number;
}

export interface SessionSnapshot {
    readonly travelling: boolean;
    readonly travelError?: string;
    readonly exploration?: ExplorationSnapshot;
    readonly saveStatus: Readonly<{ busy: boolean; savedAt?: number; error?: string }>;
    readonly generation: number;
    readonly performance: RuntimePerformanceSnapshot | undefined;
    readonly workerLoads: readonly WorkerLoad[];
    readonly status: SessionStatus;
    readonly seed: string;
    readonly paused: boolean;
    readonly hidden: boolean;
    readonly combat?: CombatSnapshot;
    readonly notices: readonly VisibleNotice[];
    readonly upgrades: readonly Equipment[];
    readonly error?: string;
}

export type SessionCommand = CombatCommand
    | { readonly type: "toggle-pause" }
    | { readonly type: "restart" }
    | { readonly type: "dismiss-upgrade"; readonly itemId: number };

const NOTICE_LIFETIME_MS = 3200;

/** Structured cloning does not preserve Object.freeze; restore the UI ownership contract. */
function freezeSnapshot<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeSnapshot(child);
        Object.freeze(value);
    }
    return value;
}

export class CombatSession {
    private framePerformance = new FramePerformance();
    private performanceSnapshot: RuntimePerformanceSnapshot | undefined;
    private performanceStartedAt = 0;
    private longFramesSupported = false;
    private presentationMs = 0;
    private skipTimingFrame = true;
    private readonly inputFeedback = new InputFeedback();
    private loadSampler = new WorkerLoadSampler();
    private workerLoads: readonly WorkerLoad[] = [];
    private sampledLoadAt = 0;
    private readonly listeners = new Set<() => void>();
    private readonly clock = new FixedStepClock();
    private status: SessionStatus = "loading";
    private seed = "rift-ember-1";
    private paused = false;
    private pauseAcknowledged = false;
    private pendingSnapshot = false;
    private hidden = document.hidden;
    private error: string | undefined;
    private client: CombatTransport | undefined;
    private combat: CombatSnapshot | undefined;
    private exploration: ExplorationSnapshot | undefined;
    private location: WorldLocation = "wilds";
    private travelling = false;
    private travelError: string | undefined;
    private renderState: CombatRenderState | undefined;
    private gameOver = false;
    private inFlight: Promise<void> | undefined;
    private pendingSteps = 0;
    private pendingCommands: CombatCommand[] = [];
    private input: MovementInput = { x: 0, z: 0, active: false };
    private frameReceivedAt = 0;
    private droppedSteps = 0;
    private clockClampedMs = 0;
    private startPosition: CombatStart | undefined;
    private visibleNotices: VisibleNotice[] = [];
    private readonly upgradeIds = new Set<number>();
    private snapshot: SessionSnapshot;
    private loadRevision = 0;
    private closePromise: Promise<void> | undefined;
    private checkpointRequest: { resolve: (value: CharacterCheckpoint) => void; reject: (reason: unknown) => void; travel?: WorldLocation; travelPoint?: { x: number; z: number } } | undefined;
    private saving: Promise<CharacterSave> | undefined;
    private saveStatus: SessionSnapshot["saveStatus"] = Object.freeze({ busy: false });
    private lastCheckpoint: CharacterCheckpoint | undefined;

    constructor(private readonly view: CombatView, private readonly createTransport: CombatTransportFactory, private readonly saves?: CharacterRepository,
        private readonly runtimeLog?: RuntimeLog) {
        this.snapshot = this.capture();
    }

    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    public getSnapshot = (): SessionSnapshot => this.snapshot;
    public get isPaused(): boolean { return this.paused; }

    public start(seed = this.seed, location: WorldLocation = "wilds"): Promise<void> { return this.launch(seed, true, undefined, location); }
    public retry(): Promise<void> { return this.launch(this.seed, true, this.lastCheckpoint); }
    public load(checkpoint: CharacterCheckpoint): Promise<void> { validateCharacterCheckpoint(checkpoint); return this.launch(checkpoint.seed, true, checkpoint); }
    public listSaves() { if (!this.saves) return Promise.reject(new Error("未配置角色存档")); return this.saves.list(); }
    public save(slot: SaveSlot): Promise<CharacterSave> {
        if (this.saving) return Promise.reject(new Error("正在保存，请稍候"));
        if (!this.saves || this.status !== "ready" || this.gameOver || this.travelling) return Promise.reject(new Error("当前角色无法保存"));
        this.saveStatus = Object.freeze({ ...this.saveStatus, busy: true, error: undefined }); this.publish();
        const checkpoint = new Promise<CharacterCheckpoint>((resolve, reject) => { this.checkpointRequest = { resolve, reject }; });
        this.pendingSnapshot = true; this.flush();
        this.saving = checkpoint.then(value => this.saves!.save(slot, value)).then(save => {
            this.saveStatus = Object.freeze({ busy: false, savedAt: save.savedAt }); return save;
        }, error => { this.runtimeLog?.error("save-failed", error); this.saveStatus = Object.freeze({ ...this.saveStatus, busy: false, error: error instanceof Error ? error.message : String(error) }); throw error; })
            .finally(() => { this.saving = undefined; if (this.status !== "closed") this.publish(); });
        return this.saving;
    }

    public async travel(destination: WorldLocation, point?: { x: number; z: number }): Promise<void> {
        if (this.status !== "ready" || this.gameOver || this.hidden || this.travelling || this.saving) return;
        if (destination === this.location) { if (point) this.dispatch({ type: "teleport", ...point }); return; }
        let revision = this.loadRevision;
        const paused = this.paused;
        this.travelling = true; this.travelError = undefined;
        this.view.clearMovement(); this.input = { x: 0, z: 0, active: false }; this.syncClock(); this.publish();
        try {
            const checkpoint = new Promise<CharacterCheckpoint>((resolve, reject) => { this.checkpointRequest = { resolve, reject, travel: destination, travelPoint: point }; });
            this.pendingSnapshot = true; this.flush();
            const state = await checkpoint;
            if (revision !== this.loadRevision || this.status !== "ready") return;
            // Commit a recoverable character before releasing the old world or authority.
            if (this.saves) {
                const saved = await this.saves.save("auto", state);
                if (revision !== this.loadRevision) return;
                this.saveStatus = Object.freeze({ busy: false, savedAt: saved.savedAt });
            }
            if (revision !== this.loadRevision) return;
            const loading = this.launch(state.seed, true, state, destination, true);
            revision = this.loadRevision;
            await loading;
            if (revision === this.loadRevision && this.status === "ready") { this.paused = paused; this.pauseAcknowledged = paused; }
        } catch (reason) {
            if (revision === this.loadRevision) this.travelError = reason instanceof Error ? reason.message : String(reason);
        } finally {
            if (revision === this.loadRevision) {
                this.travelling = false; this.clock.reset(); this.syncClock(); this.publish();
            }
        }
    }

    public get diagnostics() { return { ...this.client?.stats, pendingSteps: this.pendingSteps, pendingCommands: this.pendingCommands.length,
        droppedSteps: this.droppedSteps, clockClampedMs: this.clockClampedMs }; }
    public get settled(): Promise<void> { return this.drain(); }
    private async drain(): Promise<void> { while (this.inFlight) await this.inFlight; }

    private async launch(seed: string, reloadWorld: boolean, checkpoint?: CharacterCheckpoint, location = checkpoint?.location ?? this.location, travelling = false): Promise<void> {
        if (this.status === "closed") return;
        const revision = ++this.loadRevision;
        this.status = "loading";
        this.travelling = travelling; this.travelError = undefined;
        this.lastCheckpoint = checkpoint;
        this.location = location;
        this.checkpointRequest?.reject(new Error("角色已切换，保存取消")); this.checkpointRequest = undefined;
        this.resetPerformance();
        this.seed = seed.trim() || "rift-ember-1";
        this.error = undefined;
        this.paused = false;
        this.pauseAcknowledged = false; this.pendingSnapshot = false;
        this.client?.dispose(); this.client = undefined;
        this.combat = undefined; this.exploration = undefined; this.renderState = undefined; this.gameOver = false;
        this.inFlight = undefined; this.pendingSteps = 0; this.pendingCommands = []; this.droppedSteps = 0;
        this.clockClampedMs = 0;
        this.visibleNotices = [];
        this.upgradeIds.clear();
        this.clock.setRunning(false);
        this.clock.reset();
        this.view.clearMovement();
        this.publish();
        try {
            if (checkpoint && this.saves) {
                checkpoint = await this.saves.resolve(checkpoint);
                if (revision !== this.loadRevision) return;
                location = checkpoint.location; this.location = location; this.lastCheckpoint = checkpoint;
            }
            this.view.reset();
            const start = reloadWorld ? await this.view.load(this.seed, checkpoint?.player, location) : this.startPosition;
            if (revision !== this.loadRevision) return;
            if (!start) throw new Error("Combat start position is missing");
            this.startPosition = checkpoint?.origin ?? start;
            const client = this.createTransport(error => { if (revision === this.loadRevision) this.fail(error); });
            this.client = client;
            const update = await client.start(this.seed, this.startPosition, checkpoint, location);
            if (revision !== this.loadRevision) { client.dispose(); return; }
            this.accept(update);
            this.status = "ready";
            if (checkpoint) { this.paused = true; this.pauseAcknowledged = true; }
            this.performanceStartedAt = performance.now();
            this.sampleWorkerLoad(performance.now());
            this.clock.reset();
            this.syncClock();
            this.publish();
        } catch (reason) {
            if (revision !== this.loadRevision) return;
            this.fail(reason);
        }
    }

    public frame(timestampMs: number, restarted = false): void {
        if (this.status !== "ready" || !this.client || !this.renderState) return;
        if (restarted) { this.clock.reset(); this.resetPerformance(); }
        const sample = this.clock.sample(timestampMs);
        this.clockClampedMs += sample.clampedMs;
        const input = this.travelling ? { x: 0, z: 0, active: false } : this.view.readMovement();
        if (!this.paused && !this.hidden && !this.gameOver && (input.x !== this.input.x || input.z !== this.input.z || input.active !== this.input.active)) {
            this.inputFeedback.change(performance.now());
        }
        this.input = input;
        const steps = this.pendingSteps + sample.steps;
        this.droppedSteps += Math.max(0, steps - MAX_STEP_BATCH);
        this.pendingSteps = Math.min(MAX_STEP_BATCH, steps);
        this.flush();
        const alpha = this.paused || this.hidden || this.gameOver ? 1 : Math.min(1, Math.max(0, (timestampMs - this.frameReceivedAt) / COMBAT_STEP_MS));
        const presentationStarted = performance.now();
        this.view.render(this.renderState, alpha, timestampMs);
        this.presentationMs = performance.now() - presentationStarted;
        const before = this.visibleNotices.length;
        this.visibleNotices = this.visibleNotices.filter(notice => notice.expiresAt > timestampMs);
        if (before !== this.visibleNotices.length) this.publish();
    }

    public afterFrame(frame: HexMapFrameEndEvent): void {
        if (this.status !== "ready" || this.hidden) return;
        const now = performance.now();
        this.inputFeedback.draw(now);
        this.framePerformance.frame(this.skipTimingFrame ? { ...frame, dtS: 0 } : frame, this.presentationMs);
        this.skipTimingFrame = false;
        if (now - this.sampledLoadAt < GAME_CONFIG.timing.diagnosticsMs) return;
        const stats = this.client!.stats, simulation = stats.simulation;
        this.performanceSnapshot = Object.freeze({ ...this.framePerformance.take(now - this.sampledLoadAt),
            windowMs: now - this.sampledLoadAt,
            snapshotAgeMs: Math.max(0, now - this.frameReceivedAt), inputLatencyMs: this.inputFeedback.latencyMs,
            running: !this.paused && !this.gameOver, pendingSteps: this.pendingSteps, droppedSteps: this.droppedSteps,
            clockClampedMs: this.clockClampedMs,
            pendingRequests: Number(Boolean(this.inFlight)), executeMs: simulation?.executeMs, queryWaitMs: simulation?.queryWaitMs, generationYieldMs: simulation?.generationYieldMs,
            roundTripMs: stats.completed ? stats.roundTripMs : undefined,
            transportMs: simulation ? Math.max(0, stats.roundTripMs - simulation.batchMs) : undefined });
        this.sampleWorkerLoad(now); this.publish();
    }

    public observeLongFrames(): () => void {
        this.longFramesSupported = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("long-animation-frame");
        this.framePerformance.longFramesSupported = this.longFramesSupported;
        if (!this.longFramesSupported) return () => {};
        const observer = new PerformanceObserver(list => {
            if (this.status !== "ready" || this.hidden) return;
            for (const item of list.getEntries()) {
                if (item.startTime < this.performanceStartedAt) continue;
                const frame = item as PerformanceEntry & { blockingDuration: number; styleAndLayoutStart: number };
                const layout = frame.styleAndLayoutStart > 0 ? Math.max(0, frame.startTime + frame.duration - frame.styleAndLayoutStart) : 0;
                this.framePerformance.longFrame(frame.duration, frame.blockingDuration, layout);
            }
        });
        observer.observe({ type: "long-animation-frame" });
        return () => observer.disconnect();
    }

    private resetPerformance(): void {
        this.framePerformance = new FramePerformance(); this.framePerformance.longFramesSupported = this.longFramesSupported;
        this.performanceSnapshot = undefined; this.performanceStartedAt = performance.now();
        this.skipTimingFrame = true; this.inputFeedback.reset(); this.sampledLoadAt = performance.now();
        this.loadSampler = new WorkerLoadSampler(); this.workerLoads = [];
        if (this.status === "ready") this.sampleWorkerLoad(this.sampledLoadAt);
    }

    private sampleWorkerLoad(now: number): void {
        const stats = this.client?.stats, workers: NamedWorkerActivity[] = [];
        if (stats?.activity) workers.push({ ...stats.activity, key: "simulation", label: "战斗模拟" });
        for (const worker of stats?.simulation?.queries ?? []) workers.push({ ...worker, key: `query-${worker.id}`, label: `碰撞 ${worker.id + 1}` });
        for (const worker of this.view.workerActivity) workers.push({ ...worker, key: `terrain-${worker.id}`, label: `地形 ${worker.id + 1}` });
        this.workerLoads = this.loadSampler.sample(now, workers); this.sampledLoadAt = now;
    }

    private accept(update: CombatUpdate): void {
        if (update.exploration) this.exploration = freezeSnapshot(update.exploration);
        this.frameReceivedAt = performance.now();
        this.renderState = new RenderFrame(update.render.buffer).read(update.render);
        this.gameOver = update.gameOver;
        if (update.snapshot) this.combat = freezeSnapshot(shareSnapshot(this.combat, update.snapshot));
        const notices = update.notices;
        if (notices.length > 0) {
            for (const notice of notices) if (notice.acquiredEquipmentId !== undefined) this.upgradeIds.add(notice.acquiredEquipmentId);
            this.visibleNotices = [
                ...this.visibleNotices,
                ...notices.map(notice => Object.freeze({ ...notice, expiresAt: this.frameReceivedAt + NOTICE_LIFETIME_MS }))
            ].slice(-4);
        }
        this.syncClock();
    }

    private flush(): void {
        const client = this.client, revision = this.loadRevision;
        if (this.status !== "ready" || !client || this.inFlight || (this.pendingSteps === 0 && this.pendingCommands.length === 0 && !this.pendingSnapshot)) return;
        const steps = this.pendingSteps, commands = this.pendingCommands;
        const checkpoint = this.checkpointRequest; this.checkpointRequest = undefined;
        const inputSample = this.inputFeedback.sent();
        this.pendingSteps = 0; this.pendingCommands = []; this.pendingSnapshot = false;
        this.inFlight = client.advance({ steps, commands, input: this.input, checkpoint: Boolean(checkpoint), travel: checkpoint?.travel, travelPoint: checkpoint?.travelPoint }).then(update => {
            if (revision !== this.loadRevision) { checkpoint?.reject(new Error("角色已切换，保存取消")); return; }
            if (checkpoint) { if (update.checkpoint) checkpoint.resolve(update.checkpoint); else checkpoint.reject(new Error(update.checkpointError ?? "角色已倒下，保留原存档")); }
            const started = performance.now();
            this.accept(update);
            this.framePerformance.simulation(update.stats);
            if (steps > 0 && !this.paused && !this.hidden && !this.gameOver) this.inputFeedback.accept(inputSample);
            if (this.paused && steps === 0 && !this.pendingSnapshot && this.pendingCommands.length === 0) this.pauseAcknowledged = true;
            if (update.snapshot || update.exploration || update.notices.length > 0) this.publish();
            this.framePerformance.message(performance.now() - started + client.stats.receiveMs);
        }).catch(reason => { checkpoint?.reject(reason); if (revision === this.loadRevision) this.fail(reason); }).finally(() => {
            if (revision !== this.loadRevision) return;
            this.inFlight = undefined;
            this.flush();
        });
    }

    public dispatch(command: SessionCommand): void {
        if (this.status !== "ready" || !this.client || this.travelling) return;
        if (["set-equipment-lock", "set-auto-recycle", "sort-inventory", "equip", "craft"].includes(command.type)) {
            this.runtimeLog?.record("inventory-command", JSON.stringify({ seed: this.seed, tick: this.combat?.tick, command }));
        }
        switch (command.type) {
            case "toggle-pause":
                this.inputFeedback.reset();
                if (!this.gameOver) this.paused = !this.paused;
                this.pauseAcknowledged = false;
                this.view.clearMovement();
                this.syncClock();
                // A zero-tick barrier publishes the final committed snapshot before acknowledging pause.
                if (this.paused) { this.pendingSnapshot = true; this.flush(); }
                else this.publish();
                return;
            case "restart":
                if (isChallenge(this.location) && this.saves) {
                    void this.saves.list().then(entries => {
                        const checkpoint = entries.find(entry => entry.slot === "auto")?.save?.checkpoint;
                        if (!checkpoint) throw new Error("副本恢复记录缺失");
                        return this.load(checkpoint);
                    }).catch(reason => this.fail(reason));
                    return;
                }
                if (!this.startPosition) throw new Error("Combat start position is missing");
                void this.launch(this.seed, false); return;
            case "dismiss-upgrade": this.upgradeIds.delete(command.itemId); break;
            default: {
                if ((command.type === "cast-skill" || command.type === "use-consumable") && (this.paused || this.hidden || this.gameOver)) return;
                if (command.type === "teleport") {
                    if (this.hidden || this.gameOver) return;
                    this.view.clearMovement(); this.input = { x: 0, z: 0, active: false };
                }
                if (this.pendingCommands.length === MAX_COMMAND_BATCH) { this.fail(new Error("Combat command queue exhausted")); return; }
                this.pendingCommands.push(command); this.flush(); return;
            }
        }
        this.publish();
    }

    public setHidden(hidden: boolean): void {
        if (this.status === "closed" || this.hidden === hidden) return;
        this.hidden = hidden;
        this.resetPerformance();
        this.view.clearMovement();
        this.syncClock();
        this.publish();
    }

    public fail(reason: unknown): void {
        if (this.status === "closed") return;
        this.runtimeLog?.error("session-failed", reason);
        this.loadRevision += 1;
        this.status = "failed";
        this.travelling = false;
        this.checkpointRequest?.reject(reason); this.checkpointRequest = undefined;
        this.resetPerformance();
        this.error = reason instanceof Error ? reason.message : String(reason);
        this.clock.setRunning(false);
        this.client?.dispose(); this.client = undefined;
        this.inFlight = undefined; this.pendingSteps = 0; this.pendingCommands = [];
        this.view.clearMovement();
        this.publish();
    }

    public dispose(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.loadRevision += 1;
        this.status = "closed";
        this.travelling = false;
        this.checkpointRequest?.reject(new Error("角色已关闭，保存取消")); this.checkpointRequest = undefined;
        this.resetPerformance();
        this.clock.setRunning(false);
        this.client?.dispose(); this.client = undefined;
        this.inFlight = undefined; this.pendingSteps = 0; this.pendingCommands = [];
        this.renderState = undefined; this.combat = undefined;
        this.view.clearMovement();
        this.listeners.clear();
        this.closePromise = this.view.dispose();
        return this.closePromise;
    }

    private syncClock(): void {
        const running = this.status === "ready" && !this.paused && !this.hidden && !this.gameOver && !this.travelling;
        this.clock.setRunning(running);
        if (!running) this.pendingSteps = 0;
    }

    private capture(): SessionSnapshot {
        const combat = this.combat;
        const upgrades: Equipment[] = [];
        // Re-evaluate on every publication: equipping, discarding or clearing can invalidate a prompt.
        for (const id of this.upgradeIds) {
            const item = combat?.player.inventory.find(candidate => candidate.id === id);
            if (combat && item?.type === "equipment" && compareEquipment(item, combat.player).delta > 0) upgrades.push(item);
            else this.upgradeIds.delete(id);
        }
        if (combat) upgrades.sort((a, b) => compareEquipment(b, combat.player).delta - compareEquipment(a, combat.player).delta || a.id - b.id);
        return Object.freeze({
            exploration: this.exploration, travelling: this.travelling, travelError: this.travelError,
            saveStatus: this.saveStatus,
            generation: this.loadRevision,
            performance: this.performanceSnapshot,
            workerLoads: this.workerLoads,
            status: this.status,
            seed: this.seed,
            paused: this.paused && this.pauseAcknowledged,
            hidden: this.hidden,
            combat,
            upgrades: Object.freeze(upgrades),
            notices: Object.freeze([...this.visibleNotices]),
            error: this.error
        });
    }

    private publish(): void {
        this.snapshot = this.capture();
        for (const listener of this.listeners) listener();
    }
}

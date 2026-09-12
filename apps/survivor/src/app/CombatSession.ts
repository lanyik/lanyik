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

export type SessionStatus = "loading" | "ready" | "failed" | "closed";

export interface VisibleNotice extends CombatNotice {
    readonly expiresAt: number;
}

export interface SessionSnapshot {
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

    constructor(private readonly view: CombatView, private readonly createTransport: CombatTransportFactory) {
        this.snapshot = this.capture();
    }

    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    public getSnapshot = (): SessionSnapshot => this.snapshot;

    public start(seed = this.seed): Promise<void> { return this.launch(seed, true); }

    public get diagnostics() { return { ...this.client?.stats, pendingSteps: this.pendingSteps, pendingCommands: this.pendingCommands.length,
        droppedSteps: this.droppedSteps, clockClampedMs: this.clockClampedMs }; }
    public get settled(): Promise<void> { return this.drain(); }
    private async drain(): Promise<void> { while (this.inFlight) await this.inFlight; }

    private async launch(seed: string, reloadWorld: boolean): Promise<void> {
        if (this.status === "closed") return;
        const revision = ++this.loadRevision;
        this.status = "loading";
        this.resetPerformance();
        this.seed = seed.trim() || "rift-ember-1";
        this.error = undefined;
        this.paused = false;
        this.pauseAcknowledged = false; this.pendingSnapshot = false;
        this.client?.dispose(); this.client = undefined;
        this.combat = undefined; this.renderState = undefined; this.gameOver = false;
        this.inFlight = undefined; this.pendingSteps = 0; this.pendingCommands = []; this.droppedSteps = 0;
        this.clockClampedMs = 0;
        this.visibleNotices = [];
        this.upgradeIds.clear();
        this.clock.setRunning(false);
        this.clock.reset();
        this.view.clearMovement();
        this.publish();
        try {
            const start = reloadWorld ? await this.view.load(this.seed) : this.startPosition;
            if (revision !== this.loadRevision) return;
            if (!start) throw new Error("Combat start position is missing");
            this.startPosition = start;
            const client = this.createTransport(error => { if (revision === this.loadRevision) this.fail(error); });
            this.client = client;
            const update = await client.start(this.seed, start);
            if (revision !== this.loadRevision) { client.dispose(); return; }
            this.accept(update);
            this.status = "ready";
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
        const input = this.view.readMovement();
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
            pendingRequests: Number(Boolean(this.inFlight)), executeMs: simulation?.executeMs, queryWaitMs: simulation?.queryWaitMs,
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
        this.frameReceivedAt = performance.now();
        this.renderState = new RenderFrame(update.render.buffer).read(update.render);
        this.gameOver = update.gameOver;
        if (update.snapshot) this.combat = freezeSnapshot(update.snapshot);
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
        const inputSample = this.inputFeedback.sent();
        this.pendingSteps = 0; this.pendingCommands = []; this.pendingSnapshot = false;
        this.inFlight = client.advance({ steps, commands, input: this.input }).then(update => {
            if (revision !== this.loadRevision) return;
            const started = performance.now();
            this.accept(update);
            this.framePerformance.simulation(update.stats);
            if (steps > 0 && !this.paused && !this.hidden && !this.gameOver) this.inputFeedback.accept(inputSample);
            if (this.paused && steps === 0 && !this.pendingSnapshot && this.pendingCommands.length === 0) this.pauseAcknowledged = true;
            if (update.snapshot || update.notices.length > 0) this.publish();
            this.framePerformance.message(performance.now() - started + client.stats.receiveMs);
        }).catch(reason => { if (revision === this.loadRevision) this.fail(reason); }).finally(() => {
            if (revision !== this.loadRevision) return;
            this.inFlight = undefined;
            this.flush();
        });
    }

    public dispatch(command: SessionCommand): void {
        if (this.status !== "ready" || !this.client) return;
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
                if (!this.startPosition) throw new Error("Combat start position is missing");
                void this.launch(this.seed, false); return;
            case "dismiss-upgrade": this.upgradeIds.delete(command.itemId); break;
            default: {
                if ((command.type === "cast-skill" || command.type === "use-consumable") && (this.paused || this.hidden || this.gameOver)) return;
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
        this.loadRevision += 1;
        this.status = "failed";
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
        const running = this.status === "ready" && !this.paused && !this.hidden && !this.gameOver;
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

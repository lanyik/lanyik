import type { CombatCommand } from "../core/CombatCommand";
import type { CombatNotice, CombatSnapshot, CombatRenderState, MovementInput } from "../core/CombatState";
import { COMBAT_STEP_MS, FixedStepClock } from "../core/FixedStepClock";
import type { CombatStart, CombatView } from "./CombatView";
import { compareEquipment } from "../core/EquipmentEvaluation";
import type { Equipment } from "../core/Equipment";
import type { CombatTransport, CombatTransportFactory } from "./CombatTransport";
import { MAX_COMMAND_BATCH, MAX_STEP_BATCH, type CombatUpdate } from "../worker/CombatProtocol";
import { RenderFrame } from "../worker/RenderFrame";

export type SessionStatus = "loading" | "ready" | "failed" | "closed";

export interface VisibleNotice extends CombatNotice {
    readonly expiresAt: number;
}

export interface SessionSnapshot {
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

    public get diagnostics() { return { ...this.client?.stats, pendingSteps: this.pendingSteps, pendingCommands: this.pendingCommands.length, droppedSteps: this.droppedSteps }; }
    public get settled(): Promise<void> { return this.drain(); }
    private async drain(): Promise<void> { while (this.inFlight) await this.inFlight; }

    private async launch(seed: string, reloadWorld: boolean): Promise<void> {
        if (this.status === "closed") return;
        const revision = ++this.loadRevision;
        this.status = "loading";
        this.seed = seed.trim() || "rift-ember-1";
        this.error = undefined;
        this.paused = false;
        this.pauseAcknowledged = false; this.pendingSnapshot = false;
        this.client?.dispose(); this.client = undefined;
        this.combat = undefined; this.renderState = undefined; this.gameOver = false;
        this.inFlight = undefined; this.pendingSteps = 0; this.pendingCommands = []; this.droppedSteps = 0;
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
            this.clock.reset();
            this.syncClock();
            this.view.render(this.renderState!, 1, performance.now());
            this.publish();
        } catch (reason) {
            if (revision !== this.loadRevision) return;
            this.fail(reason);
        }
    }

    public frame(timestampMs: number): void {
        if (this.status !== "ready" || !this.client || !this.renderState) return;
        const sample = this.clock.sample(timestampMs);
        this.input = this.view.readMovement();
        const steps = this.pendingSteps + sample.steps;
        this.droppedSteps += Math.max(0, steps - MAX_STEP_BATCH);
        this.pendingSteps = Math.min(MAX_STEP_BATCH, steps);
        this.flush();
        const alpha = this.paused || this.hidden || this.gameOver ? 1 : Math.min(1, Math.max(0, (timestampMs - this.frameReceivedAt) / COMBAT_STEP_MS));
        this.view.render(this.renderState, alpha, timestampMs);
        const before = this.visibleNotices.length;
        this.visibleNotices = this.visibleNotices.filter(notice => notice.expiresAt > timestampMs);
        if (before !== this.visibleNotices.length) this.publish();
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
        this.pendingSteps = 0; this.pendingCommands = []; this.pendingSnapshot = false;
        this.inFlight = client.advance({ steps, commands, input: this.input }).then(update => {
            if (revision !== this.loadRevision) return;
            this.accept(update);
            if (this.paused && steps === 0 && !this.pendingSnapshot && this.pendingCommands.length === 0) this.pauseAcknowledged = true;
            if (update.snapshot || update.notices.length > 0) this.publish();
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
                if ((command.type === "cast-pulse" || command.type === "use-consumable") && (this.paused || this.hidden || this.gameOver)) return;
                if (this.pendingCommands.length === MAX_COMMAND_BATCH) { this.fail(new Error("Combat command queue exhausted")); return; }
                this.pendingCommands.push(command); this.flush(); return;
            }
        }
        this.publish();
    }

    public setHidden(hidden: boolean): void {
        if (this.status === "closed" || this.hidden === hidden) return;
        this.hidden = hidden;
        this.view.clearMovement();
        this.syncClock();
        this.publish();
    }

    public fail(reason: unknown): void {
        if (this.status === "closed") return;
        this.loadRevision += 1;
        this.status = "failed";
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
            if (combat && item?.kind === "equipment" && compareEquipment(item, combat.player).delta > 0) upgrades.push(item);
            else this.upgradeIds.delete(id);
        }
        if (combat) upgrades.sort((a, b) => compareEquipment(b, combat.player).delta - compareEquipment(a, combat.player).delta || a.id - b.id);
        return Object.freeze({
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

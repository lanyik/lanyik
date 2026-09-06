import type { AttributeId } from "../core/Equipment";
import { CombatSimulation, type CombatNotice, type CombatSnapshot } from "../core/CombatSimulation";
import { FixedStepClock } from "../core/FixedStepClock";
import type { CombatStart, CombatView } from "./CombatView";

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
    readonly error?: string;
}

export type SessionCommand =
    | { readonly type: "toggle-pause" }
    | { readonly type: "restart" }
    | { readonly type: "allocate"; readonly attribute: AttributeId }
    | { readonly type: "equip"; readonly itemId: number }
    | { readonly type: "discard"; readonly itemId: number };

const UI_PUBLISH_INTERVAL_MS = 100;
const NOTICE_LIFETIME_MS = 3200;

export class CombatSession {
    private readonly listeners = new Set<() => void>();
    private readonly clock = new FixedStepClock();
    private status: SessionStatus = "loading";
    private seed = "rift-ember-1";
    private paused = false;
    private hidden = document.hidden;
    private error: string | undefined;
    private simulation: CombatSimulation | undefined;
    private startPosition: CombatStart | undefined;
    private visibleNotices: VisibleNotice[] = [];
    private snapshot: SessionSnapshot;
    private loadRevision = 0;
    private lastPublishedAt = -Infinity;
    private closePromise: Promise<void> | undefined;

    constructor(private readonly view: CombatView) {
        this.snapshot = this.capture();
    }

    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    public getSnapshot = (): SessionSnapshot => this.snapshot;

    public async start(seed = this.seed): Promise<void> {
        if (this.status === "closed") return;
        const revision = ++this.loadRevision;
        this.status = "loading";
        this.seed = seed.trim() || "rift-ember-1";
        this.error = undefined;
        this.paused = false;
        this.simulation = undefined;
        this.visibleNotices = [];
        this.clock.setRunning(false);
        this.clock.reset();
        this.view.clearMovement();
        this.publish();
        try {
            const start = await this.view.load(this.seed);
            if (revision !== this.loadRevision) return;
            this.startPosition = start;
            this.simulation = new CombatSimulation(this.seed, start);
            this.status = "ready";
            this.clock.reset();
            this.syncClock();
            this.view.render(this.simulation.getRenderState(), 1, performance.now());
            this.publish();
        } catch (reason) {
            if (revision !== this.loadRevision) return;
            this.fail(reason);
        }
    }

    public frame(timestampMs: number): void {
        if (this.status !== "ready" || !this.simulation) return;
        const sample = this.clock.sample(timestampMs);
        const input = this.view.readMovement();
        for (let step = 0; step < sample.steps; step += 1) this.simulation.step(input);
        this.view.render(this.simulation.getRenderState(), this.paused || this.hidden ? 1 : sample.alpha, timestampMs);

        const notices = this.simulation.drainNotices();
        if (notices.length > 0) {
            this.visibleNotices = [
                ...this.visibleNotices,
                ...notices.map(notice => Object.freeze({ ...notice, expiresAt: timestampMs + NOTICE_LIFETIME_MS }))
            ].slice(-4);
        }
        const before = this.visibleNotices.length;
        this.visibleNotices = this.visibleNotices.filter(notice => notice.expiresAt > timestampMs);
        if (this.simulation.gameOver) this.syncClock();
        if (notices.length > 0 || before !== this.visibleNotices.length
            || (sample.steps > 0 && timestampMs - this.lastPublishedAt >= UI_PUBLISH_INTERVAL_MS)) {
            this.lastPublishedAt = timestampMs;
            this.publish();
        }
    }

    public dispatch(command: SessionCommand): void {
        if (this.status !== "ready" || !this.simulation) return;
        switch (command.type) {
            case "toggle-pause":
                if (!this.simulation.gameOver) this.paused = !this.paused;
                this.view.clearMovement();
                this.syncClock();
                break;
            case "restart":
                if (!this.startPosition) throw new Error("Combat start position is missing");
                this.simulation = new CombatSimulation(this.seed, this.startPosition);
                this.visibleNotices = [];
                this.paused = false;
                this.clock.reset();
                this.syncClock();
                break;
            case "allocate":
                this.simulation.allocateAttribute(command.attribute);
                break;
            case "equip":
                this.simulation.equip(command.itemId);
                break;
            case "discard":
                this.simulation.discard(command.itemId);
                break;
            default:
                command satisfies never;
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
        this.view.clearMovement();
        this.publish();
    }

    public dispose(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.loadRevision += 1;
        this.status = "closed";
        this.clock.setRunning(false);
        this.view.clearMovement();
        this.listeners.clear();
        this.closePromise = this.view.dispose();
        return this.closePromise;
    }

    private syncClock(): void {
        this.clock.setRunning(this.status === "ready" && !this.paused && !this.hidden && !this.simulation?.gameOver);
    }

    private capture(): SessionSnapshot {
        return Object.freeze({
            status: this.status,
            seed: this.seed,
            paused: this.paused,
            hidden: this.hidden,
            combat: this.simulation?.getSnapshot(),
            notices: Object.freeze([...this.visibleNotices]),
            error: this.error
        });
    }

    private publish(): void {
        this.snapshot = this.capture();
        for (const listener of this.listeners) listener();
    }
}

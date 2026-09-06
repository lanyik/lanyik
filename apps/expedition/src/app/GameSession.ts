import { GameClock, type GameSpeed } from "../core/GameClock";
import type { WorldSelection, WorldView } from "./WorldView";
import type { MineralId } from "../content/minerals";
import type { LandingSurvey } from "../scenarios/landingSurvey";

export type SessionStatus = "idle" | "loading" | "ready" | "failed" | "closed";
export type SessionCommand =
    | { type: "set-paused"; paused: boolean }
    | { type: "set-speed"; speed: GameSpeed }
    | { type: "focus-survey"; target: MineralId | "landing" | "expansion" };

export interface SessionSnapshot {
    readonly status: SessionStatus;
    readonly seed: string;
    readonly tick: number;
    readonly elapsedMs: number;
    readonly speed: GameSpeed;
    readonly paused: boolean;
    readonly hidden: boolean;
    readonly selection: WorldSelection | undefined;
    readonly survey: LandingSurvey | undefined;
    readonly error: string | undefined;
}

/** Owns game time and world replacement; mutations finish synchronously. */
export class GameSession {
    private clock = new GameClock();
    private status: SessionStatus = "idle";
    private seed = "expedition-1";
    private paused = false;
    private hidden = false;
    private selection: WorldSelection | undefined;
    private survey: LandingSurvey | undefined;
    private error: string | undefined;
    private revision = 0;
    private readonly listeners = new Set<() => void>();
    private closePromise: Promise<void> | undefined;
    private snapshot = this.capture();

    constructor(private readonly world: WorldView) {}

    public readonly getSnapshot = (): SessionSnapshot => this.snapshot;
    public readonly subscribe = (listener: () => void): (() => void) => {
        if (this.status === "closed") throw new Error("Game session is closed");
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    public async start(seed: string): Promise<void> {
        if (this.status === "closed") throw new Error("Game session is closed");
        if (typeof seed !== "string" || !seed.trim() || seed.trim().length > 128) {
            throw new RangeError("Planet seed must contain 1–128 characters");
        }
        const revision = ++this.revision;
        this.status = "loading";
        this.seed = seed.trim();
        this.error = undefined;
        this.selection = undefined;
        this.survey = undefined;
        this.clock.setRunning(false);
        this.publish();
        try {
            const survey = await this.world.load(this.seed);
            if (revision !== this.revision) return;
            this.survey = survey;
            this.clock = new GameClock();
            this.paused = false;
            this.status = "ready";
            this.syncClock();
            this.publish();
        } catch (reason) {
            if (revision !== this.revision) return;
            this.fail(reason);
        }
    }

    public dispatch(command: SessionCommand): void {
        if (this.status !== "ready") throw new Error("Game session is not ready");
        switch (command.type) {
            case "set-paused":
                if (typeof command.paused !== "boolean") throw new TypeError("Pause state must be boolean");
                if (this.paused === command.paused) return;
                this.paused = command.paused;
                this.syncClock();
                break;
            case "set-speed":
                if (this.clock.speed === command.speed) return;
                this.clock.setSpeed(command.speed);
                break;
            case "focus-survey": {
                const survey = this.survey!;
                const position = command.target === "landing" ? survey.landing
                    : command.target === "expansion" ? survey.expansion.node
                    : survey.resources.find(resource => resource.mineral === command.target)?.nearest;
                if (!position) throw new RangeError("Unknown survey target");
                this.world.focus(position);
                return;
            }
            default:
                throw new TypeError("Unknown session command");
        }
        this.publish();
    }

    public frame(timestampMs: number): void {
        if (this.status === "ready" && this.clock.sample(timestampMs)) this.publish();
    }

    public setHidden(hidden: boolean): void {
        if (this.status === "closed" || this.hidden === hidden) return;
        this.hidden = hidden;
        this.syncClock();
        this.publish();
    }

    public select(selection: WorldSelection): void {
        if (this.status !== "ready") return;
        this.selection = Object.freeze({ ...selection, modifiers: Object.freeze([...selection.modifiers]),
            mineral: selection.mineral && Object.freeze({ ...selection.mineral }) });
        this.publish();
    }

    public fail(reason: unknown): void {
        if (this.status === "closed") return;
        this.revision += 1;
        this.status = "failed";
        this.error = reason instanceof Error ? reason.message : String(reason);
        this.clock.setRunning(false);
        this.publish();
    }

    public dispose(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.revision += 1;
        this.status = "closed";
        this.clock.setRunning(false);
        this.publish();
        this.listeners.clear();
        this.closePromise = this.world.dispose();
        return this.closePromise;
    }

    private syncClock(): void {
        this.clock.setRunning(this.status === "ready" && !this.paused && !this.hidden);
    }

    private capture(): SessionSnapshot {
        return Object.freeze({
            status: this.status, seed: this.seed, tick: this.clock.tick,
            elapsedMs: this.clock.elapsedMs, speed: this.clock.speed,
            paused: this.paused, hidden: this.hidden, selection: this.selection, survey: this.survey, error: this.error
        });
    }

    private publish(): void {
        this.snapshot = this.capture();
        for (const listener of this.listeners) listener();
    }
}

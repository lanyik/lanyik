import { GameClock, type GameSpeed } from "../core/GameClock";
import type { WorldSelection, WorldView } from "./WorldView";
import type { MineralId, TilePosition } from "../content/minerals";
import type { LandingSurvey } from "../scenarios/landingSurvey";
import { BUILDINGS, BUILDING_IDS, type BuildingId } from "../content/buildings";
import { Industry, type BuildingSnapshot, type IndustrySnapshot, type Placement } from "../core/construction/Industry";
import type { Rotation } from "../core/spatial/footprint";
import type { PowerPriority } from "../content/energy";
import type { RecipeId } from "../content/recipes";
import { ITEM_IDS } from "../content/items";

export type SessionStatus = "idle" | "loading" | "ready" | "failed" | "closed";
export type SessionCommand =
    | { type: "set-paused"; paused: boolean }
    | { type: "set-speed"; speed: GameSpeed }
    | { type: "focus-survey"; target: MineralId | "landing" | "expansion" }
    | { type: "build-toggle" }
    | { type: "build-select"; kind: BuildingId }
    | { type: "build-rotate" }
    | { type: "build-cancel" }
    | { type: "demolish"; id: string }
    | { type: "configure-building"; id: string; enabled?: boolean; priority?: PowerPriority; recipe?: RecipeId };

export interface BuildMode { readonly kind: BuildingId; readonly rotation: Rotation; readonly preview: Placement | undefined }

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
    readonly industry: IndustrySnapshot | undefined;
    readonly build: BuildMode | undefined;
    readonly notice: string | undefined;
    readonly selectedBuilding: BuildingSnapshot | undefined;
    readonly selectedRemaining: number | undefined;
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
    private industry: Industry | undefined;
    private build: BuildMode | undefined;
    private hovered: TilePosition | undefined;
    private notice: string | undefined;
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
        this.industry = undefined;
        this.build = undefined;
        this.hovered = undefined;
        this.notice = undefined;
        this.world.showPlacement(undefined);
        this.clock.setRunning(false);
        this.publish();
        try {
            const survey = await this.world.load(this.seed);
            if (revision !== this.revision) return;
            this.survey = survey;
            this.industry = new Industry(this.world);
            this.world.showIndustry(this.industry.getSnapshot());
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
            case "build-toggle":
                this.notice = undefined;
                this.build = this.build ? undefined : Object.freeze({
                    kind: this.industry!.getSnapshot().landed ? "miner" : "command-center", rotation: 0, preview: undefined
                });
                this.refreshPreview();
                break;
            case "build-select":
                if (!BUILDING_IDS.includes(command.kind)) throw new TypeError("Unknown building type");
                this.notice = undefined;
                this.build = Object.freeze({ kind: command.kind, rotation: 0, preview: undefined });
                this.refreshPreview();
                break;
            case "build-rotate":
                if (!this.build) return;
                this.build = Object.freeze({ ...this.build, rotation: ((this.build.rotation + 1) % 6) as Rotation });
                this.refreshPreview();
                break;
            case "build-cancel":
                this.build = undefined;
                this.world.showPlacement(undefined);
                break;
            case "demolish": {
                const result = this.industry!.demolish(command.id);
                this.notice = result.message;
                if (result.ok) this.world.showIndustry(this.industry!.getSnapshot());
                this.refreshPreview();
                break;
            }
            case "configure-building":
                this.notice = this.industry!.configure(command.id, command).message;
                this.refreshPreview();
                break;
            default:
                throw new TypeError("Unknown session command");
        }
        this.publish();
    }

    public frame(timestampMs: number): void {
        if (this.status !== "ready") return;
        const previousTick = this.clock.tick;
        if (!this.clock.sample(timestampMs)) return;
        const previous = this.industry!.getSnapshot();
        this.industry!.advance(this.clock.tick - previousTick);
        const next = this.industry!.getSnapshot();
        if (next.depleted !== previous.depleted) this.world.showIndustry(next);
        if (this.build?.preview) {
            const cost = BUILDINGS[this.build.kind].cost;
            if (next.depleted !== previous.depleted || ITEM_IDS.some(id =>
                (next.inventory.amounts[id] >= cost[id]) !== (previous.inventory.amounts[id] >= cost[id]))) this.refreshPreview();
        }
        this.publish();
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
        if (this.build) {
            this.hovered = Object.freeze({ x: selection.x, y: selection.y });
            const result = this.industry!.place(this.build.kind, this.hovered, this.build.rotation);
            this.notice = result.message;
            if (result.ok) {
                this.world.showIndustry(this.industry!.getSnapshot());
                if (this.build.kind === "command-center") this.build = undefined;
                this.syncClock();
            }
            this.refreshPreview();
        }
        this.publish();
    }

    public hover(position: TilePosition | undefined): void {
        if (this.status !== "ready") return;
        if (this.hovered?.x === position?.x && this.hovered?.y === position?.y) return;
        this.hovered = position && Object.freeze({ ...position });
        if (!this.build) return;
        this.refreshPreview();
        this.publish();
    }

    public fail(reason: unknown): void {
        if (this.status === "closed") return;
        this.revision += 1;
        this.status = "failed";
        this.error = reason instanceof Error ? reason.message : String(reason);
        this.build = undefined;
        this.world.showPlacement(undefined);
        this.clock.setRunning(false);
        this.publish();
    }

    public dispose(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.revision += 1;
        this.status = "closed";
        this.build = undefined;
        this.world.showPlacement(undefined);
        this.clock.setRunning(false);
        this.publish();
        this.listeners.clear();
        this.closePromise = this.world.dispose();
        return this.closePromise;
    }

    private syncClock(): void {
        this.clock.setRunning(this.status === "ready" && this.industry?.getSnapshot().landed === true && !this.paused && !this.hidden);
    }

    private refreshPreview(): void {
        const preview = this.build && this.hovered
            ? this.industry!.preview(this.build.kind, this.hovered, this.build.rotation) : undefined;
        if (this.build) this.build = Object.freeze({ ...this.build, preview });
        this.world.showPlacement(preview);
    }

    private capture(): SessionSnapshot {
        return Object.freeze({
            status: this.status, seed: this.seed, tick: this.clock.tick,
            elapsedMs: this.clock.elapsedMs, speed: this.clock.speed,
            paused: this.paused, hidden: this.hidden, selection: this.selection, survey: this.survey, error: this.error,
            industry: this.industry?.getSnapshot(), build: this.build, notice: this.notice,
            selectedBuilding: this.selection && this.industry?.buildingAt(this.selection),
            selectedRemaining: this.selection?.mineral && this.industry?.remaining(this.selection.mineral)
        });
    }

    private publish(): void {
        this.snapshot = this.capture();
        for (const listener of this.listeners) listener();
    }
}

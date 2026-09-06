import { GameClock, type GameSpeed } from "../core/GameClock";
import type { WorldSelection, WorldView } from "./WorldView";
import { isWalkable, type MineralId, type TilePosition } from "../content/minerals";
import type { LandingSurvey } from "../scenarios/landingSurvey";
import { BUILDINGS, BUILDING_IDS, type BuildingId } from "../content/buildings";
import { Industry, type BuildingSnapshot, type IndustrySnapshot, type Placement } from "../core/construction/Industry";
import { hexDistance, type Rotation } from "../core/spatial/footprint";
import type { PowerPriority } from "../content/energy";
import type { RecipeId } from "../content/recipes";
import { ITEM_IDS } from "../content/items";
import { Explorer, explorerSpawn, touchesTile, type ExplorerSnapshot } from "../core/exploration/Explorer";
import { EXPLORER } from "../content/explorer";

export type SessionStatus = "idle" | "loading" | "ready" | "failed" | "closed";
export type SessionCommand =
    | { type: "set-paused"; paused: boolean }
    | { type: "set-speed"; speed: GameSpeed }
    | { type: "focus-survey"; target: MineralId | "landing" | "expansion" }
    | { type: "stop-walking" }
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
    readonly explorer: ExplorerSnapshot | undefined;
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
    private explorer: Explorer | undefined;
    private basePlacement: Placement | undefined;
    private explorerDirty = false;
    private explorerPublishedAt = 0;
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
        this.explorer = undefined;
        this.basePlacement = undefined;
        this.explorerDirty = false;
        this.explorerPublishedAt = 0;
        this.world.clearMovement();
        this.world.showExplorer(undefined);
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
                const position = command.target === "landing" ? this.industry!.getSnapshot().buildings.find(building => building.kind === "command-center")?.anchor ?? survey.landing
                    : command.target === "expansion" ? survey.expansion.node
                    : survey.resources.find(resource => resource.mineral === command.target)?.nearest;
                if (!position) throw new RangeError("Unknown survey target");
                if (!this.explorer) { this.world.focus(position); return; }
                this.notice = this.explorer.navigate(position) ? "正在步行前往目标，WASD 接管或空格停止" : "当前没有可通行的步行路线";
                this.world.clearMovement();
                break;
            }
            case "stop-walking":
                this.explorer?.stop();
                this.world.clearMovement();
                break;
            case "build-toggle":
                this.notice = undefined;
                if (!this.build) this.explorer?.stop();
                this.build = this.build ? undefined : Object.freeze({
                    kind: this.industry!.getSnapshot().landed ? "miner" : "command-center", rotation: 0, preview: undefined
                });
                this.refreshPreview();
                break;
            case "build-select":
                if (!BUILDING_IDS.includes(command.kind)) throw new TypeError("Unknown building type");
                this.notice = undefined;
                this.explorer?.stop();
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
                this.basePlacement = undefined;
                this.world.showPlacement(undefined);
                break;
            case "demolish": {
                const building = this.industry!.getSnapshot().buildings.find(building => building.id === command.id);
                if (building && this.outOfReach(building.cells)) { this.notice = `请走到建筑 ${EXPLORER.buildRange} 格内再拆除`; break; }
                const result = this.industry!.demolish(command.id);
                this.notice = result.message;
                if (result.ok) { this.world.showIndustry(this.industry!.getSnapshot()); this.explorer?.layoutChanged(); }
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
        if (this.explorer) {
            const input = this.world.readMovement();
            const before = this.explorer.getSnapshot();
            if (this.explorer.sample(timestampMs, { ...input, active: input.active && !this.hidden })) {
                this.explorerDirty = true;
                const after = this.explorer.getSnapshot();
                if (before.status !== after.status && after.status === "arrived") this.notice = "已到达目标附近，可以按 B 就近建造";
                if (before.status !== after.status || before.tile.x !== after.tile.x || before.tile.y !== after.tile.y) this.explorerPublishedAt = -Infinity;
                if (this.build) this.refreshPreview(false);
            }
            this.world.showExplorer(this.explorer.getSnapshot(), this.explorer.renderPoint());
        }
        const previousTick = this.clock.tick;
        const advanced = this.clock.sample(timestampMs);
        if (advanced) {
            const previous = this.industry!.getSnapshot();
            this.industry!.advance(this.clock.tick - previousTick);
            const next = this.industry!.getSnapshot();
            if (next.depleted !== previous.depleted) this.world.showIndustry(next);
            if (this.build?.preview) {
                const cost = BUILDINGS[this.build.kind].cost;
                if (next.depleted !== previous.depleted || ITEM_IDS.some(id =>
                    (next.inventory.amounts[id] >= cost[id]) !== (previous.inventory.amounts[id] >= cost[id]))) this.refreshPreview();
            }
        }
        if (!advanced && (!this.explorerDirty || timestampMs - this.explorerPublishedAt < 100)) return;
        this.explorerDirty = false;
        this.explorerPublishedAt = timestampMs;
        this.publish();
    }

    public setHidden(hidden: boolean): void {
        if (this.status === "closed" || this.hidden === hidden) return;
        this.hidden = hidden;
        this.world.clearMovement();
        this.explorer?.resetTime();
        this.syncClock();
        this.publish();
    }

    public select(selection: WorldSelection): void {
        if (this.status !== "ready") return;
        this.selection = Object.freeze({ ...selection, modifiers: Object.freeze([...selection.modifiers]),
            mineral: selection.mineral && Object.freeze({ ...selection.mineral }) });
        if (this.build) {
            this.hovered = Object.freeze({ x: selection.x, y: selection.y });
            this.refreshPreview();
            const preview = this.build.preview!;
            const result = preview.valid ? this.industry!.place(this.build.kind, this.hovered, this.build.rotation)
                : { ok: false, message: preview.message };
            this.notice = result.message;
            if (result.ok) {
                this.world.showIndustry(this.industry!.getSnapshot());
                if (this.build.kind === "command-center") {
                    const spawn = explorerSpawn(preview.cells, this.walkable);
                    if (!spawn) throw new Error("Validated explorer spawn is missing");
                    this.explorer = new Explorer(spawn, this.walkable);
                    this.world.showExplorer(this.explorer.getSnapshot());
                    this.build = undefined;
                    this.notice = "先遣员已出舱 · WASD 行走，Shift 奔跑，B 就近建造";
                } else this.explorer?.layoutChanged();
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
        this.explorer = undefined;
        this.basePlacement = undefined;
        this.world.clearMovement();
        this.world.showExplorer(undefined);
        this.world.showPlacement(undefined);
        this.clock.setRunning(false);
        this.publish();
    }

    public dispose(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.revision += 1;
        this.status = "closed";
        this.build = undefined;
        this.explorer = undefined;
        this.basePlacement = undefined;
        this.world.clearMovement();
        this.world.showExplorer(undefined);
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

    private readonly walkable = (position: TilePosition): boolean => {
        const tile = this.world.readTile(position);
        return !!tile && isWalkable(tile.terrain) && !this.industry!.isOccupied(position);
    };
    private outOfReach(cells: readonly TilePosition[]): boolean {
        const explorer = this.explorer?.getSnapshot();
        return !!explorer && cells.some(cell => hexDistance(explorer.tile, cell) > EXPLORER.buildRange);
    }
    private refreshPreview(revalidate = true): void {
        if (!this.build || !this.hovered) this.basePlacement = undefined;
        else if (revalidate || !this.basePlacement) this.basePlacement = this.industry!.preview(this.build.kind, this.hovered, this.build.rotation);
        let preview = this.basePlacement;
        if (preview?.valid) {
            const explorer = this.explorer?.getSnapshot();
            const message = explorer && preview.cells.some(cell => touchesTile(explorer, cell)) ? "占地覆盖主角，请先移开"
                : this.outOfReach(preview.cells) ? `超出施工距离，请走到 ${EXPLORER.buildRange} 格内`
                    : preview.kind === "command-center" && !explorerSpawn(preview.cells, this.walkable) ? "指挥中心旁需要留出可出舱的地块" : undefined;
            if (message) preview = Object.freeze({ ...preview, valid: false, message });
        }
        const current = this.build?.preview;
        if (current && preview && current.anchor === preview.anchor && current.valid === preview.valid && current.message === preview.message) preview = current;
        if (this.build) this.build = Object.freeze({ ...this.build, preview });
        if (current !== preview || !this.build) this.world.showPlacement(preview);
    }

    private capture(): SessionSnapshot {
        return Object.freeze({
            status: this.status, seed: this.seed, tick: this.clock.tick,
            elapsedMs: this.clock.elapsedMs, speed: this.clock.speed,
            paused: this.paused, hidden: this.hidden, selection: this.selection, survey: this.survey, error: this.error,
            industry: this.industry?.getSnapshot(), build: this.build, notice: this.notice,
            selectedBuilding: this.selection && this.industry?.buildingAt(this.selection),
            selectedRemaining: this.selection?.mineral && this.industry?.remaining(this.selection.mineral), explorer: this.explorer?.getSnapshot()
        });
    }

    private publish(): void {
        this.snapshot = this.capture();
        for (const listener of this.listeners) listener();
    }
}

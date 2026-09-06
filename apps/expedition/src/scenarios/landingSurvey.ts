import { getNeighbors } from "three-hex-map";
import { MINERALS, MINERAL_IDS, isWalkable, type MineralId, type MineralNode, type SurveyTerrain, type TilePosition } from "../content/minerals";
import type { MineralField } from "../core/resources/MineralField";

export const LANDING_RULES = Object.freeze({
    initialRadius: 18,
    expansionRadius: 32,
    clearingRadius: 2,
    buildingRadius: 8,
    minimumBuildingTiles: 60,
    minimumForestTiles: 8
});
export const SURVEY_WINDOW_SIZE = 96;
export const SURVEY_CENTRES: readonly TilePosition[] = Object.freeze([
    [0, 0], [96, 0], [0, 96], [-96, 0], [0, -96],
    [96, 96], [-96, 96], [-96, -96], [96, -96]
].map(([x, y]) => Object.freeze({ x, y })));

export interface TerrainWindow {
    readonly originX: number;
    readonly originY: number;
    readonly size: number;
    readonly tiles: readonly SurveyTerrain[];
}
export interface SurveyResource {
    readonly mineral: MineralId;
    readonly amount: number;
    readonly tiles: number;
    readonly nearest: MineralNode;
    /** Shortest ground path to an extraction tile or its adjacent work tile. */
    readonly distance: number;
}
export interface LandingSurvey {
    readonly landing: TilePosition;
    readonly buildingTiles: number;
    readonly forestTiles: number;
    readonly resources: readonly SurveyResource[];
    readonly expansion: { readonly node: MineralNode; readonly distance: number };
}
export type LandingFailure = "clearing" | "building-space" | "forest" | "minerals" | "expansion";
export interface SurveyWindowResult {
    readonly landing: LandingSurvey | undefined;
    readonly failures: Readonly<Record<LandingFailure, number>>;
}

/** A bounded, disposable working set. It never installs sampled terrain in the renderer. */
export class LandingSurveyWindow {
    private readonly nodes: readonly (MineralNode | undefined)[];

    constructor(private readonly terrain: TerrainWindow, field: Pick<MineralField, "nodeAt">) {
        if (terrain.size !== SURVEY_WINDOW_SIZE || terrain.tiles.length !== terrain.size * terrain.size
            || !Number.isSafeInteger(terrain.originX) || !Number.isSafeInteger(terrain.originY)) {
            throw new RangeError("Invalid landing survey window");
        }
        this.nodes = terrain.tiles.map((tile, index) => field.nodeAt(
            terrain.originX + index % terrain.size,
            terrain.originY + Math.floor(index / terrain.size), tile
        ));
    }

    public findLanding(): SurveyWindowResult {
        const failures: Record<LandingFailure, number> = { clearing: 0, "building-space": 0, forest: 0, minerals: 0, expansion: 0 };
        const candidates: TilePosition[] = [];
        for (let x = -12; x <= 12; x += 6) {
            for (let y = -12; y <= 12; y += 6) candidates.push({ x, y });
        }
        candidates.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y || a.x - b.x || a.y - b.y);
        for (const candidate of candidates) {
            const result = this.evaluate({
                x: this.terrain.originX + this.terrain.size / 2 + candidate.x,
                y: this.terrain.originY + this.terrain.size / 2 + candidate.y
            });
            if (typeof result !== "string") return { landing: result, failures };
            failures[result] += 1;
        }
        return { landing: undefined, failures };
    }

    public evaluate(landing: TilePosition): LandingSurvey | LandingFailure {
        // A complete radius-two patch reserves enough contiguous space for the future command centre.
        const clearing = this.flood(landing, LANDING_RULES.clearingRadius, () => true);
        if (clearing.length !== 19 || clearing.some(cell => !this.buildable(cell.index))) return "clearing";
        const building = this.flood(landing, LANDING_RULES.buildingRadius, index => this.buildable(index));
        if (building.length < LANDING_RULES.minimumBuildingTiles) return "building-space";
        const reachable = this.flood(landing, LANDING_RULES.expansionRadius, index => isWalkable(this.terrain.tiles[index]));
        const resources = new Map<MineralId, { amount: number; tiles: number; nearest: MineralNode; distance: number }>();
        const initialDeposits = new Set<string>();
        const counted = new Set<string>();
        const outer: { node: MineralNode; distance: number }[] = [];
        let forestTiles = 0;
        for (const cell of reachable) {
            if (cell.distance <= LANDING_RULES.initialRadius && this.terrain.tiles[cell.index].forest) forestTiles += 1;
            // Mountains cannot be traversed; a dry adjacent work tile can still service a mineral face.
            for (const position of [cell, ...getNeighbors(cell.x, cell.y)]) {
                const index = this.indexAt(position.x, position.y);
                const node = index === undefined ? undefined : this.nodes[index];
                if (!node || counted.has(node.id)) continue;
                counted.add(node.id);
                if (cell.distance > LANDING_RULES.initialRadius) {
                    if (node.mineral !== "stone") outer.push({ node, distance: cell.distance });
                    continue;
                }
                initialDeposits.add(node.depositId);
                const resource = resources.get(node.mineral);
                if (resource) { resource.amount += node.initialAmount; resource.tiles += 1; }
                else resources.set(node.mineral, { amount: node.initialAmount, tiles: 1, nearest: node, distance: cell.distance });
            }
        }
        if (forestTiles < LANDING_RULES.minimumForestTiles) return "forest";
        if (MINERAL_IDS.some(mineral => (resources.get(mineral)?.amount ?? 0) < MINERALS[mineral].startingAmount)) return "minerals";
        const expansion = outer.find(candidate => !initialDeposits.has(candidate.node.depositId));
        if (!expansion) return "expansion";
        return Object.freeze({
            landing: Object.freeze({ ...landing }), buildingTiles: building.length, forestTiles,
            resources: Object.freeze(MINERAL_IDS.map(mineral => Object.freeze({ mineral, ...resources.get(mineral)! }))),
            expansion: Object.freeze(expansion)
        });
    }

    private indexAt(x: number, y: number): number | undefined {
        const localX = x - this.terrain.originX;
        const localY = y - this.terrain.originY;
        return localX >= 0 && localY >= 0 && localX < this.terrain.size && localY < this.terrain.size
            ? localY * this.terrain.size + localX : undefined;
    }

    private buildable(index: number): boolean {
        const tile = this.terrain.tiles[index];
        return tile.type === "land" && !tile.hill && !tile.forest && !tile.lake && !this.nodes[index];
    }

    private flood(start: TilePosition, radius: number, allowed: (index: number) => boolean) {
        const startIndex = this.indexAt(start.x, start.y);
        const queue: { x: number; y: number; index: number; distance: number }[] = [];
        if (startIndex === undefined || !allowed(startIndex)) return queue;
        const visited = new Uint8Array(this.terrain.tiles.length);
        visited[startIndex] = 1;
        queue.push({ ...start, index: startIndex, distance: 0 });
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const current = queue[cursor];
            if (current.distance === radius) continue;
            for (const neighbor of getNeighbors(current.x, current.y)) {
                const index = this.indexAt(neighbor.x, neighbor.y);
                if (index === undefined || visited[index]) continue;
                visited[index] = 1;
                if (allowed(index)) queue.push({ ...neighbor, index, distance: current.distance + 1 });
            }
        }
        return queue;
    }
}

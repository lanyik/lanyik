import { Point } from "../interfaces";
import {
    HierarchicalPathfinder,
    HierarchicalPathOptions
} from "../world/HierarchicalPathfinder";
import {
    SimulationSystem,
    WorldSimulationRuntime
} from "./WorldSimulationRuntime";

export type ArmyMarchStatus = "idle" | "marching" | "arrived";

export interface ArmyMarchState {
    label: string;
    speedTilesPerSecond: number;
    status: ArmyMarchStatus;
    destination?: Point;
    route: readonly Point[];
    nextWaypointIndex: number;
    tileProgress: number;
    tilesTravelled: number;
    completedMarches: number;
}

export interface ArmyMarchStateOptions {
    label?: string;
    speedTilesPerSecond?: number;
}

export interface ArmyMarchOrderOptions extends Pick<HierarchicalPathOptions, "maxVisitedPortals" | "signal"> {}

export interface ArmyMarchOrderResult {
    pathLength: number;
    sourceChunks: number;
    visitedPortals: number;
    destination: Point;
}

export class ArmyMarchRouteNotFoundError extends Error {
    public readonly name = "ArmyMarchRouteNotFoundError";
    constructor(public readonly armyId: string, public readonly destination: Point) {
        super(`army "${armyId}" cannot reach (${destination.x}, ${destination.y})`);
    }
}

const copyPoint = (point: Point): Point => ({ x: point.x, y: point.y });

export function createArmyMarchState(options: ArmyMarchStateOptions = {}): ArmyMarchState {
    const label = options.label ?? "Army";
    const speedTilesPerSecond = options.speedTilesPerSecond ?? 2;
    if (typeof label !== "string" || !label.trim()) throw new TypeError("army label must be non-empty");
    if (!Number.isFinite(speedTilesPerSecond) || speedTilesPerSecond <= 0) {
        throw new RangeError("army speedTilesPerSecond must be positive and finite");
    }
    return {
        label,
        speedTilesPerSecond,
        status: "idle",
        route: [],
        nextWaypointIndex: 0,
        tileProgress: 0,
        tilesTravelled: 0,
        completedMarches: 0
    };
}

export function assertArmyMarchState(state: ArmyMarchState): void {
    if (!state || typeof state !== "object" || typeof state.label !== "string" || !state.label.trim()
        || !Number.isFinite(state.speedTilesPerSecond) || state.speedTilesPerSecond <= 0
        || !["idle", "marching", "arrived"].includes(state.status)
        || !Array.isArray(state.route)
        || !Number.isSafeInteger(state.nextWaypointIndex) || state.nextWaypointIndex < 0
        || !Number.isFinite(state.tileProgress) || state.tileProgress < 0 || state.tileProgress >= 1
        || !Number.isSafeInteger(state.tilesTravelled) || state.tilesTravelled < 0
        || !Number.isSafeInteger(state.completedMarches) || state.completedMarches < 0) {
        throw new TypeError("army march state is invalid");
    }
    for (const point of state.route) {
        if (!point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
            throw new TypeError("army march route contains invalid coordinates");
        }
    }
    if (state.destination
        && (!Number.isSafeInteger(state.destination.x) || !Number.isSafeInteger(state.destination.y))) {
        throw new TypeError("army march destination is invalid");
    }
    if (state.status === "marching"
        && (state.route.length < 2 || state.nextWaypointIndex <= 0
            || state.nextWaypointIndex >= state.route.length)) {
        throw new TypeError("marching army route cursor is invalid");
    }
}

export function createArmyMarchSystem(id = "army-march"): SimulationSystem<ArmyMarchState> {
    if (typeof id !== "string" || !id.trim()) throw new TypeError("army march system id must be non-empty");
    return {
        id,
        update(context) {
            for (const entity of context.entities) {
                const state = entity.state;
                assertArmyMarchState(state);
                if (state.status !== "marching") continue;
                let progress = state.tileProgress + context.deltaSeconds * state.speedTilesPerSecond;
                let nextWaypointIndex = state.nextWaypointIndex;
                let tilesTravelled = state.tilesTravelled;
                while (progress >= 1 && nextWaypointIndex < state.route.length) {
                    const waypoint = state.route[nextWaypointIndex];
                    context.moveEntity(entity.id, waypoint.x, waypoint.y);
                    nextWaypointIndex += 1;
                    tilesTravelled += 1;
                    progress -= 1;
                }
                const arrived = nextWaypointIndex >= state.route.length;
                context.setEntityState(entity.id, {
                    ...state,
                    status: arrived ? "arrived" : "marching",
                    route: arrived ? [] : state.route.map(copyPoint),
                    nextWaypointIndex: arrived ? 0 : nextWaypointIndex,
                    tileProgress: arrived ? 0 : progress,
                    tilesTravelled,
                    completedMarches: state.completedMarches + (arrived ? 1 : 0)
                });
            }
        }
    };
}

export async function orderArmyMarch(
    runtime: WorldSimulationRuntime<ArmyMarchState>,
    pathfinder: HierarchicalPathfinder,
    armyId: string,
    destination: Point,
    options: ArmyMarchOrderOptions = {}
): Promise<ArmyMarchOrderResult> {
    if (typeof armyId !== "string" || !armyId.trim()) throw new TypeError("army id must be non-empty");
    if (!destination || typeof destination !== "object"
        || !Number.isSafeInteger(destination.x) || !Number.isSafeInteger(destination.y)) {
        throw new TypeError("army destination must use safe integer coordinates");
    }
    const army = runtime.getEntity(armyId);
    if (!army) throw new Error(`simulation army "${armyId}" does not exist`);
    assertArmyMarchState(army.state);
    const result = await pathfinder.find(army, destination, options);
    try {
        if (result.path.length === 0) {
            throw new ArmyMarchRouteNotFoundError(armyId, copyPoint(destination));
        }
        const route = result.path.map(copyPoint);
        const state: ArmyMarchState = route.length === 1
            ? {
                ...army.state,
                status: "arrived",
                destination: copyPoint(destination),
                route: [],
                nextWaypointIndex: 0,
                tileProgress: 0,
                completedMarches: army.state.completedMarches + 1
            }
            : {
                ...army.state,
                status: "marching",
                destination: copyPoint(destination),
                route,
                nextWaypointIndex: 1,
                tileProgress: 0
            };
        if (!runtime.setEntityState(armyId, state)) {
            throw new Error(`simulation army "${armyId}" disappeared while assigning its route`);
        }
        return {
            pathLength: route.length,
            sourceChunks: result.chunks.length,
            visitedPortals: result.visitedPortals,
            destination: copyPoint(destination)
        };
    } finally {
        result.release();
    }
}

import {
    WorldSimulationCheckpoint,
    WorldSimulationRuntime
} from "../simulation/WorldSimulationRuntime";
import { WorldDeltaCheckpoint } from "../world/WorldSource";
import { GenerationCheckpointParticipant } from "./GenerationCheckpointCoordinator";

export interface WorldDeltaCheckpointSource {
    createDeltaCheckpointSnapshot(): Promise<WorldDeltaCheckpoint>;
    restoreDeltaCheckpointSnapshot(snapshot: WorldDeltaCheckpoint): Promise<void>;
}

export interface WorldDeltaGenerationParticipantOptions {
    afterRestore?(snapshot: WorldDeltaCheckpoint): Promise<void> | void;
}

export function createSimulationGenerationParticipant<State>(
    runtime: WorldSimulationRuntime<State>
): GenerationCheckpointParticipant<WorldSimulationCheckpoint<State>> {
    if (!runtime || typeof runtime.createCheckpointSnapshot !== "function"
        || typeof runtime.restoreCheckpointSnapshot !== "function") {
        throw new TypeError("simulation runtime does not support generation checkpoints");
    }
    return {
        id: "simulation",
        version: 1,
        required: true,
        capture: () => runtime.createCheckpointSnapshot(),
        restore: (_context, snapshot) => runtime.restoreCheckpointSnapshot(snapshot)
    };
}

export function createWorldDeltaGenerationParticipant(
    source: WorldDeltaCheckpointSource,
    options: WorldDeltaGenerationParticipantOptions = {}
): GenerationCheckpointParticipant<WorldDeltaCheckpoint> {
    if (!source || typeof source.createDeltaCheckpointSnapshot !== "function"
        || typeof source.restoreDeltaCheckpointSnapshot !== "function") {
        throw new TypeError("world source does not support generation checkpoints");
    }
    return {
        id: "terrain-deltas",
        version: 1,
        required: true,
        capture: () => source.createDeltaCheckpointSnapshot(),
        restore: async (_context, snapshot) => {
            await source.restoreDeltaCheckpointSnapshot(snapshot);
            await options.afterRestore?.(snapshot);
        }
    };
}

import { WorldDeltaCheckpoint } from "../world/WorldSource";
import { GenerationCheckpointParticipant } from "./GenerationCheckpointCoordinator";

export interface WorldDeltaCheckpointSource {
    createDeltaCheckpointSnapshot(): Promise<WorldDeltaCheckpoint>;
    restoreDeltaCheckpointSnapshot(snapshot: WorldDeltaCheckpoint): Promise<void>;
}

export interface WorldDeltaGenerationParticipantOptions {
    afterRestore?(snapshot: WorldDeltaCheckpoint): Promise<void> | void;
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

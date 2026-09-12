import { WorldDeltaCheckpoint } from "../world/WorldSource";
import { GenerationCheckpointParticipant } from "./GenerationCheckpointCoordinator";

export interface WorldDeltaCheckpointSource {
    createDeltaCheckpointSnapshot(signal?: AbortSignal): Promise<WorldDeltaCheckpoint>;
    restoreDeltaCheckpointSnapshot(snapshot: WorldDeltaCheckpoint, signal?: AbortSignal): Promise<void>;
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
        capture: context => source.createDeltaCheckpointSnapshot(context.signal),
        restore: async (context, snapshot) => {
            await source.restoreDeltaCheckpointSnapshot(snapshot, context.signal);
            // A successful replacement has committed. Finish required view/cache
            // synchronization even when cancellation follows that commit.
            await options.afterRestore?.(snapshot);
        }
    };
}

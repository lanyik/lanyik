import type { Point } from "../interfaces";
import type { ForestField } from "../objects/Forest";
import type { GrassField } from "../objects/Grass";
import type { WorldChunk } from "../world/WorldSource";
import type { WorldVegetationLayout } from "../world/generateVegetation";

// Mutable render-session record shared by built-in and extension layers for a
// single streamed chunk. Keeping it out of HexMap makes the ownership shape
// explicit without exposing it as public API.
export interface WorldChunkLayers {
    chunk: WorldChunk;
    points: readonly Point[];
    revision: number;
    grass?: GrassField;
    grassBuildRevision?: number;
    forest?: ForestField;
    forestBuildRevision?: number;
    cityPromise?: Promise<void>;
    forestPromise?: Promise<void>;
    vegetationPromise?: Promise<WorldVegetationLayout | undefined>;
    vegetationAbort?: AbortController;
    vegetationSignature?: string;
    requestedVegetationScale?: number;
    requestedVegetationSignature?: string;
    grassVegetationSignature?: string;
    forestVegetationSignature?: string;
    renderLayerPromises?: Map<string, Promise<void>>;
    renderLayerStates?: Map<string, "mounting" | "mounted" | "unmounted">;
    renderLayerMountRevisions?: Map<string, number>;
}

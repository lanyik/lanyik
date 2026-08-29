import { SemanticChunkKey, semanticTileIndex } from "./BaseSemanticChunk";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export const NAVIGATION_OVERRIDE_SECTION_FORMAT_VERSION = 1;
export const MAX_NAVIGATION_OVERRIDE_ENTRIES = WORLD_SEMANTIC_CHUNK_SIZE
    * WORLD_SEMANTIC_CHUNK_SIZE;
export const NAVIGATION_OVERRIDE_SECTION_BASE_RESIDENT_BYTES = 96;

export interface NavigationOverrideSection {
    readonly formatVersion: typeof NAVIGATION_OVERRIDE_SECTION_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly tileIndex: Uint16Array;
    // Zero explicitly blocks traversal. A positive Q8 value explicitly allows
    // traversal at that absolute cost, regardless of derived water or slope.
    readonly traversalCostQ8: Uint16Array;
}

export interface NavigationOverrideSectionInput extends Omit<NavigationOverrideSection,
    "formatVersion" | "key"> {
    readonly key: SemanticChunkKey;
}

export function assertNavigationOverrideSection(
    section: Readonly<NavigationOverrideSection>
): void {
    if (!section || typeof section !== "object"
        || section.formatVersion !== NAVIGATION_OVERRIDE_SECTION_FORMAT_VERSION
        || typeof section.worldIdentity !== "string" || section.worldIdentity.length === 0
        || section.worldIdentity.length > 16_384
        || !section.key || !Number.isSafeInteger(section.key.chunkX)
        || !Number.isSafeInteger(section.key.chunkY)
        || !Number.isSafeInteger(section.revision) || section.revision <= 0
        || !(section.tileIndex instanceof Uint16Array)
        || section.tileIndex.length === 0
        || section.tileIndex.length > MAX_NAVIGATION_OVERRIDE_ENTRIES
        || !(section.traversalCostQ8 instanceof Uint16Array)
        || section.traversalCostQ8.length !== section.tileIndex.length) {
        throw new TypeError("navigation override section violates its frozen layout");
    }
    chunkOrigin(section.key.chunkX, section.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    if (section.tileIndex.buffer === section.traversalCostQ8.buffer) {
        throw new Error("navigation override arrays must own distinct buffers");
    }
    let previous = -1;
    for (const tileIndex of section.tileIndex) {
        if (tileIndex <= previous || tileIndex >= MAX_NAVIGATION_OVERRIDE_ENTRIES) {
            throw new Error("navigation override tile indices must be unique ascending X-major values");
        }
        previous = tileIndex;
    }
}

export function createNavigationOverrideSection(
    input: Readonly<NavigationOverrideSectionInput>
): NavigationOverrideSection {
    if (!input || typeof input !== "object") {
        throw new TypeError("navigation override section input is required");
    }
    const section: NavigationOverrideSection = Object.freeze({
        formatVersion: NAVIGATION_OVERRIDE_SECTION_FORMAT_VERSION,
        worldIdentity: input.worldIdentity,
        key: Object.freeze({ chunkX: input.key.chunkX, chunkY: input.key.chunkY }),
        revision: input.revision,
        tileIndex: input.tileIndex,
        traversalCostQ8: input.traversalCostQ8
    });
    assertNavigationOverrideSection(section);
    return section;
}

export function navigationOverrideEntryIndex(
    section: Readonly<NavigationOverrideSection>,
    localX: number,
    localY: number
): number {
    const tileIndex = semanticTileIndex(localX, localY);
    let minimum = 0;
    let maximum = section.tileIndex.length - 1;
    while (minimum <= maximum) {
        const middle = (minimum + maximum) >>> 1;
        const candidate = section.tileIndex[middle];
        if (candidate === tileIndex) return middle;
        if (candidate < tileIndex) minimum = middle + 1;
        else maximum = middle - 1;
    }
    return -1;
}

export function navigationOverrideSectionResidentBytes(
    section: Readonly<NavigationOverrideSection>
): number {
    assertNavigationOverrideSection(section);
    return NAVIGATION_OVERRIDE_SECTION_BASE_RESIDENT_BYTES
        + section.worldIdentity.length * 2
        + section.tileIndex.byteLength
        + section.traversalCostQ8.byteLength;
}

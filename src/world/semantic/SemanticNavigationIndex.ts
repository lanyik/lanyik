import { EffectiveWorldSnapshot } from "./EffectiveWorldView";
import { HydrologyWaterKind } from "./DerivedHydrologyRaster";
import { SemanticChunkKey, WORLD_SEMANTIC_CHUNK_SIZE } from "./WorldSemanticFormat";
import { WorldChangeSet } from "./WorldChangeSet";

export const WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION = 3;

export interface SemanticNavigationHydrologySample {
    readonly coverage: number;
    readonly kind: HydrologyWaterKind;
}

export interface SemanticNavigationAuthority {
    captureNavigationChunk(key: SemanticChunkKey): EffectiveWorldSnapshot | Promise<EffectiveWorldSnapshot>;
    sampleHydrology(snapshot: EffectiveWorldSnapshot, x: number, y: number): SemanticNavigationHydrologySample;
}

export interface SemanticNavigationPortal {
    readonly side: "west" | "east" | "north" | "south";
    readonly start: number;
    readonly end: number;
    readonly minimumCost: number;
}

export interface SemanticNavigationDependencyKey {
    readonly worldIdentity: string;
    readonly semanticChunks: readonly Readonly<{
        readonly chunkX: number;
        readonly chunkY: number;
        readonly baseRevision: number;
        readonly deltaRevision: number;
    }>[];
    readonly hydrologyRegions: readonly Readonly<{
        readonly regionX: number;
        readonly regionY: number;
        readonly baseRevision: number;
        readonly features: readonly Readonly<{
            readonly featureId: string;
            readonly revision: number;
        }>[];
    }>[];
}

export interface SemanticNavigationChunkSummary {
    readonly formatVersion: typeof WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION;
    readonly key: SemanticChunkKey;
    readonly effectiveRevision: number;
    readonly dependencyKey: SemanticNavigationDependencyKey;
    readonly passable: Uint8Array;
    readonly movementCost: Uint16Array;
    readonly portals: readonly SemanticNavigationPortal[];
    readonly byteLength: number;
}

export interface SemanticNavigationIndexOptions {
    readonly authority: SemanticNavigationAuthority;
    readonly cacheBudgetBytes: number;
    readonly maximumSlope?: number;
}

function keyString(key: SemanticChunkKey): string { return `${key.chunkX},${key.chunkY}`; }

function assertKey(key: SemanticChunkKey): void {
    if (!key || !Number.isSafeInteger(key.chunkX) || !Number.isSafeInteger(key.chunkY)) {
        throw new TypeError("semantic navigation chunk key is invalid");
    }
}

function index(localX: number, localY: number): number {
    return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
}

function dependencyKey(snapshot: EffectiveWorldSnapshot): SemanticNavigationDependencyKey {
    return Object.freeze({
        worldIdentity: snapshot.worldIdentity,
        semanticChunks: Object.freeze(snapshot.semanticChunks.map(chunk => Object.freeze({
            chunkX: chunk.base.key.chunkX,
            chunkY: chunk.base.key.chunkY,
            baseRevision: chunk.base.revision,
            deltaRevision: chunk.delta?.revision ?? 0
        }))),
        hydrologyRegions: Object.freeze(snapshot.hydrologyRegions.map(region => Object.freeze({
            regionX: region.base.key.regionX,
            regionY: region.base.key.regionY,
            baseRevision: region.base.revision,
            features: Object.freeze(region.featureDeltas.map(feature => Object.freeze({
                featureId: feature.featureId,
                revision: feature.revision
            })))
        })))
    });
}

function dependencyKeysEqual(
    first: SemanticNavigationDependencyKey,
    second: SemanticNavigationDependencyKey
): boolean {
    if (first.worldIdentity !== second.worldIdentity
        || first.semanticChunks.length !== second.semanticChunks.length
        || first.hydrologyRegions.length !== second.hydrologyRegions.length) return false;
    for (let index = 0; index < first.semanticChunks.length; index += 1) {
        const left = first.semanticChunks[index];
        const right = second.semanticChunks[index];
        if (left.chunkX !== right.chunkX || left.chunkY !== right.chunkY
            || left.baseRevision !== right.baseRevision || left.deltaRevision !== right.deltaRevision) return false;
    }
    for (let index = 0; index < first.hydrologyRegions.length; index += 1) {
        const left = first.hydrologyRegions[index];
        const right = second.hydrologyRegions[index];
        if (left.regionX !== right.regionX || left.regionY !== right.regionY
            || left.baseRevision !== right.baseRevision || left.features.length !== right.features.length) return false;
        for (let featureIndex = 0; featureIndex < left.features.length; featureIndex += 1) {
            const leftFeature = left.features[featureIndex];
            const rightFeature = right.features[featureIndex];
            if (leftFeature.featureId !== rightFeature.featureId
                || leftFeature.revision !== rightFeature.revision) return false;
        }
    }
    return true;
}

function portalRuns(
    passable: Uint8Array,
    costs: Uint16Array,
    side: SemanticNavigationPortal["side"]
): readonly SemanticNavigationPortal[] {
    const values: SemanticNavigationPortal[] = [];
    const tileIndex = (offset: number): number => {
        if (side === "west") return index(0, offset);
        if (side === "east") return index(WORLD_SEMANTIC_CHUNK_SIZE - 1, offset);
        if (side === "north") return index(offset, 0);
        return index(offset, WORLD_SEMANTIC_CHUNK_SIZE - 1);
    };
    let start = -1;
    let minimumCost = 65535;
    for (let offset = 0; offset <= WORLD_SEMANTIC_CHUNK_SIZE; offset += 1) {
        const open = offset < WORLD_SEMANTIC_CHUNK_SIZE && passable[tileIndex(offset)] !== 0;
        if (open) {
            if (start < 0) start = offset;
            minimumCost = Math.min(minimumCost, costs[tileIndex(offset)]);
        } else if (start >= 0) {
            values.push(Object.freeze({ side, start, end: offset - 1, minimumCost }));
            start = -1;
            minimumCost = 65535;
        }
    }
    return Object.freeze(values);
}

export class SemanticNavigationIndex {
    public readonly chunkSize = WORLD_SEMANTIC_CHUNK_SIZE;
    private readonly authority: SemanticNavigationAuthority;
    private readonly cacheBudgetBytes: number;
    private readonly maximumSlope: number;
    private readonly cache = new Map<string, SemanticNavigationChunkSummary>();
    private cacheBytes = 0;
    private disposed = false;

    constructor(options: SemanticNavigationIndexOptions) {
        if (!options || !options.authority || typeof options.authority.captureNavigationChunk !== "function"
            || typeof options.authority.sampleHydrology !== "function"
            || !Number.isSafeInteger(options.cacheBudgetBytes) || options.cacheBudgetBytes <= 0) {
            throw new TypeError("SemanticNavigationIndex options are invalid");
        }
        this.authority = options.authority;
        this.cacheBudgetBytes = options.cacheBudgetBytes;
        this.maximumSlope = options.maximumSlope ?? 0.22;
        if (!Number.isFinite(this.maximumSlope) || this.maximumSlope <= 0 || this.maximumSlope > 1) {
            throw new RangeError("semantic navigation maximumSlope must be in (0, 1]");
        }
    }

    public async getSummary(key: SemanticChunkKey): Promise<SemanticNavigationChunkSummary> {
        this.assertReady();
        assertKey(key);
        const serialized = keyString(key);
        const cached = this.cache.get(serialized);
        const snapshot = await this.authority.captureNavigationChunk(key);
        const currentDependency = dependencyKey(snapshot);
        if (cached && dependencyKeysEqual(cached.dependencyKey, currentDependency)) {
            this.cache.delete(serialized);
            const current = cached.effectiveRevision === snapshot.effectiveRevision ? cached : Object.freeze({
                ...cached,
                effectiveRevision: snapshot.effectiveRevision
            });
            this.cache.set(serialized, current);
            return current;
        }
        if (cached) {
            this.cache.delete(serialized);
            this.cacheBytes -= cached.byteLength;
        }
        const summary = this.compile(key, snapshot);
        if (summary.byteLength > this.cacheBudgetBytes) {
            throw new RangeError("semantic navigation summary exceeds its cache budget");
        }
        while (this.cacheBytes + summary.byteLength > this.cacheBudgetBytes) {
            const oldest = this.cache.entries().next().value as [string, SemanticNavigationChunkSummary] | undefined;
            if (!oldest) break;
            this.cache.delete(oldest[0]);
            this.cacheBytes -= oldest[1].byteLength;
        }
        this.cache.set(serialized, summary);
        this.cacheBytes += summary.byteLength;
        return summary;
    }

    public applyChangeSet(changeSet: WorldChangeSet): number {
        this.assertReady();
        let invalidated = 0;
        for (const chunk of changeSet.navigationChunks) {
            const cached = this.cache.get(keyString(chunk.key));
            if (!cached) continue;
            this.cache.delete(keyString(chunk.key));
            this.cacheBytes -= cached.byteLength;
            invalidated += 1;
        }
        return invalidated;
    }

    public dispose(): void {
        this.disposed = true;
        this.cache.clear();
        this.cacheBytes = 0;
    }

    public get stats(): Readonly<{ entries: number; bytes: number; budgetBytes: number }> {
        return Object.freeze({ entries: this.cache.size, bytes: this.cacheBytes, budgetBytes: this.cacheBudgetBytes });
    }

    private compile(key: SemanticChunkKey, snapshot: EffectiveWorldSnapshot): SemanticNavigationChunkSummary {
        const passable = new Uint8Array(WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE);
        const movementCost = new Uint16Array(passable.length);
        const originX = key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
        const originY = key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
        for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
            for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
                const tile = snapshot.getTile(originX + localX, originY + localY);
                const east = snapshot.getTile(originX + Math.min(localX + 1, WORLD_SEMANTIC_CHUNK_SIZE - 1), originY + localY);
                const south = snapshot.getTile(originX + localX, originY + Math.min(localY + 1, WORLD_SEMANTIC_CHUNK_SIZE - 1));
                const slope = Math.max(Math.abs(tile.macroHeight - east.macroHeight), Math.abs(tile.macroHeight - south.macroHeight));
                const water = this.authority.sampleHydrology(snapshot, originX + localX, originY + localY);
                const tileIndex = index(localX, localY);
                const open = slope <= this.maximumSlope && water.coverage < 128;
                passable[tileIndex] = open ? 1 : 0;
                movementCost[tileIndex] = open
                    ? Math.min(65535, 256 + Math.round(slope * 4096) + (tile.substrateClass === 3 ? 192 : 0))
                    : 65535;
            }
        }
        const portals = Object.freeze((["west", "east", "north", "south"] as const)
            .flatMap(side => portalRuns(passable, movementCost, side)));
        return Object.freeze({
            formatVersion: WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION,
            key: Object.freeze({ ...key }),
            effectiveRevision: snapshot.effectiveRevision,
            dependencyKey: dependencyKey(snapshot),
            passable,
            movementCost,
            portals,
            byteLength: passable.byteLength + movementCost.byteLength + portals.length * 16
        });
    }

    private assertReady(): void {
        if (this.disposed) throw new Error("SemanticNavigationIndex has been disposed");
    }
}

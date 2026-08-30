import { hydrologyFeatureBounds, HydrologyFeatureBounds } from "./HydrologyFeatureDelta";
import { HydrologyFeatureId } from "./MacroDrainageGraph";
import {
    HYDROLOGY_REGION_SIZE,
    HydrologyRegionKey,
    SemanticChunkKey,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./WorldSemanticFormat";
import { SURFACE_INFLUENCE_RADIUS_TILES, SURFACE_RENDER_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { canonicalizeRenderChunkKey, RenderChunkKey } from "./SurfaceDependency";
import {
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey,
    WorldDescriptorV2
} from "./WorldDescriptorV2";

export enum WorldChangeDomain {
    Height = 1 << 0,
    Material = 1 << 1,
    Hydrology = 1 << 2,
    Vegetation = 1 << 3,
    Navigation = 1 << 4,
    Fog = 1 << 5,
    Application = 1 << 6
}

export interface TileBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

export interface DirtySemanticChunk {
    readonly key: SemanticChunkKey;
    readonly domains: number;
    readonly localBounds: TileBounds;
}

export interface DirtyHydrologyFeature {
    readonly featureId: HydrologyFeatureId;
    readonly previousBounds?: HydrologyFeatureBounds;
    readonly nextBounds?: HydrologyFeatureBounds;
}

export interface DirtyHydrologyRegion {
    readonly key: HydrologyRegionKey;
}

export interface DirtyRenderChunk {
    readonly key: RenderChunkKey;
    readonly domains: number;
}

export interface DirtyNavigationChunk {
    readonly key: SemanticChunkKey;
}

export interface DirtySimulationChunk {
    readonly chunkX: number;
    readonly chunkY: number;
}

export interface WorldChangeSet {
    readonly transactionId: bigint;
    readonly revision: number;
    readonly domains: number;
    readonly semanticChunks: readonly DirtySemanticChunk[];
    readonly hydrologyFeatures: readonly DirtyHydrologyFeature[];
    readonly hydrologyRegions: readonly DirtyHydrologyRegion[];
    readonly renderChunks: readonly DirtyRenderChunk[];
    readonly navigationChunks: readonly DirtyNavigationChunk[];
    readonly simulationChunks: readonly DirtySimulationChunk[];
}

export interface SemanticChangePoint {
    readonly x: number;
    readonly y: number;
    readonly domains: number;
}

export interface HydrologyFeatureChange {
    readonly featureId: HydrologyFeatureId;
    readonly previous?: Parameters<typeof hydrologyFeatureBounds>[0];
    readonly next?: Parameters<typeof hydrologyFeatureBounds>[0];
}

interface MutableBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface MutableDomainBounds extends MutableBounds {
    domains: number;
}

function assertDomainMask(value: number): void {
    const all = WorldChangeDomain.Height | WorldChangeDomain.Material | WorldChangeDomain.Hydrology
        | WorldChangeDomain.Vegetation | WorldChangeDomain.Navigation | WorldChangeDomain.Fog
        | WorldChangeDomain.Application;
    if (!Number.isSafeInteger(value) || value <= 0 || (value & ~all) !== 0) {
        throw new RangeError("world change domain mask is invalid");
    }
}

function assertCoordinate(name: string, value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

function nestedGetOrCreate<T>(
    rows: Map<number, Map<number, T>>,
    x: number,
    y: number,
    create: () => T
): T {
    let row = rows.get(x);
    if (!row) {
        row = new Map<number, T>();
        rows.set(x, row);
    }
    let value = row.get(y);
    if (!value) {
        value = create();
        row.set(y, value);
    }
    return value;
}

function addPointBounds(
    rows: Map<number, Map<number, MutableDomainBounds>>,
    chunkX: number,
    chunkY: number,
    localX: number,
    localY: number,
    domains: number
): void {
    const value = nestedGetOrCreate(rows, chunkX, chunkY, () => ({
        minX: localX,
        minY: localY,
        maxX: localX,
        maxY: localY,
        domains: 0
    }));
    value.minX = Math.min(value.minX, localX);
    value.minY = Math.min(value.minY, localY);
    value.maxX = Math.max(value.maxX, localX);
    value.maxY = Math.max(value.maxY, localY);
    value.domains |= domains;
}

function forEachChunkInBounds(
    bounds: TileBounds,
    size: number,
    visit: (chunkX: number, chunkY: number) => void
): void {
    const minChunkX = Math.floor(bounds.minX / size);
    const minChunkY = Math.floor(bounds.minY / size);
    const maxChunkX = Math.floor(bounds.maxX / size);
    const maxChunkY = Math.floor(bounds.maxY / size);
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) visit(chunkX, chunkY);
    }
}

function combinedBounds(
    previous: HydrologyFeatureBounds | undefined,
    next: HydrologyFeatureBounds | undefined
): TileBounds {
    const present = previous ?? next;
    if (!present) throw new TypeError("hydrology feature change must have previous or next geometry");
    return Object.freeze({
        minX: Math.floor(Math.min(previous?.minX ?? present.minX, next?.minX ?? present.minX)),
        minY: Math.floor(Math.min(previous?.minY ?? present.minY, next?.minY ?? present.minY)),
        maxX: Math.ceil(Math.max(previous?.maxX ?? present.maxX, next?.maxX ?? present.maxX)),
        maxY: Math.ceil(Math.max(previous?.maxY ?? present.maxY, next?.maxY ?? present.maxY))
    });
}

function expanded(bounds: TileBounds, radius: number): TileBounds {
    return Object.freeze({
        minX: bounds.minX - radius,
        minY: bounds.minY - radius,
        maxX: bounds.maxX + radius,
        maxY: bounds.maxY + radius
    });
}

function sortedNested<T>(rows: Map<number, Map<number, T>>): readonly [number, number, T][] {
    const values: [number, number, T][] = [];
    for (const [x, row] of rows) for (const [y, value] of row) values.push([x, y, value]);
    values.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
    return values;
}

function canonicalTile(descriptor: WorldDescriptorV2, x: number, y: number): Readonly<{ x: number; y: number }> {
    if (descriptor.topology === "toroidal") {
        const modulo = (value: number, size: number) => ((value % size) + size) % size;
        return Object.freeze({ x: modulo(x, descriptor.width), y: modulo(y, descriptor.height) });
    }
    if (descriptor.topology === "bounded"
        && (x < 0 || y < 0 || x >= descriptor.width || y >= descriptor.height)) {
        throw new RangeError("world change lies outside bounded topology");
    }
    return Object.freeze({ x, y });
}

export function createWorldChangeSet(options: {
    readonly descriptor: WorldDescriptorV2;
    readonly transactionId: bigint;
    readonly revision: number;
    readonly semanticChanges?: readonly SemanticChangePoint[];
    readonly hydrologyChanges?: readonly HydrologyFeatureChange[];
}): WorldChangeSet {
    if (!options || typeof options !== "object" || typeof options.transactionId !== "bigint"
        || options.transactionId <= 0n || !Number.isSafeInteger(options.revision) || options.revision <= 0) {
        throw new TypeError("world change-set identity is invalid");
    }
    const semanticRows = new Map<number, Map<number, MutableDomainBounds>>();
    const renderRows = new Map<number, Map<number, { domains: number }>>();
    const hydrologyRows = new Map<number, Map<number, true>>();
    const navigationRows = new Map<number, Map<number, true>>();
    const simulationRows = new Map<number, Map<number, true>>();
    let domains = 0;

    const addRenderBounds = (bounds: TileBounds, changeDomains: number): void => {
        forEachChunkInBounds(bounds, SURFACE_RENDER_CHUNK_SIZE, (rawX, rawY) => {
            let key: RenderChunkKey;
            try {
                key = canonicalizeRenderChunkKey(options.descriptor, { chunkX: rawX, chunkY: rawY });
            } catch (reason) {
                if (options.descriptor.topology === "bounded" && reason instanceof RangeError) return;
                throw reason;
            }
            nestedGetOrCreate(renderRows, key.chunkX, key.chunkY, () => ({ domains: 0 })).domains |= changeDomains;
        });
    };
    const addConsumerBounds = (bounds: TileBounds): void => {
        forEachChunkInBounds(bounds, WORLD_SEMANTIC_CHUNK_SIZE, (rawX, rawY) => {
            let key: SemanticChunkKey;
            try {
                key = canonicalizeSemanticChunkKey(options.descriptor, { chunkX: rawX, chunkY: rawY });
            } catch (reason) {
                if (options.descriptor.topology === "bounded" && reason instanceof RangeError) return;
                throw reason;
            }
            nestedGetOrCreate(navigationRows, key.chunkX, key.chunkY, () => true);
        });
        forEachChunkInBounds(bounds, WORLD_SEMANTIC_CHUNK_SIZE * 2, (rawX, rawY) => {
            if (options.descriptor.topology === "bounded") {
                const originX = rawX * WORLD_SEMANTIC_CHUNK_SIZE * 2;
                const originY = rawY * WORLD_SEMANTIC_CHUNK_SIZE * 2;
                if (originX < 0 || originY < 0 || originX >= options.descriptor.width || originY >= options.descriptor.height) return;
            }
            const key = options.descriptor.topology === "toroidal"
                ? {
                    chunkX: ((rawX % Math.ceil(options.descriptor.width / 64)) + Math.ceil(options.descriptor.width / 64))
                        % Math.ceil(options.descriptor.width / 64),
                    chunkY: ((rawY % Math.ceil(options.descriptor.height / 64)) + Math.ceil(options.descriptor.height / 64))
                        % Math.ceil(options.descriptor.height / 64)
                }
                : { chunkX: rawX, chunkY: rawY };
            nestedGetOrCreate(simulationRows, key.chunkX, key.chunkY, () => true);
        });
    };

    for (const change of options.semanticChanges ?? []) {
        assertCoordinate("semantic change x", change.x);
        assertCoordinate("semantic change y", change.y);
        assertDomainMask(change.domains);
        const point = canonicalTile(options.descriptor, change.x, change.y);
        const chunkX = Math.floor(point.x / WORLD_SEMANTIC_CHUNK_SIZE);
        const chunkY = Math.floor(point.y / WORLD_SEMANTIC_CHUNK_SIZE);
        const key = canonicalizeSemanticChunkKey(options.descriptor, { chunkX, chunkY });
        const localX = point.x - chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
        const localY = point.y - chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
        addPointBounds(semanticRows, key.chunkX, key.chunkY, localX, localY, change.domains);
        domains |= change.domains;
        const influence = change.domains & (WorldChangeDomain.Height | WorldChangeDomain.Vegetation)
            ? SURFACE_INFLUENCE_RADIUS_TILES : 0;
        const dirty = expanded({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }, influence);
        addRenderBounds(dirty, change.domains);
        if (change.domains & (WorldChangeDomain.Height | WorldChangeDomain.Navigation)) addConsumerBounds(dirty);
    }

    const hydrologyFeatures: DirtyHydrologyFeature[] = [];
    for (const change of options.hydrologyChanges ?? []) {
        const previousBounds = change.previous ? hydrologyFeatureBounds(change.previous) : undefined;
        const nextBounds = change.next ? hydrologyFeatureBounds(change.next) : undefined;
        const bounds = combinedBounds(previousBounds, nextBounds);
        const dirty = expanded(bounds, SURFACE_INFLUENCE_RADIUS_TILES);
        hydrologyFeatures.push(Object.freeze({ featureId: change.featureId, previousBounds, nextBounds }));
        domains |= WorldChangeDomain.Hydrology | WorldChangeDomain.Navigation;
        addRenderBounds(dirty, WorldChangeDomain.Hydrology | WorldChangeDomain.Vegetation);
        addConsumerBounds(dirty);
        forEachChunkInBounds(bounds, HYDROLOGY_REGION_SIZE, (rawX, rawY) => {
            let key: HydrologyRegionKey;
            try {
                key = canonicalizeHydrologyRegionKey(options.descriptor, { regionX: rawX, regionY: rawY });
            } catch (reason) {
                if (options.descriptor.topology === "bounded" && reason instanceof RangeError) return;
                throw reason;
            }
            nestedGetOrCreate(hydrologyRows, key.regionX, key.regionY, () => true);
        });
    }
    hydrologyFeatures.sort((first, second) => first.featureId.localeCompare(second.featureId));

    return Object.freeze({
        transactionId: options.transactionId,
        revision: options.revision,
        domains,
        semanticChunks: Object.freeze(sortedNested(semanticRows).map(([chunkX, chunkY, value]) => Object.freeze({
            key: Object.freeze({ chunkX, chunkY }),
            domains: value.domains,
            localBounds: Object.freeze({
                minX: value.minX,
                minY: value.minY,
                maxX: value.maxX,
                maxY: value.maxY
            })
        }))),
        hydrologyFeatures: Object.freeze(hydrologyFeatures),
        hydrologyRegions: Object.freeze(sortedNested(hydrologyRows).map(([regionX, regionY]) => Object.freeze({
            key: Object.freeze({ regionX, regionY })
        }))),
        renderChunks: Object.freeze(sortedNested(renderRows).map(([chunkX, chunkY, value]) => Object.freeze({
            key: Object.freeze({ chunkX, chunkY }),
            domains: value.domains
        }))),
        navigationChunks: Object.freeze(sortedNested(navigationRows).map(([chunkX, chunkY]) => Object.freeze({
            key: Object.freeze({ chunkX, chunkY })
        }))),
        simulationChunks: Object.freeze(sortedNested(simulationRows).map(([chunkX, chunkY]) => Object.freeze({
            chunkX,
            chunkY
        })))
    });
}

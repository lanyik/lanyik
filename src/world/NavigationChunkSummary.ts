import { getNeighborCoords, NEIGHBOR_DIRECTIONS } from "../helpers/neighbors";
import { positiveModulo } from "../helpers/topology";
import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    SemanticChunkKey,
    semanticTileIndex
} from "./BaseSemanticChunk";
import {
    CompiledSurfaceChunk,
    assertCompiledSurfaceChunk
} from "./CompiledSurfaceChunk";
import {
    CompiledSurfaceSampler,
    createCompiledSurfaceSample,
    sampleCompiledGroundSlope
} from "./CompiledSurfaceSampler";
import {
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_OCEAN,
    SURFACE_WATER_KIND_RIVER
} from "./CompiledSurfaceField";
import { EffectiveSemanticChunk } from "./EffectiveSemanticChunk";
import {
    NavigationOverrideSection,
    assertNavigationOverrideSection,
    navigationOverrideEntryIndex
} from "./NavigationOverrideSection";
import {
    SurfaceDependencyKey,
    SurfaceSemanticDependency,
    assertSurfaceDependencyKey,
    serializeSurfaceDependencyKey
} from "./SurfaceDependencyKey";
import {
    SURFACE_COMPILE_PROFILE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";
import { chunkOrigin, semanticChunkLocation } from "./WorldGrid";
import {
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export const NAVIGATION_CHUNK_SUMMARY_FORMAT_VERSION = 1;
export const NAVIGATION_COST_FRACTION_BITS = 8;
export const NAVIGATION_COST_SCALE = 1 << NAVIGATION_COST_FRACTION_BITS;
export const NAVIGATION_CHUNK_SUMMARY_BASE_RESIDENT_BYTES = 256;

export interface NavigationMovementProfile {
    readonly id: string;
    readonly maximumGroundSlope: number;
    readonly dryCost: number;
    readonly slopeCostScale: number;
    readonly oceanCost: number | null;
    readonly lakeCost: number | null;
    readonly riverCost: number | null;
}

export interface NavigationChunkSummary {
    readonly formatVersion: typeof NAVIGATION_CHUNK_SUMMARY_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly key: SemanticChunkKey;
    readonly effectiveRevision: number;
    readonly baseRevision: number;
    readonly deltaRevision: number;
    readonly overrideRevision: number;
    readonly profile: NavigationMovementProfile;
    readonly surfaceDependencies: readonly [
        SurfaceDependencyKey,
        SurfaceDependencyKey,
        SurfaceDependencyKey,
        SurfaceDependencyKey
    ];
    readonly valid: Uint8Array;
    // Zero is blocked/invalid; positive values are absolute Q8 traversal costs.
    readonly traversalCostQ8: Uint16Array;
    // Zero is blocked/invalid; passable connected components start at one.
    readonly component: Uint16Array;
    readonly componentCount: number;
    readonly portalTileIndex: Uint16Array;
    readonly portalDirection: Uint8Array;
}

export interface CompileNavigationChunkSummaryOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly semantic: EffectiveSemanticChunk;
    readonly surfaces: readonly CompiledSurfaceChunk[];
    readonly profile: NavigationMovementProfile;
    readonly override?: NavigationOverrideSection;
}

interface CanonicalTile {
    readonly x: number;
    readonly y: number;
}

function assertCost(name: string, value: number | null): void {
    if (value !== null && (!Number.isFinite(value) || value <= 0
        || Math.round(value * NAVIGATION_COST_SCALE) > 0xffff)) {
        throw new RangeError(`${name} must be null or a positive Q8-representable cost`);
    }
}

export function assertNavigationMovementProfile(
    profile: Readonly<NavigationMovementProfile>
): void {
    if (!profile || typeof profile !== "object"
        || typeof profile.id !== "string" || profile.id.trim() !== profile.id
        || profile.id.length === 0 || profile.id.length > 256
        || !Number.isFinite(profile.maximumGroundSlope) || profile.maximumGroundSlope <= 0
        || !Number.isFinite(profile.dryCost) || profile.dryCost <= 0
        || !Number.isFinite(profile.slopeCostScale) || profile.slopeCostScale < 0) {
        throw new TypeError("navigation movement profile metadata is invalid");
    }
    assertCost("navigation dry cost", profile.dryCost);
    assertCost("navigation ocean cost", profile.oceanCost);
    assertCost("navigation lake cost", profile.lakeCost);
    assertCost("navigation river cost", profile.riverCost);
    if (Math.round((profile.dryCost
        + profile.maximumGroundSlope * profile.slopeCostScale) * NAVIGATION_COST_SCALE) > 0xffff) {
        throw new RangeError("navigation dry slope cost exceeds uint16 Q8 representation");
    }
}

export function createNavigationMovementProfile(
    profile: Readonly<NavigationMovementProfile>
): NavigationMovementProfile {
    assertNavigationMovementProfile(profile);
    return Object.freeze({ ...profile });
}

function canonicalTile(
    descriptor: Readonly<WorldDescriptorV2>,
    x: number,
    y: number
): CanonicalTile | undefined {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
    if (descriptor.sourceKind === "procedural-infinite") return { x, y };
    if (descriptor.sourceKind === "procedural-toroidal") {
        return { x: positiveModulo(x, descriptor.width), y: positiveModulo(y, descriptor.height) };
    }
    return x >= 0 && x < descriptor.width && y >= 0 && y < descriptor.height
        ? { x, y } : undefined;
}

function surfaceIndex(localX: number, localY: number): number {
    return Math.floor(localX / SURFACE_COMPILE_PROFILE.renderChunkSize) * 2
        + Math.floor(localY / SURFACE_COMPILE_PROFILE.renderChunkSize);
}

function expectedSurfaceKey(
    semanticKey: Readonly<SemanticChunkKey>,
    index: number
): Readonly<{ chunkX: number; chunkY: number }> {
    const originX = semanticKey.chunkX * 2;
    const originY = semanticKey.chunkY * 2;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) {
        throw new RangeError("navigation semantic key exceeds aligned render chunk coordinates");
    }
    return Object.freeze({ chunkX: originX + Math.floor(index / 2), chunkY: originY + index % 2 });
}

function assertSurfaceInputs(
    worldIdentity: string,
    semantic: Readonly<EffectiveSemanticChunk>,
    surfaces: readonly CompiledSurfaceChunk[]
): asserts surfaces is readonly [
    CompiledSurfaceChunk,
    CompiledSurfaceChunk,
    CompiledSurfaceChunk,
    CompiledSurfaceChunk
] {
    if (!Array.isArray(surfaces) || surfaces.length !== 4) {
        throw new TypeError("navigation summary requires exactly four aligned surface chunks");
    }
    let firstHexSize: number | undefined;
    let firstHeightScale: number | undefined;
    for (let index = 0; index < surfaces.length; index += 1) {
        const surface = surfaces[index];
        assertCompiledSurfaceChunk(surface);
        const expected = expectedSurfaceKey(semantic.key, index);
        if (surface.key.chunkX !== expected.chunkX || surface.key.chunkY !== expected.chunkY
            || surface.dependencyKey.worldIdentity !== worldIdentity) {
            throw new TypeError("navigation surface chunk is not aligned with its semantic owner");
        }
        const semanticDependency = surface.dependencyKey.semantic.find((dependency: SurfaceSemanticDependency) =>
            dependency.key.chunkX === semantic.key.chunkX
            && dependency.key.chunkY === semantic.key.chunkY);
        if (!semanticDependency
            || semanticDependency.baseRevision !== semantic.baseRevision
            || semanticDependency.deltaRevision !== semantic.deltaRevision) {
            throw new Error("navigation surface dependency is stale for its effective semantic chunk");
        }
        const { hexSize, heightScale } = surface.dependencyKey.metrics;
        if (firstHexSize === undefined) {
            firstHexSize = hexSize;
            firstHeightScale = heightScale;
        } else if (hexSize !== firstHexSize || heightScale !== firstHeightScale) {
            throw new Error("navigation surface chunks use inconsistent compile metrics");
        }
    }
}

function assertEffectiveSemanticMetadata(
    descriptor: Readonly<WorldDescriptorV2>,
    semantic: Readonly<EffectiveSemanticChunk>,
    worldIdentity: string
): void {
    if (!semantic || semantic.worldIdentity !== worldIdentity
        || !semantic.key || !Number.isSafeInteger(semantic.key.chunkX)
        || !Number.isSafeInteger(semantic.key.chunkY)
        || !Number.isSafeInteger(semantic.effectiveRevision) || semantic.effectiveRevision < 0
        || !Number.isSafeInteger(semantic.baseRevision) || semantic.baseRevision < 0
        || semantic.baseRevision > semantic.effectiveRevision
        || !Number.isSafeInteger(semantic.deltaRevision) || semantic.deltaRevision < 0
        || semantic.deltaRevision > semantic.effectiveRevision
        || !semantic.validBounds
        || !Number.isInteger(semantic.validBounds.minX) || semantic.validBounds.minX < 0
        || !Number.isInteger(semantic.validBounds.minY) || semantic.validBounds.minY < 0
        || !Number.isInteger(semantic.validBounds.maxXExclusive)
        || semantic.validBounds.maxXExclusive > WORLD_SEMANTIC_CHUNK_SIZE
        || !Number.isInteger(semantic.validBounds.maxYExclusive)
        || semantic.validBounds.maxYExclusive > WORLD_SEMANTIC_CHUNK_SIZE
        || semantic.validBounds.minX >= semantic.validBounds.maxXExclusive
        || semantic.validBounds.minY >= semantic.validBounds.maxYExclusive) {
        throw new TypeError("navigation effective semantic metadata is invalid");
    }
    const origin = chunkOrigin(
        semantic.key.chunkX,
        semantic.key.chunkY,
        WORLD_SEMANTIC_CHUNK_SIZE
    );
    if (descriptor.sourceKind !== "procedural-infinite"
        && (origin.x < 0 || origin.y < 0
            || origin.x >= descriptor.width || origin.y >= descriptor.height)) {
        throw new RangeError("navigation semantic key is outside its canonical world domain");
    }
}

function q8Cost(cost: number): number {
    const quantized = Math.round(cost * NAVIGATION_COST_SCALE);
    if (quantized <= 0 || quantized > 0xffff) {
        throw new RangeError("navigation traversal cost is outside uint16 Q8 representation");
    }
    return quantized;
}

function waterCost(profile: Readonly<NavigationMovementProfile>, kind: number): number | null {
    if (kind === SURFACE_WATER_KIND_OCEAN) return profile.oceanCost;
    if (kind === SURFACE_WATER_KIND_LAKE) return profile.lakeCost;
    if (kind === SURFACE_WATER_KIND_RIVER) return profile.riverCost;
    throw new Error("wet navigation sample has no canonical water kind");
}

function localNeighborIndex(
    descriptor: Readonly<WorldDescriptorV2>,
    key: Readonly<SemanticChunkKey>,
    origin: Readonly<{ x: number; y: number }>,
    tileIndex: number,
    direction: typeof NEIGHBOR_DIRECTIONS[number]
): number | undefined {
    const localX = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
    const localY = tileIndex - localX * WORLD_SEMANTIC_CHUNK_SIZE;
    const neighbor = getNeighborCoords(origin.x + localX, origin.y + localY, direction);
    const canonical = canonicalTile(descriptor, neighbor.x, neighbor.y);
    if (!canonical) return undefined;
    const location = semanticChunkLocation(canonical.x, canonical.y);
    if (location.chunkX !== key.chunkX || location.chunkY !== key.chunkY) return undefined;
    return semanticTileIndex(location.localX, location.localY);
}

function compileComponents(
    descriptor: Readonly<WorldDescriptorV2>,
    key: Readonly<SemanticChunkKey>,
    valid: Uint8Array,
    traversalCostQ8: Uint16Array
): { readonly component: Uint16Array; readonly count: number } {
    const component = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const queue = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const origin = chunkOrigin(key.chunkX, key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    let count = 0;
    for (let seed = 0; seed < BASE_SEMANTIC_CHUNK_TILE_COUNT; seed += 1) {
        if (valid[seed] === 0 || traversalCostQ8[seed] === 0 || component[seed] !== 0) continue;
        count += 1;
        let head = 0;
        let tail = 0;
        component[seed] = count;
        queue[tail] = seed;
        tail += 1;
        while (head < tail) {
            const current = queue[head];
            head += 1;
            for (const direction of NEIGHBOR_DIRECTIONS) {
                const neighbor = localNeighborIndex(descriptor, key, origin, current, direction);
                if (neighbor === undefined || valid[neighbor] === 0
                    || traversalCostQ8[neighbor] === 0 || component[neighbor] !== 0) continue;
                component[neighbor] = count;
                queue[tail] = neighbor;
                tail += 1;
            }
        }
    }
    return { component, count };
}

function compilePortals(
    descriptor: Readonly<WorldDescriptorV2>,
    key: Readonly<SemanticChunkKey>,
    valid: Uint8Array,
    traversalCostQ8: Uint16Array
): { readonly tileIndex: Uint16Array; readonly direction: Uint8Array } {
    const origin = chunkOrigin(key.chunkX, key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    const tileIndices: number[] = [];
    const directions: number[] = [];
    for (let tileIndex = 0; tileIndex < BASE_SEMANTIC_CHUNK_TILE_COUNT; tileIndex += 1) {
        if (valid[tileIndex] === 0 || traversalCostQ8[tileIndex] === 0) continue;
        const localX = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
        const localY = tileIndex - localX * WORLD_SEMANTIC_CHUNK_SIZE;
        for (let directionIndex = 0; directionIndex < NEIGHBOR_DIRECTIONS.length; directionIndex += 1) {
            const neighbor = getNeighborCoords(
                origin.x + localX,
                origin.y + localY,
                NEIGHBOR_DIRECTIONS[directionIndex]
            );
            const canonical = canonicalTile(descriptor, neighbor.x, neighbor.y);
            if (!canonical) continue;
            const owner = semanticChunkLocation(canonical.x, canonical.y);
            if (owner.chunkX === key.chunkX && owner.chunkY === key.chunkY) continue;
            tileIndices.push(tileIndex);
            directions.push(directionIndex);
        }
    }
    return {
        tileIndex: new Uint16Array(tileIndices),
        direction: new Uint8Array(directions)
    };
}

function distinctSummaryBuffers(summary: Readonly<NavigationChunkSummary>): boolean {
    return new Set([
        summary.valid.buffer,
        summary.traversalCostQ8.buffer,
        summary.component.buffer,
        summary.portalTileIndex.buffer,
        summary.portalDirection.buffer
    ]).size === 5;
}

export function assertNavigationChunkSummary(summary: Readonly<NavigationChunkSummary>): void {
    if (!summary || typeof summary !== "object"
        || summary.formatVersion !== NAVIGATION_CHUNK_SUMMARY_FORMAT_VERSION
        || typeof summary.worldIdentity !== "string" || summary.worldIdentity.length === 0
        || summary.worldIdentity.length > 16_384
        || !summary.key || !Number.isSafeInteger(summary.key.chunkX)
        || !Number.isSafeInteger(summary.key.chunkY)
        || !Number.isSafeInteger(summary.effectiveRevision) || summary.effectiveRevision < 0
        || !Number.isSafeInteger(summary.baseRevision) || summary.baseRevision < 0
        || summary.baseRevision > summary.effectiveRevision
        || !Number.isSafeInteger(summary.deltaRevision) || summary.deltaRevision < 0
        || summary.deltaRevision > summary.effectiveRevision
        || !Number.isSafeInteger(summary.overrideRevision) || summary.overrideRevision < 0
        || !Number.isInteger(summary.componentCount) || summary.componentCount < 0
        || summary.componentCount > BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !Array.isArray(summary.surfaceDependencies) || summary.surfaceDependencies.length !== 4
        || !(summary.valid instanceof Uint8Array)
        || summary.valid.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(summary.traversalCostQ8 instanceof Uint16Array)
        || summary.traversalCostQ8.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(summary.component instanceof Uint16Array)
        || summary.component.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(summary.portalTileIndex instanceof Uint16Array)
        || !(summary.portalDirection instanceof Uint8Array)
        || summary.portalDirection.length !== summary.portalTileIndex.length
        || !distinctSummaryBuffers(summary)) {
        throw new TypeError("navigation chunk summary violates its frozen layout");
    }
    chunkOrigin(summary.key.chunkX, summary.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    assertNavigationMovementProfile(summary.profile);
    const seenComponents = new Uint8Array(summary.componentCount + 1);
    let highestComponent = 0;
    for (let index = 0; index < BASE_SEMANTIC_CHUNK_TILE_COUNT; index += 1) {
        const valid = summary.valid[index];
        const cost = summary.traversalCostQ8[index];
        const component = summary.component[index];
        if ((valid !== 0 && valid !== 1)
            || valid === 0 && (cost !== 0 || component !== 0)
            || cost === 0 && component !== 0
            || cost !== 0 && (valid === 0 || component === 0 || component > summary.componentCount)) {
            throw new Error("navigation tile validity, cost and component disagree");
        }
        if (component !== 0) seenComponents[component] = 1;
        highestComponent = Math.max(highestComponent, component);
    }
    if (highestComponent !== summary.componentCount
        || seenComponents.some((seen, index) => index !== 0 && seen === 0)) {
        throw new Error("navigation component count is not canonical");
    }
    let previousTile = -1;
    let previousDirection = -1;
    for (let index = 0; index < summary.portalTileIndex.length; index += 1) {
        const tile = summary.portalTileIndex[index];
        const direction = summary.portalDirection[index];
        if (tile >= BASE_SEMANTIC_CHUNK_TILE_COUNT || direction >= NEIGHBOR_DIRECTIONS.length
            || summary.traversalCostQ8[tile] === 0
            || tile < previousTile || tile === previousTile && direction <= previousDirection) {
            throw new Error("navigation portals are invalid or not canonical");
        }
        previousTile = tile;
        previousDirection = direction;
    }
    let firstMetrics: string | undefined;
    for (let index = 0; index < summary.surfaceDependencies.length; index += 1) {
        const dependency = summary.surfaceDependencies[index];
        assertSurfaceDependencyKey(dependency);
        const expected = expectedSurfaceKey(summary.key, index);
        if (dependency.worldIdentity !== summary.worldIdentity
            || dependency.renderKey.chunkX !== expected.chunkX
            || dependency.renderKey.chunkY !== expected.chunkY) {
            throw new Error("navigation surface dependency identity is invalid");
        }
        const semanticDependency = dependency.semantic.find((candidate: SurfaceSemanticDependency) =>
            candidate.key.chunkX === summary.key.chunkX
            && candidate.key.chunkY === summary.key.chunkY);
        if (!semanticDependency
            || semanticDependency.baseRevision !== summary.baseRevision
            || semanticDependency.deltaRevision !== summary.deltaRevision) {
            throw new Error("navigation summary semantic dependency is stale");
        }
        const metrics = `${dependency.metrics.hexSize}:${dependency.metrics.heightScale}`;
        if (firstMetrics !== undefined && metrics !== firstMetrics) {
            throw new Error("navigation surface dependency metrics disagree");
        }
        firstMetrics = metrics;
    }
}

export function compileNavigationChunkSummary(
    options: Readonly<CompileNavigationChunkSummaryOptions>
): NavigationChunkSummary {
    if (!options || typeof options !== "object") {
        throw new TypeError("navigation chunk summary options are required");
    }
    assertWorldDescriptorV2(options.descriptor);
    const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    const semantic = options.semantic;
    assertEffectiveSemanticMetadata(options.descriptor, semantic, worldIdentity);
    const profile = createNavigationMovementProfile(options.profile);
    assertSurfaceInputs(worldIdentity, semantic, options.surfaces);
    if (options.override) {
        assertNavigationOverrideSection(options.override);
        if (options.override.worldIdentity !== worldIdentity
            || options.override.key.chunkX !== semantic.key.chunkX
            || options.override.key.chunkY !== semantic.key.chunkY) {
            throw new TypeError("navigation override does not match its semantic chunk");
        }
    }

    const valid = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const traversalCostQ8 = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const samplers = options.surfaces.map(surface => new CompiledSurfaceSampler(surface.field));
    const scratch = createCompiledSurfaceSample();
    const hexSize = options.surfaces[0].dependencyKey.metrics.hexSize;
    for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
        for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
            const tileIndex = semanticTileIndex(localX, localY);
            const isValid = localX >= semantic.validBounds.minX
                && localX < semantic.validBounds.maxXExclusive
                && localY >= semantic.validBounds.minY
                && localY < semantic.validBounds.maxYExclusive;
            if (!isValid) continue;
            valid[tileIndex] = 1;
            const overrideIndex = options.override
                ? navigationOverrideEntryIndex(options.override, localX, localY) : -1;
            if (overrideIndex >= 0) {
                traversalCostQ8[tileIndex] = options.override!.traversalCostQ8[overrideIndex];
                continue;
            }
            const owner = surfaceIndex(localX, localY);
            const localU = localX % SURFACE_COMPILE_PROFILE.renderChunkSize;
            const localV = localY % SURFACE_COMPILE_PROFILE.renderChunkSize;
            const sampler = samplers[owner];
            sampler.sampleSurface(localU, localV, scratch);
            if (scratch.waterCoverage > SURFACE_COMPILE_PROFILE.waterGeometryCoverageThreshold) {
                const cost = waterCost(profile, scratch.waterKind);
                if (cost !== null) traversalCostQ8[tileIndex] = q8Cost(cost);
                continue;
            }
            const slope = sampleCompiledGroundSlope(sampler, localU, localV, hexSize);
            if (slope > profile.maximumGroundSlope) continue;
            traversalCostQ8[tileIndex] = q8Cost(profile.dryCost + slope * profile.slopeCostScale);
        }
    }
    if (options.override) {
        for (const tileIndex of options.override.tileIndex) {
            if (valid[tileIndex] === 0) {
                throw new RangeError("navigation override targets an invalid finite-world tile");
            }
        }
    }
    const components = compileComponents(options.descriptor, semantic.key, valid, traversalCostQ8);
    const portals = compilePortals(options.descriptor, semantic.key, valid, traversalCostQ8);
    const summary: NavigationChunkSummary = Object.freeze({
        formatVersion: NAVIGATION_CHUNK_SUMMARY_FORMAT_VERSION,
        worldIdentity,
        key: Object.freeze({ chunkX: semantic.key.chunkX, chunkY: semantic.key.chunkY }),
        effectiveRevision: semantic.effectiveRevision,
        baseRevision: semantic.baseRevision,
        deltaRevision: semantic.deltaRevision,
        overrideRevision: options.override?.revision ?? 0,
        profile,
        surfaceDependencies: Object.freeze(options.surfaces.map(surface => surface.dependencyKey)) as
            NavigationChunkSummary["surfaceDependencies"],
        valid,
        traversalCostQ8,
        component: components.component,
        componentCount: components.count,
        portalTileIndex: portals.tileIndex,
        portalDirection: portals.direction
    });
    assertNavigationChunkSummary(summary);
    return summary;
}

export function navigationChunkSummaryResidentBytes(
    summary: Readonly<NavigationChunkSummary>
): number {
    assertNavigationChunkSummary(summary);
    return NAVIGATION_CHUNK_SUMMARY_BASE_RESIDENT_BYTES
        + summary.worldIdentity.length * 2
        + summary.profile.id.length * 2
        + summary.surfaceDependencies.reduce((bytes, dependency) =>
            bytes + serializeSurfaceDependencyKey(dependency).length * 2, 0)
        + summary.valid.byteLength
        + summary.traversalCostQ8.byteLength
        + summary.component.byteLength
        + summary.portalTileIndex.byteLength
        + summary.portalDirection.byteLength;
}

if (BASE_SEMANTIC_CHUNK_TILE_COUNT !== 1024
    || WORLD_SEMANTIC_CHUNK_SIZE !== SURFACE_COMPILE_PROFILE.renderChunkSize * 2
    || NAVIGATION_COST_SCALE !== 256) {
    throw new Error("navigation summary constants drifted from the v2 chunk contracts");
}

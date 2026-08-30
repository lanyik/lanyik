import {
    SemanticCatalogIdentity,
    WORLD_BIOME_BASIS,
    WORLD_SUBSTRATE_CATALOG_IDENTITY,
    WORLD_VEGETATION_CATALOG_IDENTITY,
    WorldBiomeBasis
} from "./WorldSemanticCatalog";
import {
    HYDROLOGY_REGION_FORMAT_VERSION,
    HYDROLOGY_REGION_SIZE,
    assertHydrologyRegionKey,
    assertSemanticChunkKey,
    HydrologyRegionKey,
    positiveIntegerModulo,
    SemanticChunkKey,
    WORLD_SEMANTIC_CHUNK_FORMAT_VERSION,
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SURFACE_V2_GENERATOR_VERSION
} from "./WorldSemanticFormat";

export const WORLD_DESCRIPTOR_V2_FORMAT_VERSION = 2;

interface WorldDescriptorV2Base {
    readonly descriptorVersion: typeof WORLD_DESCRIPTOR_V2_FORMAT_VERSION;
    readonly semanticChunkFormatVersion: typeof WORLD_SEMANTIC_CHUNK_FORMAT_VERSION;
    readonly hydrologyRegionFormatVersion: typeof HYDROLOGY_REGION_FORMAT_VERSION;
    readonly biomeBasis: readonly [WorldBiomeBasis, WorldBiomeBasis, WorldBiomeBasis, WorldBiomeBasis];
    readonly substrateCatalog: SemanticCatalogIdentity;
    readonly vegetationCatalog: SemanticCatalogIdentity;
}

export interface InfiniteWorldDescriptorV2 extends WorldDescriptorV2Base {
    readonly sourceKind: "procedural-infinite";
    readonly seed: string;
    readonly generatorVersion: typeof WORLD_SURFACE_V2_GENERATOR_VERSION;
    readonly topology: "infinite";
}

export interface ToroidalWorldDescriptorV2 extends WorldDescriptorV2Base {
    readonly sourceKind: "procedural-toroidal";
    readonly seed: string;
    readonly generatorVersion: typeof WORLD_SURFACE_V2_GENERATOR_VERSION;
    readonly topology: "toroidal";
    readonly width: number;
    readonly height: number;
}

export interface StaticWorldDescriptorV2 extends WorldDescriptorV2Base {
    readonly sourceKind: "static";
    readonly sourceContentHash: string;
    readonly topology: "bounded" | "toroidal";
    readonly width: number;
    readonly height: number;
}

export type ProceduralWorldDescriptorV2 = InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2;
export type WorldDescriptorV2 = ProceduralWorldDescriptorV2 | StaticWorldDescriptorV2;

export type CreateProceduralWorldDescriptorV2Options = {
    readonly sourceKind?: "procedural";
    readonly seed: string | number;
    readonly topology?: { readonly kind: "infinite" } | {
        readonly kind: "toroidal";
        readonly width: number;
        readonly height: number;
    };
};

export type CreateStaticWorldDescriptorV2Options = {
    readonly sourceKind: "static";
    readonly sourceContentHash: string;
    readonly topology: {
        readonly kind: "bounded" | "toroidal";
        readonly width: number;
        readonly height: number;
    };
};

export type CreateWorldDescriptorV2Options = CreateProceduralWorldDescriptorV2Options
    | CreateStaticWorldDescriptorV2Options;

function assertSeed(value: unknown): asserts value is string | number {
    if (typeof value !== "string" && typeof value !== "number") {
        throw new TypeError("v2 procedural world seed must be a string or number");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
        throw new RangeError("v2 numeric world seed must be finite");
    }
}

function assertDimension(name: "width" | "height", value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`v2 world ${name} must be a positive safe integer`);
    }
}

function assertToroidalDimensions(width: number, height: number): void {
    assertDimension("width", width);
    assertDimension("height", height);
    if (width < WORLD_SEMANTIC_CHUNK_SIZE || height < WORLD_SEMANTIC_CHUNK_SIZE
        || positiveIntegerModulo(width, WORLD_SEMANTIC_CHUNK_SIZE) !== 0
        || positiveIntegerModulo(height, WORLD_SEMANTIC_CHUNK_SIZE) !== 0) {
        throw new RangeError(
            `v2 toroidal world dimensions must be multiples of ${WORLD_SEMANTIC_CHUNK_SIZE} and at least ${WORLD_SEMANTIC_CHUNK_SIZE}`
        );
    }
}

function baseDescriptor(): WorldDescriptorV2Base {
    return {
        descriptorVersion: WORLD_DESCRIPTOR_V2_FORMAT_VERSION,
        semanticChunkFormatVersion: WORLD_SEMANTIC_CHUNK_FORMAT_VERSION,
        hydrologyRegionFormatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
        biomeBasis: WORLD_BIOME_BASIS,
        substrateCatalog: WORLD_SUBSTRATE_CATALOG_IDENTITY,
        vegetationCatalog: WORLD_VEGETATION_CATALOG_IDENTITY
    };
}

export function createWorldDescriptorV2(
    options: CreateProceduralWorldDescriptorV2Options
): ProceduralWorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateStaticWorldDescriptorV2Options): StaticWorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateWorldDescriptorV2Options): WorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateWorldDescriptorV2Options): WorldDescriptorV2 {
    if (!options || typeof options !== "object") throw new TypeError("v2 world descriptor options are required");
    const base = baseDescriptor();
    if (options.sourceKind === "static") {
        if (typeof options.sourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(options.sourceContentHash)) {
            throw new TypeError("v2 static world sourceContentHash must be a lowercase SHA-256 hex string");
        }
        assertDimension("width", options.topology.width);
        assertDimension("height", options.topology.height);
        if (options.topology.kind === "toroidal") {
            assertToroidalDimensions(options.topology.width, options.topology.height);
        } else if (options.topology.kind !== "bounded") {
            throw new TypeError("v2 static world topology is invalid");
        }
        return Object.freeze({
            ...base,
            sourceKind: "static",
            sourceContentHash: options.sourceContentHash,
            topology: options.topology.kind,
            width: options.topology.width,
            height: options.topology.height
        });
    }

    assertSeed(options.seed);
    const topology = options.topology ?? { kind: "infinite" as const };
    if (topology.kind === "infinite") {
        return Object.freeze({
            ...base,
            sourceKind: "procedural-infinite",
            seed: String(options.seed),
            generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
            topology: "infinite"
        });
    }
    if (topology.kind !== "toroidal") throw new TypeError("v2 procedural world topology is invalid");
    assertToroidalDimensions(topology.width, topology.height);
    return Object.freeze({
        ...base,
        sourceKind: "procedural-toroidal",
        seed: String(options.seed),
        generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
        topology: "toroidal",
        width: topology.width,
        height: topology.height
    });
}

function catalogIdentityMatches(value: unknown, expected: SemanticCatalogIdentity): boolean {
    return Boolean(value && typeof value === "object"
        && Object.getOwnPropertyNames(value).sort().join(",") === "contentHash,id"
        && (value as SemanticCatalogIdentity).id === expected.id
        && (value as SemanticCatalogIdentity).contentHash === expected.contentHash);
}

export function assertWorldDescriptorV2(value: unknown): asserts value is WorldDescriptorV2 {
    if (!value || typeof value !== "object") throw new TypeError("v2 world descriptor must be an object");
    const descriptor = value as Partial<WorldDescriptorV2>;
    if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_V2_FORMAT_VERSION) {
        throw new TypeError(`unsupported v2 world descriptor format ${String(descriptor.descriptorVersion)}`);
    }
    if (descriptor.semanticChunkFormatVersion !== WORLD_SEMANTIC_CHUNK_FORMAT_VERSION
        || descriptor.hydrologyRegionFormatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
        throw new TypeError("v2 world descriptor contains unsupported semantic or hydrology formats");
    }
    if (!Array.isArray(descriptor.biomeBasis)
        || descriptor.biomeBasis.length !== WORLD_BIOME_BASIS.length
        || descriptor.biomeBasis.some((value, index) => value !== WORLD_BIOME_BASIS[index])) {
        throw new TypeError("v2 world descriptor biome basis does not match this build");
    }
    if (!catalogIdentityMatches(descriptor.substrateCatalog, WORLD_SUBSTRATE_CATALOG_IDENTITY)
        || !catalogIdentityMatches(descriptor.vegetationCatalog, WORLD_VEGETATION_CATALOG_IDENTITY)) {
        throw new TypeError("v2 world descriptor semantic catalog identity does not match this build");
    }
    const commonFields = [
        "descriptorVersion",
        "sourceKind",
        "semanticChunkFormatVersion",
        "hydrologyRegionFormatVersion",
        "biomeBasis",
        "substrateCatalog",
        "vegetationCatalog",
        "topology"
    ];
    const assertFields = (variantFields: readonly string[]): void => {
        const allowed = new Set([...commonFields, ...variantFields]);
        if (Object.getOwnPropertyNames(descriptor).some(name => !allowed.has(name))) {
            throw new TypeError("v2 world descriptor contains unknown or deprecated fields");
        }
    };
    if (descriptor.sourceKind === "procedural-infinite") {
        assertFields(["seed", "generatorVersion"]);
        assertSeed(descriptor.seed);
        if (typeof descriptor.seed !== "string" || descriptor.generatorVersion !== WORLD_SURFACE_V2_GENERATOR_VERSION
            || descriptor.topology !== "infinite" || "width" in descriptor || "height" in descriptor) {
            throw new TypeError("v2 infinite world descriptor is invalid");
        }
        return;
    }
    if (descriptor.sourceKind === "procedural-toroidal") {
        assertFields(["seed", "generatorVersion", "width", "height"]);
        assertSeed(descriptor.seed);
        if (typeof descriptor.seed !== "string" || descriptor.generatorVersion !== WORLD_SURFACE_V2_GENERATOR_VERSION
            || descriptor.topology !== "toroidal") {
            throw new TypeError("v2 toroidal world descriptor is invalid");
        }
        assertToroidalDimensions(descriptor.width as number, descriptor.height as number);
        return;
    }
    if (descriptor.sourceKind === "static") {
        assertFields(["sourceContentHash", "width", "height"]);
        if (typeof descriptor.sourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sourceContentHash)
            || (descriptor.topology !== "bounded" && descriptor.topology !== "toroidal")) {
            throw new TypeError("v2 static world descriptor is invalid");
        }
        if (descriptor.topology === "toroidal") {
            assertToroidalDimensions(descriptor.width as number, descriptor.height as number);
        } else {
            assertDimension("width", descriptor.width as number);
            assertDimension("height", descriptor.height as number);
        }
        return;
    }
    throw new TypeError("v2 world descriptor sourceKind is invalid");
}

export function serializeWorldDescriptorV2(descriptor: WorldDescriptorV2): string {
    assertWorldDescriptorV2(descriptor);
    const common = [
        descriptor.descriptorVersion,
        descriptor.sourceKind,
        descriptor.semanticChunkFormatVersion,
        descriptor.hydrologyRegionFormatVersion,
        [...descriptor.biomeBasis],
        [descriptor.substrateCatalog.id, descriptor.substrateCatalog.contentHash],
        [descriptor.vegetationCatalog.id, descriptor.vegetationCatalog.contentHash],
        descriptor.topology
    ];
    if (descriptor.sourceKind === "procedural-infinite") {
        return JSON.stringify([...common, descriptor.seed, descriptor.generatorVersion, null, null]);
    }
    if (descriptor.sourceKind === "procedural-toroidal") {
        return JSON.stringify([
            ...common,
            descriptor.seed,
            descriptor.generatorVersion,
            descriptor.width,
            descriptor.height
        ]);
    }
    return JSON.stringify([
        ...common,
        descriptor.sourceContentHash,
        null,
        descriptor.width,
        descriptor.height
    ]);
}

export function worldDescriptorsV2Equal(first: WorldDescriptorV2, second: WorldDescriptorV2): boolean {
    return serializeWorldDescriptorV2(first) === serializeWorldDescriptorV2(second);
}

export function canonicalizeSemanticChunkKey(
    descriptor: WorldDescriptorV2,
    key: SemanticChunkKey
): SemanticChunkKey {
    assertWorldDescriptorV2(descriptor);
    if (!Number.isSafeInteger(key?.chunkX) || !Number.isSafeInteger(key?.chunkY)) {
        throw new RangeError("semantic chunk key must use safe integer coordinates");
    }
    if (descriptor.topology !== "toroidal") {
        assertSemanticChunkKey(key);
        return { chunkX: key.chunkX, chunkY: key.chunkY };
    }
    const chunksX = descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
    const chunksY = descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
    const canonical = {
        chunkX: positiveIntegerModulo(key.chunkX, chunksX),
        chunkY: positiveIntegerModulo(key.chunkY, chunksY)
    };
    assertSemanticChunkKey(canonical);
    return canonical;
}

export function canonicalizeHydrologyRegionKey(
    descriptor: WorldDescriptorV2,
    key: HydrologyRegionKey
): HydrologyRegionKey {
    assertWorldDescriptorV2(descriptor);
    if (!Number.isSafeInteger(key?.regionX) || !Number.isSafeInteger(key?.regionY)) {
        throw new RangeError("hydrology region key must use safe integer coordinates");
    }
    if (descriptor.topology !== "toroidal") {
        assertHydrologyRegionKey(key);
        return { regionX: key.regionX, regionY: key.regionY };
    }
    const regionsX = Math.ceil(descriptor.width / HYDROLOGY_REGION_SIZE);
    const regionsY = Math.ceil(descriptor.height / HYDROLOGY_REGION_SIZE);
    const canonical = {
        regionX: positiveIntegerModulo(key.regionX, regionsX),
        regionY: positiveIntegerModulo(key.regionY, regionsY)
    };
    assertHydrologyRegionKey(canonical);
    return canonical;
}

import {
    HYDROLOGY_REGION_SIZE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";

export const WORLD_GENERATOR_VERSION_V2 = 6;
export const WORLD_DESCRIPTOR_FORMAT_VERSION_V2 = 2;
export const WORLD_CHUNK_FORMAT_VERSION_V2 = 2;
export const HYDROLOGY_REGION_FORMAT_VERSION = 1;

const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface SemanticBasisIdentity {
    readonly id: string;
    readonly contentHash: string;
}

export interface SemanticCatalogIdentity extends SemanticBasisIdentity {
    readonly entryCount: number;
}

interface WorldDescriptorV2Base {
    readonly descriptorVersion: typeof WORLD_DESCRIPTOR_FORMAT_VERSION_V2;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly chunkFormatVersion: typeof WORLD_CHUNK_FORMAT_VERSION_V2;
    readonly hydrologyRegionFormatVersion: typeof HYDROLOGY_REGION_FORMAT_VERSION;
    readonly seaLevel: number;
    readonly substrateCatalog: SemanticCatalogIdentity;
    readonly biomeBasis: readonly [
        SemanticBasisIdentity,
        SemanticBasisIdentity,
        SemanticBasisIdentity,
        SemanticBasisIdentity
    ];
    readonly vegetationCatalog: SemanticCatalogIdentity;
}

export interface StaticWorldDescriptorV2 extends WorldDescriptorV2Base {
    readonly sourceKind: "static";
    readonly topology: "finite";
    readonly sourceContentHash: string;
    readonly width: number;
    readonly height: number;
}

export interface InfiniteWorldDescriptorV2 extends WorldDescriptorV2Base {
    readonly sourceKind: "procedural-infinite";
    readonly topology: "infinite";
    readonly seed: string;
}

export interface ToroidalWorldDescriptorV2 extends WorldDescriptorV2Base {
    readonly sourceKind: "procedural-toroidal";
    readonly topology: "toroidal";
    readonly seed: string;
    readonly width: number;
    readonly height: number;
}

export type WorldDescriptorV2 = StaticWorldDescriptorV2
    | InfiniteWorldDescriptorV2
    | ToroidalWorldDescriptorV2;

export interface WorldDescriptorV2Semantics {
    readonly seaLevel: number;
    readonly substrateCatalog: SemanticCatalogIdentity;
    readonly biomeBasis: readonly [
        SemanticBasisIdentity,
        SemanticBasisIdentity,
        SemanticBasisIdentity,
        SemanticBasisIdentity
    ];
    readonly vegetationCatalog: SemanticCatalogIdentity;
}

export type CreateWorldDescriptorV2Options = WorldDescriptorV2Semantics & (
    | { readonly sourceKind: "static"; readonly sourceContentHash: string; readonly width: number; readonly height: number }
    | { readonly sourceKind: "procedural-infinite"; readonly seed: string | number }
    | { readonly sourceKind: "procedural-toroidal"; readonly seed: string | number; readonly width: number; readonly height: number }
);

export type CreateStaticWorldDescriptorV2Options = WorldDescriptorV2Semantics & {
    readonly sourceKind: "static";
    readonly sourceContentHash: string;
    readonly width: number;
    readonly height: number;
};

export type CreateInfiniteWorldDescriptorV2Options = WorldDescriptorV2Semantics & {
    readonly sourceKind: "procedural-infinite";
    readonly seed: string | number;
};

export type CreateToroidalWorldDescriptorV2Options = WorldDescriptorV2Semantics & {
    readonly sourceKind: "procedural-toroidal";
    readonly seed: string | number;
    readonly width: number;
    readonly height: number;
};

function assertContentHash(name: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || !CONTENT_HASH_PATTERN.test(value)) {
        throw new TypeError(`${name} must be a lowercase sha256 content hash`);
    }
}

function assertIdentity(name: string, value: unknown, catalog: boolean): void {
    if (!value || typeof value !== "object") throw new TypeError(`${name} identity must be an object`);
    const identity = value as Partial<SemanticCatalogIdentity>;
    if (typeof identity.id !== "string" || identity.id.trim() !== identity.id || identity.id.length === 0) {
        throw new TypeError(`${name} id must be a non-empty canonical string`);
    }
    assertContentHash(`${name} contentHash`, identity.contentHash);
    if (catalog && (!Number.isInteger(identity.entryCount)
        || (identity.entryCount as number) <= 0 || (identity.entryCount as number) > 256)) {
        throw new RangeError(`${name} entryCount must be an integer between 1 and 256`);
    }
}

function cloneBasis(identity: SemanticBasisIdentity): SemanticBasisIdentity {
    return Object.freeze({ id: identity.id, contentHash: identity.contentHash });
}

function cloneCatalog(identity: SemanticCatalogIdentity): SemanticCatalogIdentity {
    return Object.freeze({ id: identity.id, contentHash: identity.contentHash, entryCount: identity.entryCount });
}

function assertSemantics(value: Partial<WorldDescriptorV2Base>): void {
    if (!Number.isInteger(value.seaLevel) || (value.seaLevel as number) < 0 || (value.seaLevel as number) > 0xffff) {
        throw new RangeError("world descriptor seaLevel must be a uint16 value");
    }
    assertIdentity("substrate catalog", value.substrateCatalog, true);
    assertIdentity("vegetation catalog", value.vegetationCatalog, true);
    if (!Array.isArray(value.biomeBasis) || value.biomeBasis.length !== 4) {
        throw new TypeError("world descriptor must contain exactly four biome basis identities");
    }
    const ids = new Set<string>();
    for (const basis of value.biomeBasis) {
        assertIdentity("biome basis", basis, false);
        if (ids.has(basis.id)) throw new TypeError("world descriptor biome basis ids must be unique");
        ids.add(basis.id);
    }
}

function assertFiniteBounds(width: unknown, height: unknown): asserts width is number {
    if (!Number.isSafeInteger(width) || (width as number) <= 0
        || !Number.isSafeInteger(height) || (height as number) <= 0) {
        throw new RangeError("world descriptor bounds must be positive safe integers");
    }
}

function canonicalSeed(seed: unknown): string {
    if (typeof seed !== "string" && typeof seed !== "number") {
        throw new TypeError("procedural world descriptor seed must be a string or number");
    }
    if (typeof seed === "number" && !Number.isFinite(seed)) {
        throw new RangeError("numeric procedural world descriptor seed must be finite");
    }
    return String(seed);
}

export function createWorldDescriptorV2(options: CreateStaticWorldDescriptorV2Options): StaticWorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateInfiniteWorldDescriptorV2Options): InfiniteWorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateToroidalWorldDescriptorV2Options): ToroidalWorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateWorldDescriptorV2Options): WorldDescriptorV2;
export function createWorldDescriptorV2(options: CreateWorldDescriptorV2Options): WorldDescriptorV2 {
    if (!options || typeof options !== "object") throw new TypeError("world descriptor v2 options are required");
    assertSemantics(options as Partial<WorldDescriptorV2Base>);
    const [firstBiome, secondBiome, thirdBiome, fourthBiome] = options.biomeBasis;
    const base: WorldDescriptorV2Base = {
        descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION_V2,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        chunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION_V2,
        hydrologyRegionFormatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
        seaLevel: options.seaLevel,
        substrateCatalog: cloneCatalog(options.substrateCatalog),
        biomeBasis: Object.freeze([
            cloneBasis(firstBiome),
            cloneBasis(secondBiome),
            cloneBasis(thirdBiome),
            cloneBasis(fourthBiome)
        ]),
        vegetationCatalog: cloneCatalog(options.vegetationCatalog)
    };
    let descriptor: WorldDescriptorV2;
    if (options.sourceKind === "static") {
        assertContentHash("static world sourceContentHash", options.sourceContentHash);
        assertFiniteBounds(options.width, options.height);
        descriptor = {
            ...base,
            sourceKind: "static",
            topology: "finite",
            sourceContentHash: options.sourceContentHash,
            width: options.width,
            height: options.height
        };
    } else if (options.sourceKind === "procedural-infinite") {
        descriptor = {
            ...base,
            sourceKind: "procedural-infinite",
            topology: "infinite",
            seed: canonicalSeed(options.seed)
        };
    } else if (options.sourceKind === "procedural-toroidal") {
        assertFiniteBounds(options.width, options.height);
        if (options.width < WORLD_SEMANTIC_CHUNK_SIZE || options.height < WORLD_SEMANTIC_CHUNK_SIZE
            || options.width % WORLD_SEMANTIC_CHUNK_SIZE !== 0
            || options.height % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
            throw new RangeError("toroidal v2 bounds must be positive multiples of the semantic chunk size");
        }
        descriptor = {
            ...base,
            sourceKind: "procedural-toroidal",
            topology: "toroidal",
            seed: canonicalSeed(options.seed),
            width: options.width,
            height: options.height
        };
    } else {
        throw new TypeError("world descriptor v2 sourceKind is invalid");
    }
    assertWorldDescriptorV2(descriptor);
    return Object.freeze(descriptor);
}

export function assertWorldDescriptorV2(value: unknown): asserts value is WorldDescriptorV2 {
    if (!value || typeof value !== "object") throw new TypeError("world descriptor v2 must be an object");
    const descriptor = value as Partial<WorldDescriptorV2>;
    if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_FORMAT_VERSION_V2
        || descriptor.generatorVersion !== WORLD_GENERATOR_VERSION_V2
        || descriptor.chunkFormatVersion !== WORLD_CHUNK_FORMAT_VERSION_V2
        || descriptor.hydrologyRegionFormatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
        throw new TypeError("world descriptor v2 format or generator version is unsupported");
    }
    assertSemantics(descriptor);
    if (descriptor.sourceKind === "static") {
        if (descriptor.topology !== "finite" || "seed" in descriptor) {
            throw new TypeError("static world descriptor v2 topology is invalid");
        }
        assertContentHash("static world sourceContentHash", descriptor.sourceContentHash);
        assertFiniteBounds(descriptor.width, descriptor.height);
        return;
    }
    if (descriptor.sourceKind === "procedural-infinite") {
        if (descriptor.topology !== "infinite" || typeof descriptor.seed !== "string"
            || "width" in descriptor || "height" in descriptor || "sourceContentHash" in descriptor) {
            throw new TypeError("infinite world descriptor v2 topology is invalid");
        }
        return;
    }
    if (descriptor.sourceKind === "procedural-toroidal") {
        if (descriptor.topology !== "toroidal" || typeof descriptor.seed !== "string"
            || "sourceContentHash" in descriptor) {
            throw new TypeError("toroidal world descriptor v2 topology is invalid");
        }
        assertFiniteBounds(descriptor.width, descriptor.height);
        if ((descriptor.width as number) < WORLD_SEMANTIC_CHUNK_SIZE
            || (descriptor.height as number) < WORLD_SEMANTIC_CHUNK_SIZE
            || (descriptor.width as number) % WORLD_SEMANTIC_CHUNK_SIZE !== 0
            || (descriptor.height as number) % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
            throw new RangeError("toroidal v2 bounds must be positive multiples of the semantic chunk size");
        }
        return;
    }
    throw new TypeError("world descriptor v2 sourceKind is invalid");
}

export function serializeWorldDescriptorV2(descriptor: WorldDescriptorV2): string {
    assertWorldDescriptorV2(descriptor);
    return JSON.stringify([
        descriptor.descriptorVersion,
        descriptor.sourceKind,
        "seed" in descriptor ? descriptor.seed : null,
        "sourceContentHash" in descriptor ? descriptor.sourceContentHash : null,
        descriptor.generatorVersion,
        descriptor.chunkFormatVersion,
        descriptor.hydrologyRegionFormatVersion,
        descriptor.topology,
        "width" in descriptor ? descriptor.width : null,
        "height" in descriptor ? descriptor.height : null,
        descriptor.seaLevel,
        [
            descriptor.substrateCatalog.id,
            descriptor.substrateCatalog.contentHash,
            descriptor.substrateCatalog.entryCount
        ],
        descriptor.biomeBasis.map(basis => [basis.id, basis.contentHash]),
        [
            descriptor.vegetationCatalog.id,
            descriptor.vegetationCatalog.contentHash,
            descriptor.vegetationCatalog.entryCount
        ]
    ]);
}

export function worldDescriptorsV2Equal(first: WorldDescriptorV2, second: WorldDescriptorV2): boolean {
    return serializeWorldDescriptorV2(first) === serializeWorldDescriptorV2(second);
}

if (HYDROLOGY_REGION_SIZE % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
    throw new Error("world descriptor v2 formats are not spatially aligned");
}

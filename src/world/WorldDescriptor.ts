import {
    BoundedWorldChunkGeneration,
    DEFAULT_WORLD_GENERATION_CHUNK_SIZE,
    MAX_WORLD_GENERATION_CHUNK_SIZE,
    WORLD_CHUNK_FORMAT_VERSION
} from "./generateWorldChunk";
import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";

export const WORLD_DESCRIPTOR_FORMAT_VERSION = 1;
// Protocol v4 adds the staged v2 hydrology-region task. Existing v1 request
// variants remain the active production path until the v2 render cutover.
export const WORLD_WORKER_PROTOCOL_VERSION = 4;

export type ProceduralWorldKind = "procedural-infinite" | "procedural-toroidal";

export interface WorldDescriptor {
    readonly descriptorVersion: typeof WORLD_DESCRIPTOR_FORMAT_VERSION;
    readonly sourceKind: ProceduralWorldKind;
    readonly seed: string;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION;
    readonly chunkFormatVersion: typeof WORLD_CHUNK_FORMAT_VERSION;
    readonly chunkSize: number;
    readonly topology: "infinite" | "toroidal";
    readonly width?: number;
    readonly height?: number;
}

export interface CreateWorldDescriptorOptions {
    seed: string | number;
    chunkSize?: number;
    generatorVersion?: number;
    world?: BoundedWorldChunkGeneration;
}

function assertChunkSize(value: number): void {
    if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
        throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
    }
}

export function assertSupportedWorldGeneratorVersion(value: number): asserts value is typeof WORLD_GENERATOR_VERSION {
    if (value !== WORLD_GENERATOR_VERSION) {
        throw new RangeError(
            `unsupported world generator version ${String(value)}; this build supports ${WORLD_GENERATOR_VERSION}`
        );
    }
}

export function createWorldDescriptor(options: CreateWorldDescriptorOptions): WorldDescriptor {
    if (!options || typeof options !== "object") throw new TypeError("world descriptor options are required");
    if (typeof options.seed !== "string" && typeof options.seed !== "number") {
        throw new TypeError("world seed must be a string or number");
    }
    if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
        throw new RangeError("numeric world seed must be finite");
    }
    const chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
    assertChunkSize(chunkSize);
    const generatorVersion = options.generatorVersion ?? WORLD_GENERATOR_VERSION;
    assertSupportedWorldGeneratorVersion(generatorVersion);
    const base = {
        descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION,
        seed: String(options.seed),
        generatorVersion,
        chunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION,
        chunkSize
    } as const;
    if (!options.world) {
        return { ...base, sourceKind: "procedural-infinite", topology: "infinite" };
    }
    const world = options.world;
    if (world.topology !== "toroidal" || !Number.isInteger(world.width) || world.width < 8
        || !Number.isInteger(world.height) || world.height < 8 || world.width % 2 !== 0) {
        throw new TypeError("toroidal world descriptor bounds are invalid");
    }
    return {
        ...base,
        sourceKind: "procedural-toroidal",
        topology: "toroidal",
        width: world.width,
        height: world.height
    };
}

export function assertWorldDescriptor(value: unknown): asserts value is WorldDescriptor {
    if (!value || typeof value !== "object") throw new TypeError("world descriptor must be an object");
    const descriptor = value as Partial<WorldDescriptor>;
    if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_FORMAT_VERSION) {
        throw new TypeError(`unsupported world descriptor format ${String(descriptor.descriptorVersion)}`);
    }
    if (descriptor.sourceKind !== "procedural-infinite" && descriptor.sourceKind !== "procedural-toroidal") {
        throw new TypeError("world descriptor sourceKind is invalid");
    }
    if (typeof descriptor.seed !== "string") throw new TypeError("world descriptor seed must be a string");
    assertSupportedWorldGeneratorVersion(descriptor.generatorVersion as number);
    if (descriptor.chunkFormatVersion !== WORLD_CHUNK_FORMAT_VERSION) {
        throw new TypeError(`unsupported world chunk format ${String(descriptor.chunkFormatVersion)}`);
    }
    assertChunkSize(descriptor.chunkSize as number);
    if (descriptor.sourceKind === "procedural-infinite") {
        if (descriptor.topology !== "infinite" || descriptor.width !== undefined || descriptor.height !== undefined) {
            throw new TypeError("infinite world descriptor topology is invalid");
        }
        return;
    }
    if (descriptor.topology !== "toroidal" || !Number.isInteger(descriptor.width)
        || (descriptor.width as number) < 8 || (descriptor.width as number) % 2 !== 0
        || !Number.isInteger(descriptor.height) || (descriptor.height as number) < 8) {
        throw new TypeError("toroidal world descriptor topology is invalid");
    }
}

export function serializeWorldDescriptor(descriptor: WorldDescriptor): string {
    assertWorldDescriptor(descriptor);
    return JSON.stringify([
        descriptor.descriptorVersion,
        descriptor.sourceKind,
        descriptor.seed,
        descriptor.generatorVersion,
        descriptor.chunkFormatVersion,
        descriptor.chunkSize,
        descriptor.topology,
        descriptor.width ?? null,
        descriptor.height ?? null
    ]);
}

export function worldDescriptorsEqual(first: WorldDescriptor, second: WorldDescriptor): boolean {
    return serializeWorldDescriptor(first) === serializeWorldDescriptor(second);
}

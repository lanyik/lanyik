import { describe, expect, test } from "vitest";

import {
    assertWorldDescriptorV2,
    canonicalizeSemanticChunkKey,
    createWorldDescriptorV2,
    HYDROLOGY_REGION_FORMAT_VERSION,
    serializeWorldDescriptorV2,
    WORLD_BIOME_BASIS,
    WORLD_DESCRIPTOR_V2_FORMAT_VERSION,
    WORLD_SEMANTIC_CHUNK_FORMAT_VERSION,
    WORLD_SUBSTRATE_CATALOG,
    WORLD_SUBSTRATE_CATALOG_IDENTITY,
    WORLD_SURFACE_V2_GENERATOR_VERSION,
    WORLD_VEGETATION_CATALOG_IDENTITY,
    WORLD_VEGETATION_PROFILE_CATALOG,
    worldDescriptorsV2Equal
} from "../../src/index";

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

describe("WorldDescriptor v2", () => {
    test("freezes the complete infinite procedural identity", () => {
        const descriptor = createWorldDescriptorV2({ seed: 42 });
        expect(descriptor).toEqual({
            descriptorVersion: WORLD_DESCRIPTOR_V2_FORMAT_VERSION,
            sourceKind: "procedural-infinite",
            seed: "42",
            generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
            semanticChunkFormatVersion: WORLD_SEMANTIC_CHUNK_FORMAT_VERSION,
            hydrologyRegionFormatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
            biomeBasis: WORLD_BIOME_BASIS,
            substrateCatalog: WORLD_SUBSTRATE_CATALOG_IDENTITY,
            vegetationCatalog: WORLD_VEGETATION_CATALOG_IDENTITY,
            topology: "infinite"
        });
        expect(() => assertWorldDescriptorV2(structuredClone(descriptor))).not.toThrow();
        expect(worldDescriptorsV2Equal(descriptor, createWorldDescriptorV2({ seed: "42" }))).toBe(true);
    });

    test("requires aligned toroidal worlds and canonicalizes their chunk keys", () => {
        const descriptor = createWorldDescriptorV2({
            seed: "round",
            topology: { kind: "toroidal", width: 64, height: 96 }
        });
        expect(canonicalizeSemanticChunkKey(descriptor, { chunkX: -1, chunkY: 3 }))
            .toEqual({ chunkX: 1, chunkY: 0 });
        expect(() => createWorldDescriptorV2({
            seed: "misaligned",
            topology: { kind: "toroidal", width: 48, height: 64 }
        })).toThrow(/multiples of 32/);
    });

    test("gives static sources an explicit content identity", () => {
        const sourceContentHash = "a".repeat(64);
        const descriptor = createWorldDescriptorV2({
            sourceKind: "static",
            sourceContentHash,
            topology: { kind: "bounded", width: 45, height: 33 }
        });
        expect(descriptor).toMatchObject({
            sourceKind: "static",
            sourceContentHash,
            topology: "bounded",
            width: 45,
            height: 33
        });
        expect(serializeWorldDescriptorV2(descriptor)).toContain(sourceContentHash);
        expect(() => createWorldDescriptorV2({
            sourceKind: "static",
            sourceContentHash: "not-a-hash",
            topology: { kind: "bounded", width: 1, height: 1 }
        })).toThrow(/SHA-256/);
    });

    test("rejects catalog substitution even when the catalog name is unchanged", () => {
        const descriptor = structuredClone(createWorldDescriptorV2({ seed: "catalog" }));
        (descriptor.substrateCatalog as { contentHash: string }).contentHash = "0".repeat(64);
        expect(() => assertWorldDescriptorV2(descriptor)).toThrow(/catalog identity/);
        expect(() => assertWorldDescriptorV2({
            ...createWorldDescriptorV2({ seed: "legacy-size" }),
            chunkSize: 24
        })).toThrow(/deprecated fields/);
    });

    test("catalog identities are SHA-256 hashes of their canonical contents", async () => {
        expect(WORLD_SUBSTRATE_CATALOG.map(entry => entry.class))
            .toEqual(WORLD_SUBSTRATE_CATALOG.map((_, index) => index));
        for (const [index, profile] of WORLD_VEGETATION_PROFILE_CATALOG.entries()) {
            expect(profile.species.reduce((sum, species) => sum + species.weight, 0)).toBe(index === 0 ? 0 : 255);
        }
        await expect(sha256(JSON.stringify(WORLD_SUBSTRATE_CATALOG)))
            .resolves.toBe(WORLD_SUBSTRATE_CATALOG_IDENTITY.contentHash);
        await expect(sha256(JSON.stringify(WORLD_VEGETATION_PROFILE_CATALOG)))
            .resolves.toBe(WORLD_VEGETATION_CATALOG_IDENTITY.contentHash);
    });
});

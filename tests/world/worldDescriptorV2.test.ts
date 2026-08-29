import { describe, expect, test } from "vitest";

import {
    CreateWorldDescriptorV2Options,
    assertWorldDescriptorV2,
    createWorldDescriptorV2,
    serializeWorldDescriptorV2,
    worldDescriptorsV2Equal
} from "../../src/world/WorldDescriptorV2";

const hash = (character: string): string => `sha256:${character.repeat(64)}`;

function semantics(): Pick<CreateWorldDescriptorV2Options,
    "seaLevel" | "substrateCatalog" | "biomeBasis" | "vegetationCatalog"> {
    return {
        seaLevel: 18_000,
        substrateCatalog: { id: "substrate/core", contentHash: hash("1"), entryCount: 7 },
        biomeBasis: [
            { id: "temperate", contentHash: hash("2") },
            { id: "dry", contentHash: hash("3") },
            { id: "cold", contentHash: hash("4") },
            { id: "alpine", contentHash: hash("5") }
        ],
        vegetationCatalog: { id: "vegetation/core", contentHash: hash("6"), entryCount: 12 }
    };
}

describe("WorldDescriptor v2", () => {
    test("canonicalizes infinite and toroidal procedural identities", () => {
        const infinite = createWorldDescriptorV2({
            ...semantics(), sourceKind: "procedural-infinite", seed: 42
        });
        expect(infinite).toMatchObject({
            descriptorVersion: 2,
            generatorVersion: 6,
            chunkFormatVersion: 2,
            hydrologyRegionFormatVersion: 1,
            sourceKind: "procedural-infinite",
            topology: "infinite",
            seed: "42"
        });
        expect(Object.isFrozen(infinite)).toBe(true);
        expect(Object.isFrozen(infinite.biomeBasis)).toBe(true);
        expect(worldDescriptorsV2Equal(infinite, createWorldDescriptorV2({
            ...semantics(), sourceKind: "procedural-infinite", seed: "42"
        }))).toBe(true);

        const toroidal = createWorldDescriptorV2({
            ...semantics(), sourceKind: "procedural-toroidal", seed: "round", width: 96, height: 64
        });
        expect(toroidal).toMatchObject({ topology: "toroidal", width: 96, height: 64 });
        expect(() => assertWorldDescriptorV2(structuredClone(toroidal))).not.toThrow();
    });

    test("uses source content rather than a fabricated seed for static worlds", () => {
        const descriptor = createWorldDescriptorV2({
            ...semantics(),
            sourceKind: "static",
            sourceContentHash: hash("a"),
            width: 45,
            height: 37
        });
        expect(descriptor).toMatchObject({ sourceKind: "static", topology: "finite", width: 45, height: 37 });
        expect("seed" in descriptor).toBe(false);
        expect(serializeWorldDescriptorV2(descriptor)).toContain(hash("a"));
    });

    test("changes identity when semantic catalog content changes under the same name", () => {
        const first = createWorldDescriptorV2({
            ...semantics(), sourceKind: "procedural-infinite", seed: "catalog"
        });
        const baseSemantics = semantics();
        const changed = {
            ...baseSemantics,
            substrateCatalog: { ...baseSemantics.substrateCatalog, contentHash: hash("b") }
        };
        const second = createWorldDescriptorV2({
            ...changed, sourceKind: "procedural-infinite", seed: "catalog"
        });
        expect(serializeWorldDescriptorV2(second)).not.toBe(serializeWorldDescriptorV2(first));
    });

    test("rejects malformed hashes, catalogs, topology and old descriptors", () => {
        expect(() => createWorldDescriptorV2({
            ...semantics(), sourceKind: "static", sourceContentHash: "not-a-hash", width: 32, height: 32
        })).toThrow(/sha256/);
        expect(() => createWorldDescriptorV2({
            ...semantics(), sourceKind: "procedural-toroidal", seed: "bad", width: 64, height: 48
        })).toThrow(/multiples/);
        const baseSemantics = semantics();
        const duplicate = {
            ...baseSemantics,
            biomeBasis: [
                baseSemantics.biomeBasis[0],
                baseSemantics.biomeBasis[0],
                baseSemantics.biomeBasis[2],
                baseSemantics.biomeBasis[3]
            ] as typeof baseSemantics.biomeBasis
        };
        expect(() => createWorldDescriptorV2({
            ...duplicate, sourceKind: "procedural-infinite", seed: "bad"
        })).toThrow(/unique/);
        expect(() => assertWorldDescriptorV2({ descriptorVersion: 1 })).toThrow(/unsupported/);
    });
});

import { describe, expect, test } from "vitest";

import {
    assertWorldDescriptor,
    createWorldDescriptor,
    serializeWorldDescriptor,
    WORLD_CHUNK_FORMAT_VERSION,
    WORLD_DESCRIPTOR_FORMAT_VERSION,
    DEFAULT_WORLD_WATER_STYLE,
    WORLD_GENERATOR_VERSION,
    worldDescriptorsEqual
} from "../../src/index";

describe("world descriptor protocol", () => {
    test("canonicalizes an infinite procedural world", () => {
        const descriptor = createWorldDescriptor({ seed: 42, chunkSize: 24 });
        expect(descriptor).toEqual({
            descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION,
            sourceKind: "procedural-infinite",
            seed: "42",
            generatorVersion: WORLD_GENERATOR_VERSION,
            chunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION,
            chunkSize: 24,
            waterStyle: DEFAULT_WORLD_WATER_STYLE,
            topology: "infinite"
        });
        expect(() => assertWorldDescriptor(structuredClone(descriptor))).not.toThrow();
        expect(worldDescriptorsEqual(descriptor, createWorldDescriptor({ seed: "42", chunkSize: 24 }))).toBe(true);
    });

    test("partitions world identity by canonical water generation style", () => {
        const base = createWorldDescriptor({ seed: "water-style", chunkSize: 24 });
        const wetter = createWorldDescriptor({
            seed: "water-style",
            chunkSize: 24,
            waterStyle: { ...DEFAULT_WORLD_WATER_STYLE, oceanLevel: 0.55 }
        });
        expect(wetter.waterStyle.oceanLevel).toBe(0.55);
        expect(Object.isFrozen(wetter.waterStyle)).toBe(true);
        expect(serializeWorldDescriptor(wetter)).not.toBe(serializeWorldDescriptor(base));
        expect(worldDescriptorsEqual(wetter, base)).toBe(false);
    });

    test("includes all toroidal identity and persistence-partition fields", () => {
        const descriptor = createWorldDescriptor({
            seed: "round",
            chunkSize: 12,
            world: { topology: "toroidal", width: 64, height: 48 }
        });
        expect(descriptor).toMatchObject({
            sourceKind: "procedural-toroidal",
            topology: "toroidal",
            width: 64,
            height: 48
        });
        expect(serializeWorldDescriptor(descriptor)).not.toBe(serializeWorldDescriptor(
            createWorldDescriptor({
                seed: "round",
                chunkSize: 24,
                world: { topology: "toroidal", width: 64, height: 48 }
            })
        ));
    });

    test("rejects unsupported algorithms and malformed persisted descriptors", () => {
        expect(() => createWorldDescriptor({ seed: "future", generatorVersion: WORLD_GENERATOR_VERSION + 1 }))
            .toThrow(/unsupported world generator version/);
        expect(() => assertWorldDescriptor({
            ...createWorldDescriptor({ seed: "world" }),
            descriptorVersion: 999
        })).toThrow(/descriptor format/);
        expect(() => assertWorldDescriptor({
            ...createWorldDescriptor({ seed: "world" }),
            chunkFormatVersion: 999
        })).toThrow(/chunk format/);
        const missingWaterStyle = { ...createWorldDescriptor({ seed: "world" }) } as any;
        delete missingWaterStyle.waterStyle;
        expect(() => assertWorldDescriptor(missingWaterStyle)).toThrow(/water generation style/);
    });
});

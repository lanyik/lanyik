import { describe, expect, test } from "vitest";

import {
    CORE_SUBSTRATE_ENTRIES,
    CORE_VEGETATION_PROFILE_ENTRIES,
    CORE_WORLD_SEMANTICS_V2
} from "../../src/world/SemanticCatalogsV2";

async function contentHash(value: unknown): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
}

describe("v2 core semantic catalogs", () => {
    test("binds each frozen index interpretation to its canonical content hash", async () => {
        expect(CORE_WORLD_SEMANTICS_V2.substrateCatalog.contentHash).toBe(await contentHash({
            version: 1,
            entries: CORE_SUBSTRATE_ENTRIES
        }));
        expect(CORE_WORLD_SEMANTICS_V2.vegetationCatalog.contentHash).toBe(await contentHash({
            version: 1,
            entries: CORE_VEGETATION_PROFILE_ENTRIES
        }));
        for (const basis of CORE_WORLD_SEMANTICS_V2.biomeBasis) {
            expect(basis.contentHash).toBe(await contentHash({ version: 1, id: basis.id }));
        }
    });

    test("keeps all catalog containers immutable", () => {
        expect(Object.isFrozen(CORE_WORLD_SEMANTICS_V2)).toBe(true);
        expect(Object.isFrozen(CORE_WORLD_SEMANTICS_V2.biomeBasis)).toBe(true);
        expect(Object.isFrozen(CORE_SUBSTRATE_ENTRIES)).toBe(true);
        expect(Object.isFrozen(CORE_VEGETATION_PROFILE_ENTRIES)).toBe(true);
    });
});

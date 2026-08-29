import {
    createWorldDescriptorV2,
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WorldDescriptorV2Semantics
} from "./WorldDescriptorV2";

export const CORE_SUBSTRATE_ENTRIES = Object.freeze(["soil", "sand", "rock"] as const);
export const CORE_VEGETATION_PROFILE_ENTRIES = Object.freeze([
    "tropical-palm-mix",
    "temperate-oak-mix",
    "boreal-pine-mix",
    "alpine-scrub-mix"
] as const);

export const enum CoreSubstrateClass {
    Soil = 0,
    Sand = 1,
    Rock = 2
}

export const enum CoreVegetationProfile {
    Tropical = 0,
    Temperate = 1,
    Boreal = 2,
    Alpine = 3
}

export const CORE_WORLD_SEMANTICS_V2: Readonly<WorldDescriptorV2Semantics> = Object.freeze({
    seaLevel: 28_180,
    substrateCatalog: Object.freeze({
        id: "core/substrate-v1",
        contentHash: "sha256:26c47bb7a026006adb6752e18242a954e9c127fc282b13c98e087030e77aff4e",
        entryCount: CORE_SUBSTRATE_ENTRIES.length
    }),
    biomeBasis: Object.freeze([
        Object.freeze({
            id: "temperate",
            contentHash: "sha256:59c7239eff9fb5f96d39d6acecf201748d5f0582a1b8882806f6c681e9e50668"
        }),
        Object.freeze({
            id: "dry",
            contentHash: "sha256:1c9fdbff28acbfc7950eab9e0823710a42b7a23bd5088ecd648165d84e09f65c"
        }),
        Object.freeze({
            id: "cold",
            contentHash: "sha256:13e616d6a945fd47356aa67c7da81dc27adc935ad88496e1d07ac4a66761d3e5"
        }),
        Object.freeze({
            id: "alpine",
            contentHash: "sha256:ef636273bfe43421e259e6067c48752f85e80c264ea971d963c93e9e6f1723c4"
        })
    ] as const),
    vegetationCatalog: Object.freeze({
        id: "core/vegetation-v1",
        contentHash: "sha256:d930afdbc24859f54d002bc060ef3075efcb906f975ac10032e699e087677a51",
        entryCount: CORE_VEGETATION_PROFILE_ENTRIES.length
    })
});

export function assertCoreWorldSemanticsV2(semantics: Readonly<WorldDescriptorV2Semantics>): void {
    if (!semantics || typeof semantics !== "object"
        || semantics.seaLevel !== CORE_WORLD_SEMANTICS_V2.seaLevel
        || semantics.substrateCatalog.id !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.id
        || semantics.substrateCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.contentHash
        || semantics.substrateCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.entryCount
        || semantics.vegetationCatalog.id !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.id
        || semantics.vegetationCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.contentHash
        || semantics.vegetationCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.entryCount
        || !Array.isArray(semantics.biomeBasis) || semantics.biomeBasis.length !== 4
        || semantics.biomeBasis.some((basis, index) =>
            basis.id !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].id
            || basis.contentHash !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].contentHash)) {
        throw new TypeError("world semantics do not match the frozen core v2 catalogs or sea level");
    }
}

export function createCoreInfiniteWorldDescriptorV2(seed: string | number): InfiniteWorldDescriptorV2 {
    return createWorldDescriptorV2({
        ...CORE_WORLD_SEMANTICS_V2,
        sourceKind: "procedural-infinite",
        seed
    });
}

export function createCoreToroidalWorldDescriptorV2(
    seed: string | number,
    width: number,
    height: number
): ToroidalWorldDescriptorV2 {
    return createWorldDescriptorV2({
        ...CORE_WORLD_SEMANTICS_V2,
        sourceKind: "procedural-toroidal",
        seed,
        width,
        height
    });
}

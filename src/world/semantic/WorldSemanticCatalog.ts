export enum SubstrateClass {
    Sediment = 0,
    Soil = 1,
    Sand = 2,
    Rock = 3,
    Permafrost = 4
}

export type WorldBiomeBasis = "temperate" | "dry" | "cold" | "alpine";

export interface SemanticCatalogIdentity {
    readonly id: string;
    readonly contentHash: string;
}

export interface SubstrateCatalogEntry {
    readonly id: string;
    readonly class: SubstrateClass;
}

export interface VegetationSpeciesWeight {
    readonly species: "palm" | "pinia" | "oak";
    readonly weight: number;
}

export interface VegetationProfileCatalogEntry {
    readonly id: string;
    readonly species: readonly VegetationSpeciesWeight[];
}

export const WORLD_BIOME_BASIS = Object.freeze([
    "temperate",
    "dry",
    "cold",
    "alpine"
] as const);

export const WORLD_SUBSTRATE_CATALOG = Object.freeze<readonly SubstrateCatalogEntry[]>([
    Object.freeze({ id: "sediment", class: SubstrateClass.Sediment }),
    Object.freeze({ id: "soil", class: SubstrateClass.Soil }),
    Object.freeze({ id: "sand", class: SubstrateClass.Sand }),
    Object.freeze({ id: "rock", class: SubstrateClass.Rock }),
    Object.freeze({ id: "permafrost", class: SubstrateClass.Permafrost })
]);

export const WORLD_VEGETATION_PROFILE_CATALOG = Object.freeze<readonly VegetationProfileCatalogEntry[]>([
    Object.freeze({ id: "none", species: Object.freeze([]) }),
    Object.freeze({
        id: "warm-palm-mix",
        species: Object.freeze([
            Object.freeze({ species: "palm", weight: 204 }),
            Object.freeze({ species: "oak", weight: 51 })
        ])
    }),
    Object.freeze({
        id: "cold-pinia-mix",
        species: Object.freeze([
            Object.freeze({ species: "pinia", weight: 204 }),
            Object.freeze({ species: "oak", weight: 51 })
        ])
    }),
    Object.freeze({
        id: "temperate-oak-mix",
        species: Object.freeze([
            Object.freeze({ species: "oak", weight: 178 }),
            Object.freeze({ species: "pinia", weight: 51 }),
            Object.freeze({ species: "palm", weight: 26 })
        ])
    })
]);

// These SHA-256 values cover JSON.stringify() of the corresponding frozen
// catalog. Tests recompute them so changing catalog content cannot silently
// reuse an existing world identity.
export const WORLD_SUBSTRATE_CATALOG_IDENTITY: Readonly<SemanticCatalogIdentity> = Object.freeze({
    id: "three-hex-map/substrate-v1",
    contentHash: "471edc137e2d634b36a2fa7452a9b72ef204258648b681b4357e72abad4d1561"
});

export const WORLD_VEGETATION_CATALOG_IDENTITY: Readonly<SemanticCatalogIdentity> = Object.freeze({
    id: "three-hex-map/vegetation-v1",
    contentHash: "aa515fb7c895c1bd600b464119a9599e4963c466fcb35281f6824ce8911283ef"
});

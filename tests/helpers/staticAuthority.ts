import { HydrologyRegion } from "../../src/world/semantic/HydrologyRegion";
import { OCEAN_BODY_ID } from "../../src/world/semantic/MacroDrainageGraph";
import { StaticWorldSemanticFields } from "../../src/world/semantic/compileStaticWorldAuthority";
import { SubstrateClass } from "../../src/world/semantic/WorldSemanticCatalog";
import { HYDROLOGY_REGION_REVISION, HYDROLOGY_REGION_SIZE } from "../../src/world/semantic/WorldSemanticFormat";

export function createFlatStaticAuthorityFields(
    width = 32,
    height = 32,
    macroHeightValue = 32_768
): StaticWorldSemanticFields {
    const count = width * height;
    const biomeWeights = new Uint8Array(count * 4);
    for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
    const hydrologyRegions: HydrologyRegion[] = [];
    for (let regionX = 0; regionX < Math.ceil(width / HYDROLOGY_REGION_SIZE); regionX += 1) {
        for (let regionY = 0; regionY < Math.ceil(height / HYDROLOGY_REGION_SIZE); regionY += 1) {
            hydrologyRegions.push(Object.freeze({
                key: Object.freeze({ regionX, regionY }),
                revision: HYDROLOGY_REGION_REVISION,
                validBounds: Object.freeze({
                    minX: 0,
                    minY: 0,
                    maxXExclusive: Math.min(HYDROLOGY_REGION_SIZE, width - regionX * HYDROLOGY_REGION_SIZE),
                    maxYExclusive: Math.min(HYDROLOGY_REGION_SIZE, height - regionY * HYDROLOGY_REGION_SIZE)
                }),
                boundaryPorts: Object.freeze([]),
                rivers: Object.freeze([]),
                lakes: Object.freeze([]),
                mouths: Object.freeze([]),
                bodies: Object.freeze([Object.freeze({
                    bodyId: OCEAN_BODY_ID,
                    kind: "ocean" as const,
                    profileIndex: 0
                })])
            }));
        }
    }
    return {
        width,
        height,
        topology: "bounded",
        sourceContentHash: "c".repeat(64),
        substrateClass: new Uint8Array(count).fill(SubstrateClass.Soil),
        macroHeight: new Uint16Array(count).fill(macroHeightValue),
        biomeWeights,
        climate: new Uint8Array(count * 2).fill(128),
        vegetationDensity: new Uint8Array(count),
        vegetationProfile: new Uint8Array(count),
        hydrologyRegions: Object.freeze(hydrologyRegions)
    };
}

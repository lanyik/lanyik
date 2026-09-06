import { MINERALS, MINERAL_IDS, isDryGround, type MineralId, type MineralNode, type SurveyTerrain } from "../../content/minerals";

export const MINERAL_GENERATION_VERSION = 1;
export const MINERAL_REGION_SIZE = 16;
const TOTAL_WEIGHT = MINERAL_IDS.reduce((sum, mineral) => sum + MINERALS[mineral].weight, 0);

function mix(value: number): number {
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return (value ^ value >>> 16) >>> 0;
}

/** Stateless geological blobs in global tile coordinates, independent of render chunks. */
export class MineralField {
    private readonly seedHash: number;

    constructor(seed: string) {
        if (typeof seed !== "string" || !seed.length || seed.length > 128) throw new RangeError("Invalid mineral seed");
        let hash = 2166136261;
        for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
        this.seedHash = mix(hash ^ MINERAL_GENERATION_VERSION);
    }

    public nodeAt(x: number, y: number, terrain: SurveyTerrain): MineralNode | undefined {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new RangeError("Mineral coordinates must be safe integers");
        if (!isDryGround(terrain)) return undefined;
        const regionX = Math.floor(x / MINERAL_REGION_SIZE);
        const regionY = Math.floor(y / MINERAL_REGION_SIZE);
        let winner: { regionX: number; regionY: number; strength: number; hash: number } | undefined;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                const rx = regionX + offsetX;
                const ry = regionY + offsetY;
                const hash = this.hashAt(rx, ry);
                if (hash % 10 < 2) continue;
                const shape = mix(hash ^ 0x9e3779b9);
                // Centres may sit on a region edge; the halo above keeps veins continuous.
                const cx = rx * MINERAL_REGION_SIZE + (shape & 15);
                const cy = ry * MINERAL_REGION_SIZE + (shape >>> 4 & 15);
                const radiusX = 2.5 + (shape >>> 8 & 7) / 3;
                const radiusY = 2.5 + (shape >>> 11 & 7) / 3;
                const dx = (x - cx) / radiusX;
                const dy = (y - cy) / radiusY;
                const strength = 1 - dx * dx - dy * dy;
                if (strength <= 0 || (winner && strength <= winner.strength)) continue;
                winner = { regionX: rx, regionY: ry, strength, hash };
            }
        }
        if (!winner) return undefined;
        const mineral = this.mineralFor(mix(winner.hash ^ 0xa511e9b3) % TOTAL_WEIGHT);
        const definition = MINERALS[mineral];
        const richness = (this.hashAt(x, y) & 1023) / 1023;
        const initialAmount = definition.minimum + Math.floor(
            (definition.maximum - definition.minimum) * (winner.strength * 0.7 + richness * 0.3)
        );
        const depositId = `m${MINERAL_GENERATION_VERSION}:${winner.regionX}:${winner.regionY}`;
        return Object.freeze({ id: `${depositId}:${x}:${y}`, depositId, mineral, x, y, initialAmount });
    }

    private hashAt(x: number, y: number): number {
        // Fold both words so far coordinates do not repeat merely because of int32 truncation.
        return mix(this.seedHash ^ mix(x) ^ mix(Math.floor(x / 0x1_0000_0000))
            ^ mix(y ^ 0x632be5ab) ^ mix(Math.floor(y / 0x1_0000_0000) ^ 0x85157af5));
    }

    private mineralFor(roll: number): MineralId {
        for (const mineral of MINERAL_IDS) {
            roll -= MINERALS[mineral].weight;
            if (roll < 0) return mineral;
        }
        throw new Error("Mineral content weights do not cover the generated roll");
    }
}

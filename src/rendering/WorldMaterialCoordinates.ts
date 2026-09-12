import { RawShaderMaterial, Vector2, Vector4 } from "three";
import { WORLD_NOISE_SCALES } from "../shaders/worldNoise";
import type { ResourceBudgetAccount, ResourceReservationHandle } from "../runtime/ResourceBudget";

let nextCoordinateOwner = 1;

export const TAU = Math.PI * 2;
export function phaseModulo(value: number, period = TAU): number {
    return ((value % period) + period) % period;
}

/** Actual configured repeat spans, with no implicit minimum world-space scale. */
export function createTerrainTexturePeriod(size: number, regionSize: number): Vector2 {
    if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(regionSize) || regionSize <= 0) {
        throw new RangeError("Terrain texture size and region size must be positive finite numbers");
    }
    const period = new Vector2(size * 1.5 * regionSize, size * Math.sqrt(3) * regionSize);
    if (![period.x, period.y].every(value => Number.isFinite(Math.fround(value)) && Math.fround(value) > 0)) {
        throw new RangeError("Terrain texture periods must be representable as positive finite GPU floats");
    }
    return period;
}

/** Cached per-chunk phases; global JS doubles are reduced before upload to WebGL. */
export class WorldMaterialCoordinates {
    public readonly noiseCell = new Uint32Array(WORLD_NOISE_SCALES.length * 2);
    public readonly noiseFraction = new Float32Array(WORLD_NOISE_SCALES.length * 2);
    public readonly texturePhase = new Vector2();
    public readonly fogPhase = new Vector2();
    public readonly macroPhase = new Vector2();
    public readonly wavePhase = new Vector4();
    private x = NaN;
    private z = NaN;
    private textureX = NaN;
    private textureZ = NaN;
    private fogSize = NaN;
    private waveFrequency: number | undefined = NaN;
    private readonly reservation: ResourceReservationHandle | undefined;

    constructor(private readonly size: number, resources?: ResourceBudgetAccount) {
        this.reservation = resources?.acquireRequired(`material-coordinates:${nextCoordinateOwner++}`, {}, true,
            [this.noiseCell, this.noiseFraction].map(array => ({
                identity: array.buffer, cost: { cpuBytes: array.byteLength }
            })));
    }

    public dispose(): void { this.reservation?.release(); }

    public apply(material: RawShaderMaterial, x: number, z: number): void {
        const uniforms = material.uniforms;
        const textureSize = uniforms.terrainTextureWorldSize.value as Vector2;
        const fogSize = uniforms.fogTextureSize.value as number;
        const waveFrequency = uniforms.waveFrequency?.value as number | undefined;
        if (x !== this.x || z !== this.z || textureSize.x !== this.textureX || textureSize.y !== this.textureZ
            || fogSize !== this.fogSize || waveFrequency !== this.waveFrequency) {
            for (let index = 0; index < WORLD_NOISE_SCALES.length; index++) {
                const frequency = WORLD_NOISE_SCALES[index];
                const nx = x / this.size * frequency, nz = z / this.size * frequency;
                this.noiseCell[index * 2] = Math.floor(nx) >>> 0;
                this.noiseCell[index * 2 + 1] = Math.floor(nz) >>> 0;
                this.noiseFraction[index * 2] = nx - Math.floor(nx);
                this.noiseFraction[index * 2 + 1] = nz - Math.floor(nz);
            }
            this.texturePhase.set(phaseModulo(x / textureSize.x, 2), phaseModulo(z / textureSize.y, 2));
            this.fogPhase.set(phaseModulo(-z / fogSize, 1), phaseModulo(-x / fogSize, 1));
            const macroSize = this.size * 4;
            this.macroPhase.set(phaseModulo((x * .73 + z * 1.21) / macroSize), phaseModulo((x * -1.37 + z * .61) / macroSize + 1.9));
            if (waveFrequency !== undefined) {
                let frequency = waveFrequency;
                for (let index = 0; index < 4; index++) {
                    const angle = .4 + index * 2.399963;
                    this.wavePhase.setComponent(index, phaseModulo((Math.cos(angle) * x + Math.sin(angle) * z) * frequency));
                    frequency *= 1.8;
                }
            }
            this.x = x; this.z = z;
            this.textureX = textureSize.x; this.textureZ = textureSize.y;
            this.fogSize = fogSize; this.waveFrequency = waveFrequency;
        }
        uniforms.noiseCell.value = this.noiseCell;
        uniforms.noiseFraction.value = this.noiseFraction;
        uniforms.texturePhase.value = this.texturePhase;
        uniforms.fogPhase.value = this.fogPhase;
        uniforms.macroPhase.value = this.macroPhase;
        uniforms.wavePhase.value = this.wavePhase;
    }
}

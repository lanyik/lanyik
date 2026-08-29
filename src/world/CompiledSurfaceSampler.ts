import {
    CompiledSurfaceField,
    assertCompiledSurfaceField
} from "./CompiledSurfaceField";
import { float16BitsToFloat32 } from "./HalfFloat";
import { SURFACE_COMPILE_PROFILE, SURFACE_CORE_TEXELS } from "./SurfaceCompileProfile";
import { surfaceToWorld } from "./SurfaceLattice";

export const SURFACE_GROUND_SLOPE_SAMPLE_STEP = 0.25;

export interface MutableCompiledSurfaceSample {
    groundHeight: number;
    waterLevel: number;
    waterDepth: number;
    shorelineDistance: number;
    waterCoverage: number;
    waterKind: number;
    waterProfile: number;
    waterBodyIndex: number;
    readonly materialWeights: Float32Array;
    readonly flow: Float32Array;
}

export function createCompiledSurfaceSample(): MutableCompiledSurfaceSample {
    return {
        groundHeight: 0,
        waterLevel: 0,
        waterDepth: 0,
        shorelineDistance: 0,
        waterCoverage: 0,
        waterKind: 0,
        waterProfile: 0,
        waterBodyIndex: 0,
        materialWeights: new Float32Array(4),
        flow: new Float32Array(2)
    };
}

function assertOutput(output: MutableCompiledSurfaceSample): void {
    if (!output || typeof output !== "object"
        || !(output.materialWeights instanceof Float32Array) || output.materialWeights.length !== 4
        || !(output.flow instanceof Float32Array) || output.flow.length !== 2) {
        throw new TypeError("compiled surface sample output has an invalid fixed layout");
    }
}

function assertCoordinate(localU: number, localV: number): void {
    const minimum = -0.5;
    const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    if (!Number.isFinite(localU) || !Number.isFinite(localV)
        || localU < minimum || localU > maximum || localV < minimum || localV > maximum) {
        throw new RangeError("compiled surface sample coordinate is outside the render chunk core");
    }
}

function binary16At(values: Uint16Array, localU: number, localV: number): number {
    assertCoordinate(localU, localV);
    const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const gutter = SURFACE_COMPILE_PROFILE.gutterTexels;
    const physicalX = (localU + 0.5) * samplesPerTile - 0.5 + gutter;
    const physicalY = (localV + 0.5) * samplesPerTile - 0.5 + gutter;
    const firstX = Math.floor(physicalX);
    const firstY = Math.floor(physicalY);
    const amountX = physicalX - firstX;
    const amountY = physicalY - firstY;
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    const firstIndex = firstX * size + firstY;
    const secondIndex = (firstX + 1) * size + firstY;
    return float16BitsToFloat32(values[firstIndex]) * (1 - amountX) * (1 - amountY)
        + float16BitsToFloat32(values[firstIndex + 1]) * (1 - amountX) * amountY
        + float16BitsToFloat32(values[secondIndex]) * amountX * (1 - amountY)
        + float16BitsToFloat32(values[secondIndex + 1]) * amountX * amountY;
}

function binary16Four(
    values: Uint16Array,
    firstIndex: number,
    secondIndex: number,
    firstWeight: number,
    secondWeight: number,
    thirdWeight: number,
    fourthWeight: number
): number {
    return float16BitsToFloat32(values[firstIndex]) * firstWeight
        + float16BitsToFloat32(values[firstIndex + 1]) * secondWeight
        + float16BitsToFloat32(values[secondIndex]) * thirdWeight
        + float16BitsToFloat32(values[secondIndex + 1]) * fourthWeight;
}

export class CompiledSurfaceSampler {
    constructor(private readonly field: Readonly<CompiledSurfaceField>) {
        assertCompiledSurfaceField(field);
    }

    public sampleBilinear(
        localU: number,
        localV: number,
        output: MutableCompiledSurfaceSample
    ): MutableCompiledSurfaceSample {
        assertOutput(output);
        assertCoordinate(localU, localV);
        const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
        const gutter = SURFACE_COMPILE_PROFILE.gutterTexels;
        const physicalX = (localU + 0.5) * samplesPerTile - 0.5 + gutter;
        const physicalY = (localV + 0.5) * samplesPerTile - 0.5 + gutter;
        const firstX = Math.floor(physicalX);
        const firstY = Math.floor(physicalY);
        const amountX = physicalX - firstX;
        const amountY = physicalY - firstY;
        const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
        const firstIndex = firstX * size + firstY;
        const secondIndex = (firstX + 1) * size + firstY;
        const firstWeight = (1 - amountX) * (1 - amountY);
        const secondWeight = (1 - amountX) * amountY;
        const thirdWeight = amountX * (1 - amountY);
        const fourthWeight = amountX * amountY;
        output.groundHeight = binary16Four(
            this.field.groundHeight,
            firstIndex,
            secondIndex,
            firstWeight,
            secondWeight,
            thirdWeight,
            fourthWeight
        );
        output.shorelineDistance = binary16Four(
            this.field.shorelineDistance,
            firstIndex,
            secondIndex,
            firstWeight,
            secondWeight,
            thirdWeight,
            fourthWeight
        );
        output.waterCoverage = 0;
        output.waterLevel = 0;
        output.waterDepth = 0;
        output.waterKind = 0;
        output.waterProfile = 0;
        output.waterBodyIndex = 0;
        output.materialWeights.fill(0);
        output.flow.fill(0);
        let winningScore = 0;
        let winningIndex = Number.POSITIVE_INFINITY;
        for (let tap = 0; tap < 4; tap += 1) {
            const index = tap === 0 ? firstIndex : tap === 1 ? firstIndex + 1
                : tap === 2 ? secondIndex : secondIndex + 1;
            const weight = tap === 0 ? firstWeight : tap === 1 ? secondWeight
                : tap === 2 ? thirdWeight : fourthWeight;
            const coverage = this.field.waterCoverage[index] / 255;
            output.waterCoverage += coverage * weight;
            const materialOffset = index * 4;
            for (let material = 0; material < 4; material += 1) {
                output.materialWeights[material] += this.field.materialWeights[materialOffset + material]
                    / 255 * weight;
            }
            const score = coverage * weight;
            if (score > winningScore || (score === winningScore && score > 0 && index < winningIndex)) {
                winningScore = score;
                winningIndex = index;
            }
        }
        if (winningScore === 0) return output;
        const winningBody = this.field.waterBodyIndex[winningIndex];
        output.waterKind = this.field.waterKind[winningIndex];
        output.waterProfile = this.field.waterProfile[winningIndex];
        output.waterBodyIndex = winningBody;
        let waterWeight = 0;
        for (let tap = 0; tap < 4; tap += 1) {
            const index = tap === 0 ? firstIndex : tap === 1 ? firstIndex + 1
                : tap === 2 ? secondIndex : secondIndex + 1;
            if (this.field.waterBodyIndex[index] !== winningBody) continue;
            const bilinearWeight = tap === 0 ? firstWeight : tap === 1 ? secondWeight
                : tap === 2 ? thirdWeight : fourthWeight;
            const weight = bilinearWeight * this.field.waterCoverage[index] / 255;
            if (weight === 0) continue;
            waterWeight += weight;
            output.waterLevel += float16BitsToFloat32(this.field.waterLevel[index]) * weight;
            output.waterDepth += float16BitsToFloat32(this.field.waterDepth[index]) * weight;
            output.flow[0] += this.field.flow[index * 2] / 127 * weight;
            output.flow[1] += this.field.flow[index * 2 + 1] / 127 * weight;
        }
        if (!(waterWeight > 0)) throw new Error("compiled surface winning body has no weighted payload");
        output.waterLevel /= waterWeight;
        output.waterDepth /= waterWeight;
        const flowLength = Math.hypot(output.flow[0], output.flow[1]);
        if (flowLength > 0) {
            output.flow[0] /= flowLength;
            output.flow[1] /= flowLength;
        }
        return output;
    }

    public sampleGroundHeight(localU: number, localV: number): number {
        assertCoordinate(localU, localV);
        const samplesPerTile = SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
        const gridX = (localU + 0.5) * samplesPerTile;
        const gridY = (localV + 0.5) * samplesPerTile;
        const cellX = Math.min(SURFACE_CORE_TEXELS - 1, Math.floor(gridX));
        const cellY = Math.min(SURFACE_CORE_TEXELS - 1, Math.floor(gridY));
        const amountX = gridX - cellX;
        const amountY = gridY - cellY;
        const step = 1 / samplesPerTile;
        const bottomLeftU = -0.5 + cellX * step;
        const bottomLeftV = -0.5 + cellY * step;
        const bottomLeft = binary16At(this.field.groundHeight, bottomLeftU, bottomLeftV);
        const topRight = binary16At(this.field.groundHeight, bottomLeftU + step, bottomLeftV + step);
        if (amountY <= amountX) {
            const bottomRight = binary16At(this.field.groundHeight, bottomLeftU + step, bottomLeftV);
            return bottomLeft * (1 - amountX)
                + bottomRight * (amountX - amountY)
                + topRight * amountY;
        }
        const topLeft = binary16At(this.field.groundHeight, bottomLeftU, bottomLeftV + step);
        return bottomLeft * (1 - amountY)
            + topLeft * (amountY - amountX)
            + topRight * amountX;
    }

    public sampleSurface(
        localU: number,
        localV: number,
        output: MutableCompiledSurfaceSample
    ): MutableCompiledSurfaceSample {
        this.sampleBilinear(localU, localV, output);
        output.groundHeight = this.sampleGroundHeight(localU, localV);
        return output;
    }
}

// Shared gameplay/vegetation slope kernel. The stencil works in logical
// coordinates, converts both basis directions through SurfaceLattice, and uses
// the same canonical Ground triangle sampler as placement and navigation.
export function sampleCompiledGroundSlope(
    sampler: CompiledSurfaceSampler,
    localU: number,
    localV: number,
    hexSize: number
): number {
    if (!(sampler instanceof CompiledSurfaceSampler)) {
        throw new TypeError("compiled ground slope requires a surface sampler");
    }
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("compiled ground slope requires a positive finite hex size");
    }
    const minimum = -0.5;
    const maximum = SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5;
    if (!Number.isFinite(localU) || !Number.isFinite(localV)
        || localU < minimum || localU > maximum || localV < minimum || localV > maximum) {
        throw new RangeError("compiled ground slope coordinate is outside the render chunk core");
    }
    const minimumU = Math.max(minimum, localU - SURFACE_GROUND_SLOPE_SAMPLE_STEP);
    const maximumU = Math.min(maximum, localU + SURFACE_GROUND_SLOPE_SAMPLE_STEP);
    const minimumV = Math.max(minimum, localV - SURFACE_GROUND_SLOPE_SAMPLE_STEP);
    const maximumV = Math.min(maximum, localV + SURFACE_GROUND_SLOPE_SAMPLE_STEP);
    const heightU = sampler.sampleGroundHeight(maximumU, localV)
        - sampler.sampleGroundHeight(minimumU, localV);
    const heightV = sampler.sampleGroundHeight(localU, maximumV)
        - sampler.sampleGroundHeight(localU, minimumV);
    const worldUMinimum = surfaceToWorld(minimumU, localV, hexSize);
    const worldUMaximum = surfaceToWorld(maximumU, localV, hexSize);
    const worldVMinimum = surfaceToWorld(localU, minimumV, hexSize);
    const worldVMaximum = surfaceToWorld(localU, maximumV, hexSize);
    const deltaUx = worldUMaximum.x - worldUMinimum.x;
    const deltaUz = worldUMaximum.z - worldUMinimum.z;
    const deltaVz = worldVMaximum.z - worldVMinimum.z;
    if (!(deltaUx > 0) || !(deltaVz > 0)) {
        throw new Error("compiled ground slope stencil collapsed at the surface core boundary");
    }
    const gradientZ = heightV / deltaVz;
    const gradientX = (heightU - gradientZ * deltaUz) / deltaUx;
    return Math.hypot(gradientX, gradientZ);
}

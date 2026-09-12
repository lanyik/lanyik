import { expect, test } from "vitest";
import { RawShaderMaterial, Vector2, Vector4 } from "three";
import { createTerrainTexturePeriod, phaseModulo, WorldMaterialCoordinates } from "../../src/rendering/WorldMaterialCoordinates";
import { WORLD_NOISE_SCALES } from "../../src/shaders/worldNoise";
import { ResourceBudgetLedger } from "../../src/runtime/ResourceBudget";
import { TERRAIN_FRAGMENT_SHADER } from "../../src/shaders/terrain.fragment";
import { TERRAIN_FAST_FRAGMENT_SHADER } from "../../src/shaders/terrain.fast.fragment";
import { resolveHexMapOptions } from "../../src/HexMapOptions";

function material(): RawShaderMaterial {
    return new RawShaderMaterial({ uniforms: {
        terrainTextureWorldSize: { value: new Vector2(120, 160) }, fogTextureSize: { value: 320 },
        waveFrequency: { value: .045 }, noiseCell: { value: null }, noiseFraction: { value: null },
        texturePhase: { value: new Vector2() }, fogPhase: { value: new Vector2() },
        macroPhase: { value: new Vector2() }, wavePhase: { value: new Vector4() }
    } });
}

test("remote and negative chunks reconstruct the same noise lattice across chunk boundaries", () => {
    const shader = material(), size = 40;
    for (const start of [2 ** 30 + .25, -(2 ** 30) - .25]) {
        const left = new WorldMaterialCoordinates(size), right = new WorldMaterialCoordinates(size);
        const width = size * 18;
        left.apply(shader, start, start);
        right.apply(shader, start + width, start + width);
        for (let index = 0; index < WORLD_NOISE_SCALES.length; index++) {
            const relative = width / size * WORLD_NOISE_SCALES[index] + left.noiseFraction[index * 2];
            expect((left.noiseCell[index * 2] + Math.floor(relative)) >>> 0).toBe(right.noiseCell[index * 2]);
            expect(relative - Math.floor(relative)).toBeCloseTo(right.noiseFraction[index * 2], 6);
        }
        expect(left.texturePhase.x).toBeGreaterThanOrEqual(0);
        expect(left.texturePhase.x).toBeLessThan(2);
        expect(left.fogPhase.x).toBeGreaterThanOrEqual(0);
        expect(left.fogPhase.x).toBeLessThan(1);
        expect(left.wavePhase.toArray().every(value => value >= 0 && value < Math.PI * 2)).toBe(true);
    }
    shader.dispose();
});

test("material phase changes preserve sub-unit motion beyond Float32 integer precision", () => {
    const shader = material(), coordinates = new WorldMaterialCoordinates(40), origin = 2 ** 30;
    coordinates.apply(shader, origin, origin);
    const initial = coordinates.texturePhase.x;
    coordinates.apply(shader, origin + .25, origin);
    expect(coordinates.texturePhase.x - initial).toBeCloseTo(.25 / 120, 8);
    shader.dispose();
});

test("CPU phase buffers remain charged until their chunk owner is released", () => {
    const budget = new ResourceBudgetLedger({ cpuBytes: 1024, gpuBytes: 0 });
    const coordinates = new WorldMaterialCoordinates(40, budget.createAccount("terrain"));
    expect(budget.stats.cpuBytes).toBe(coordinates.noiseCell.byteLength + coordinates.noiseFraction.byteLength);
    expect(budget.stats.gpuBytes).toBe(0);
    coordinates.dispose();
    expect(budget.stats.cpuBytes).toBe(0);
    budget.dispose();
});

test("sub-unit texture periods preserve phase and unwrapped gradients across chunk boundaries", () => {
    const size = .04, regionSize = .07, shader = material();
    const period = createTerrainTexturePeriod(size, regionSize);
    shader.uniforms.terrainTextureWorldSize.value.copy(period);
    expect(period.x).toBeCloseTo(.0042, 12);
    expect(period.y).toBeLessThan(1);
    const width = size * 18, depth = size * Math.sqrt(3) * 12;
    for (const origin of [-30.123, 30.123, 2 ** 20 + .25]) {
        const left = new WorldMaterialCoordinates(size), right = new WorldMaterialCoordinates(size);
        left.apply(shader, origin, origin);
        right.apply(shader, origin + width, origin + depth);
        const uv = (coordinates: WorldMaterialCoordinates, x: number, z: number) => new Vector2(
            x / period.x + coordinates.texturePhase.x, z / period.y + coordinates.texturePhase.y
        );
        const boundaryLeft = uv(left, width, depth), boundaryRight = uv(right, 0, 0);
        for (const axis of ["x", "y"] as const) {
            // Mirrored repeat permits a whole two-cycle phase difference at a draw boundary.
            expect(phaseModulo(boundaryLeft[axis] - boundaryRight[axis] + 1, 2) - 1).toBeCloseTo(0, 6);
        }
        const deltaLeft = uv(left, width + period.x * .001, depth + period.y * .001).sub(boundaryLeft);
        const deltaRight = uv(right, period.x * .001, period.y * .001).sub(boundaryRight);
        expect(deltaLeft.x).toBeCloseTo(.001, 10);
        expect(deltaLeft.y).toBeCloseTo(.001, 10);
        expect(deltaLeft.distanceTo(deltaRight)).toBeLessThan(1e-10);
        // Fast macro phases also scale with the actual hex radius at sub-unit sizes.
        expect(Math.sin((width * .73 + depth * 1.21) / (size * 4) + left.macroPhase.x))
            .toBeCloseTo(Math.sin(right.macroPhase.x), 7);
        for (let index = 0; index < WORLD_NOISE_SCALES.length; index++) {
            const local = width / size * WORLD_NOISE_SCALES[index] + left.noiseFraction[index * 2];
            expect((left.noiseCell[index * 2] + Math.floor(local)) >>> 0).toBe(right.noiseCell[index * 2]);
            expect(local - Math.floor(local)).toBeCloseTo(right.noiseFraction[index * 2], 6);
        }
    }
    for (const source of [TERRAIN_FRAGMENT_SHADER, TERRAIN_FAST_FRAGMENT_SHADER]) {
        expect(source).toContain("sampleWorld / terrainTextureWorldSize + texturePhase");
        expect(source).not.toContain("max(hexSize * 4.0, 1.0)");
        expect(source.indexOf("terrainGradientX = dFdx(materialPattern.xy)"))
            .toBeLessThan(source.indexOf("if (vFogState < 0.5)"));
        expect(source).toContain("textureGrad(map, vec3(pattern.xy, idx), terrainGradientX, terrainGradientY)");
    }
    shader.dispose();
});

test("configuration rejects invalid GPU periods instead of clamping their scale", () => {
    expect(resolveHexMapOptions({ element: "canvas", size: .04, terrainTextureRegionSize: .07 }).terrainTextureRegionSize).toBe(.07);
    for (const regionSize of [0, -1, NaN, Infinity, 1e40, 1e-50]) {
        expect(() => resolveHexMapOptions({ element: "canvas", terrainTextureRegionSize: regionSize })).toThrow(RangeError);
    }
    expect(() => createTerrainTexturePeriod(.04, -1)).toThrow(RangeError);
});

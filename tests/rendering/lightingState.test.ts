import { describe, expect, test } from "vitest";
import { AmbientLight, CubeUVReflectionMapping, Scene, Texture } from "three";

import {
    createEnvironmentHandle,
    createLightingState
} from "../../src/rendering/LightingState";
import { ThreeLightingAdapter } from "../../src/rendering/ThreeLightingAdapter";

function state(options: Readonly<{
    uniformRevision?: number;
    environmentRevision?: number;
    texture?: Texture;
    exposure?: number;
    sunX?: number;
}> = {}) {
    const environmentRevision = options.environmentRevision ?? 2;
    const texture = options.texture ?? new Texture();
    texture.mapping = CubeUVReflectionMapping;
    return createLightingState({
        uniformRevision: options.uniformRevision ?? 1,
        sunDirection: { x: options.sunX ?? 3, y: 4, z: 0 },
        sunRadiance: { r: 1.5, g: 1.25, b: 1 },
        skyDiffuseIrradiance: { r: 0.2, g: 0.3, b: 0.4 },
        groundDiffuseIrradiance: { r: 0.08, g: 0.06, b: 0.04 },
        specularEnvironment: createEnvironmentHandle(
            environmentRevision,
            texture
        ),
        environmentRevision,
        exposure: options.exposure ?? 0.75
    });
}

describe("unified LightingState", () => {
    test("normalizes inputs and freezes copied linear values", () => {
        const direction = { x: 3, y: 4, z: 0 };
        const lighting = state();
        direction.x = 10;

        expect(lighting.sunDirection).toEqual({ x: 0.6, y: 0.8, z: 0 });
        expect(Object.isFrozen(lighting)).toBe(true);
        expect(Object.isFrozen(lighting.sunRadiance)).toBe(true);
    });

    test("rejects invalid color, exposure and mismatched environment revisions", () => {
        const texture = new Texture();
        texture.mapping = CubeUVReflectionMapping;
        expect(() => createLightingState({
            ...state(),
            sunRadiance: { r: -1, g: 0, b: 0 }
        })).toThrow(/linear RGB/);
        expect(() => createLightingState({ ...state(), exposure: 0 })).toThrow(/exposure/);
        expect(() => createLightingState({
            ...state(),
            environmentRevision: 7,
            specularEnvironment: createEnvironmentHandle(6, texture)
        })).toThrow(/revisions must match/);
    });
});

describe("ThreeLightingAdapter", () => {
    test("maps one state to PBR lights, PMREM environment, exposure and shader uniforms", () => {
        const scene = new Scene();
        const renderer = { toneMappingExposure: 1 };
        const adapter = new ThreeLightingAdapter(renderer, scene);
        const initial = state();

        expect(adapter.apply(initial)).toBe(true);
        expect(adapter.sunLight.position.toArray()).toEqual([0.6, 0.8, 0]);
        expect(adapter.sunLight.color.toArray()).toEqual([1.5, 1.25, 1]);
        expect(adapter.diffuseLight.color.toArray()).toEqual([0.2, 0.3, 0.4]);
        expect(adapter.diffuseLight.groundColor.toArray()).toEqual([0.08, 0.06, 0.04]);
        expect(scene.environment).toBe(initial.specularEnvironment.texture);
        expect(renderer.toneMappingExposure).toBe(0.75);
        expect(scene.children.some(child => child instanceof AmbientLight)).toBe(false);

        const uniforms = adapter.createUniforms();
        expect(uniforms.sunDirection.value.toArray()).toEqual([0.6, 0.8, 0]);
        const nextTexture = new Texture();
        const next = state({
            uniformRevision: 2,
            environmentRevision: 3,
            texture: nextTexture,
            exposure: 1.1,
            sunX: -3
        });
        expect(adapter.apply(next)).toBe(true);
        expect(uniforms.sunDirection.value.x).toBe(-0.6);
        expect(uniforms.specularEnvironment.value).toBe(nextTexture);
        expect(uniforms.exposure.value).toBe(1.1);
        adapter.releaseUniforms(uniforms);
        adapter.dispose();
        expect(scene.environment).toBeNull();
        expect(scene.children).toHaveLength(0);
    });

    test("rejects stale and conflicting equal revisions", () => {
        const adapter = new ThreeLightingAdapter({ toneMappingExposure: 1 }, new Scene());
        const initial = state();
        adapter.apply(initial);
        expect(adapter.apply(initial)).toBe(false);
        expect(() => adapter.apply(state({ uniformRevision: 0 }))).toThrow(/stale/);
        expect(() => adapter.apply(state({ texture: new Texture() }))).toThrow(/equal lighting revisions/);
        adapter.dispose();
    });

    test("enforces uniform ownership and disposed lifecycle", () => {
        const adapter = new ThreeLightingAdapter({ toneMappingExposure: 1 }, new Scene());
        expect(() => adapter.createUniforms()).toThrow(/requires state/);
        adapter.apply(state());
        const uniforms = adapter.createUniforms();
        adapter.releaseUniforms(uniforms);
        expect(() => adapter.releaseUniforms(uniforms)).toThrow(/not owned/);
        adapter.dispose();
        expect(() => adapter.apply(state({ uniformRevision: 2 }))).toThrow(/disposed/);
    });
});

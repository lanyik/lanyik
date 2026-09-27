import { expect, test, vi } from "vitest";
import { Group, Mesh, PerspectiveCamera, RawShaderMaterial, Texture, WebGLRenderTarget, type WebGLRenderer } from "three";
import { WorldLighting } from "../../src/rendering/WorldLighting";
import { WORLD_LIGHTING_HEADER } from "../../src/shaders/worldLighting";

test("raw lighting preserves hooks and material defines, rebinds restored environment, and releases hooks", () => {
    const environment = new WebGLRenderTarget(768, 1024), camera = new PerspectiveCamera();
    const lighting = new WorldLighting(environment, camera);
    const original = vi.fn(), defines = { TERRAIN_SURFACE_MAP: 1 };
    const material = new RawShaderMaterial({ fragmentShader: WORLD_LIGHTING_HEADER, defines });
    material.onBeforeCompile = original;
    const key = material.customProgramCacheKey;
    const root = new Group(); root.add(new Mesh(undefined, material));
    lighting.prepare(root); lighting.prepare(root);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "", fragmentShader: "" };
    material.onBeforeCompile(shader as Parameters<RawShaderMaterial["onBeforeCompile"]>[0], {} as WebGLRenderer);
    expect(original).toHaveBeenCalledOnce();
    expect(shader.uniforms.worldEnvironment.value).toBe(environment.texture);
    expect(shader.uniforms.worldLightingCamera.value).toBe(camera.matrixWorld);
    const restored = new Texture(); lighting.setEnvironment(restored);
    expect(shader.uniforms.worldEnvironment.value).toBe(restored);
    material.dispose();
    expect(material.onBeforeCompile).toBe(original); expect(material.customProgramCacheKey).toBe(key);
    expect(material.defines).toBe(defines);
    lighting.dispose(); environment.dispose(); restored.dispose();
});

import { expect, test, vi } from "vitest";
import { CubeTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, RawShaderMaterial, Vector3, WebGLRenderTarget, type WebGLRenderer } from "three";
import { SkyFog } from "../../src/rendering/SkyFog";
import { WorldLighting } from "../../src/rendering/WorldLighting";
import { HORIZON_FOG_FRAGMENT_HEADER } from "../../src/shaders/horizonFog";
import { WORLD_LIGHTING_HEADER } from "../../src/shaders/worldLighting";
type Shader = Parameters<MeshBasicMaterial["onBeforeCompile"]>[0];

test("radial sky fog preserves material hooks, shares camera uniforms and releases disposed materials", () => {
    const camera = new PerspectiveCamera(), texture = new CubeTexture(), sky = new SkyFog(texture, camera);
    const environment = new WebGLRenderTarget(768, 1024), lighting = new WorldLighting(environment, camera, sky);
    const material = new MeshBasicMaterial(), original = vi.fn(); material.onBeforeCompile = original;
    const key = material.customProgramCacheKey;
    const raw = new RawShaderMaterial({ vertexShader: "vHorizonFogDepth = -mvPosition.z;", fragmentShader: WORLD_LIGHTING_HEADER + HORIZON_FOG_FRAGMENT_HEADER });
    const rawCompile = raw.onBeforeCompile, rawKey = raw.customProgramCacheKey, rawDefines = raw.defines;
    const root = new Group(); root.add(new Mesh(undefined, material), new Mesh(undefined, raw));
    lighting.prepare(root, new Vector3(50, 100, 70));
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <fog_vertex>", fragmentShader: "#include <fog_fragment>" };
    material.onBeforeCompile(shader as Shader, {} as WebGLRenderer); expect(original).toHaveBeenCalledOnce();
    expect(shader.vertexShader).toContain("vSkyFogPoint = mvPosition.xyz");
    expect(shader.fragmentShader).toContain("length(worldPoint.xz - skyFogCenter)");
    expect(shader.uniforms.skyFogCamera.value).toBe(camera.matrixWorld);
    expect(shader.uniforms.skyFogCenter.value).toMatchObject({ x: 50, y: 70 });
    const rawShader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: raw.vertexShader, fragmentShader: raw.fragmentShader };
    raw.onBeforeCompile(rawShader as Shader, {} as WebGLRenderer);
    expect(rawShader.fragmentShader).toContain("return skyFogBlend(color, vSkyFogPoint, fogNear, fogFar)");
    expect(rawShader.uniforms.worldEnvironment.value).toBe(environment.texture);
    raw.dispose();
    expect(raw.onBeforeCompile).toBe(rawCompile); expect(raw.customProgramCacheKey).toBe(rawKey); expect(raw.defines).toBe(rawDefines);
    // A disposed material can be reused; the combined hook must install and release exactly once again.
    lighting.prepare(root, new Vector3());
    const disposeTexture = vi.spyOn(texture, "dispose"); lighting.dispose();
    expect(raw.onBeforeCompile).toBe(rawCompile); expect(raw.customProgramCacheKey).toBe(rawKey); expect(raw.defines).toBe(rawDefines);
    expect(material.onBeforeCompile).toBe(original); expect(material.customProgramCacheKey).toBe(key);
    expect(disposeTexture).not.toHaveBeenCalled();
    environment.dispose(); texture.dispose();
});

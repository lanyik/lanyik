import { expect, test, vi } from "vitest";
import { CubeTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, RawShaderMaterial, Vector3, type WebGLRenderer } from "three";
import { SkyFog } from "../../src/rendering/SkyFog";
import { HORIZON_FOG_FRAGMENT_HEADER } from "../../src/shaders/horizonFog";
type Shader = Parameters<MeshBasicMaterial["onBeforeCompile"]>[0];

test("radial sky fog preserves material hooks, shares camera uniforms and releases disposed materials", () => {
    const camera = new PerspectiveCamera(), texture = new CubeTexture(), sky = new SkyFog(texture, camera);
    const material = new MeshBasicMaterial(), original = vi.fn(); material.onBeforeCompile = original;
    const key = material.customProgramCacheKey;
    const raw = new RawShaderMaterial({ vertexShader: "vHorizonFogDepth = -mvPosition.z;", fragmentShader: HORIZON_FOG_FRAGMENT_HEADER });
    const root = new Group(); root.add(new Mesh(undefined, material), new Mesh(undefined, raw));
    sky.prepare(root, new Vector3(50, 100, 70), .8);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <fog_vertex>", fragmentShader: "#include <fog_fragment>" };
    material.onBeforeCompile(shader as Shader, {} as WebGLRenderer); expect(original).toHaveBeenCalledOnce();
    expect(shader.vertexShader).toContain("vSkyFogPoint = mvPosition.xyz");
    expect(shader.fragmentShader).toContain("length(worldPoint.xz - skyFogCenter)");
    expect(shader.uniforms.skyFogCamera.value).toBe(camera.matrixWorld);
    expect(shader.uniforms.skyFogCenter.value).toMatchObject({ x: 50, y: 70 });
    const rawShader = { uniforms: {}, vertexShader: raw.vertexShader, fragmentShader: raw.fragmentShader };
    raw.onBeforeCompile(rawShader as Shader, {} as WebGLRenderer);
    expect(rawShader.fragmentShader).toContain("return skyFogBlend(color, vSkyFogPoint, fogNear, fogFar)");
    const rawHook = raw.onBeforeCompile; raw.dispose(); expect(raw.onBeforeCompile).not.toBe(rawHook);
    const disposeTexture = vi.spyOn(texture, "dispose"); sky.dispose();
    expect(material.onBeforeCompile).toBe(original); expect(material.customProgramCacheKey).toBe(key);
    expect(disposeTexture).not.toHaveBeenCalled();
});

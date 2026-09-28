import { Color, CubeUVReflectionMapping, GLSL3, LinearFilter, LinearSRGBColorSpace, Mesh, MeshStandardMaterial,
    NoToneMapping, PerspectiveCamera, PlaneGeometry, RawShaderMaterial, Scene, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";
import { WorldLighting } from "../../src/rendering/WorldLighting";
import { TERRAIN_MATERIAL_SAMPLING } from "../../src/shaders/terrainMaterial";

const renderer = new WebGLRenderer({ canvas: document.querySelector("canvas")!, antialias: false });
renderer.setSize(64, 64); renderer.toneMapping = NoToneMapping; renderer.outputColorSpace = LinearSRGBColorSpace;
const environment = new WebGLRenderTarget(768, 1024, { depthBuffer: false, minFilter: LinearFilter });
environment.texture.mapping = CubeUVReflectionMapping;
// A constant white CubeUV atlas isolates BRDF energy from sky features and mip choice.
renderer.setRenderTarget(environment); renderer.setClearColor(0xffffff); renderer.clear();
renderer.setRenderTarget(null); renderer.setClearColor(0);
const scene = new Scene(), camera = new PerspectiveCamera(30, 1, .1, 100);
scene.environment = environment.texture;
const lighting = new WorldLighting(environment, camera);
const geometry = new PlaneGeometry(20, 20);
const raw = new RawShaderMaterial({ glslVersion: GLSL3, defines: { TERRAIN_SURFACE_MAP: 1 },
    uniforms: { probeRoughness: { value: 1 }, lightDir: { value: new Vector3(0, 0, 1) } },
    vertexShader: `precision highp float;
        in vec3 position, normal; uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
        out vec3 vNormal, vViewPosition; out float vSurfaceSlope, vTerrain;
        void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vViewPosition = -p.xyz;
            vNormal = normalize(normalMatrix * normal); vSurfaceSlope = 0.0; vTerrain = 0.0;
            gl_Position = projectionMatrix * p; }`,
    fragmentShader: `precision highp float;
        in vec3 vNormal; in float vTerrain;
        uniform highp sampler2DArray map; uniform vec3 lightDir; uniform float probeRoughness;
        vec2 terrainGradientX = vec2(0.0), terrainGradientY = vec2(0.0);
        out vec4 result;
        ${TERRAIN_MATERIAL_SAMPLING}
        void main() { result = vec4(lightTerrainSurface(vec3(.08), vec4(0.0, 0.0, probeRoughness, 1.0)), 1.0); }`
});
const standard = new MeshStandardMaterial({ color: new Color(.08, .08, .08), metalness: 0, roughness: 1, fog: false });
const mesh = new Mesh<PlaneGeometry, RawShaderMaterial | MeshStandardMaterial>(geometry, raw); scene.add(mesh);
lighting.prepare(scene);
camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); renderer.compile(scene, camera);
raw.uniforms.worldSunColor.value.setRGB(0, 0, 0);
const read = () => {
    renderer.render(scene, camera);
    const bytes = new Uint8Array(4), gl = renderer.getContext();
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return bytes[0];
};
const samples: { roughness: number; cosine: number; terrain: number; standard: number }[] = [];
try {
    for (const roughness of [.35, .65, 1]) for (const cosine of [1, .5, .1]) {
        camera.position.set(3 * Math.sqrt(1 - cosine ** 2), 0, 3 * cosine); camera.lookAt(0, 0, 0);
        raw.uniforms.probeRoughness.value = roughness; standard.roughness = roughness;
        mesh.material = raw; const terrain = read();
        mesh.material = standard; const reference = read();
        samples.push({ roughness, cosine, terrain, standard: reference });
    }
} finally {
    lighting.dispose(); raw.dispose(); standard.dispose(); geometry.dispose(); environment.dispose(); renderer.dispose();
}
declare global { interface Window { terrainReflectionSamples: typeof samples } }
window.terrainReflectionSamples = samples;

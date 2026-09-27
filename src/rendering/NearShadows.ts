import { DepthTexture, DirectionalLight, LessEqualCompare, LinearFilter, MeshStandardMaterial, PCFShadowMap,
    RawShaderMaterial, ShaderChunk, UnsignedIntType, Vector2, Vector3, WebGLRenderTarget,
    type Material, type PerspectiveCamera, type WebGLRenderer } from "three";
import type { ResourceBudgetAccount } from "../runtime/ResourceBudget";
import { createSunDirection } from "./SunLight";

// The same stable, hardware-filtered kernel and border fade shade raw and Standard surfaces.
const FILTER = `
float getShadow(sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity,
    float shadowBias, float shadowRadius, vec4 shadowCoord) {
    vec3 p = shadowCoord.xyz / shadowCoord.w;
    float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
    if (edge <= 0.0 || p.z <= 0.0 || p.z >= 1.0) return 1.0;
    p.z += shadowBias;
    vec2 d = vec2(shadowRadius * .5) / shadowMapSize;
    float shade = (texture(shadowMap, p + vec3(-d.x, -d.y, 0.0))
        + texture(shadowMap, p + vec3(d.x, -d.y, 0.0))
        + texture(shadowMap, p + vec3(-d.x, d.y, 0.0))
        + texture(shadowMap, p + vec3(d.x, d.y, 0.0))) * .25;
    return mix(1.0, shade, shadowIntensity * smoothstep(0.0, .08, edge));
}
`;
const STANDARD_SHADOWS = ShaderChunk.shadowmap_pars_fragment.replace(
    /float getShadow\( sampler2DShadow[\s\S]*?(?=\n\s*#elif defined\( SHADOWMAP_TYPE_VSM \))/, FILTER);

/** One fixed allocation, following a logical-world texel grid across origin rebases. */
export class NearShadows {
    public readonly target: WebGLRenderTarget;
    private readonly direction = createSunDirection();
    private readonly right = new Vector3().crossVectors(new Vector3(0, 1, 0), this.direction).normalize();
    private readonly up = new Vector3().crossVectors(this.direction, this.right);
    private readonly center = new Vector3();
    private readonly uniforms;
    private readonly texel: number;

    constructor(public readonly light: DirectionalLight, radius: number, camera: PerspectiveCamera,
        renderer: WebGLRenderer, private readonly resources: ResourceBudgetAccount) {
        if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("Shadow radius must be positive and finite");
        const size = 2048;
        if (renderer.capabilities.maxTextureSize < size) throw new Error("Near shadows require 2048 texture support");
        this.texel = radius * 2 / size;
        this.target = new WebGLRenderTarget(size, size, { depthTexture: new DepthTexture(size, size, UnsignedIntType) });
        this.target.texture.name = "near-sun-shadow-color";
        const depth = this.target.depthTexture!;
        depth.name = "near-sun-shadow-depth";
        depth.compareFunction = LessEqualCompare;
        depth.minFilter = depth.magFilter = LinearFilter;
        resources.acquireRequired("near-shadows", { gpuBytes: size * size * 8, textureBytes: size * size * 8 }, true);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = PCFShadowMap;
        light.castShadow = true;
        const shadow = light.shadow;
        shadow.map = this.target;
        shadow.mapSize.set(size, size);
        shadow.bias = -.00005;
        shadow.normalBias = .55;
        shadow.radius = 1.5;
        Object.assign(shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: Math.min(1, radius), far: radius * 8 });
        shadow.camera.updateProjectionMatrix();
        this.uniforms = { worldShadowMap: { value: depth }, worldShadowMatrix: { value: shadow.matrix },
            worldShadowCamera: { value: camera.matrixWorld }, worldShadowSize: { value: shadow.mapSize },
            worldShadowBias: { value: shadow.bias }, worldShadowNormalBias: { value: shadow.normalBias },
            worldShadowRadius: { value: shadow.radius } };
    }

    public prepare(focus: Vector3, origin: Vector2): void {
        this.center.set(focus.x + origin.x, focus.y, focus.z + origin.y);
        const x = this.center.dot(this.right), y = this.center.dot(this.up);
        this.center.copy(focus).addScaledVector(this.right, Math.round(x / this.texel) * this.texel - x)
            .addScaledVector(this.up, Math.round(y / this.texel) * this.texel - y);
        this.light.target.position.copy(this.center);
        this.light.position.copy(this.center).addScaledVector(this.direction, this.light.shadow.camera.far / 2);
        this.light.updateMatrixWorld(); this.light.target.updateMatrixWorld();
        this.light.shadow.updateMatrices(this.light);
    }

    public accepts(material: Material): boolean { return material instanceof MeshStandardMaterial; }
    public apply(shader: Parameters<Material["onBeforeCompile"]>[0], material: Material): void {
        if (!(material instanceof RawShaderMaterial)) {
            shader.fragmentShader = shader.fragmentShader.replace("#include <shadowmap_pars_fragment>", STANDARD_SHADOWS);
            return;
        }
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = "out highp vec3 vWorldShadowPoint;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("vHorizonFogDepth = -mvPosition.z;", "vHorizonFogDepth = -mvPosition.z; vWorldShadowPoint = mvPosition.xyz;");
        shader.fragmentShader = `precision highp float; precision highp sampler2DShadow;
            in highp vec3 vWorldShadowPoint;
            uniform sampler2DShadow worldShadowMap;
            uniform mat4 worldShadowMatrix, worldShadowCamera;
            uniform vec2 worldShadowSize;
            uniform float worldShadowBias, worldShadowNormalBias, worldShadowRadius;
            ${FILTER}
            float worldShadow(vec3 viewNormal) {
                vec3 point = (worldShadowCamera * vec4(vWorldShadowPoint, 1.0)).xyz;
                point += normalize(mat3(worldShadowCamera) * viewNormal) * worldShadowNormalBias;
                return getShadow(worldShadowMap, worldShadowSize, 1.0, worldShadowBias, worldShadowRadius,
                    worldShadowMatrix * vec4(point, 1.0));
            }
            ${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace("void main() {", "void main() {\nworldDirectVisibility = worldShadow(normalize(vNormal));");
    }

    public handleContextLost(): void { this.target.dispose(); }
    public dispose(): void {
        this.target.dispose(); this.light.shadow.map = null; this.light.castShadow = false;
        this.resources.release("near-shadows");
    }
}

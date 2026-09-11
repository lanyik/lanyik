import { Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Object3D, RingGeometry, ShaderMaterial, Vector2 } from "three";
import { GAME_CONFIG } from "../core/GameConfig";

const POLICY = GAME_CONFIG.presentation;
/** Three depth-tested fog sheets add world-space wisps; the inner combat area stays clear. */
export class BoundaryMist {
    private readonly geometry = new RingGeometry(POLICY.mistInnerRadius, POLICY.mistOuterRadius, 64, 2).rotateX(-Math.PI / 2);
    private readonly material = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide,
        uniforms: { center: { value: new Vector2() }, time: { value: 0 }, tint: { value: new Color("#a3bdc4") } },
        vertexShader: `varying vec3 vGround;
            void main() { vec4 p = instanceMatrix * vec4(position, 1.); vGround = p.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * p; }`,
        fragmentShader: `uniform vec2 center; uniform float time; uniform vec3 tint; varying vec3 vGround;
            float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
            float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
                return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
            void main() {
                float distance = length(vGround.xz - center);
                float boundary = smoothstep(${POLICY.mistInnerRadius.toFixed(1)}, ${POLICY.mistDenseRadius.toFixed(1)}, distance)
                    * (1. - smoothstep(${POLICY.mistFadeRadius.toFixed(1)}, ${POLICY.mistOuterRadius.toFixed(1)}, distance));
                vec2 p = vGround.xz * .23 + vec2(time * .035, time * -.022) + vGround.y * .4;
                float billow = noise(p) * .57 + noise(p * 2.07 + 8.) * .29 + noise(p * 4.13) * .14;
                float strands = smoothstep(.26, .73, billow);
                gl_FragColor = vec4(tint * (.85 + strands * .3), boundary * (.23 + strands * .48));
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`
    });
    public readonly mesh = new InstancedMesh(this.geometry, this.material, 3);
    private readonly dummy = new Object3D();
    constructor() {
        this.mesh.name = "boundary-mist"; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    public update(x: number, y: number, z: number, seconds: number): void {
        this.material.uniforms.center.value.set(x, z); this.material.uniforms.time.value = seconds;
        for (let i = 0; i < 3; i++) {
            this.dummy.position.set(x, y + 1.2 + i * 1.1, z); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
    public dispose(): void { this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); }
}

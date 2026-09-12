import { AdditiveBlending, AddEquation, CustomBlending, OneFactor, SrcAlphaFactor, ZeroFactor, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial } from "three";
import { GAME_CONFIG, MAX_GROUND_EQUIPMENT } from "../core/GameConfig";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";
import { RARITIES } from "../core/Loot";
import { ACTOR_FADE_END, ACTOR_FADE_START } from "./ActorVisibility";

const CAPACITY = MAX_GROUND_EQUIPMENT + MAX_COMBAT_CHUNKS;
const COLORS = RARITIES.map(rarity => new Color(GAME_CONFIG.quality[rarity].color));
const vertexShader = `attribute vec2 lootStyle; varying vec2 vUv; varying vec2 vStyle; varying vec3 vTint; varying float vDistance;
    void main() {
        vUv = uv; vStyle = lootStyle; vTint = instanceColor;
        vec4 p = instanceMatrix * vec4(position, 1.); vDistance = length(p.xz);
        gl_Position = projectionMatrix * modelViewMatrix * p;
    }`;
const fragmentShader = `uniform float time; varying vec2 vUv; varying vec2 vStyle; varying vec3 vTint; varying float vDistance;
    vec3 spectrum(float h) { return .55 + .45 * cos(6.283185 * (h + vec3(0., .3333, .6667))); }
    void main() {
        float quality = vStyle.x, phase = time * (.35 + quality * .12) + vStyle.y;
        vec2 q = vUv * 2. - 1.; float radius = length(q), angle = atan(q.y, q.x), mask = 0.;
        #ifdef HALO
            mask = exp(-pow((radius - .62) * 36., 2.)) * (.16 + quality * .065);
            mask += exp(-radius * radius * 8.) * (.08 + quality * .025);
            if (quality >= 1.) mask *= .8 + .2 * sin(phase * 2.);
            if (quality >= 2.) mask += exp(-pow((radius - .78) * 50., 2.)) * pow(.5 + .5 * cos(angle * 3. - phase * 3.), 5.) * .5;
            if (quality >= 3.) mask += exp(-pow((radius - .86) * 50., 2.)) * pow(.5 + .5 * cos(angle * (quality + 1.) + phase * 2.), 24.) * .9;
            if (quality >= 4.) mask += exp(-pow((radius - .43) * 45., 2.)) * (.2 + .3 * pow(.5 + .5 * cos(angle * 6. + phase), 10.));
            if (quality >= 5.) mask += exp(-pow((radius - (.56 + .15 * sin(angle * 3. + phase))) * 50., 2.)) * .5;
        #else
            float top = pow(1. - vUv.y, 1.5), flow = .6 + .4 * pow(.5 + .5 * sin(vUv.y * 28. - phase * 7.), 6.);
            mask = exp(-q.x * q.x * 45.) * top * flow * (.22 + quality * .05);
            if (quality >= 3.) {
                float rise = fract(vUv.y * 3. - phase * .3);
                float trail = q.x - sin(vUv.y * 10. + phase * 2.) * .5;
                mask += exp(-trail * trail * 600.) * pow(max(0., 1. - abs(rise - .5) * 14.), 3.) * top;
            }
            if (quality >= 5.) mask += exp(-pow((q.x + sin(vUv.y * 12. + phase * 2.) * .6) * 26., 2.)) * top * .6;
        #endif
        vec3 tint = quality >= 5. ? spectrum(angle / 6.283185 + vUv.y * .7 - time * .18) : vTint;
        float fade = 1. - smoothstep(${ACTOR_FADE_START.toFixed(1)}, ${ACTOR_FADE_END.toFixed(1)}, vDistance);
        gl_FragColor = vec4(tint, min(.85, mask) * fade);
        #include <colorspace_fragment>
    }`;

/** Two bounded batches. All flow, orbiting points and rainbow ribbons animate in the shader. */
export class LootEffects {
    public readonly halo: InstancedMesh;
    public readonly beam: InstancedMesh;
    private readonly dummy = new Object3D();
    private readonly time = { value: 0 };

    constructor() {
        const make = (halo: boolean) => {
            const geometry = new PlaneGeometry(1, 1);
            geometry.setAttribute("lootStyle", new InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2).setUsage(DynamicDrawUsage));
            const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms: { time: this.time }, defines: halo ? { HALO: 1 } : {},
                transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
            if (halo) {
                material.blending = CustomBlending; material.blendEquation = material.blendEquationAlpha = AddEquation;
                material.blendSrc = SrcAlphaFactor; material.blendDst = OneFactor;
                material.blendSrcAlpha = ZeroFactor; material.blendDstAlpha = OneFactor; material.depthTest = false;
            }
            const mesh = new InstancedMesh(geometry, material, CAPACITY); mesh.count = 0; mesh.frustumCulled = false;
            mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.setColorAt(0, COLORS[0]); mesh.instanceColor!.setUsage(DynamicDrawUsage);
            return mesh;
        };
        this.halo = make(true); this.beam = make(false);
        this.halo.renderOrder = 1;
    }

    public begin(time: number): void { this.time.value = time; this.reset(); }
    public add(x: number, y: number, z: number, quality: number, seed: number, chest = false): void {
        const span = (chest ? 1.45 : .95) + quality * .13;
        this.stamp(this.halo, x, y, z, quality, seed, span, true);
        if (quality >= 2) this.stamp(this.beam, x, y, z, quality, seed, span, false);
    }
    private stamp(mesh: InstancedMesh, x: number, y: number, z: number, quality: number, seed: number, span: number, ground: boolean): void {
        const index = mesh.count;
        if (index >= CAPACITY) throw new Error("Loot effect capacity exceeded");
        mesh.count++;
        const height = .65 + quality * .3;
        this.dummy.position.set(x, ground ? 0 : y + height / 2, z);
        this.dummy.rotation.set(ground ? -Math.PI / 2 : 0, ground ? 0 : -Math.PI / 4, 0);
        this.dummy.scale.set(span, ground ? span : height, 1); this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix); mesh.setColorAt(index, COLORS[quality]);
        mesh.geometry.getAttribute("lootStyle").setXY(index, quality, seed % 100);
    }
    public upload(): void {
        for (const mesh of [this.halo, this.beam]) for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!, mesh.geometry.getAttribute("lootStyle") as InstancedBufferAttribute]) {
            attribute.clearUpdateRanges();
            if (mesh.count) { attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true; }
        }
    }
    public reset(): void { this.halo.count = this.beam.count = 0; }
    public dispose(): void {
        for (const mesh of [this.halo, this.beam]) { mesh.removeFromParent(); mesh.dispose(); mesh.geometry.dispose(); (mesh.material as ShaderMaterial).dispose(); }
    }
}

import { AdditiveBlending, AddEquation, CustomBlending, OneFactor, SrcAlphaFactor, ZeroFactor, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial } from "three";
import { GAME_CONFIG, MAX_GROUND_EQUIPMENT } from "../core/GameConfig";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";
import { RARITIES } from "../core/Loot";
import { ACTOR_FADE_END, ACTOR_FADE_START } from "./ActorVisibility";

const CAPACITY = MAX_GROUND_EQUIPMENT + MAX_COMBAT_CHUNKS;
const COLORS = RARITIES.map(rarity => new Color(GAME_CONFIG.quality[rarity].color));
const vertexShader = `attribute vec2 lootStyle; varying vec2 vUv; flat varying vec2 vStyle; flat varying vec3 vTint; flat varying float vDistance;
    void main() {
        vUv = uv; vStyle = lootStyle; vTint = instanceColor;
        vec4 p = instanceMatrix * vec4(position, 1.);
        #ifndef HALO
            // Cylindrical billboard: world-up stays vertical while the camera can orbit freely.
            vec3 right = normalize(vec3(viewMatrix[0][0], 0., viewMatrix[2][0]));
            p = vec4(instanceMatrix[3].xyz + right * position.x * length(instanceMatrix[0].xyz)
                + vec3(0., position.y * length(instanceMatrix[1].xyz), 0.), 1.);
        #endif
        vDistance = length(instanceMatrix[3].xz);
        gl_Position = projectionMatrix * modelViewMatrix * p;
    }`;
const fragmentShader = `uniform float time; varying vec2 vUv; flat varying vec2 vStyle; flat varying vec3 vTint; flat varying float vDistance;
    vec3 spectrum(float h) { return .55 + .45 * cos(6.283185 * (h + vec3(0., .3333, .6667))); }
    float stroke(float distance, float width, float pixel) {
        // Keep a two-texel core in the ground target, with one texel of edge antialiasing.
        float halfWidth = max(width, pixel);
        return 1. - smoothstep(halfWidth - pixel * .5, halfWidth + pixel * .5, abs(distance));
    }
    void main() {
        float quality = vStyle.x, phase = time * (.35 + quality * .12) + vStyle.y;
        vec2 q = vUv * 2. - 1.; float radius = length(q), angle = atan(q.y, q.x), mask = 0.;
        #ifdef HALO
            float pixel = length(vec2(dFdx(radius), dFdy(radius)));
            mask = stroke(radius - .60, .035, pixel) * (.48 + quality * .045);
            float glow = (radius - .60) * 9.;
            mask += exp(-glow * glow) * .13;
            mask += exp(-radius * radius * 6.) * (.06 + quality * .012);
            if (quality >= 1.) mask *= .9 + .1 * sin(phase * 2.);
            if (quality >= 2.) mask += stroke(radius - .82, .018, pixel) * pow(.5 + .5 * cos(angle * 3. - phase * 3.), 5.) * .55;
            if (quality >= 3.) mask += stroke(radius - .82, .025, pixel) * pow(.5 + .5 * cos(angle * (quality + 1.) + phase * 2.), 24.) * .9;
            if (quality >= 4.) mask += stroke(radius - .35, .018, pixel) * (.25 + .3 * pow(.5 + .5 * cos(angle * 6. + phase), 10.));
            if (quality >= 5.) mask += stroke(radius - (.55 + .14 * sin(angle * 3. + phase)), .018, pixel) * .5;
            mask *= 1. - smoothstep(.94, 1., radius);
        #else
            // MSAA can shade a covered edge sample with its pixel center outside the quad.
            float top = pow(max(0., 1. - vUv.y), 1.3), flow = .8 + .2 * pow(.5 + .5 * sin(vUv.y * 28. - phase * 7.), 6.);
            mask = (exp(-q.x * q.x * 240.) * .65 + exp(-q.x * q.x * 24.) * .24) * top * flow;
            if (quality >= 3.) {
                float rise = fract(vUv.y * 3. - phase * .3);
                float trail = q.x - sin(vUv.y * 10. + phase * 2.) * .5;
                mask += exp(-trail * trail * 600.) * pow(max(0., 1. - abs(rise - .5) * 14.), 3.) * top;
            }
            if (quality >= 5.) {
                // GLSL pow(negative, 2.) is undefined; signed distances must be squared by multiplication.
                float ribbon = (q.x + sin(vUv.y * 12. + phase * 2.) * .6) * 26.;
                mask += exp(-ribbon * ribbon) * top * .6;
            }
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
        this.dummy.rotation.set(ground ? -Math.PI / 2 : 0, 0, 0);
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

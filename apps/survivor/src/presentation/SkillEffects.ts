import { AdditiveBlending, AddEquation, CustomBlending, OneFactor, SrcAlphaFactor, ZeroFactor, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, ShaderMaterial, SphereGeometry } from "three";
import { EffectKind, type EffectBuffer, type FireShotBuffer } from "../core/CombatEffects";
import { GAME_CONFIG } from "../core/GameConfig";
import { AssetLoader } from "./AssetLoader";

const COLORS = ["#bd93ff", "#7bdeff", "#ffe29a", "#80f1ce", "#8dafef", "#ff9954", "#ffb45e", "#c17bff", "#7fffd6", "#d9f5ff"].map(color => new Color(color));
const WHITE = new Color("#f4fcff"), TAU = Math.PI * 2;
const FIRE = new Color("#ff792b"), HOT_FIRE = new Color("#ffce6b");
const THUNDER = new Color("#91cbff"), HIGH_VOLTAGE = new Color("#cab5ff");
const STAR = new Color("#cfb2ff"), STAR_GOLD = new Color("#ffe4a6"), STAR_GUARD = new Color("#a4eeec");
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Visual choreography expands authoritative facts into bounded GPU instances, never gameplay. */
export class SkillEffects {
    public readonly mesh: InstancedMesh;
    public readonly ground: InstancedMesh;
    private readonly groundMaterial: MeshBasicMaterial;
    public readonly ward: Mesh;
    private readonly geometry = new PlaneGeometry(1, 1);
    private readonly material = new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    private readonly dummy = new Object3D();
    private originX = 0;
    private originZ = 0;
    private readonly time = { value: 0 };
    private readonly styles = new InstancedBufferAttribute(new Float32Array(GAME_CONFIG.presentation.effectInstances * 4), 4).setUsage(DynamicDrawUsage);
    private readonly wardGeometry = new SphereGeometry(1, 24, 16);
    private readonly wardMaterial = new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
        uniforms: { time: { value: 0 }, tint: { value: COLORS[4] } },
        vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec2 vUv;
            void main() { vUv = uv; vec4 p = modelViewMatrix * vec4(position, 1.); vView = -p.xyz;
                vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * p; }`,
        fragmentShader: `uniform float time; uniform vec3 tint;
            varying vec3 vNormal; varying vec3 vView; varying vec2 vUv;
            void main() {
                float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
                float lattice = pow(abs(sin(vUv.x * 37.699 + time * .35) * sin(vUv.y * 25.133 - time * .3)), 24.);
                float alpha = .045 + rim * .6 + lattice * .24;
                gl_FragColor = vec4(tint * (1.2 + rim), alpha);
                #include <colorspace_fragment>
            }`
    });

    private constructor() {
        this.geometry.setAttribute("effectStyle", this.styles);
        this.material.onBeforeCompile = shader => {
            shader.uniforms.effectTime = this.time;
            shader.vertexShader = "attribute vec4 effectStyle; varying vec4 vEffectStyle; varying vec2 vShapeUv;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvShapeUv = uv * 2. - 1.; vEffectStyle = effectStyle; vMapUv = (vMapUv + vec2(mod(effectStyle.x, 3.), 1. - floor(effectStyle.x / 3.))) / vec2(3., 2.);");
            shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
                #ifdef GROUND_PASS
                    if (effectStyle.w < 8.) gl_Position = vec4(2., 2., 2., 1.);
                #else
                    if (effectStyle.w >= 8.) gl_Position = vec4(2., 2., 2., 1.);
                #endif`);
            shader.fragmentShader = "uniform float effectTime; varying vec4 vEffectStyle; varying vec2 vShapeUv;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
                float shape = mod(vEffectStyle.w, 8.);
                vec2 q = vShapeUv;
                float radius = length(q);
                float mask = 0.;
                if (shape < .5) { mask = texture2D(map, vMapUv).a; }
                else if (shape < 1.5) { mask = exp(-pow((radius - .82) * 28., 2.)); }
                else if (shape < 2.5) { mask = pow(max(0., 1. - radius), 2.8); }
                else if (shape < 3.5) { mask = exp(-q.x * q.x * 12.) * (1. - smoothstep(.8, 1., abs(q.y))); }
                else if (shape < 4.5) {
                    float diamond = abs(q.x) + abs(q.y);
                    mask = (1. - smoothstep(.92, 1., diamond)) * (.35 + .65 * step(q.x, 0.));
                } else if (shape < 5.5) {
                    float angle = atan(q.y, q.x);
                    float ring = exp(-pow((radius - .85) * 80., 2.)) + exp(-pow((radius - .65) * 80., 2.));
                    float marks = step(.8, cos(angle * 24.)) * smoothstep(.67, .7, radius) * (1. - smoothstep(.79, .82, radius));
                    mask = ring + marks;
                } else {
                    float h = (q.y + 1.) * .5;
                    float sway = sin(h * 10. - effectTime * 8. + vEffectStyle.y) * .16 * h + sin(h * 19. - effectTime * 12.) * .05;
                    float width = .9 * pow(max(0., 1. - h), .7);
                    mask = (1. - smoothstep(width * .3, width, abs(q.x - sway))) * smoothstep(0., .08, h) * (1. - smoothstep(.82, 1., h));
                    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1., .9, .45), pow(mask * (1. - h), 2.));
                }
                diffuseColor.a *= mask * vEffectStyle.z;
            `);
        };
        this.material.customProgramCacheKey = () => "survivor-skill-choreography-v6";
        this.mesh = new InstancedMesh(this.geometry, this.material, GAME_CONFIG.presentation.effectInstances);
        this.mesh.name = "skill-effects"; this.mesh.renderOrder = 3;
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); this.mesh.setColorAt(0, COLORS[0]);
        this.mesh.instanceColor!.setUsage(DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false;
        this.groundMaterial = this.material.clone();
        this.groundMaterial.onBeforeCompile = this.material.onBeforeCompile;
        this.groundMaterial.customProgramCacheKey = this.material.customProgramCacheKey;
        this.groundMaterial.defines = { GROUND_PASS: 1 };
        this.groundMaterial.blending = CustomBlending;
        this.groundMaterial.blendEquation = this.groundMaterial.blendEquationAlpha = AddEquation;
        this.groundMaterial.blendSrc = SrcAlphaFactor; this.groundMaterial.blendDst = OneFactor;
        this.groundMaterial.blendSrcAlpha = ZeroFactor; this.groundMaterial.blendDstAlpha = OneFactor;
        this.groundMaterial.depthTest = false;
        this.ground = new InstancedMesh(this.geometry, this.groundMaterial, GAME_CONFIG.presentation.effectInstances);
        this.ground.name = "ground-skill-effects"; this.ground.renderOrder = 3;
        this.ground.instanceMatrix = this.mesh.instanceMatrix; this.ground.instanceColor = this.mesh.instanceColor;
        this.ground.count = 0; this.ground.frustumCulled = false;
        this.ward = new Mesh(this.wardGeometry, this.wardMaterial);
        this.ward.name = "player-ward"; this.ward.renderOrder = 2; this.ward.visible = false;
    }
    public static async load(signal: AbortSignal): Promise<SkillEffects> {
        const effects = new SkillEffects();
        const loader = new AssetLoader(signal);
        try {
            effects.material.map = await loader.texture(`${import.meta.env.BASE_URL}effects/skills.png`, true);
            effects.groundMaterial.map = effects.material.map;
            effects.material.needsUpdate = effects.groundMaterial.needsUpdate = true;
            return effects;
        } catch (error) { effects.dispose(); throw new Error("Skill effect atlas load failed: effects/skills.png", { cause: error }); }
        finally { loader.dispose(); }
    }

    public update(b: EffectBuffer, seconds: number, height: (x: number, z: number) => number, playerX: number, playerZ: number, ward: number, shots: FireShotBuffer, alpha: number): void {
        this.mesh.count = 0;
        this.time.value = seconds;
        this.originX = playerX; this.originZ = playerZ;
        const tick = seconds * GAME_CONFIG.timing.simulationHz;
        for (let i = 0; i < b.count; i++) {
            const kind = b.kind[i], t = clamp((tick - b.started[i]) / (b.endsAt[i] - b.started[i]));
            if (kind >= EffectKind.Heal && kind < EffectKind.IceBolt || t >= 1 || tick < b.started[i]) continue;
            const x = kind === EffectKind.Blades ? playerX : b.x[i], z = kind === EffectKind.Blades ? playerZ : b.z[i];
            const y = height(x, z) + .13, r = b.radius[i];
            const fade = (1 - t) ** .7, burst = 1 - (1 - t) ** 3;
            const seed = b.started[i] * .17 + x * 2.3 + z * 1.7;
            if (kind === EffectKind.StarBolt) {
                const ex = b.endX[i], ez = b.endZ[i], ey = height(ex, ez) + .7;
                this.beam(x, y + .6, z, ex, ey, ez, .14, kind, fade * .8);
                this.stamp(ex, ey, ez, .8 * fade, .8 * fade, t * 3, kind, fade, 4, 0, true);
                this.stamp(ex, ey, ez, .2, .2, 0, -1, fade, 2, 0, true);
                for (let j = 0; j < 6; j++) {
                    const at = (j + 1) / 7, px = x + (ex - x) * at, pz = z + (ez - z) * at;
                    this.stamp(px, y + .6 + (ey - y - .6) * at + Math.sin(at * TAU + t * 6) * .15, pz, .15, .25, j + t, kind, fade, 4, 0, true);
                }
            } else if (kind >= EffectKind.Infusion && kind <= EffectKind.Bastion) {
                const ultimate = kind === EffectKind.Bastion || kind === EffectKind.Resonance;
                const purify = kind === EffectKind.Cleanse, size = r * (purify ? burst : .5 + burst * .5);
                this.stamp(x, y, z, size * 2.42, size * 2.42, seconds * .4, kind, fade, 5, 0, false, true);
                this.stamp(x, y, z, r * 2.42 * burst, r * 2.42 * burst, -t, kind, fade * .8, 1, 0, false, true);
                for (let j = 0; j < (ultimate ? 12 : 6); j++) {
                    const angle = j * TAU / (ultimate ? 12 : 6) + t * (purify ? -.5 : 1.5), orbit = size * .85;
                    const px = x + Math.sin(angle) * orbit, pz = z + Math.cos(angle) * orbit;
                    const lift = purify ? .3 + burst * 2.5 : .4 + Math.sin(t * Math.PI) * (ultimate ? 2 : 1);
                    this.stamp(px, y + lift, pz, .18 + (ultimate ? .1 : 0), .45, -angle, kind, fade, 4, 0, true);
                    if (kind === EffectKind.Bastion) this.beam(px, y, pz, px, y + 2.7 * burst, pz, .15, kind, fade);
                    if (kind === EffectKind.Resonance || kind === EffectKind.Infusion) this.beam(px, y + lift, pz, x, y + 1, z, .045, kind, fade * .6);
                }
                this.stamp(x, y + .9, z, ultimate ? 1.5 : .8, ultimate ? 1.5 : .8, -t * 2, -1, fade * .6, 4, 0, true);
            } else if (kind === EffectKind.ThunderWarning || kind === EffectKind.JudgmentWarning) {
                this.stamp(x, y, z, r * 2.42, r * 2.42, -t, kind, .35 + t * .45, 5, 0, false, true);
                this.stamp(x, y, z, r * 2.42 * (1 - t), r * 2.42 * (1 - t), t, -1, .7, 1, 0, false, true);
                for (let j = 0; j < 6; j++) {
                    const angle = j * TAU / 6 + seed, px = x + Math.sin(angle) * r, pz = z + Math.cos(angle) * r;
                    this.beam(px, height(px, pz) + .1, pz, px, height(px, pz) + .4 + t * 1.5, pz, .1, kind, t * .6);
                }
            } else if (kind === EffectKind.ThunderImpact || kind === EffectKind.JudgmentImpact) {
                const ultimate = kind === EffectKind.JudgmentImpact, power = ultimate ? 1.8 : 1, column = Math.max(0, 1 - t * 2.2);
                this.beam(x, y, z, x, y + 9 * power, z, power * .9, kind, column);
                this.beam(x, y, z, x, y + 10 * power, z, power * .18, -1, column);
                this.stamp(x, y, z, r * 2.42 * burst, r * 2.42 * burst, t, kind, fade, 1, 0, false, true);
                this.stamp(x, y, z, r * 2.1, r * 2.1, -t, kind, fade * .65, 5, 0, false, true);
                this.stamp(x, y + .6, z, power * 3, power * 3, 0, -1, column, 2, 0, true);
                for (let j = 0; j < (ultimate ? 16 : 10); j++) {
                    const angle = seed + j * 2.4, radius = r * (.4 + j % 4 * .15), px = x + Math.sin(angle) * radius, pz = z + Math.cos(angle) * radius;
                    const midX = x + Math.sin(angle) * radius * .4, midZ = z + Math.cos(angle) * radius * .4;
                    this.beam(x, y + (2 + j % 3) * power, z, midX, y + 1, midZ, .13 * power, kind, column);
                    this.beam(midX, y + 1, midZ, px, height(px, pz) + .15, pz, .09 * power, kind, column);
                    this.stamp(px, height(px, pz) + .2 + burst * 1.3, pz, .13, .35, angle, -1, fade, 4, 0, true);
                }
            } else if (kind === EffectKind.ThunderField) {
                const opacity = Math.min(1, t * 12, (1 - t) * 12), phase = ((tick - b.started[i]) % (GAME_CONFIG.timing.simulationHz * .5)) / (GAME_CONFIG.timing.simulationHz * .5);
                this.stamp(x, y, z, r * 2.42, r * 2.42, seconds * .2, kind, opacity * .7, 5, 0, false, true);
                this.stamp(x, y, z, r * 2.42 * phase, r * 2.42 * phase, 0, kind, opacity * (1 - phase), 1, 0, false, true);
                for (let j = 0; j < 12; j++) {
                    const angle = j * TAU / 12, next = angle + TAU / 12, px = x + Math.sin(angle) * r, pz = z + Math.cos(angle) * r;
                    const ex = x + Math.sin(next) * r, ez = z + Math.cos(next) * r;
                    this.beam(px, height(px, pz) + .25, pz, ex, height(ex, ez) + .35 + Math.sin(seconds * 10 + j) * .2, ez, .11, kind, opacity * .7);
                    if (j % 3 === 0) this.beam(px, height(px, pz) + .1, pz, px, height(px, pz) + 1.6, pz, .12, kind, opacity * (.6 + .4 * Math.sin(seconds * 12 + j)));
                }
            } else if (kind === EffectKind.ThunderLance) {
                const ex = b.endX[i], ez = b.endZ[i], dx = ex - x, dz = ez - z, angle = Math.atan2(dx, dz);
                this.beam(x, y + .57, z, ex, y + .57, ez, r * 3, kind, fade * .8);
                this.beam(x, y + .57, z, ex, y + .57, ez, r * .5, -1, fade);
                for (let j = 0; j < 10; j++) {
                    const at = j / 10, px = x + dx * at, pz = z + dz * at, offset = Math.sin(seed + j * 7 + Math.floor(t * 8)) * r * 2;
                    this.beam(px, y + .57, pz, px + Math.cos(angle) * offset, y + .57 + r, pz - Math.sin(angle) * offset, .1, kind, fade);
                }
            } else if (kind === EffectKind.FireRay) {
                const ex = b.endX[i], ez = b.endZ[i], ey = y + .57;
                const opacity = Math.min(1, t * 15, (1 - t) * 15), shimmer = .8 + .2 * Math.sin(seconds * 35);
                this.beam(x, y + .57, z, ex, ey, ez, r * 3.5, kind, opacity * .75);
                this.beam(x, y + .58, z, ex, ey, ez, r * .65, -1, opacity * shimmer);
                for (let j = 0; j < 14; j++) {
                    const at = (seconds * 2 + j / 14) % 1, px = x + (ex - x) * at, pz = z + (ez - z) * at;
                    this.stamp(px, y + .57 + (ey - y - .57) * at, pz, r * 2, .8, seed + j, kind, opacity * .8, 6, 0, true);
                }
                this.stamp(x, y, z, 1.3, 1.3, seconds, kind, opacity, 5, 0, false, true);
            } else if (kind === EffectKind.FireWall || kind === EffectKind.FireDomain) {
                const opacity = Math.min(1, t * 15, (1 - t) * 12), wall = kind === EffectKind.FireWall;
                const heading = Math.atan2(b.endX[i] - x, b.endZ[i] - z), dx = Math.cos(heading), dz = -Math.sin(heading);
                if (wall) this.beam(x - dx * r, y, z - dz * r, x + dx * r, y, z + dz * r, 1.3, kind, opacity * .5, true);
                else {
                    this.stamp(x, y, z, r * 2.42, r * 2.42, seconds * .1, kind, opacity * .65, 5, 0, false, true);
                    this.stamp(x, y, z, r * 2, r * 2, -seconds * .2, kind, opacity * .28, 2, 0, false, true);
                }
                const count = wall ? 16 : 32;
                for (let j = 0; j < count; j++) {
                    const angle = j * 2.4 + seconds * .22, spread = r * Math.sqrt((j + .5) / count);
                    const px = wall ? x + dx * r * ((j + .5) / count * 2 - 1) : x + Math.sin(angle) * spread;
                    const pz = wall ? z + dz * r * ((j + .5) / count * 2 - 1) : z + Math.cos(angle) * spread;
                    const ground = height(px, pz), flameHeight = (wall ? 1.7 : 1.3) * (.8 + .2 * Math.sin(seconds * 9 + j * 1.7));
                    this.stamp(px, ground + flameHeight * .5, pz, .8, flameHeight, heading, kind, opacity * .85, 6, 0, true);
                    this.stamp(px, ground + flameHeight * .4, pz, .65, flameHeight * .8, heading + Math.PI / 2, kind, opacity * .55, 6, 0, true);
                    const phase = (seconds * .85 + j / count) % 1;
                    this.stamp(px + Math.sin(angle) * phase * .3, ground + phase * 2.7, pz, .07, .2, angle, kind, opacity * Math.sin(phase * Math.PI), 4, 0, true);
                }
            } else if (kind === EffectKind.Doom || kind === EffectKind.FireImpact || kind === EffectKind.Detonation) {
                const size = r * (.15 + burst), ultimate = kind === EffectKind.Doom;
                this.stamp(x, y, z, size * 2.42, size * 2.42, t, kind, fade, 1, 0, false, true);
                if (ultimate) this.stamp(x, y, z, r * 2.4, r * 2.4, -.3 * t, kind, fade * .7, 5, 0, false, true);
                this.stamp(x, y + .3, z, size * 2, size * 2, 0, kind, fade * .8, 2);
                this.stamp(x, y + .5, z, r * Math.max(0, 1 - t * 5), r * Math.max(0, 1 - t * 5), 0, -1, fade, 2, 0, true);
                const count = ultimate ? 24 : 10;
                for (let j = 0; j < count; j++) {
                    const angle = j * TAU / count + seed, spread = r * burst * (.5 + (j % 3) * .2);
                    const px = x + Math.sin(angle) * spread, pz = z + Math.cos(angle) * spread;
                    const lift = Math.sin(t * Math.PI) * (ultimate ? 2.5 : 1.2), h = (ultimate ? 2.8 : 1.3) * fade;
                    this.stamp(px, height(px, pz) + h * .45 + lift * .3, pz, .6 + fade * .4, h, angle, kind, fade, 6, 0, true);
                    this.stamp(px, height(px, pz) + lift + .2, pz, .08, .35, angle, -1, fade * .7, 4, 0, true);
                }
            } else if (kind === EffectKind.IceBolt) {
                const ex = b.endX[i], ez = b.endZ[i], ey = height(ex, ez) + .7;
                this.beam(x, y + .5, z, ex, ey, ez, .18 * fade, kind, fade);
                this.stamp(ex, ey, ez, .8 * fade, 1.3 * fade, t * 2, kind, fade, 4, 1, true);
                for (let j = 0; j < 5; j++) { const at = (j + 1) / 6;
                    this.stamp(x + (ex - x) * at, y + .5 + (ey - y - .5) * at, z + (ez - z) * at, .18, .5, t + j, kind, fade, 4, 1, true); }
            } else if (kind === EffectKind.IceField) {
                const opacity = Math.min(1, t * 10, (1 - t) * 10), spin = seconds * .35;
                this.stamp(x, y, z, r * 2.1, r * 2.1, spin, kind, opacity * .5, 5, 0, false, true);
                for (let j = 0; j < 18; j++) {
                    const angle = j * 2.4 + spin, radius = r * (.25 + (j % 5) * .15), px = x + Math.sin(angle) * radius, pz = z + Math.cos(angle) * radius;
                    const phase = (seconds * 1.6 + j / 18) % 1;
                    this.stamp(px, height(px, pz) + .2 + (1 - phase) * 2.5, pz, .15, .6, angle, kind, opacity * .7, 4, 1, true);
                }
            } else if (kind === EffectKind.Meteor) {
                this.stamp(x, y, z, r * 2.42, r * 2.42, -t, kind, .35 + t * .5, 5, 0, false, true);
                this.stamp(x, y, z, r * 2.42 * (1 - t), r * 2.42 * (1 - t), 0, -1, .8, 1, 0, false, true);
                const lift = 8 * (1 - t * t), mx = x - (1 - t) * 2;
                this.stamp(mx, y + lift, z, 1.3, 2.2, .4, kind, .9, 0, 2, true);
                this.beam(mx, y + lift, z, mx - .7, y + lift + 2, z, .6, kind, .7);
                for (let j = 0; j < 6; j++) this.stamp(mx - j * .13, y + lift + j * .3, z, .5, .5, t * 5 + j, kind, .5 - j * .06, 0, 1, true);
            } else if (kind === EffectKind.Vortex) {
                const spin = seconds * 2;
                this.stamp(x, y, z, r * 2, r * 2, spin, kind, .65, 0, 5, false, true);
                this.stamp(x, y, z, r * 1.3, r * 1.3, -spin * 1.4, kind, .7, 0, 5, false, true);
                this.stamp(x, y + .2, z, 1, 1, spin, -1, .6, 2);
                for (let j = 0; j < 18; j++) {
                    const phase = (seconds * .8 + j / 18) % 1, angle = j * 2.4 + spin + phase * 3;
                    const spread = r * (1 - phase), px = x + Math.sin(angle) * spread, pz = z + Math.cos(angle) * spread;
                    this.stamp(px, height(px, pz) + .15 + phase, pz, .18 + phase * .25, .4, angle, kind, Math.sin(phase * Math.PI) * .85, 0, 1, true);
                }
            } else if (kind === EffectKind.Blades) {
                const spin = seconds * 4.5, opacity = Math.min(1, t * 12, (1 - t) * 12);
                for (let j = 0; j < 3; j++) {
                    const angle = spin + j * TAU / 3;
                    this.stamp(x, y + .65, z, r * 2.5, r * 2.5, angle, kind, opacity * .8, 0, 4);
                    const px = x + Math.sin(angle) * r, pz = z + Math.cos(angle) * r;
                    this.stamp(px, height(px, pz) + .65, pz, .3, 1.2, angle, -1, opacity, 4);
                    this.stamp(x, y, z, r * 2.5, r * 2.5, angle - .15, kind, opacity * .3, 0, 4, false, true);
                }
            } else if (kind === EffectKind.MeteorImpact || kind === EffectKind.Shatter) {
                const size = r * (.2 + burst);
                this.stamp(x, y, z, size * 2.42, size * 2.42, t, kind, fade, 1, 0, false, true);
                this.stamp(x, y + .3, z, size * 2, size * 2, -t, kind, fade * .65, 2);
                for (let j = 0; j < 12; j++) {
                    const angle = j * TAU / 12 + seed, spread = r * burst * (.6 + j % 3 * .2);
                    const px = x + Math.sin(angle) * spread, pz = z + Math.cos(angle) * spread, lift = Math.sin(t * Math.PI) * (1 + j % 3 * .4);
                    this.stamp(px, height(px, pz) + .2 + lift, pz, .3 + fade * .3, .6 + fade, angle, kind, fade, kind === EffectKind.Shatter ? 4 : 0, 2, true);
                    if (kind === EffectKind.MeteorImpact && j % 2 === 0) this.stamp(px, height(px, pz) + .3 + t, pz, 1 + t, 1 + t, angle, kind, fade * .25, 0, 3, true);
                }
            } else if (kind === EffectKind.Lightning || kind === EffectKind.Tempest) {
                const dx = b.endX[i] - x, dz = b.endZ[i] - z, length = Math.hypot(dx, dz);
                const endY = height(b.endX[i], b.endZ[i]) + .65;
                const normalX = length ? -dz / length : 0, normalZ = length ? dx / length : 1;
                let sx = x, sz = z, sy = y + .5;
                for (let j = 1; j <= 8; j++) {
                    const at = j / 8, offset = j === 8 ? 0 : Math.sin(seed + j * 7.31 + Math.floor(t * 7) * 2.7) * .34;
                    const ex = x + dx * at + normalX * offset, ez = z + dz * at + normalZ * offset, ey = y + .5 + (endY - y - .5) * at;
                    this.beam(sx, sy, sz, ex, ey, ez, .25, kind, fade * .55);
                    this.beam(sx, sy + .015, sz, ex, ey + .015, ez, .065, -1, fade);
                    if (j === 3 || j === 5) {
                        const bx = ex + normalX * .7 + dx * .1, bz = ez + normalZ * .7 + dz * .1;
                        this.beam(ex, ey, ez, bx, ey + .2, bz, .08, kind, fade * .8);
                    }
                    sx = ex; sz = ez; sy = ey;
                }
                this.stamp(sx, endY, sz, 1.5, 1.5, t, kind, fade, 2);
                this.stamp(sx, endY + .05, sz, .8, .8, t, -1, fade, 0, 1);
            } else if (kind === EffectKind.Dash) {
                const dx = b.endX[i] - x, dz = b.endZ[i] - z, rotation = Math.atan2(dx, dz);
                this.beam(x, y + .1, z, b.endX[i], height(b.endX[i], b.endZ[i]) + .23, b.endZ[i], .7, kind, fade * .65, true);
                for (let j = 0; j < 8; j++) {
                    const at = j / 8, age = clamp((t - at * .35) / .65);
                    if (t < at * .35) continue;
                    const px = x + dx * at, pz = z + dz * at, py = height(px, pz);
                    this.stamp(px, py + .65, pz, .55 * (1 - age), 1.35, rotation, kind, (1 - age) * .65, 0, 0, true);
                    this.stamp(px, py + .14, pz, .8, .8, rotation + t, kind, (1 - age) * .65, 0, 1, false, true);
                }
            } else {
                const radius = r * (kind === EffectKind.Ward ? .85 + t * .3 : .18 + .82 * burst);
                this.stamp(x, y, z, radius * 2.45, radius * 2.45, 0, kind, fade * .55, 2, 0, false, true);
                this.stamp(x, y + .03, z, radius * 2.42, radius * 2.42, t, kind, fade * 1.1, 1, 0, false, true);
                this.stamp(x, y + .06, z, r * 1.65, r * 1.65, (kind === EffectKind.Frost ? -1 : 1) * t * .6, kind, fade * .8, 5, 0, false, true);
                if (kind === EffectKind.Pulse) {
                    for (let j = 0; j < 3; j++) this.stamp(x, y + .2 + j * .15, z, radius * 2.4, radius * 2.4,
                        seed + j * TAU / 3 - t * 2, kind, fade * .8, 0, 4);
                }
                if (kind === EffectKind.Frost) {
                    for (let j = 0; j < 10; j++) {
                        const angle = j / 10 * TAU + seed, spread = radius * (.76 + (j % 3) * .08);
                        const px = x + Math.sin(angle) * spread, pz = z + Math.cos(angle) * spread;
                        const h = (.5 + j % 3 * .24) * Math.sin(Math.PI * Math.max(.05, t));
                        this.stamp(px, height(px, pz) + h / 2, pz, .3, h, angle, kind, fade, 4, 0, true);
                        this.stamp(px, height(px, pz) + h / 2, pz, .3, h, angle + Math.PI / 2, -1, fade * .5, 4, 0, true);
                    }
                }
                const particles = kind === EffectKind.Frost ? 8 : 16;
                for (let j = 0; j < particles; j++) {
                    const angle = j / particles * TAU + seed, spread = radius * (.5 + (j % 4) * .17);
                    const px = x + Math.sin(angle) * spread, pz = z + Math.cos(angle) * spread;
                    const lift = Math.sin(Math.PI * t) * (.3 + (j % 3) * .3);
                    this.stamp(px, height(px, pz) + .2 + lift, pz, .17 + fade * .2, .17 + fade * .2, angle, kind, fade, 0, 1);
                }
            }
        }
        for (let i = 0; i < shots.count; i++) {
            const x = shots.previousX[i] + (shots.x[i] - shots.previousX[i]) * alpha;
            const y = shots.previousY[i] + (shots.y[i] - shots.previousY[i]) * alpha;
            const z = shots.previousZ[i] + (shots.z[i] - shots.previousZ[i]) * alpha;
            const dx = shots.x[i] - shots.previousX[i], dz = shots.z[i] - shots.previousZ[i], length = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
            const size = shots.kind[i] ? .48 : .6, kind = EffectKind.FireImpact;
            this.stamp(x, y, z, size * 1.7, size * 1.7, angle, kind, .8, 2, 0, true);
            this.stamp(x, y, z, size, size, angle, -1, .9, 2, 0, true);
            if (length > 0) for (let j = 1; j <= 5; j++) {
                const trail = j * .14, fade = 1 - j / 6;
                this.stamp(x - dx / length * trail, y + Math.sin(seconds * 20 + j) * .04, z - dz / length * trail,
                    size * fade, size * 1.3 * fade, angle + Math.PI / 2, kind, fade * .85, 6, 0, true);
            }
        }
        this.ward.visible = ward > 0;
        if (ward > 0) {
            const y = height(playerX, playerZ);
            this.ward.position.set(0, y + .65, 0); this.ward.scale.set(1.05, 1.25, 1.05);
            this.wardMaterial.uniforms.time.value = seconds;
            this.stamp(playerX, y + .1, playerZ, 2.3, 2.3, seconds * .2, EffectKind.Ward, .7, 5, 0, false, true);
            for (let j = 0; j < 6; j++) {
                const angle = seconds * .7 + j * TAU / 6;
                this.stamp(playerX + Math.sin(angle), y + .4 + Math.sin(angle * 2) * .25, playerZ + Math.cos(angle), .22, .22, angle, -1, .8, 0, 1);
            }
        }
        this.ground.count = this.mesh.count;
        for (const attribute of [this.mesh.instanceMatrix, this.mesh.instanceColor!, this.styles]) {
            attribute.clearUpdateRanges();
            if (this.mesh.count) { attribute.addUpdateRange(0, this.mesh.count * attribute.itemSize); attribute.needsUpdate = true; }
        }
    }

    private beam(x: number, y: number, z: number, endX: number, endY: number, endZ: number, width: number, kind: number, alpha: number, projected = false): void {
        const horizontal = Math.hypot(endX - x, endZ - z), rise = projected ? 0 : endY - y;
        this.stamp((x + endX) / 2, (y + endY) / 2, (z + endZ) / 2, width, Math.hypot(horizontal, rise) + .08,
            Math.atan2(endX - x, endZ - z), kind, alpha, 3, 0, false, projected, Math.atan2(rise, horizontal));
    }
    private stamp(x: number, y: number, z: number, width: number, length: number, rotation: number, kind: number, alpha: number, shape: number, tile = 0, vertical = false, projected = false, pitch = 0): void {
        if (this.mesh.count === GAME_CONFIG.presentation.effectInstances || alpha <= 0) return;
        const i = this.mesh.count++;
        this.dummy.position.set(x - this.originX, projected ? 0 : y, z - this.originZ); this.dummy.rotation.set(0, rotation, 0);
        if (!vertical) this.dummy.rotateX(-Math.PI / 2 - pitch);
        this.dummy.scale.set(width, length, 1); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.mesh.setColorAt(i, kind < 0 ? WHITE : kind >= EffectKind.StarBolt ? kind === EffectKind.Bastion || kind === EffectKind.Resonance ? STAR_GOLD : kind === EffectKind.Shelter || kind === EffectKind.Cleanse ? STAR_GUARD : STAR
            : kind >= EffectKind.ThunderLance ? kind === EffectKind.Tempest || kind === EffectKind.JudgmentImpact ? HIGH_VOLTAGE : THUNDER
            : kind >= EffectKind.FireRay ? kind === EffectKind.Doom || kind === EffectKind.Detonation ? HOT_FIRE : FIRE
            : COLORS[kind === EffectKind.IceBolt || kind === EffectKind.IceField ? EffectKind.Frost : kind]);
        this.styles.setXYZW(i, tile, rotation, alpha, shape + (projected ? 8 : 0));
    }
    public reset(): void { this.mesh.count = this.ground.count = 0; this.ward.visible = false; }
    public dispose(): void {
        this.mesh.dispose(); this.ground.dispose(); this.groundMaterial.dispose(); this.material.map?.dispose(); this.material.dispose(); this.geometry.dispose();
        this.wardMaterial.dispose(); this.wardGeometry.dispose();
    }
}

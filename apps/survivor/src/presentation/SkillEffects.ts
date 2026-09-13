import { AdditiveBlending, AddEquation, CustomBlending, OneFactor, SrcAlphaFactor, ZeroFactor, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, ShaderMaterial, SphereGeometry } from "three";
import { EffectKind, type EffectBuffer } from "../core/CombatEffects";
import { GAME_CONFIG } from "../core/GameConfig";
import { AssetLoader } from "./AssetLoader";

const COLORS = ["#bd93ff", "#7bdeff", "#ffe29a", "#80f1ce", "#8dafef"].map(color => new Color(color));
const WHITE = new Color("#f4fcff"), TAU = Math.PI * 2;
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
            shader.vertexShader = "attribute vec4 effectStyle; varying vec4 vEffectStyle; varying vec2 vShapeUv;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvShapeUv = uv * 2. - 1.; vEffectStyle = effectStyle; vMapUv.x = (vMapUv.x + effectStyle.x) * .5;");
            shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
                #ifdef GROUND_PASS
                    if (effectStyle.w < 8.) gl_Position = vec4(2., 2., 2., 1.);
                #else
                    if (effectStyle.w >= 8.) gl_Position = vec4(2., 2., 2., 1.);
                #endif`);
            shader.fragmentShader = "varying vec4 vEffectStyle; varying vec2 vShapeUv;\n" + shader.fragmentShader;
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
                } else {
                    float angle = atan(q.y, q.x);
                    float ring = exp(-pow((radius - .85) * 80., 2.)) + exp(-pow((radius - .65) * 80., 2.));
                    float marks = step(.8, cos(angle * 24.)) * smoothstep(.67, .7, radius) * (1. - smoothstep(.79, .82, radius));
                    mask = ring + marks;
                }
                diffuseColor.a *= mask * vEffectStyle.z;
            `);
        };
        this.material.customProgramCacheKey = () => "survivor-skill-choreography-v4";
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

    public update(b: EffectBuffer, seconds: number, height: (x: number, z: number) => number, playerX: number, playerZ: number, ward: number): void {
        this.mesh.count = 0;
        this.originX = playerX; this.originZ = playerZ;
        const tick = seconds * GAME_CONFIG.timing.simulationHz;
        for (let i = 0; i < b.count; i++) {
            const kind = b.kind[i], t = clamp((tick - b.started[i]) / (b.endsAt[i] - b.started[i]));
            if (kind >= EffectKind.Heal || t >= 1) continue;
            const x = b.x[i], z = b.z[i], y = height(x, z) + .13, r = b.radius[i];
            const fade = (1 - t) ** .7, burst = 1 - (1 - t) ** 3;
            const seed = b.started[i] * .17 + x * 2.3 + z * 1.7;
            if (kind === EffectKind.Lightning) {
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
        this.mesh.setColorAt(i, kind < 0 ? WHITE : COLORS[kind]);
        this.styles.setXYZW(i, tile, 0, alpha, shape + (projected ? 8 : 0));
    }
    public reset(): void { this.mesh.count = this.ground.count = 0; this.ward.visible = false; }
    public dispose(): void {
        this.mesh.dispose(); this.ground.dispose(); this.groundMaterial.dispose(); this.material.map?.dispose(); this.material.dispose(); this.geometry.dispose();
        this.wardMaterial.dispose(); this.wardGeometry.dispose();
    }
}

import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, OctahedronGeometry, PlaneGeometry, RingGeometry } from "three";
import { MAX_ENEMIES } from "../core/GameConfig";
import type { CombatRenderState } from "../core/CombatState";
import type { BufferGeometry } from "three";

const CAPACITY = MAX_ENEMIES + 1;
const FROST = new Color(0x71dfff), ICE = new Color(0xc4f5ff);
const FIRE = new Color(0xff7625), SMOKE = new Color(0x292225), EMBER = new Color(0xffdc80);
const ELECTRIC = new Color(0xc8c4ff), STATIC = new Color(0x78deff);
type StatusMesh = InstancedMesh<BufferGeometry, MeshBasicMaterial>;

/** Attached, persistent visuals rebuilt from authoritative status deadlines; no effect timers or entity cache. */
export class ActorStatusEffects {
    public readonly root = new Group();
    public readonly ground: StatusMesh;
    private readonly crystals: StatusMesh;
    private readonly ice: StatusMesh;
    private readonly flames: StatusMesh;
    private readonly smoke: StatusMesh;
    private readonly embers: StatusMesh;
    private readonly electricity: StatusMesh;
    private readonly staticGuard: StatusMesh;
    private readonly time = { value: 0 };
    private readonly dummy = new Object3D();
    private readonly pools: readonly StatusMesh[];
    private tick = 0;
    private seconds = 0;

    constructor() {
        this.ground = this.pool(new RingGeometry(.76, 1, 24, 1, 0, Math.PI * 1.85), CAPACITY, .48);
        this.crystals = this.pool(new OctahedronGeometry(1, 0), CAPACITY * 3, .8);
        this.ice = this.pool(new CylinderGeometry(.65, 1, 1, 6, 1), CAPACITY, .25);
        this.flames = this.pool(new PlaneGeometry(1, 1), CAPACITY * 3, .8, "flame");
        this.smoke = this.pool(new PlaneGeometry(1, 1), CAPACITY * 2, .2, "smoke");
        this.embers = this.pool(new OctahedronGeometry(1, 0), CAPACITY * 3, .9);
        this.electricity = this.pool(new PlaneGeometry(1, 1), CAPACITY * 3, .95, "electric");
        this.staticGuard = this.pool(new RingGeometry(.94, 1, 32, 1, 0, Math.PI * 1.7), CAPACITY * 2, .7);
        this.flames.material.blending = this.embers.material.blending = AdditiveBlending;
        this.electricity.material.blending = this.staticGuard.material.blending = AdditiveBlending;
        this.ground.material.depthTest = false;
        this.root.add(this.ice, this.crystals, this.smoke, this.flames, this.embers, this.electricity, this.staticGuard);
        this.pools = [this.ground, this.crystals, this.ice, this.flames, this.smoke, this.embers, this.electricity, this.staticGuard];
    }

    private pool(geometry: BufferGeometry, capacity: number, opacity: number, style?: "flame" | "smoke" | "electric"): StatusMesh {
        geometry.setAttribute("statusVisibility", new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage));
        const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false, side: DoubleSide, toneMapped: false });
        material.forceSinglePass = true;
        material.onBeforeCompile = shader => {
            shader.vertexShader = "attribute float statusVisibility; varying float vStatusVisibility;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvStatusVisibility = statusVisibility;");
            shader.fragmentShader = "varying float vStatusVisibility;\n" + shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vStatusVisibility;");
            if (style) {
                shader.uniforms.statusTime = this.time;
                shader.vertexShader = "varying vec2 statusUv;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nstatusUv = uv;");
                shader.fragmentShader = "uniform float statusTime; varying vec2 statusUv;\n" + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
                    vec2 q = statusUv;
                    float sway = sin(q.y * 9. - statusTime * 7.) * .11 * q.y + sin(q.y * 17. - statusTime * 11.) * .04;
                    float width = .48 * pow(max(0., 1. - q.y), .7);
                    float flame = (1. - smoothstep(width * .4, width, abs(q.x - .5 - sway))) * smoothstep(0., .08, q.y) * (1. - smoothstep(.8, 1., q.y));
                    ${style === "electric" ? "float zig = abs(fract(q.y * 4. + floor(statusTime * 12.) * .31) * 2. - 1.) * .42 - .21; float line = abs(q.x - .5 - zig); diffuseColor.a *= exp(-line * line * 1700.) * smoothstep(0., .12, q.y) * (1. - smoothstep(.85, 1., q.y));"
                        : style === "flame" ? "diffuseColor.a *= flame; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1., .88, .38), pow(flame * (1. - q.y), 2.));"
                        : "float cloud = max(0., 1. - length((q - .5) * vec2(2., 2.4))); diffuseColor.a *= cloud * cloud * (.75 + .25 * sin(q.x * 14. + q.y * 11. - statusTime * 2.));"}
                `);
            }
        };
        material.customProgramCacheKey = () => "actor-status-visibility-v3-" + (style ?? "ice");
        const mesh = new InstancedMesh(geometry, material, capacity);
        mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.setColorAt(0, FROST); mesh.instanceColor!.setUsage(DynamicDrawUsage);
        return mesh;
    }

    public begin(tick: number, seconds: number): void { this.reset(); this.tick = tick; this.seconds = this.time.value = seconds; }
    public reset(): void { for (const mesh of this.pools) mesh.count = 0; }

    /** Coordinates are relative to the current render origin; the ground pass supplies terrain height. */
    public actor(status: CombatRenderState["entities"]["status"], slot: number, x: number, y: number, z: number, radius: number, visibility = 1): void {
        const frozen = status.frozenUntil[slot] > this.tick, slow = status.slowUntil[slot] > this.tick, burning = status.burnUntil[slot] > this.tick;
        const conductive = status.conductiveUntil[slot] > this.tick, guarded = status.staticGuardUntil[slot] > this.tick;
        if ((!frozen && !slow && !burning && !conductive && !guarded) || visibility <= 0) return;
        const scale = radius / .3, color = frozen ? ICE : FROST;
        if (conductive) for (let i = 0; i < 3; i++) {
            const angle = slot * .83 + i * Math.PI * 2 / 3, pulse = .55 + .45 * Math.abs(Math.sin(this.seconds * 11 + angle));
            this.stamp(this.electricity, x + Math.sin(angle) * radius, y + .65 * scale, z + Math.cos(angle) * radius,
                radius * 2.2, 1.35 * scale, 1, angle, ELECTRIC, visibility * pulse);
        }
        if (guarded) for (let i = 0; i < 2; i++) this.stamp(this.staticGuard, x, y + (.32 + i * .62) * scale, z,
            radius * 1.9, radius * 1.9, 1, this.seconds * (i ? -2 : 2), STATIC, visibility, -Math.PI / 2 + (i ? .3 : -.3));
        if (burning) {
            const strength = Math.min(1, status.burnStacks[slot] / 8), seed = slot * .731;
            for (let i = 0; i < 3; i++) {
                const angle = seed + i * Math.PI * 2 / 3, pulse = .88 + .12 * Math.sin(this.seconds * 8 + angle);
                const h = scale * (.65 + .55 * strength) * pulse, orbit = radius * .75;
                this.stamp(this.flames, x + Math.sin(angle) * orbit, y + h * .48, z + Math.cos(angle) * orbit,
                    radius * (2 + strength), h, 1, angle, FIRE, visibility);
                const phase = (this.seconds * .8 + i / 3 + seed % 1) % 1;
                this.stamp(this.embers, x + Math.sin(angle + phase) * radius, y + phase * 2 * scale, z + Math.cos(angle + phase) * radius,
                    .025 * scale, .08 * scale, .025 * scale, angle, EMBER, visibility * Math.sin(phase * Math.PI));
            }
            for (let i = 0; i < 2; i++) {
                const phase = (this.seconds * .45 + i / 2 + seed % 1) % 1, size = radius * (2 + phase * 3);
                this.stamp(this.smoke, x + Math.sin(seed + phase) * radius * .5, y + (.65 + phase * 1.6) * scale, z,
                    size, size * 1.2, 1, seed + i * Math.PI / 2, SMOKE, visibility * Math.sin(phase * Math.PI));
            }
        }
        if (!frozen && !slow) return;
        this.stamp(this.ground, x, 0, z, radius * 1.8, radius * 1.8, 1, this.seconds * .4, color, visibility, -Math.PI / 2);
        if (frozen) this.stamp(this.ice, x, y + .65 * scale, z, radius * 1.8, 1.45 * scale, radius * 1.8, 0, ICE, visibility);
        for (let i = 0; i < 3; i++) {
            const angle = i * Math.PI * 2 / 3 + (frozen ? .3 : this.seconds * .8);
            const orbit = radius * (frozen ? 1.3 : 1.45), rise = frozen ? .3 : .12 + .05 * Math.sin(this.seconds * 2 + i);
            this.stamp(this.crystals, x + Math.sin(angle) * orbit, y + rise * scale, z + Math.cos(angle) * orbit,
                .075 * scale, (frozen ? .4 : .16) * scale, .075 * scale, angle, color, visibility);
        }
    }

    private stamp(mesh: InstancedMesh, x: number, y: number, z: number, width: number, height: number, depth: number,
        yaw: number, color: Color, visibility: number, pitch = 0): void {
        if (mesh.count === mesh.instanceMatrix.count) throw new Error("Actor status presentation capacity exceeded");
        const index = mesh.count++;
        this.dummy.position.set(x, y, z); this.dummy.rotation.set(pitch, yaw, 0, "YXZ");
        this.dummy.scale.set(width, height, depth); this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix); mesh.setColorAt(index, color);
        mesh.geometry.getAttribute("statusVisibility").setX(index, visibility);
    }

    public upload(): void {
        for (const mesh of this.pools) for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!, mesh.geometry.getAttribute("statusVisibility") as InstancedBufferAttribute]) {
            attribute.clearUpdateRanges();
            if (mesh.count) { attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true; }
        }
    }
    public dispose(): void {
        for (const mesh of this.pools) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
    }
}

import { Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, OctahedronGeometry, RingGeometry } from "three";
import { MAX_ENEMIES } from "../core/GameConfig";
import type { CombatRenderState } from "../core/CombatState";
import type { BufferGeometry } from "three";

const CAPACITY = MAX_ENEMIES + 1;
const FROST = new Color(0x71dfff), ICE = new Color(0xc4f5ff);
type StatusMesh = InstancedMesh<BufferGeometry, MeshBasicMaterial>;

/** Attached, persistent visuals rebuilt from authoritative status deadlines; no effect timers or entity cache. */
export class ActorStatusEffects {
    public readonly root = new Group();
    public readonly ground: StatusMesh;
    private readonly crystals: StatusMesh;
    private readonly ice: StatusMesh;
    private readonly dummy = new Object3D();
    private readonly pools: readonly StatusMesh[];
    private tick = 0;
    private seconds = 0;

    constructor() {
        this.ground = this.pool(new RingGeometry(.76, 1, 24, 1, 0, Math.PI * 1.85), CAPACITY, .48);
        this.crystals = this.pool(new OctahedronGeometry(1, 0), CAPACITY * 3, .8);
        this.ice = this.pool(new CylinderGeometry(.65, 1, 1, 6, 1), CAPACITY, .25);
        this.ground.material.depthTest = false;
        this.root.add(this.ice, this.crystals);
        this.pools = [this.ground, this.crystals, this.ice];
    }

    private pool(geometry: BufferGeometry, capacity: number, opacity: number): StatusMesh {
        geometry.setAttribute("statusVisibility", new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage));
        const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false, side: DoubleSide, toneMapped: false });
        material.forceSinglePass = true;
        material.onBeforeCompile = shader => {
            shader.vertexShader = "attribute float statusVisibility; varying float vStatusVisibility;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvStatusVisibility = statusVisibility;");
            shader.fragmentShader = "varying float vStatusVisibility;\n" + shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vStatusVisibility;");
        };
        material.customProgramCacheKey = () => "actor-status-visibility-v1";
        const mesh = new InstancedMesh(geometry, material, capacity);
        mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.setColorAt(0, FROST); mesh.instanceColor!.setUsage(DynamicDrawUsage);
        return mesh;
    }

    public begin(tick: number, seconds: number): void { this.reset(); this.tick = tick; this.seconds = seconds; }
    public reset(): void { for (const mesh of this.pools) mesh.count = 0; }

    /** Coordinates are relative to the current render origin; the ground pass supplies terrain height. */
    public actor(status: CombatRenderState["entities"]["status"], slot: number, x: number, y: number, z: number, radius: number, visibility = 1): void {
        const frozen = status.frozenUntil[slot] > this.tick, slow = status.slowUntil[slot] > this.tick;
        if ((!frozen && !slow) || visibility <= 0) return;
        const scale = radius / .3, color = frozen ? ICE : FROST;
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

import { AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, TextureLoader } from "three";
import { EffectKind, type EffectBuffer } from "../core/CombatEffects";
import { GAME_CONFIG } from "../core/GameConfig";

const COLORS = ["#bd93ff", "#7bdeff", "#ffe29a", "#80f1ce", "#8dafef", "#8bffbb", "#ff526f"].map(color => new Color(color));
const TILES = [0, 3, 2, 1, 1, 3, 0];
/** A single instanced draw uses the shared CC0 atlas. Time always comes from simulation. */
export class SkillEffects {
    public readonly mesh: InstancedMesh;
    private readonly geometry = new PlaneGeometry(1, 1);
    private readonly material = new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    private readonly dummy = new Object3D();
    private constructor() {
        const n = GAME_CONFIG.skills.maxEffects;
        this.geometry.setAttribute("effectTile", new InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(DynamicDrawUsage));
        this.geometry.setAttribute("effectAlpha", new InstancedBufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage));
        this.material.onBeforeCompile = shader => {
            shader.vertexShader = "attribute vec2 effectTile; attribute float effectAlpha; varying float vEffectAlpha;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * .5 + effectTile * .5; vEffectAlpha = effectAlpha;");
            shader.fragmentShader = "varying float vEffectAlpha;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vEffectAlpha;");
        };
        this.material.customProgramCacheKey = () => "survivor-skill-atlas";
        this.mesh = new InstancedMesh(this.geometry, this.material, n);
        this.mesh.name = "skill-effects";
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); this.mesh.setColorAt(0, COLORS[0]);
        this.mesh.count = 0; this.mesh.frustumCulled = false;
    }
    public static async load(): Promise<SkillEffects> {
        const effects = new SkillEffects();
        try {
            effects.material.map = await new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}effects/skills.png`);
            effects.material.needsUpdate = true;
            return effects;
        } catch (error) { effects.dispose(); throw new Error("Skill effect atlas load failed: effects/skills.png", { cause: error }); }
    }
    public update(b: EffectBuffer, seconds: number, height: (x: number, z: number) => number): void {
        this.mesh.count = b.count;
        if (b.count === 0) return;
        const tiles = this.geometry.getAttribute("effectTile"), opacity = this.geometry.getAttribute("effectAlpha");
        const tick = seconds * GAME_CONFIG.timing.simulationHz;
        for (let i = 0; i < b.count; i++) {
            const kind = b.kind[i], tile = TILES[kind];
            const progress = Math.max(0, Math.min(1, (tick - b.started[i]) / (b.endsAt[i] - b.started[i])));
            const line = kind === EffectKind.Lightning || kind === EffectKind.Dash;
            const x = line ? (b.x[i] + b.endX[i]) / 2 : b.x[i], z = line ? (b.z[i] + b.endZ[i]) / 2 : b.z[i];
            const length = Math.hypot(b.endX[i] - b.x[i], b.endZ[i] - b.z[i]);
            const size = b.radius[i] * 2 * (.35 + .65 * progress);
            this.dummy.position.set(x, height(x, z) + .12, z);
            this.dummy.rotation.set(-Math.PI / 2, 0, line ? Math.atan2(b.endX[i] - b.x[i], b.endZ[i] - b.z[i]) : progress * .4);
            this.dummy.scale.set(line ? b.radius[i] * 2 : size, line ? Math.max(.2, length) : size, 1);
            this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); this.mesh.setColorAt(i, COLORS[kind]);
            tiles.setXY(i, tile % 2, 1 - Math.floor(tile / 2)); opacity.setX(i, (1 - progress) * .85);
        }
        this.mesh.instanceMatrix.needsUpdate = this.mesh.instanceColor!.needsUpdate = tiles.needsUpdate = opacity.needsUpdate = true;
    }
    public dispose(): void { this.mesh.dispose(); this.material.map?.dispose(); this.material.dispose(); this.geometry.dispose(); }
}

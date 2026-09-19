import { BufferGeometry, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh,
    MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Vector2, Vector3 } from "three";
import { ActorAction } from "../core/CombatWorld";
import { EffectKind, type EffectBuffer } from "../core/CombatEffects";
import { GAME_CONFIG, MAX_ENEMIES, MAX_PROJECTILES } from "../core/GameConfig";
import { ENEMY_SPECIAL } from "../core/EnemyDefinitions";
import { strikeSegment } from "../core/EnemyStrikes";
import { installActorFade } from "./ActorVisibility";

const FX = GAME_CONFIG.skills.maxEffects, UP = new Vector3(0, 1, 0);
const STONE = new Color("#827567"), EDGE = new Color("#ada391"), FANG = new Color("#c1a999"), HOT = new Color("#e1c3a0");
const WARNING = new Color("#e45b4e");
const BLOOD = new Color("#b64e69"), LIFE = new Color("#8eb8a3");
type Height = (x: number, z: number) => number;

/** Curved, tapered teeth with dark roots and fine longitudinal ridges, built once for all attacks. */
function fangGeometry(): BufferGeometry {
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [], rings = 10, sides = 10;
    for (let row = 0; row <= rings; row++) {
        const t = row / rings, radius = .25 * Math.pow(1 - t, .7) + .002, bend = .4 * t * t;
        for (let side = 0; side <= sides; side++) {
            const angle = side / sides * Math.PI * 2, ridge = 1 + .08 * Math.sin(angle * 5 + t * 2);
            vertices.push(bend + Math.cos(angle) * radius * ridge - .15, -.48 + t * 1.14, Math.sin(angle) * radius * .6 * ridge);
            const shade = .18 + .82 * Math.sqrt(t), vein = .9 + .1 * Math.cos(angle * 5 + t * 2);
            colors.push(shade * vein, shade * vein * (.6 + .4 * t), shade * vein * (.5 + .5 * t));
            if (row < rings && side < sides) {
                const a = row * (sides + 1) + side, b = a + sides + 1;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
    }
    const bottom = vertices.length / 3, top = bottom + 1;
    vertices.push(-.15, -.48, 0, .25, .66, 0); colors.push(.18, .108, .09, 1, 1, 1);
    for (let side = 0; side < sides; side++) {
        const tip = rings * (sides + 1) + side;
        indices.push(bottom, side, side + 1, top, tip + 1, tip);
    }
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
}

function rockMaterial(): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ roughness: .96 });
    material.onBeforeCompile = shader => {
        shader.vertexShader = "varying vec3 vRockPoint;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRockPoint = position;");
        shader.fragmentShader = "varying vec3 vRockPoint;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
            float strata = sin(dot(vRockPoint, vec3(5.1, 9.8, 4.7)) + sin(dot(vRockPoint, vec3(13.0, 3.0, 8.0))) * 2.0);
            float grain = sin(vRockPoint.x * 181.0 + vRockPoint.z * 93.0) * sin(vRockPoint.y * 139.0 - vRockPoint.z * 167.0);
            float detail = 1.0 / (1.0 + length(fwidth(vRockPoint)) * 140.0);
            diffuseColor.rgb *= .85 + .07 * strata + .09 * grain * detail;
        `);
    };
    material.customProgramCacheKey = () => "enemy-stratified-rock-v1";
    return material;
}

/** Enemy attacks use solid silhouettes, swept weapons and tissue-like links, independent of player rune effects. */
export class EnemyPresentation {
    public readonly root = new Group();
    public readonly warnings: InstancedMesh;
    public readonly rocks: InstancedMesh;
    public readonly blades: InstancedMesh;
    public readonly threads: InstancedMesh;
    private readonly dummy = new Object3D();
    private readonly direction = new Vector3();
    private readonly segment = new Float64Array(4);
    private readonly tint = new Color();
    private originX = 0;
    private originZ = 0;
    private seconds = 0;

    constructor() {
        this.blades = this.pool(fangGeometry(),
            new MeshStandardMaterial({ roughness: .4, metalness: .12, vertexColors: true }), MAX_ENEMIES * 6 + FX * 24 + MAX_PROJECTILES * 2);
        this.rocks = this.pool(new DodecahedronGeometry(1, 1), rockMaterial(), FX * 12 + MAX_ENEMIES * 2);
        this.threads = this.pool(new CylinderGeometry(1, 1, 1, 5),
            new MeshBasicMaterial({ transparent: true, opacity: .7, depthWrite: false }), MAX_ENEMIES * 5 + FX * 12 + MAX_PROJECTILES * 2);
        this.warnings = this.pool(new PlaneGeometry(1, 1),
            new MeshBasicMaterial({ transparent: true, opacity: .48, depthWrite: false, depthTest: false, side: DoubleSide }), MAX_ENEMIES * 8);
        const center = new Vector2();
        for (const mesh of [this.blades, this.rocks, this.threads]) installActorFade(mesh.material as MeshBasicMaterial, center);
        this.root.add(this.rocks, this.blades, this.threads);
    }
    private pool(geometry: InstancedMesh["geometry"], material: MeshBasicMaterial | MeshStandardMaterial, capacity: number): InstancedMesh {
        const mesh = new InstancedMesh(geometry, material, capacity);
        mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.setColorAt(0, HOT); mesh.instanceColor!.setUsage(DynamicDrawUsage); return mesh;
    }
    private stamp(mesh: InstancedMesh, x: number, y: number, z: number, width: number, height: number, depth: number,
        yaw: number, color: Color, pitch = 0, roll = 0): void {
        this.dummy.position.set(x - this.originX, y, z - this.originZ);
        this.dummy.rotation.set(pitch, yaw, roll, "YXZ"); this.dummy.scale.set(width, height, depth); this.dummy.updateMatrix();
        this.write(mesh, color);
    }
    private write(mesh: InstancedMesh, color: Color): void {
        if (mesh.count >= mesh.instanceMatrix.count) throw new Error("Enemy presentation capacity exceeded");
        const i = mesh.count++; mesh.setMatrixAt(i, this.dummy.matrix); mesh.setColorAt(i, color);
    }
    private thread(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, color: Color): void {
        this.direction.set(bx - ax, by - ay, bz - az); const length = this.direction.length();
        if (length < 1e-6) return;
        this.dummy.position.set((ax + bx) / 2 - this.originX, (ay + by) / 2, (az + bz) / 2 - this.originZ);
        this.dummy.quaternion.setFromUnitVectors(UP, this.direction.multiplyScalar(1 / length));
        this.dummy.scale.set(width, length, width); this.dummy.updateMatrix(); this.write(this.threads, color);
    }
    private line(ax: number, az: number, bx: number, bz: number, width: number): void {
        this.stamp(this.warnings, (ax + bx) / 2, 0, (az + bz) / 2, width, Math.hypot(bx - ax, bz - az), 1,
            Math.atan2(bx - ax, bz - az), WARNING, -Math.PI / 2);
    }
    public begin(facts: EffectBuffer, seconds: number, height: Height, x: number, z: number): void {
        this.reset(); this.originX = x; this.originZ = z; this.seconds = seconds;
        for (let i = 0; i < facts.count; i++) {
            const kind = facts.kind[i]; if (kind < EffectKind.Heal || kind > EffectKind.EnemyQuake) continue;
            const age = seconds - facts.started[i] / GAME_CONFIG.timing.simulationHz;
            if (age < 0 || seconds * GAME_CONFIG.timing.simulationHz >= facts.endsAt[i]) continue;
            const x = facts.x[i], z = facts.z[i], heading = Math.atan2(facts.endX[i] - x, facts.endZ[i] - z);
            if (kind === EffectKind.EnemyQuake) {
                const radius = facts.radius[i] * age / ENEMY_SPECIAL.quake.duration;
                for (let j = 0; j < 12; j++) {
                    const angle = j * Math.PI / 6, px = x + Math.sin(angle) * radius, pz = z + Math.cos(angle) * radius;
                    this.stamp(this.rocks, px, height(px, pz) + .25, pz, .4, .65, .4, angle, j % 2 ? STONE : EDGE);
                    const next = angle + Math.PI / 6;
                    this.thread(px, height(px, pz) + .18, pz, x + Math.sin(next) * radius, height(px, pz) + .18, z + Math.cos(next) * radius, .07, WARNING);
                }
            } else if (kind === EffectKind.EnemyFault) {
                for (let j = 0; j < 12; j++) {
                    const front = j === 0;
                    if (front && age >= ENEMY_SPECIAL.fault.duration) continue;
                    const distance = front ? age / ENEMY_SPECIAL.fault.duration : j / 11;
                    const elapsed = front ? .2 : age - distance * ENEMY_SPECIAL.fault.duration;
                    if (elapsed < 0 || elapsed > .4) continue;
                    const px = x + Math.sin(heading) * distance * ENEMY_SPECIAL.fault.length, pz = z + Math.cos(heading) * distance * ENEMY_SPECIAL.fault.length;
                    const lift = Math.sin(Math.PI * elapsed / .4);
                    this.stamp(this.rocks, px, height(px, pz) + lift * .45, pz, .42, .1 + lift * .85, .5, heading + j * 1.7, j % 3 ? STONE : EDGE, .1, (j % 2 ? 1 : -1) * .2);
                }
            } else if (kind === EffectKind.EnemyJaws) {
                const phase = Math.min(1, age / ENEMY_SPECIAL.jaws.duration), retract = 1 - Math.max(0, age - ENEMY_SPECIAL.jaws.duration) / .3;
                for (let side = -1; side <= 1; side += 2) {
                    strikeSegment(this.segment, ActorAction.Jaws, x, z, heading, phase, side);
                    for (let j = 0; j < 7; j++) {
                        const t = j / 6, px = this.segment[0] + (this.segment[2] - this.segment[0]) * t, pz = this.segment[1] + (this.segment[3] - this.segment[1]) * t;
                        this.stamp(this.blades, px, height(px, pz) + .7 * retract, pz, .85, (1.4 + j % 2 * .4) * retract, 2,
                            heading, j % 2 ? FANG : HOT, 0, side * .3);
                    }
                }
            } else if (kind === EffectKind.EnemyReave) {
                const phase = Math.min(1, age / ENEMY_SPECIAL.reave.duration), shrink = 1 - Math.max(0, age - ENEMY_SPECIAL.reave.duration) / .3;
                for (let j = 0; j < 3; j++) {
                    const t = Math.max(0, phase - j * .07), angle = heading + (t * 2 - 1) * ENEMY_SPECIAL.reave.halfArc;
                    strikeSegment(this.segment, ActorAction.Reave, x, z, heading, t);
                    const px = (this.segment[0] + this.segment[2]) / 2, pz = (this.segment[1] + this.segment[3]) / 2;
                    this.stamp(this.blades, px, height(px, pz) + .9, pz, (1 - j * .2) * shrink, 3 * shrink, 1.5, angle, j ? FANG : HOT, Math.PI / 2, -.2);
                }
            } else if (kind === EffectKind.Heal) {
                const t = Math.min(1, age / .8);
                for (let j = 0; j < 8; j++) {
                    const at = Math.max(0, Math.min(1, t * 1.8 - j * .08));
                    const px = x + (facts.endX[i] - x) * at, pz = z + (facts.endZ[i] - z) * at;
                    this.stamp(this.blades, px, height(px, pz) + .8 + Math.sin(at * Math.PI) * .8, pz, .14, .28, .4, heading,
                        this.tint.copy(BLOOD).lerp(LIFE, at), 0, this.seconds * 4 + j);
                }
            }
        }
    }
    public actor(kind: ActorAction, progress: number, x: number, z: number, y: number, heading: number, tx: number, tz: number, ward: boolean): void {
        if (ward) for (let j = 0; j < 3; j++) {
            const angle = this.seconds * 1.5 + j * Math.PI * 2 / 3;
            this.stamp(this.blades, x + Math.sin(angle) * .55, y + .7, z + Math.cos(angle) * .55, .35, .6, .6, angle, LIFE);
        }
        if (progress >= .5) return;
        if (kind === ActorAction.Quake) {
            // Radial arrows communicate an outward wave and leave the centre readable.
            for (let j = 0; j < 6; j++) {
                const angle = j * Math.PI / 3;
                this.line(x + Math.sin(angle) * 1.5, z + Math.cos(angle) * 1.5,
                    x + Math.sin(angle) * ENEMY_SPECIAL.quake.radius, z + Math.cos(angle) * ENEMY_SPECIAL.quake.radius, .11);
            }
            this.stamp(this.rocks, x, y + .25, z, 1.2, .4 + progress, 1.2, heading, EDGE);
        } else if (kind === ActorAction.Storm) {
            for (let j = -2; j <= 2; j++) {
                const angle = heading + j * ENEMY_SPECIAL.storm.spread;
                this.line(x + Math.sin(angle), z + Math.cos(angle), x + Math.sin(angle) * 7, z + Math.cos(angle) * 7, .1);
            }
        } else if (kind === ActorAction.Fault) {
            for (let j = 0; j < 6; j++) {
                const from = j / 6 * ENEMY_SPECIAL.fault.length, to = (j + .8) / 6 * ENEMY_SPECIAL.fault.length;
                this.line(x + Math.sin(heading) * from, z + Math.cos(heading) * from, x + Math.sin(heading) * to, z + Math.cos(heading) * to, .16);
            }
            this.stamp(this.rocks, x, y + .2, z, .5, .25 + progress * .5, .5, heading + Math.sin(progress * 70) * .04, STONE);
        } else if (kind === ActorAction.Jaws) {
            for (let side = -1; side <= 1; side += 2) {
                strikeSegment(this.segment, kind, tx, tz, heading, 0, side);
                this.line(this.segment[0], this.segment[1], this.segment[2], this.segment[3], .2);
                const px = tx + Math.cos(heading) * side * ENEMY_SPECIAL.jaws.halfGap, pz = tz - Math.sin(heading) * side * ENEMY_SPECIAL.jaws.halfGap;
                this.line(px, pz, px - Math.cos(heading) * side * 1.1, pz + Math.sin(heading) * side * 1.1, .15);
            }
        } else if (kind === ActorAction.Reave) {
            for (let t = 0; t <= 1; t++) { strikeSegment(this.segment, kind, x, z, heading, t); this.line(this.segment[0], this.segment[1], this.segment[2], this.segment[3], .14); }
        }
    }
    public hand(kind: ActorAction, progress: number, x: number, y: number, z: number, tx: number, tz: number, heading: number, height: Height): void {
        if (kind === ActorAction.Heal) {
            let px = x, py = y, pz = z;
            for (let j = 1; j <= 5; j++) {
                const t = j / 5, nx = x + (tx - x) * t, nz = z + (tz - z) * t;
                const ny = y * (1 - t) + (height(tx, tz) + .8) * t + Math.sin(t * Math.PI) * .5;
                this.thread(px, py, pz, nx, ny, nz, .025 + progress * .03, this.tint.copy(BLOOD).lerp(LIFE, t)); px = nx; py = ny; pz = nz;
            }
        } else for (let j = 0; j < (kind === ActorAction.Volley ? 3 : 1); j++) {
            const angle = this.seconds * 5 + j * Math.PI * 2 / 3;
            this.stamp(this.blades, x + Math.cos(angle) * .22, y + Math.sin(angle) * .22, z, .25 + progress * .45, .65, .6, heading, HOT, Math.PI / 2, angle);
        }
    }
    public projectile(x: number, y: number, z: number, heading: number, age: number): void {
        this.stamp(this.blades, x, y, z, .4, .9, .75, heading, BLOOD, Math.PI / 2, 0);
        this.stamp(this.blades, x, y + .015, z + .02, .12, .8, .8, heading, HOT, Math.PI / 2, 0);
        const tail = Math.min(.9, age * 4.5);
        this.thread(x, y, z, x - Math.sin(heading) * tail, y, z - Math.cos(heading) * tail, .026, WARNING);
    }
    public upload(): void {
        for (const mesh of [this.warnings, this.rocks, this.blades, this.threads]) for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!]) {
            attribute.clearUpdateRanges(); if (mesh.count) { attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true; }
        }
    }
    public reset(): void { this.warnings.count = this.rocks.count = this.blades.count = this.threads.count = 0; }
    public dispose(): void {
        for (const mesh of [this.warnings, this.rocks, this.blades, this.threads]) { mesh.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); }
    }
}

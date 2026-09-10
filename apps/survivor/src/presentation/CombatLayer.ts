import {
    BoxGeometry,
    CircleGeometry,
    CylinderGeometry,
    Color,
    DoubleSide,
    DirectionalLight,
    DynamicDrawUsage,
    Group,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    OctahedronGeometry,
    PlaneGeometry,
    RingGeometry,
    SphereGeometry,
    Vector2
} from "three";
import {
    collectObject3DResourceAllocations,
    type ResourceBudgetAccount,
    type WorldRenderLayer,
    type WorldRenderLayerHost
} from "three-hex-map";
import type { CombatRenderState } from "../core/CombatState";
import { MAX_ENEMIES, MAX_EXPERIENCE_ORBS, MAX_GROUND_EQUIPMENT, MAX_PROJECTILES, MELEE_HALF_ARC } from "../core/GameConfig";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";
import { GAME_CONFIG } from "../core/GameConfig";
import { RARITIES } from "../core/Loot";

import { ActorAction, Faction } from "../core/CombatWorld";
import { ActorModels } from "./ActorModels";
import { SkillEffects } from "./SkillEffects";
import { ENEMY_DEFINITIONS, ENEMY_SPECIAL } from "../core/EnemyDefinitions";
import { ACTOR_FADE_END, actorVisibility, installActorFade } from "./ActorVisibility";
const RARITY_COLORS = RARITIES.map(rarity => new Color(GAME_CONFIG.quality[rarity].color));
const CHEST_COLORS = [new Color(0xb87838), new Color(0xd7e0ed), new Color(0xffc34b), new Color(0x70f5ed), new Color(0xff79dc)] as const;
const WHITE = new Color(0xffffff);
const ELITE = new Color(0xffc857);
const BOSS = new Color(0xa922ee);
const ENEMY_COLORS = ENEMY_DEFINITIONS.map(definition => new Color(definition.tint));
const FROST = new Color(0x72dcff);
const ENRAGED = new Color(0xff526f);
const HEAL = new Color(0x8bffbb);

/** Converts the map's flat-top even-q layout back from logical ground coordinates. */
export function groundTile(point: { readonly x: number; readonly z: number }): { readonly x: number; readonly y: number } {
    const q = point.x * 2 / 3;
    const r = (point.z - Math.sqrt(3) / 2) / Math.sqrt(3) - q / 2;
    let x = Math.round(q);
    let y = Math.round(r);
    const s = Math.round(-q - r);
    const dx = Math.abs(x - q);
    const dy = Math.abs(y - r);
    const ds = Math.abs(s + q + r);
    if (dx > dy && dx > ds) x = -y - s;
    else if (dy > ds) y = -x - s;
    return { x, y: y + Math.ceil(x / 2) };
}

export class CombatLayer implements WorldRenderLayer {
    public readonly id = "survivor-combat";
    private readonly root = new Group();
    private readonly player = new Group();
    private readonly playerBody = new Group();
    private readonly shield = new Group();
    private actors: ActorModels | undefined;
    private effects: SkillEffects | undefined;
    private actorLoading: Promise<void> | undefined;
    private disposed = false;
    private readonly projectiles: InstancedMesh;
    private readonly experience: InstancedMesh;
    private readonly telegraphs: InstancedMesh;
    private readonly castWarnings: InstancedMesh;
    private readonly chargeWarnings: InstancedMesh;
    private readonly loot: readonly InstancedMesh[];
    private readonly chests: InstancedMesh;
    private readonly chestLids: InstancedMesh;
    private readonly chestLocks: InstancedMesh;
    private readonly geometries = [
        new SphereGeometry(0.09, 8, 6),
        new OctahedronGeometry(0.11, 0),
        new BoxGeometry(0.22, 0.22, 0.22),
        new RingGeometry(0.42, 0.49, 32),
        new CircleGeometry(0.34, 24),
        new BoxGeometry(0.65, 0.36, 0.46),
        new BoxGeometry(0.7, 0.13, 0.5),
        new BoxGeometry(0.09, 0.16, 0.045),
        new OctahedronGeometry(0.21, 0),
        new CylinderGeometry(0.09, 0.13, 0.32, 8),
        new CircleGeometry(1, 32, -Math.PI / 2 - MELEE_HALF_ARC, MELEE_HALF_ARC * 2),
        new RingGeometry(.8, 1, 32),
        new PlaneGeometry(1, 1)
    ] as const;
    private readonly projectileMaterial = new MeshBasicMaterial({ color: 0xffffff });
    private readonly warningMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28, depthWrite: false, side: DoubleSide });
    private readonly experienceMaterial = new MeshBasicMaterial({ color: 0x66f5ff });
    private readonly lootMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x17110a, roughness: 0.3, metalness: 0.55 });
    private readonly emberMaterial = new MeshBasicMaterial({ color: 0xffc35c });
    private readonly auraMaterial = new MeshBasicMaterial({ color: 0x70ecff, transparent: true, opacity: 0.48, side: DoubleSide, depthWrite: false });
    private readonly shadowMaterial = new MeshBasicMaterial({ color: 0x06090b, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false });
    private readonly dummy = new Object3D();
    private readonly color = new Color();
    private readonly viewCenter = new Vector2();
    private readonly actorFill = new DirectionalLight(0xe2ebdf, 1.6);
    private readonly heightCache = new Map<string, number>();
    private host: WorldRenderLayerHost | undefined;
    private readonly effectHeight = (x: number, z: number) => this.height(x, z);

    constructor(private readonly resources: ResourceBudgetAccount) {
        installActorFade(this.lootMaterial, this.viewCenter);
        installActorFade(this.emberMaterial, this.viewCenter);
        this.root.name = "survivor-combat";
        // Soft light from the fixed camera direction keeps dark leather and faces readable.
        this.actorFill.position.set(-6, 9, 7);
        this.root.add(this.actorFill, this.actorFill.target);
        this.projectiles = this.instance(this.geometries[0], this.projectileMaterial, MAX_PROJECTILES);
        this.telegraphs = this.instance(this.geometries[10], this.warningMaterial, MAX_ENEMIES);
        this.castWarnings = this.instance(this.geometries[11], this.warningMaterial, MAX_ENEMIES);
        this.chargeWarnings = this.instance(this.geometries[12], this.warningMaterial, MAX_ENEMIES);
        this.projectiles.setColorAt(0, WHITE);
        for (const warning of [this.telegraphs, this.castWarnings, this.chargeWarnings]) { warning.setColorAt(0, ENRAGED); warning.count = 0; }
        this.experience = this.instance(this.geometries[1], this.experienceMaterial, MAX_EXPERIENCE_ORBS);
        this.loot = [2, 8, 9].map(index => this.instance(this.geometries[index], this.lootMaterial, MAX_GROUND_EQUIPMENT));
        this.chests = this.instance(this.geometries[5], this.lootMaterial, MAX_COMBAT_CHUNKS);
        this.chestLids = this.instance(this.geometries[6], this.lootMaterial, MAX_COMBAT_CHUNKS);
        this.chestLocks = this.instance(this.geometries[7], this.emberMaterial, MAX_COMBAT_CHUNKS);
        for (const mesh of this.loot) { mesh.setColorAt(0, WHITE); mesh.count = 0; }
        this.chests.setColorAt(0, WHITE);
        this.chestLids.setColorAt(0, WHITE);
        this.projectiles.count = this.experience.count = 0;
        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        this.buildPlayer();
        this.root.add(this.projectiles, this.telegraphs, this.castWarnings, this.chargeWarnings, this.experience, ...this.loot, this.chests, this.chestLids, this.chestLocks, this.player);
        resources.acquireRequired("combat-render-pool", {}, true, collectObject3DResourceAllocations([this.root]));
    }

    public async initialize(host: WorldRenderLayerHost): Promise<void> {
        if (!host.surface) throw new Error("Combat rendering requires a world surface");
        if (!this.actorLoading) {
            this.actorLoading = Promise.allSettled([ActorModels.load(MAX_ENEMIES, this.viewCenter), SkillEffects.load()]).then(results => {
                const [actorResult, effectResult] = results;
                if (actorResult.status === "rejected" || effectResult.status === "rejected" || this.disposed) {
                    if (actorResult.status === "fulfilled") actorResult.value.dispose();
                    if (effectResult.status === "fulfilled") effectResult.value.dispose();
                    throw actorResult.status === "rejected" ? actorResult.reason : effectResult.status === "rejected" ? effectResult.reason : new Error("Combat layer disposed during loading");
                }
                const actors = actorResult.value, effects = effectResult.value;
                try {
                    this.resources.acquireRequired("combat-actor-models", {}, true,
                        collectObject3DResourceAllocations([actors.hero, ...actors.enemies.flat(), effects.mesh]));
                } catch (error) { actors.dispose(); effects.dispose(); throw error; }
                this.actors = actors;
                this.effects = effects;
                this.root.add(effects.mesh);
                this.playerBody.add(actors.hero);
                for (const pool of actors.enemies) this.root.add(...pool);
            }).catch(error => { this.actorLoading = undefined; throw error; });
        }
        await this.actorLoading;
        host.signal.throwIfAborted();
        this.host = host;
        this.root.scale.setScalar(host.tileSize);
        host.addObject(this.root);
    }

    public update(state: CombatRenderState, alpha: number, timestampMs: number): void {
        if (!this.host || !this.actors) return;
        const { position, enemy, vitals, action, projectile, item, ids, enemies, projectiles, experience, loot, experienceValue, status } = state.entities;
        const blend = Math.max(0, Math.min(1, alpha));
        const playerX = state.player.previousX + (state.player.x - state.player.previousX) * blend;
        const playerZ = state.player.previousZ + (state.player.z - state.player.previousZ) * blend;
        this.viewCenter.set(playerX, playerZ);
        this.player.position.set(playerX, this.height(playerX, playerZ), playerZ);
        this.playerBody.rotation.y = state.player.heading;
        this.actors.animateHero(state.player.animationTime, Math.hypot(state.player.x - state.player.previousX, state.player.z - state.player.previousZ) > .0001);
        this.playerBody.rotation.z = state.player.gameOver ? -Math.PI / 2 : 0;
        this.playerBody.visible = state.player.dashing || !state.player.invulnerable || Math.floor(timestampMs / 70) % 2 === 0;
        this.shield.visible = state.player.shieldReady || state.player.ward > 0;
        this.shield.scale.setScalar(state.player.ward > 0 ? 1.6 : 1);
        this.effects!.update(state.effects, state.player.animationTime, this.effectHeight);

        for (const pool of this.actors.enemies) for (const mesh of pool) mesh.count = 0;
        this.telegraphs.count = this.castWarnings.count = this.chargeWarnings.count = 0;
        for (let cursor = 0; cursor < enemies.count; cursor++) {
            const index = enemies.slots[cursor];
            const x = position.previousX[index] + (position.x[index] - position.previousX[index]) * blend;
            const z = position.previousZ[index] + (position.z[index] - position.previousZ[index]) * blend;
            // Render resident actors ahead of the active simulation ring, without a chunk-boundary pop.
            const homeX = enemy.homeX[index], homeZ = enemy.homeZ[index];
            const distance = Math.max(Math.hypot(x - playerX, z - playerZ) - position.radius[index] * 2,
                Math.hypot(homeX - playerX, homeZ - playerZ));
            if (actorVisibility(distance) === 0) continue;
            const rotation = position.heading[index];
            if (action.kind[index] >= ActorAction.Melee && action.progress[index] < .5) {
                const warning = action.kind[index] === ActorAction.Melee ? this.telegraphs : this.castWarnings;
                const kind = action.kind[index];
                const scale = kind === ActorAction.Melee ? action.reach[index] : kind === ActorAction.Nova ? ENEMY_SPECIAL.nova.radius : position.radius[index] + .45;
                const charge = kind === ActorAction.Charge;
                const length = ENEMY_SPECIAL.charge.speed * ENEMY_SPECIAL.charge.duration;
                const centerX = x + (charge ? Math.sin(rotation) * length / 2 : 0), centerZ = z + (charge ? Math.cos(rotation) * length / 2 : 0);
                this.dummy.position.set(centerX, this.height(centerX, centerZ) + .045, centerZ);
                this.dummy.rotation.set(0, rotation, 0);
                this.dummy.rotateX(-Math.PI / 2);
                if (charge) this.dummy.scale.set(position.radius[index] * 2, length, 1);
                else this.dummy.scale.setScalar(scale);
                this.dummy.updateMatrix();
                const mesh = charge ? this.chargeWarnings : warning, instance = mesh.count++;
                mesh.setMatrixAt(instance, this.dummy.matrix);
                mesh.setColorAt(instance, kind === ActorAction.Heal ? HEAL : ENRAGED);
            }
            this.color.copy(ENEMY_COLORS[enemy.kind[index]]);
            if (enemy.elite[index]) this.color.lerp(ELITE, .38);
            if (enemy.boss[index]) this.color.lerp(BOSS, .5);
            if (enemy.enraged[index]) this.color.lerp(ENRAGED, .6);
            if (status.slowUntil[index] > state.player.animationTime * GAME_CONFIG.timing.simulationHz) this.color.lerp(FROST, .65);
            if (vitals.hitFlash[index] > 0) this.color.setRGB(2, 2, 2);
            for (const mesh of this.actors.enemies[ENEMY_DEFINITIONS[enemy.kind[index]].model]) {
                const instance = mesh.count++;
                this.setInstance(mesh, instance, x, this.height(x, z), z, position.radius[index] / .3, rotation);
                mesh.setColorAt(instance, this.color);
                mesh.geometry.getAttribute("actorHome").setXY(instance, homeX, homeZ);
                this.actors.animateEnemy(mesh, instance, state.player.animationTime, ids[index] * .37, action.kind[index], action.progress[index]);
            }
        }
        for (const pool of this.actors.enemies) for (const mesh of pool) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor!.needsUpdate = true;
            mesh.morphTexture!.needsUpdate = true;
            mesh.geometry.getAttribute("actorHome").needsUpdate = true;
        }

        for (const warning of [this.telegraphs, this.castWarnings, this.chargeWarnings]) {
            warning.instanceMatrix.needsUpdate = warning.instanceColor!.needsUpdate = true;
        }
        this.projectiles.count = projectiles.count;
        for (let cursor = 0; cursor < projectiles.count; cursor += 1) {
            const index = projectiles.slots[cursor];
            const x = position.previousX[index] + (position.x[index] - position.previousX[index]) * blend;
            const z = position.previousZ[index] + (position.z[index] - position.previousZ[index]) * blend;
            this.setInstance(this.projectiles, cursor, x, this.height(x, z) + .42, z,
                projectile.faction[index] === Faction.Enemy ? 1.55 : projectile.critical[index] ? 1.65 : 1, 0);
            this.color.set(projectile.faction[index] === Faction.Enemy ? 0xff526f : 0xffe79a);
            this.projectiles.setColorAt(cursor, this.color);
        }
        this.projectiles.instanceMatrix.needsUpdate = true;
        this.projectiles.instanceColor!.needsUpdate = true;

        this.experience.count = experience.count;
        for (let cursor = 0; cursor < experience.count; cursor += 1) {
            const index = experience.slots[cursor];
            const x = position.previousX[index] + (position.x[index] - position.previousX[index]) * blend;
            const z = position.previousZ[index] + (position.z[index] - position.previousZ[index]) * blend;
            const bob = 0.18 + Math.sin(timestampMs * 0.004 + index * 0.71) * 0.055;
            const scale = Math.min(1.8, 0.85 + Math.log2(Math.max(1, experienceValue[index])) * 0.1);
            this.setInstance(this.experience, cursor, x, this.height(x, z) + bob, z, scale, timestampMs * 0.002);
        }
        this.experience.instanceMatrix.needsUpdate = true;

        for (const mesh of this.loot) mesh.count = 0;
        for (let cursor = 0; cursor < loot.count; cursor++) {
            const index = loot.slots[cursor];
            const x = position.x[index], z = position.z[index];
            if (Math.hypot(x - playerX, z - playerZ) > ACTOR_FADE_END + 1) continue;
            const bob = .24 + Math.sin(timestampMs * .003 + item.id[index]) * .08;
            const mesh = this.loot[item.kind[index]], instance = mesh.count++;
            this.setInstance(mesh, instance, x, this.height(x, z) + bob, z, 1, timestampMs * .0015);
            mesh.setColorAt(instance, RARITY_COLORS[item.rarity[index]]);
        }
        for (const mesh of this.loot) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor!.needsUpdate = true;
        }

        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        for (let index = 0; index < state.chests.count; index += 1) {
            const x = state.chests.x[index];
            const z = state.chests.z[index];
            if (Math.hypot(x - playerX, z - playerZ) > ACTOR_FADE_END + 1) continue;
            const instance = this.chests.count++;
            this.chestLids.count++;
            this.chestLocks.count++;
            const y = this.height(x, z);
            this.setInstance(this.chests, instance, x, y + 0.2, z, 1, 0);
            this.setInstance(this.chestLids, instance, x, y + 0.445, z, 1, 0);
            this.setInstance(this.chestLocks, instance, x, y + 0.34, z + 0.26, 1, 0);
            this.color.copy(CHEST_COLORS[state.chests.tiers[index]]);
            if (state.chests.tiers[index] === 4) this.color.setHSL((timestampMs * 0.00015 + index * 0.13) % 1, 0.85, 0.65);
            this.chests.setColorAt(instance, this.color);
            this.chestLids.setColorAt(instance, this.color);
        }
        for (const mesh of [this.chests, this.chestLids, this.chestLocks]) mesh.instanceMatrix.needsUpdate = true;
        this.chests.instanceColor!.needsUpdate = true;
        this.chestLids.instanceColor!.needsUpdate = true;
    }

    public reset(): void {
        this.projectiles.count = this.experience.count = 0;
        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        this.telegraphs.count = this.castWarnings.count = this.chargeWarnings.count = 0;
        if (this.effects) this.effects.mesh.count = 0;
        this.heightCache.clear();
        if (this.actors) for (const pool of this.actors.enemies) for (const mesh of pool) mesh.count = 0;
        for (const mesh of this.loot) mesh.count = 0;
    }

    public mountChunk(): void {}
    public unmountChunk(): void {}
    public surfaceChanged(): void { this.heightCache.clear(); }

    public unloadWorld(host: WorldRenderLayerHost): void {
        host.removeObject(this.root);
        this.host = undefined;
        this.heightCache.clear();
    }

    public dispose(): void {
        this.disposed = true;
        this.host?.removeObject(this.root);
        this.host = undefined;
        this.actors?.dispose();
        this.effects?.dispose();
        this.actorFill.dispose();
        for (const mesh of [this.projectiles, this.telegraphs, this.castWarnings, this.chargeWarnings, this.experience, ...this.loot, this.chests, this.chestLids, this.chestLocks]) mesh.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of [
            this.projectileMaterial,
            this.warningMaterial,
            this.experienceMaterial,
            this.lootMaterial,
            this.emberMaterial,
            this.auraMaterial,
            this.shadowMaterial
        ]) material.dispose();
        this.resources.dispose();
    }

    private instance(geometry: ConstructorParameters<typeof InstancedMesh>[0], material: ConstructorParameters<typeof InstancedMesh>[1], count: number): InstancedMesh {
        const mesh = new InstancedMesh(geometry, material, count);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        return mesh;
    }

    private buildPlayer(): void {
        const aura = new Mesh(this.geometries[3], this.auraMaterial);
        aura.position.y = 0.035;
        aura.rotation.x = -Math.PI / 2;
        this.shield.add(aura);
        const shadow = new Mesh(this.geometries[4], this.shadowMaterial);
        shadow.position.y = 0.02;
        shadow.rotation.x = -Math.PI / 2;
        this.player.add(shadow, this.shield, this.playerBody);
    }

    private setInstance(mesh: InstancedMesh, index: number, x: number, y: number, z: number, scale: number, rotation: number): void {
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(0, rotation, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
    }

    private height(x: number, z: number): number {
        const host = this.host!;
        const tile = groundTile({ x, z });
        const key = `${tile.x},${tile.y}`;
        const cached = this.heightCache.get(key);
        if (cached !== undefined) return cached;
        if (this.heightCache.size >= 4096) this.heightCache.clear();
        const height = host.surface!.getTileCenterHeight(tile.x, tile.y) / host.tileSize + 0.025;
        this.heightCache.set(key, height);
        return height;
    }
}

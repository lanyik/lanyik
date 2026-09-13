import {
    CircleGeometry,
    Color,
    DoubleSide,
    DirectionalLight,
    DynamicDrawUsage,
    Group,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    OctahedronGeometry,
    PlaneGeometry,
    RingGeometry,
    SphereGeometry,
    Vector2,
    Vector3
} from "three";
import type { BufferAttribute } from "three";
import {
    collectObject3DResourceAllocations,
    GroundProjection,
    type ResourceBudgetAccount,
    type WorldRenderLayer,
    type WorldRenderLayerHost
} from "three-hex-map";
import type { CombatRenderState } from "../core/CombatState";
import { MAX_ENEMIES, MAX_EXPERIENCE_ORBS, MAX_PROJECTILES, MELEE_HALF_ARC } from "../core/GameConfig";
import { CHEST_TIERS, CHEST_RULES } from "../core/RegionalWorld";
import { GroundItemKind } from "../core/InventoryItem";
import { LootModels } from "./LootModels";
import { LootEffects } from "./LootEffects";
import { ChestGrounding } from "./ChestGrounding";
import { GAME_CONFIG } from "../core/GameConfig";
import { RARITIES } from "../core/Loot";

import { ActorAction, Faction } from "../core/CombatWorld";
import { ActorModels } from "./ActorModels";
import { SkillEffects } from "./SkillEffects";
import { EnemyPresentation } from "./EnemyPresentation";
import { BoundaryMist } from "./BoundaryMist";
import { ENEMY_DEFINITIONS, ENEMY_SPECIAL } from "../core/EnemyDefinitions";
import { ACTOR_FADE_END, actorVisibility } from "./ActorVisibility";
const RARITY_COLORS = RARITIES.map(rarity => new Color(GAME_CONFIG.quality[rarity].color));
const CHEST_COLORS = [new Color(0xb87838), new Color(0xd7e0ed), new Color(0xffc34b), new Color(0x70f5ed), new Color(0xff79dc)] as const;
const WHITE = new Color(0xffffff);
const ELITE = new Color(0xffc857);
const BOSS = new Color(0xa922ee);
const ENEMY_COLORS = ENEMY_DEFINITIONS.map(definition => new Color(definition.tint));
const FROST = new Color(0x72dcff);
const ENRAGED = new Color(0xff526f);
const HEAL = new Color(0x8bffbb);
const HEX_CORNERS = Array.from({ length: 6 }, (_, corner) => ({ x: Math.cos(corner * Math.PI / 3), z: Math.sin(corner * Math.PI / 3) }));

/** Upload the visible prefix; fixed pool capacity is not the amount changed this frame. */
export function uploadCombatInstances(mesh: InstancedMesh): void {
    const home = mesh.geometry.getAttribute("actorHome") as BufferAttribute | undefined;
    for (const attribute of [mesh.instanceMatrix, mesh.instanceColor, home]) {
        if (!attribute) continue;
        attribute.clearUpdateRanges();
        if (mesh.count) { attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true; }
    }
    // Three's texture update ranges only support RGBA rows; morph weights use RedFormat.
    if (mesh.morphTexture && mesh.count) mesh.morphTexture.needsUpdate = true;
}

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
    public readonly groundProjection = new GroundProjection(GAME_CONFIG.presentation.groundProjection.span, GAME_CONFIG.presentation.groundProjection.resolution);
    private readonly groundPlayer = new Group();
    private readonly root = new Group();
    private readonly player = new Group();
    private readonly playerBody = new Group();
    private readonly shield = new Group();
    private actors: ActorModels | undefined;
    private effects: SkillEffects | undefined;
    private readonly mist = new BoundaryMist();
    private actorLoading: Promise<void> | undefined;
    private assetAbort: AbortController | undefined;
    private disposed = false;
    private readonly projectiles: InstancedMesh;
    private readonly enemyEffects = new EnemyPresentation();
    private readonly hand = new Vector3();
    private presentationTime = -1;
    private readonly experience: InstancedMesh;
    private readonly telegraphs: InstancedMesh;
    private readonly chargeWarnings: InstancedMesh;
    private lootModels: LootModels | undefined;
    private chestGrounding: ChestGrounding | undefined;
    private readonly lootEffects = new LootEffects();
    private readonly geometries = {
        projectile: new SphereGeometry(0.09, 8, 6),
        experience: new OctahedronGeometry(0.11, 0),
        shield: new RingGeometry(0.42, 0.49, 32),
        shadow: new CircleGeometry(0.34, 24),
        telegraph: new CircleGeometry(1, 32, -Math.PI / 2 - MELEE_HALF_ARC, MELEE_HALF_ARC * 2),
        charge: new PlaneGeometry(1, 1)
    } as const;
    private readonly projectileMaterial = new MeshBasicMaterial({ color: 0xffffff });
    private readonly warningMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28, depthWrite: false, depthTest: false, side: DoubleSide });
    private readonly experienceMaterial = new MeshBasicMaterial({ color: 0x66f5ff });
    private readonly auraMaterial = new MeshBasicMaterial({ color: 0x70ecff, transparent: true, opacity: 0.48, side: DoubleSide, depthWrite: false });
    private readonly shadowMaterial = new MeshBasicMaterial({ color: 0x06090b, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false });
    private readonly dummy = new Object3D();
    private readonly color = new Color();
    private readonly viewCenter = new Vector2();
    private readonly renderOrigin = new Vector2();
    private readonly actorFill = new DirectionalLight(0xe2ebdf, 1.6);
    private readonly heightCache = new Map<string, Float64Array>();
    private host: WorldRenderLayerHost | undefined;
    private readonly effectHeight = (x: number, z: number) => this.height(x, z);

    constructor(private readonly resources: ResourceBudgetAccount) {
        this.root.name = "survivor-combat";
        // Soft light from the fixed camera direction keeps dark leather and faces readable.
        this.actorFill.position.set(-6, 9, 7);
        this.root.add(this.actorFill, this.actorFill.target);
        this.projectiles = this.instance(this.geometries.projectile, this.projectileMaterial, MAX_PROJECTILES);
        this.telegraphs = this.instance(this.geometries.telegraph, this.warningMaterial, MAX_ENEMIES);
        this.chargeWarnings = this.instance(this.geometries.charge, this.warningMaterial, MAX_ENEMIES);
        this.projectiles.setColorAt(0, WHITE);
        for (const warning of [this.telegraphs, this.chargeWarnings]) { warning.setColorAt(0, ENRAGED); warning.count = 0; }
        this.experience = this.instance(this.geometries.experience, this.experienceMaterial, MAX_EXPERIENCE_ORBS);
        this.projectiles.count = this.experience.count = 0;
        this.buildPlayer();
        this.groundProjection.root.add(this.enemyEffects.warnings, this.telegraphs, this.chargeWarnings, this.groundPlayer, this.lootEffects.halo);
        this.root.add(this.enemyEffects.root, this.projectiles, this.experience, this.lootEffects.beam, this.player, this.mist.mesh);
        try { resources.acquireRequired("combat-render-pool", {}, true, [
            ...collectObject3DResourceAllocations([this.root, this.groundProjection.root]),
            { identity: this.groundProjection.target.texture, cost: {
                gpuBytes: this.groundProjection.target.width * this.groundProjection.target.height * 4,
                textureBytes: this.groundProjection.target.width * this.groundProjection.target.height * 4 } }
        ]); } catch (error) { this.dispose(); throw error; }
    }

    public async initialize(host: WorldRenderLayerHost): Promise<void> {
        if (!host.surface) throw new Error("Combat rendering requires a world surface");
        if (!this.actorLoading || this.assetAbort?.signal.aborted) {
            const controller = new AbortController();
            const abort = () => controller.abort(host.signal.reason);
            this.assetAbort = controller;
            if (host.signal.aborted) abort();
            else host.signal.addEventListener("abort", abort, { once: true });
            const reject = (error: unknown): never => { controller.abort(error); throw error; };
            const pending = Promise.allSettled([
                ActorModels.load(MAX_ENEMIES, this.viewCenter, controller.signal).catch(reject),
                SkillEffects.load(controller.signal).catch(reject),
                LootModels.load(this.viewCenter, controller.signal).catch(reject)
            ]).then(results => {
                const [actorResult, effectResult, lootResult] = results;
                if (actorResult.status === "rejected" || effectResult.status === "rejected" || lootResult.status === "rejected" || this.disposed || controller.signal.aborted) {
                    if (actorResult.status === "fulfilled") actorResult.value.dispose();
                    if (effectResult.status === "fulfilled") effectResult.value.dispose();
                    if (lootResult.status === "fulfilled") lootResult.value.dispose();
                    throw actorResult.status === "rejected" ? actorResult.reason : effectResult.status === "rejected" ? effectResult.reason : lootResult.status === "rejected" ? lootResult.reason : controller.signal.reason;
                }
                const actors = actorResult.value, effects = effectResult.value, models = lootResult.value;
                try {
                    this.resources.acquireRequired("combat-actor-models", {}, true, [
                        ...collectObject3DResourceAllocations([actors.hero, ...actors.enemies.flat(), effects.mesh, effects.ground, effects.ward, models.root]),
                        ...actors.poseBuffers.map(array => ({ identity: array.buffer, cost: { cpuBytes: array.byteLength } }))
                    ]);
                } catch (error) { actors.dispose(); effects.dispose(); models.dispose(); throw error; }
                this.actors = actors;
                this.effects = effects;
                this.lootModels = models;
                this.chestGrounding = new ChestGrounding(models.chest.geometry, this.effectHeight);
                this.root.add(models.root);
                this.root.add(effects.mesh, effects.ward);
                this.groundProjection.root.add(effects.ground);
                this.playerBody.add(actors.hero);
                for (const pool of actors.enemies) this.root.add(...pool);
            }).catch(error => { if (this.actorLoading === pending) this.actorLoading = undefined; throw error; })
                .finally(() => {
                    host.signal.removeEventListener("abort", abort);
                    if (this.assetAbort === controller) this.assetAbort = undefined;
                });
            this.actorLoading = pending;
        }
        await this.actorLoading;
        host.signal.throwIfAborted();
        this.host = host;
        this.root.scale.setScalar(host.tileSize);
        host.addObject(this.root);
    }

    public update(state: CombatRenderState, alpha: number, timestampMs: number): void {
        if (!this.host || !this.actors || !this.lootModels) return;
        this.root.visible = this.groundProjection.root.visible = true;
        const { position, enemy, vitals, action, projectile, item, ids, enemies, projectiles, experience, loot, experienceValue, status } = state.entities;
        const blend = Math.max(0, Math.min(1, alpha));
        const playerX = state.player.previousX + (state.player.x - state.player.previousX) * blend;
        const playerZ = state.player.previousZ + (state.player.z - state.player.previousZ) * blend;
        this.renderOrigin.set(playerX, playerZ);
        this.root.position.set(playerX * this.host.tileSize, 0, playerZ * this.host.tileSize);
        this.player.position.set(0, this.height(playerX, playerZ), 0);
        this.groundPlayer.position.set(0, 0, 0);
        this.groundProjection.setCenter(playerX, playerZ, this.host.tileSize);
        const dt = this.presentationTime < 0 ? 1 : Math.max(0, state.player.animationTime - this.presentationTime);
        this.presentationTime = state.player.animationTime;
        const turn = state.player.heading - this.playerBody.rotation.y;
        this.playerBody.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-24 * dt));
        this.actors.animateHero(state.player.animationTime, Math.hypot(state.player.x - state.player.previousX, state.player.z - state.player.previousZ) > .0001);
        this.playerBody.rotation.z = state.player.gameOver ? -Math.PI / 2 : 0;
        this.playerBody.visible = state.player.dashing || !state.player.invulnerable || Math.floor(timestampMs / 70) % 2 === 0;
        this.shield.visible = state.player.shieldReady || state.player.ward > 0;
        this.shield.scale.setScalar(state.player.ward > 0 ? 1.6 : 1);
        this.effects!.update(state.effects, state.player.animationTime, this.effectHeight, playerX, playerZ, state.player.ward);
        this.enemyEffects.begin(state.effects, state.player.animationTime, this.effectHeight, playerX, playerZ);
        this.mist.update(0, this.player.position.y, 0, state.player.animationTime, playerX, playerZ);

        for (const pool of this.actors.enemies) for (const mesh of pool) mesh.count = 0;
        this.telegraphs.count = this.chargeWarnings.count = 0;
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
            this.enemyEffects.actor(action.kind[index], action.progress[index], x, z, this.height(x, z), rotation,
                action.targetX[index], action.targetZ[index], status.wardUntil[index] > state.player.animationTime * GAME_CONFIG.timing.simulationHz);
            if ((action.kind[index] === ActorAction.Melee || action.kind[index] === ActorAction.Charge) && action.progress[index] < .5) {
                const charge = action.kind[index] === ActorAction.Charge, length = ENEMY_SPECIAL.charge.speed * ENEMY_SPECIAL.charge.duration;
                this.dummy.position.set(x - playerX + (charge ? Math.sin(rotation) * length / 2 : 0), 0,
                    z - playerZ + (charge ? Math.cos(rotation) * length / 2 : 0));
                this.dummy.rotation.set(0, rotation, 0); this.dummy.rotateX(-Math.PI / 2);
                if (charge) this.dummy.scale.set(position.radius[index] * 2, length, 1); else this.dummy.scale.setScalar(action.reach[index]);
                this.dummy.updateMatrix(); const mesh = charge ? this.chargeWarnings : this.telegraphs, instance = mesh.count++;
                mesh.setMatrixAt(instance, this.dummy.matrix); mesh.setColorAt(instance, ENRAGED);
            }
            this.color.copy(ENEMY_COLORS[enemy.kind[index]]);
            if (enemy.elite[index]) this.color.lerp(ELITE, .38);
            if (enemy.boss[index]) this.color.lerp(BOSS, .5);
            if (enemy.enraged[index]) this.color.lerp(ENRAGED, .6);
            if (status.slowUntil[index] > state.player.animationTime * GAME_CONFIG.timing.simulationHz) this.color.lerp(FROST, .65);
            if (status.wardUntil[index] > state.player.animationTime * GAME_CONFIG.timing.simulationHz) this.color.lerp(HEAL, .45);
            if (vitals.hitFlash[index] > 0) this.color.setRGB(2, 2, 2);
            for (const mesh of this.actors.enemies[ENEMY_DEFINITIONS[enemy.kind[index]].model]) {
                const instance = mesh.count++;
                this.setInstance(mesh, instance, x, this.height(x, z), z, position.radius[index] / .3, rotation);
                mesh.setColorAt(instance, this.color);
                mesh.geometry.getAttribute("actorHome").setXY(instance, homeX - playerX, homeZ - playerZ);
                this.actors.animateEnemy(mesh, instance, index, ids[index], state.player.animationTime, action.kind[index], action.progress[index]);
                if (action.kind[index] >= ActorAction.Cast && action.kind[index] !== ActorAction.Charge
                    && action.progress[index] < .5 && this.actors.castingHand(mesh, this.hand)) {
                    const scale = position.radius[index] / .3, sin = Math.sin(rotation), cos = Math.cos(rotation);
                    const hx = x + (this.hand.x * cos + this.hand.z * sin) * scale;
                    const hz = z + (this.hand.z * cos - this.hand.x * sin) * scale;
                    this.enemyEffects.hand(action.kind[index], action.progress[index], hx, this.height(x, z) + this.hand.y * scale, hz,
                        action.targetX[index], action.targetZ[index], rotation, this.effectHeight);
                }
            }
        }
        for (const pool of this.actors.enemies) for (const mesh of pool) uploadCombatInstances(mesh);

        for (const warning of [this.telegraphs, this.chargeWarnings]) {
            uploadCombatInstances(warning);
        }
        this.projectiles.count = 0;
        for (let cursor = 0; cursor < projectiles.count; cursor += 1) {
            const index = projectiles.slots[cursor];
            const x = position.previousX[index] + (position.x[index] - position.previousX[index]) * blend;
            const z = position.previousZ[index] + (position.z[index] - position.previousZ[index]) * blend;
            const flight = Math.min(1, Math.max(0, projectile.age[index] - (1 - blend) / GAME_CONFIG.timing.simulationHz) / .45);
            const launchY = this.height(projectile.groundX[index], projectile.groundZ[index]) + projectile.launchHeight[index];
            const elevation = launchY * (1 - flight) + (this.height(x, z) + .42) * flight;
            if (projectile.faction[index] === Faction.Enemy) this.enemyEffects.projectile(x, elevation, z, position.heading[index], projectile.age[index]);
            else {
                const instance = this.projectiles.count++;
                this.setInstance(this.projectiles, instance, x, elevation, z, projectile.critical[index] ? 1.65 : 1, 0);
                this.color.set(0xffe79a); this.projectiles.setColorAt(instance, this.color);
            }
        }
        uploadCombatInstances(this.projectiles); this.enemyEffects.upload();

        this.experience.count = experience.count;
        for (let cursor = 0; cursor < experience.count; cursor += 1) {
            const index = experience.slots[cursor];
            const x = position.previousX[index] + (position.x[index] - position.previousX[index]) * blend;
            const z = position.previousZ[index] + (position.z[index] - position.previousZ[index]) * blend;
            const bob = 0.18 + Math.sin(timestampMs * 0.004 + index * 0.71) * 0.055;
            const scale = Math.min(1.8, 0.85 + Math.log2(Math.max(1, experienceValue[index])) * 0.1);
            this.setInstance(this.experience, cursor, x, this.height(x, z) + bob, z, scale, timestampMs * 0.002);
        }
        uploadCombatInstances(this.experience);

        this.lootModels.reset();
        this.lootEffects.begin(state.player.animationTime);
        for (let cursor = 0; cursor < loot.count; cursor++) {
            const index = loot.slots[cursor];
            const x = position.previousX[index] + (position.x[index] - position.previousX[index]) * blend;
            const z = position.previousZ[index] + (position.z[index] - position.previousZ[index]) * blend;
            if (Math.hypot(x - playerX, z - playerZ) > ACTOR_FADE_END + 1) continue;
            const kind = item.kind[index], quality = item.rarity[index], y = this.height(x, z);
            const bob = .16 + Math.sin(state.player.animationTime * 3. + item.id[index]) * .06;
            const mesh = this.lootModels.loot[kind], instance = mesh.count++;
            this.setInstance(mesh, instance, x, y + bob, z, kind === GroundItemKind.HealthEssence || kind === GroundItemKind.ManaEssence ? 1.25 : 1, state.player.animationTime * 1.2);
            if (kind === GroundItemKind.Health || kind === GroundItemKind.HealthEssence) this.color.set(0xff9aa8);
            else if (kind === GroundItemKind.Mana || kind === GroundItemKind.ManaEssence) this.color.set(0x83baff);
            else this.color.copy(RARITY_COLORS[quality]);
            if (quality === 5) this.color.setHSL((state.player.animationTime * .15 + item.id[index] * .13) % 1, .8, .68);
            mesh.setColorAt(instance, this.color);
            this.lootEffects.add(x - playerX, y, z - playerZ, quality, item.id[index]);
        }
        for (const mesh of this.lootModels.loot) uploadCombatInstances(mesh);
        const chestMesh = this.lootModels.chest;
        for (let index = 0; index < state.chests.count; index++) {
            const x = state.chests.x[index], z = state.chests.z[index], tier = state.chests.tiers[index];
            if (Math.hypot(x - playerX, z - playerZ) > ACTOR_FADE_END + 1) continue;
            const instance = chestMesh.count++, y = this.height(x, z);
            this.dummy.matrix.copy(this.chestGrounding!.at(x, z));
            this.dummy.matrix.elements[12] -= playerX; this.dummy.matrix.elements[14] -= playerZ;
            chestMesh.setMatrixAt(instance, this.dummy.matrix);
            this.color.copy(CHEST_COLORS[tier]);
            if (tier === 4) this.color.setHSL((state.player.animationTime * .15 + index * .13) % 1, .8, .68);
            chestMesh.setColorAt(instance, this.color);
            this.lootEffects.add(x - playerX, y, z - playerZ, RARITIES.indexOf(CHEST_RULES[CHEST_TIERS[tier]].rarity), index, true);
        }
        uploadCombatInstances(chestMesh); this.lootEffects.upload();
    }

    public reset(): void {
        this.actors?.reset(); this.presentationTime = -1; this.enemyEffects.reset();
        this.root.visible = this.groundProjection.root.visible = false;
        this.projectiles.count = this.experience.count = 0;
        this.telegraphs.count = this.chargeWarnings.count = 0;
        this.effects?.reset();
        this.heightCache.clear();
        this.chestGrounding?.clear();
        if (this.actors) for (const pool of this.actors.enemies) for (const mesh of pool) mesh.count = 0;
        this.lootModels?.reset();
        this.lootEffects.reset();
    }

    public mountChunk(): void { this.surfaceChanged(); }
    public unmountChunk(): void { this.surfaceChanged(); }
    public surfaceChanged(): void { this.heightCache.clear(); this.chestGrounding?.clear(); }

    public unloadWorld(host: WorldRenderLayerHost): void {
        host.removeObject(this.root);
        this.host = undefined;
        this.heightCache.clear();
        this.chestGrounding?.clear();
    }

    public dispose(): void {
        this.disposed = true;
        this.assetAbort?.abort(new DOMException("Combat layer closed", "AbortError"));
        this.host?.removeObject(this.root);
        this.host = undefined;
        this.actors?.dispose();
        this.effects?.dispose(); this.enemyEffects.dispose();
        this.lootModels?.dispose();
        this.lootEffects.dispose();
        this.groundProjection.dispose();
        this.mist.dispose();
        this.actorFill.dispose();
        for (const mesh of [this.projectiles, this.telegraphs, this.chargeWarnings, this.experience]) mesh.dispose();
        for (const geometry of Object.values(this.geometries)) geometry.dispose();
        for (const material of [
            this.projectileMaterial,
            this.warningMaterial,
            this.experienceMaterial,
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
        const aura = new Mesh(this.geometries.shield, this.auraMaterial);
        aura.position.y = 0;
        aura.rotation.x = -Math.PI / 2;
        this.shield.add(aura);
        const shadow = new Mesh(this.geometries.shadow, this.shadowMaterial);
        shadow.position.y = 0;
        shadow.rotation.x = -Math.PI / 2;
        this.groundPlayer.add(shadow, this.shield);
        this.player.add(this.playerBody);
    }

    private setInstance(mesh: InstancedMesh, index: number, x: number, y: number, z: number, scale: number, rotation: number): void {
        this.dummy.position.set(x - this.renderOrigin.x, y, z - this.renderOrigin.y);
        this.dummy.rotation.set(0, rotation, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
    }

    private height(x: number, z: number): number {
        const host = this.host!;
        const tile = groundTile({ x, z });
        const key = `${tile.x},${tile.y}`;
        let heights = this.heightCache.get(key);
        const cx = tile.x * 1.5, cz = Math.sqrt(3) * (tile.y + (tile.x % 2 === 0 ? .5 : 0));
        if (!heights) {
            if (this.heightCache.size >= 4096) this.heightCache.clear();
            heights = new Float64Array(7);
            for (let corner = 0; corner < 6; corner++) {
                const offset = HEX_CORNERS[corner];
                heights[corner] = host.surface!.getWorldHeight((cx + offset.x) * host.tileSize,
                    (cz + offset.z) * host.tileSize) / host.tileSize;
                heights[6] += heights[corner] / 6;
            }
            this.heightCache.set(key, heights);
        }
        const lx = x - cx, lz = z - cz;
        const angle = (Math.atan2(lz, lx) + Math.PI * 2) % (Math.PI * 2);
        const corner = Math.min(5, Math.floor(angle / (Math.PI / 3))), next = (corner + 1) % 6;
        const a = HEX_CORNERS[corner], b = HEX_CORNERS[next];
        const wa = (lx * b.z - lz * b.x) / (Math.sqrt(3) / 2);
        const wb = (a.x * lz - a.z * lx) / (Math.sqrt(3) / 2);
        return Math.max(0, heights[6] * (1 - wa - wb) + heights[corner] * wa + heights[next] * wb) * 1.015 + .025;
    }
}

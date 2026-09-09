import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Vector3 } from "three";
import { actorPoser, disposeActorSource, loadActorSource, sourceReader } from "../../scripts/lib/actor-source.mjs";

const directory = fileURLToPath(new URL("../../apps/survivor/assets/actors/", import.meta.url));

describe("survivor actor source and retargeting contracts", () => {
    let read, animation, creature;
    beforeAll(async () => {
        read = await sourceReader(directory);
        animation = await loadActorSource(read, "animation/UAL1_Standard.glb");
        creature = await loadActorSource(read, "bestiary/Puglin.glb");
    });
    afterAll(() => {
        if (animation) disposeActorSource(animation);
        if (creature) disposeActorSource(creature);
    });

    it("can rebuild from every registered source byte and rejects unregistered inputs", async () => {
        const entries = JSON.parse(await readFile(new URL("../../apps/survivor/assets/actors/sources.json", import.meta.url), "utf8"));
        for (const entry of entries) expect((await read(entry.file)).length).toBe(entry.bytes);
        await expect(read("unregistered.glb")).rejects.toThrow("Unregistered actor source");
    });

    it("moves the actual creature without stretching its limbs or importing root travel", () => {
        const bones = creature.meshes[0].skeleton.bones;
        const rest = new Map(bones.map(bone => [bone.name, bone.position.clone()]));
        const hip = creature.scene.getObjectByName("pelvis");
        const origin = hip.getWorldPosition(new Vector3());
        const leg = creature.scene.getObjectByName("calf_l");
        const poser = actorPoser(animation, [creature]);
        try {
            poser.pose("Walk_Loop", .1);
            const first = leg.getWorldQuaternion(leg.quaternion.clone());
            poser.pose("Walk_Loop", .7);
            expect(first.angleTo(leg.getWorldQuaternion(first.clone()))).toBeGreaterThan(.1);
            for (const bone of bones) {
                expect(bone.position.toArray().every(Number.isFinite)).toBe(true);
                expect(bone.quaternion.toArray().every(Number.isFinite)).toBe(true);
                if (bone.name !== "pelvis") expect(bone.position.distanceTo(rest.get(bone.name))).toBeLessThan(1e-7);
            }
            const moved = hip.getWorldPosition(new Vector3());
            expect(moved.x).toBeCloseTo(origin.x, 6);
            expect(moved.z).toBeCloseTo(origin.z, 6);
            poser.pose("Idle_Loop", 0);
            const idle = leg.quaternion.clone();
            poser.pose("Walk_Loop", .4);
            poser.pose("Idle_Loop", 0);
            expect(leg.quaternion.angleTo(idle)).toBeLessThan(1e-6);
            expect(() => poser.pose("Unknown_Action", 0)).toThrow("Missing animation");
        } finally { poser.dispose(); }
    });

    it.each([
        ["Puglin", "Punch_Cross"], ["Imp", "Punch_Jab"],
        ["Puglin", "Sword_Attack"], ["Imp", "Spell_Simple_Shoot"]
    ])("samples %s %s through its true final frame without looping or stretching", async (model, name) => {
        const target = await loadActorSource(read, `bestiary/${model}.glb`);
        const bones = target.meshes[0].skeleton.bones;
        const positions = bones.map(bone => bone.position.clone());
        const poser = actorPoser(animation, [target]);
        try {
            const duration = animation.animations.find(clip => clip.name === name).duration;
            poser.pose(name, 0);
            const start = bones.map(bone => bone.quaternion.clone());
            poser.pose(name, duration / 2);
            expect(bones.some((bone, i) => bone.quaternion.angleTo(start[i]) > .1)).toBe(true);
            poser.pose(name, duration - 1e-6);
            const end = bones.map(bone => bone.quaternion.clone());
            poser.pose(name, duration);
            for (const [i, bone] of bones.entries()) {
                expect(bone.quaternion.angleTo(end[i])).toBeLessThan(.001);
                if (bone.name !== "pelvis") expect(bone.position.distanceTo(positions[i])).toBeLessThan(1e-7);
            }
        } finally { poser.dispose(); disposeActorSource(target); }
    });

    it("rejects an unmapped target bone instead of silently leaving a broken limb", () => {
        const bone = creature.scene.getObjectByName("calf_l");
        bone.name = "missing_bone";
        try { expect(() => actorPoser(animation, [creature])).toThrow("missing_bone"); }
        finally { bone.name = "calf_l"; }
    });
});

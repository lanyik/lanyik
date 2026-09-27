import { afterEach, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { Bone, Mesh, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HeroAnimation } from "../src/presentation/HeroAnimation";
import { PlayerFeedback } from "../src/core/PlayerFeedback";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
async function fixture() {
    const bytes = await readFile(new URL("../.assets/actors/Ranger.glb", import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const mesh = gltf.scene.getObjectByName("Ranger") as SkinnedMesh;
    const animation = new HeroAnimation(gltf.scene, mesh, gltf.animations);
    cleanups.push(() => { mesh.skeleton.dispose(); gltf.scene.traverse(node => { if (node instanceof Mesh) {
        node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    } }); });
    const player = { feedback: new PlayerFeedback(), animationTime: 0, entitySlot: 0, x: 0, z: .03, previousX: 0, previousZ: 0,
        heading: 0, healthRatio: 1, invulnerable: false, shieldReady: false, ward: 0, dashing: false, gameOver: false };
    const bone = (name: string) => gltf.scene.getObjectByName(`hero0_${name}`) as Bone;
    const draw = (seconds: number) => { player.animationTime = seconds; animation.write(player, seconds * 1000, true, false); };
    return { mesh, animation, player, bone, draw, root: gltf.scene, clips: gltf.animations };
}

test("real skeletal masks keep moving legs identical while the hands attack, including interrupted blends", async () => {
    const walking = await fixture(), attacking = await fixture();
    walking.draw(0); attacking.draw(0);
    attacking.player.feedback.attackTick = 0; attacking.player.feedback.attackDuration = 1;
    walking.draw(.1); attacking.draw(.1);
    walking.draw(.3); attacking.draw(.3);
    for (const name of ["pelvis", "thigh_l", "calf_l", "foot_r"]) {
        expect(attacking.bone(name).quaternion.angleTo(walking.bone(name).quaternion)).toBeLessThan(.001);
        expect(attacking.bone(name).position.distanceTo(walking.bone(name).position)).toBeLessThan(1e-6);
    }
    expect(attacking.bone("hand_l").quaternion.angleTo(walking.bone("hand_l").quaternion)).toBeGreaterThan(.05);
    const before = attacking.bone("upperarm_l").quaternion.clone();
    attacking.player.feedback.castPhase = 1; attacking.player.feedback.castProgress = .8; attacking.draw(.3);
    expect(attacking.bone("upperarm_l").quaternion.angleTo(before)).toBeLessThan(.001);
    attacking.player.animationTime = 1;
    attacking.animation.write(attacking.player, 1000, true, true);
    expect(attacking.bone("upperarm_l").quaternion.angleTo(before)).toBeLessThan(.001);
});

test("locked casts own the legs and releasing that lock restores the walking layer", async () => {
    const walking = await fixture(), casting = await fixture();
    casting.player.feedback.castPhase = 2; casting.player.feedback.castLocksMovement = true;
    walking.draw(0); casting.draw(0); walking.draw(.2); casting.draw(.2);
    expect(casting.bone("thigh_l").quaternion.angleTo(walking.bone("thigh_l").quaternion)).toBeGreaterThan(.05);
    casting.player.feedback.castLocksMovement = false; casting.player.feedback.castPhase = 3; casting.player.feedback.castProgress = .8;
    walking.draw(.3); casting.draw(.3); walking.draw(.5); casting.draw(.5);
    expect(casting.bone("thigh_l").quaternion.angleTo(walking.bone("thigh_l").quaternion)).toBeLessThan(.001);
});

test("re-evaluating a side aim never accumulates spine twist into the base pose", async () => {
    const { player, bone, draw } = await fixture();
    player.feedback.attackTick = 0; player.feedback.attackDuration = 1; player.feedback.attackHeading = Math.PI / 2;
    draw(0); draw(.2);
    const bones = ["spine_01", "spine_02", "spine_03", "neck_01", "upperarm_l"].map(bone);
    const pose = bones.map(bone => bone.quaternion.clone());
    for (let frame = 0; frame < 10; frame++) draw(.2);
    for (const [index, bone] of bones.entries()) expect(bone.quaternion.angleTo(pose[index])).toBeLessThan(.001);
});

test("an incomplete exported bone track is rejected before the character can be displayed", async () => {
    const { root, mesh, clips } = await fixture();
    const malformed = clips.map(clip => clip.clone());
    malformed[0].tracks = malformed[0].tracks.filter(track => track.name !== "hero1_spine_02.position");
    expect(() => new HeroAnimation(root, mesh, malformed)).toThrow("incomplete animation layer");
});

test("the normalized skin stands at 1.6m and death reaches the ground without looping", async () => {
    const { mesh, animation, player, draw } = await fixture(); player.z = 0; draw(0);
    const height = () => {
        const vertex = new Vector3(); let maximum = -Infinity, minimum = Infinity;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
            maximum = Math.max(maximum, vertex.y); minimum = Math.min(minimum, vertex.y);
        }
        return { maximum, minimum };
    };
    expect(height().maximum).toBeCloseTo(1.6, 1);
    player.gameOver = true; animation.write(player, 100, true, false); animation.write(player, 3100, true, false);
    const dead = height(); expect(dead.maximum).toBeLessThan(.96); expect(dead.minimum).toBeGreaterThan(-.2);
    animation.write(player, 8000, true, false); expect(height()).toEqual(dead);
    expect(mesh.skeleton.boneTexture).not.toBeNull();
    expect(animation.buffers.every(buffer => buffer.byteLength > 0)).toBe(true);
});

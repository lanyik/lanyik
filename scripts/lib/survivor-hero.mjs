import { AnimationClip, Float32BufferAttribute, Group, Matrix4, QuaternionKeyframeTrack, Skeleton,
    SkinnedMesh, Uint16BufferAttribute, VectorKeyframeTrack } from "three";

/** Keep the single player rig; enemy crowds continue to use baked morph poses. */
export function prepareHeroRig(rigs, parts, geometry, material, animation, poser, scale, floor) {
    const bones = [], inverses = [], groups = [], positions = [], normals = [], skinIndices = [], skinWeights = [];
    for (const [index, rig] of rigs.entries()) {
        const skeleton = rig.meshes[0].skeleton;
        const spine = rig.scene.getObjectByName("spine_01");
        if (!spine?.isBone) throw new Error("Ranger: missing upper-body root");
        groups.push({ prefix: `hero${index}_`, bones: skeleton.bones, spine });
        bones.push(...skeleton.bones); inverses.push(...skeleton.boneInverses.map(matrix => matrix.clone()));
    }
    const indices = new Map(bones.map((bone, index) => [bone, index]));
    const identity = new Matrix4();
    for (const { mesh, selected } of parts) {
        // These authored inputs use world-space bind vertices. Reject a changed export contract.
        if (!mesh.matrixWorld.equals(identity) || !mesh.bindMatrix.equals(identity)) throw new Error("Ranger: unsupported bind transform");
        const attributes = mesh.geometry.attributes;
        for (const index of selected) {
            for (let axis = 0; axis < 3; axis++) {
                positions.push(attributes.position.getComponent(index, axis));
                normals.push(attributes.normal.getComponent(index, axis));
            }
            for (let axis = 0; axis < 4; axis++) {
                const bone = indices.get(mesh.skeleton.bones[attributes.skinIndex.getComponent(index, axis)]);
                if (bone === undefined) throw new Error("Ranger: unregistered skin bone");
                skinIndices.push(bone); skinWeights.push(attributes.skinWeight.getComponent(index, axis));
            }
        }
    }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));
    const sequences = {
        move: ["Jog_Fwd_Loop", true], attack: ["Spell_Simple_Shoot", false], windup: ["Spell_Simple_Enter", false],
        channel: ["Spell_Simple_Idle_Loop", true], recovery: ["Spell_Simple_Exit", false],
        hurt: ["Hit_Chest", false], death: ["Death01", false], idle: ["Idle_Loop", true]
    };
    const clips = [], specs = {};
    for (const [name, [sourceName, loop]] of Object.entries(sequences)) {
        const source = animation.animations.find(clip => clip.name === sourceName);
        if (!source) throw new Error(`Ranger: missing ${sourceName}`);
        const count = Math.ceil(source.duration * 30), times = [], rotations = bones.map(() => []), translations = bones.map(() => []);
        for (let frame = 0; frame <= count; frame++) {
            const time = source.duration * frame / count; times.push(time); poser.pose(sourceName, time);
            bones.forEach((bone, index) => {
                rotations[index].push(...bone.quaternion.toArray()); translations[index].push(...bone.position.toArray());
            });
        }
        const tracks = [];
        let index = 0;
        for (const group of groups) for (const bone of group.bones) {
            const target = group.prefix + bone.name;
            tracks.push(new QuaternionKeyframeTrack(`${target}.quaternion`, times, rotations[index]));
            tracks.push(new VectorKeyframeTrack(`${target}.position`, times, translations[index++]));
        }
        clips.push(new AnimationClip(name, source.duration, tracks).optimize());
        specs[name] = { duration: source.duration, loop };
    }
    poser.pose("Idle_Loop", 0);
    const root = new Group(); root.name = "RangerRig";
    // Scale geometry and bones together; clip translation remains in the authored rig's units.
    root.scale.setScalar(scale); root.position.y = -floor * scale;
    const upperRoots = [];
    for (const [index, rig] of rigs.entries()) {
        for (const mesh of rig.meshes) mesh.removeFromParent();
        for (const bone of groups[index].bones) bone.name = groups[index].prefix + bone.name;
        upperRoots.push(groups[index].spine.name); root.add(rig.scene);
    }
    const mesh = new SkinnedMesh(geometry, material); mesh.name = "Ranger";
    mesh.bind(new Skeleton(bones, inverses), identity);
    mesh.userData = { heroClips: specs, upperRoots, height: 1.6 };
    root.add(mesh); root.updateMatrixWorld(true);
    return { root, mesh, clips, specs, bones: bones.length };
}

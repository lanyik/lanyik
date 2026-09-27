import { Bone, InterpolateLinear, LinearInterpolant, Quaternion, QuaternionLinearInterpolant, Vector3,
    type AnimationClip, type Interpolant, type Object3D, type SkinnedMesh } from "three";
import type { PlayerRenderState } from "../core/CombatState";
import { HERO_CLIPS } from "./HeroClips.generated";
import { HeroPose, type HeroClip } from "./HeroPose";

const SPINE_WEIGHTS = [0.4, 0.35, 0.25] as const;

class PoseLayer {
    private readonly previous: Float32Array;
    private readonly from: Float32Array;
    private readonly target: Float32Array;
    private readonly tracks = new Map<HeroClip, { offset: number; sample: Interpolant }[]>();
    private readonly rotation = new Quaternion();
    private clip: HeroClip | undefined;
    private sequence = -1;
    private changedAt: number | undefined;

    constructor(private readonly bones: readonly Bone[], clips: readonly AnimationClip[]) {
        this.previous = new Float32Array(bones.length * 7); this.from = this.previous.slice(); this.target = this.previous.slice();
        const names = new Map(bones.map((bone, index) => [bone.name, index]));
        for (const clip of clips) {
            const tracks: { offset: number; sample: Interpolant }[] = [];
            for (const track of clip.tracks) {
                const [name, property] = track.name.split("."), index = names.get(name);
                if (index === undefined) continue;
                const quaternion = property === "quaternion";
                if (!quaternion && property !== "position" || track.getInterpolation() !== InterpolateLinear) throw new Error("Ranger: invalid skeletal track");
                const width = quaternion ? 4 : 3;
                if (track.getValueSize() !== width) throw new Error("Ranger: invalid skeletal values");
                const sample = quaternion ? new QuaternionLinearInterpolant(track.times, track.values, width) : new LinearInterpolant(track.times, track.values, width);
                tracks.push({ offset: index * 7 + (quaternion ? 3 : 0), sample });
            }
            if (new Set(tracks.map(track => track.offset)).size !== bones.length * 2 || tracks.length !== bones.length * 2) throw new Error("Ranger: incomplete animation layer");
            this.tracks.set(clip.name as HeroClip, tracks);
        }
    }
    public reset(): void { this.clip = undefined; }
    public get buffers(): readonly ArrayBufferView[] {
        return [this.previous, this.from, this.target, ...[...this.tracks.values()].flatMap(tracks => tracks.flatMap(({ sample }) =>
            [sample.parameterPositions, sample.sampleValues, sample.resultBuffer]))];
    }
    public write(clip: HeroClip, phase: number, sequence: number, clock: number): void {
        const fresh = this.clip === undefined;
        if (this.clip !== clip || this.sequence !== sequence) {
            this.from.set(this.previous); this.clip = clip; this.sequence = sequence;
            this.changedAt = fresh ? undefined : clock; // First playback has no outgoing pose to blend from.
        }
        const spec = HERO_CLIPS[clip], time = (spec.loop ? ((phase % 1) + 1) % 1 : Math.max(0, Math.min(1, phase))) * spec.duration;
        for (const track of this.tracks.get(clip)!) this.target.set(track.sample.evaluate(time), track.offset);
        const t = this.changedAt === undefined ? 1 : Math.max(0, Math.min(1, (clock - this.changedAt) / .12)), blend = t * t * (3 - 2 * t);
        for (let i = 0; i < this.bones.length; i++) {
            const bone = this.bones[i], offset = i * 7;
            for (let axis = 0; axis < 3; axis++) this.previous[offset + axis] = this.from[offset + axis] * (1 - blend) + this.target[offset + axis] * blend;
            bone.position.fromArray(this.previous, offset);
            bone.quaternion.fromArray(this.target, offset + 3);
            if (blend < 1) {
                // Keep the target separate: writing the source into the destination must not overwrite it.
                this.rotation.copy(bone.quaternion);
                bone.quaternion.fromArray(this.from, offset + 3).slerp(this.rotation, blend);
            }
            bone.quaternion.toArray(this.previous, offset + 3);
        }
    }
}

/** A bounded two-layer skeletal player. Leg/hip tracks never receive mobile attack poses. */
export class HeroAnimation {
    private readonly pose = new HeroPose();
    private readonly lower: PoseLayer;
    private readonly upper: PoseLayer;
    private readonly spines: Bone[][];
    private readonly rotation = new Quaternion();
    private readonly parent = new Quaternion();
    private readonly yaw = new Quaternion();
    private readonly up = new Vector3(0, 1, 0);

    constructor(private readonly root: Object3D, private readonly mesh: SkinnedMesh, clips: readonly AnimationClip[]) {
        if (JSON.stringify(mesh.userData.heroClips) !== JSON.stringify(HERO_CLIPS)
            || clips.length !== Object.keys(HERO_CLIPS).length || new Set(clips.map(clip => clip.name)).size !== clips.length
            || clips.some(clip => !Object.hasOwn(HERO_CLIPS, clip.name) || Math.abs(clip.duration - HERO_CLIPS[clip.name as HeroClip].duration) > 1e-5)) throw new Error("Ranger: mismatched skeletal clips; rebuild assets");
        const roots: unknown = mesh.userData.upperRoots;
        if (!Array.isArray(roots) || roots.length !== 2 || roots.some(name => typeof name !== "string")) throw new Error("Ranger: invalid upper-body mask");
        const upper = new Set<Bone>();
        this.spines = roots.map(name => {
            const spines = ["01", "02", "03"].map(suffix => root.getObjectByName(name.replace(/01$/, suffix)));
            if (spines.some(bone => !(bone instanceof Bone) || !mesh.skeleton.bones.includes(bone))) throw new Error("Ranger: missing spine chain");
            spines[0]!.traverse(object => { if (object instanceof Bone) upper.add(object); });
            return spines as Bone[];
        });
        this.lower = new PoseLayer(mesh.skeleton.bones.filter(bone => !upper.has(bone)), clips);
        this.upper = new PoseLayer(mesh.skeleton.bones.filter(bone => upper.has(bone)), clips);
        mesh.frustumCulled = false;
        mesh.skeleton.computeBoneTexture(); // Allocate before the resource account inspects the model.
    }
    public get buffers(): readonly ArrayBufferView[] {
        return [...new Map([...this.lower.buffers, ...this.upper.buffers].map(view => [view.buffer, new Uint8Array(view.buffer)])).values()];
    }
    public reset(): void { this.pose.reset(); this.lower.reset(); this.upper.reset(); }
    public suspend(): void { this.pose.suspend(); }
    public write(player: PlayerRenderState, timestampMs: number, active: boolean, frozen: boolean): number {
        if (!this.pose.write(player, timestampMs, active, frozen)) return this.pose.heading;
        this.lower.write(this.pose.lower, this.pose.lowerPhase, Number(this.pose.reverse), this.pose.clock);
        this.upper.write(this.pose.upper, this.pose.upperPhase, this.pose.upperSequence, this.pose.clock);
        this.root.updateMatrixWorld(true);
        // Distribute aim over three spine joints in world-up space, respecting the authored bind axes.
        for (const chain of this.spines) for (let i = 0; i < chain.length; i++) {
            const bone = chain[i];
            bone.parent!.getWorldQuaternion(this.parent);
            this.yaw.setFromAxisAngle(this.up, this.pose.twist * SPINE_WEIGHTS[i]);
            this.rotation.copy(this.parent).invert().multiply(this.yaw).multiply(this.parent);
            bone.quaternion.premultiply(this.rotation); bone.updateMatrixWorld(true);
        }
        this.mesh.skeleton.update();
        return this.pose.heading;
    }
}

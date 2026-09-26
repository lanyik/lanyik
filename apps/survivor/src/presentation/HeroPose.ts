import type { PlayerRenderState } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { HERO_CLIPS, HERO_POSES } from "./HeroClips.generated";

type Clip = keyof typeof HERO_CLIPS;

/** One hero, independent of the fixed enemy pose stride. Only death uses presentation time. */
export class HeroPose {
    private readonly previous = new Float32Array(HERO_POSES);
    private readonly from = new Float32Array(HERO_POSES);
    private clip: Clip | undefined;
    private changedAt = 0;
    private deathTime = 0;
    private previousFrame = -1;
    private frozenAt: number | undefined;
    public heading = 0;
    public get buffers(): readonly ArrayBufferView[] { return [this.previous, this.from]; }
    public reset(): void { this.clip = undefined; this.deathTime = 0; this.previousFrame = -1; this.frozenAt = undefined; }
    public suspend(): void { this.previousFrame = -1; }

    public write(weights: number[], player: PlayerRenderState, timestampMs: number, active: boolean, frozen: boolean): void {
        const dt = this.previousFrame < 0 || !active ? 0 : Math.max(0, (timestampMs - this.previousFrame) / 1000);
        this.previousFrame = active ? timestampMs : -1;
        const now = player.animationTime, feedback = player.feedback;
        if (frozen) this.frozenAt ??= now; else this.frozenAt = undefined;
        let clip: Clip, phase: number, seconds = this.frozenAt ?? now;
        this.heading = player.heading;
        if (player.gameOver) {
            if (this.clip === "death") this.deathTime = Math.min(HERO_CLIPS.death.duration, this.deathTime + dt);
            clip = "death"; phase = this.deathTime / HERO_CLIPS.death.duration; seconds = now + this.deathTime;
        } else {
            const hurtAge = seconds - feedback.hurtTick / GAME_CONFIG.timing.simulationHz;
            const attackAge = seconds - feedback.attackTick / GAME_CONFIG.timing.simulationHz;
            if (feedback.hurtTick >= 0 && hurtAge >= 0 && hurtAge < HERO_CLIPS.hurt.duration) {
                clip = "hurt"; phase = hurtAge / HERO_CLIPS.hurt.duration;
            } else if (feedback.castPhase) {
                this.heading = feedback.castHeading;
                clip = feedback.castPhase === 1 ? "windup" : feedback.castPhase === 2 ? "channel" : feedback.castProgress < .4 ? "attack" : "recovery";
                phase = clip === "channel" ? seconds / HERO_CLIPS.channel.duration : clip === "attack" ? feedback.castProgress / .4
                    : clip === "recovery" ? (feedback.castProgress - .4) / .6 : feedback.castProgress;
            } else if (feedback.attackTick >= 0 && attackAge >= 0 && attackAge < feedback.attackDuration) {
                clip = "attack"; phase = attackAge / feedback.attackDuration; this.heading = feedback.attackHeading;
            } else {
                clip = !frozen && Math.hypot(player.x - player.previousX, player.z - player.previousZ) > .0001 ? "move" : "idle";
                phase = seconds / HERO_CLIPS[clip].duration;
            }
        }
        const fresh = this.clip === undefined;
        if (this.clip !== clip) { this.from.set(this.previous); this.clip = clip; this.changedAt = seconds; }
        const spec = HERO_CLIPS[clip], progress = spec.loop ? ((phase % 1) + 1) % 1 : Math.max(0, Math.min(1, phase));
        const frame = progress * (spec.loop ? spec.count : spec.count - 1), index = Math.floor(frame), fraction = frame - index;
        weights.fill(0);
        weights[spec.offset + index] = 1 - fraction;
        weights[spec.offset + (spec.loop ? (index + 1) % spec.count : Math.min(spec.count - 1, index + 1))] += fraction;
        const t = fresh ? 1 : Math.max(0, Math.min(1, (seconds - this.changedAt) / .1)), mix = t * t * (3 - 2 * t);
        for (let i = 0; i < HERO_POSES; i++) {
            weights[i] = this.from[i] * (1 - mix) + weights[i] * mix;
            this.previous[i] = weights[i];
        }
    }
}

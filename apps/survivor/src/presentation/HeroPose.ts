import type { PlayerRenderState } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { HERO_CLIPS } from "./HeroClips.generated";

export type HeroClip = keyof typeof HERO_CLIPS;
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

/** Authoritative action phases, independent locomotion and aim. Only death uses wall time. */
export class HeroPose {
    public lower: HeroClip = "idle";
    public upper: HeroClip = "idle";
    public lowerPhase = 0;
    public upperPhase = 0;
    public upperSequence = -1;
    public heading = 0;
    public twist = 0;
    public reverse = false;
    public clock = 0;
    private previousSimulation = -1;
    private previousFrame = -1;
    private deathTime = 0;
    private movingPhase = 0;
    private dying = false;

    public reset(): void {
        this.previousSimulation = this.previousFrame = -1;
        this.deathTime = this.movingPhase = this.twist = 0;
        this.reverse = this.dying = false;
    }
    public suspend(): void { this.previousFrame = -1; }

    public write(player: PlayerRenderState, timestampMs: number, active: boolean, frozen: boolean): boolean {
        const fresh = this.previousSimulation < 0, now = player.animationTime;
        const dt = fresh ? 0 : Math.max(0, now - this.previousSimulation);
        const presentationDelta = this.previousFrame < 0 || !active ? 0 : Math.max(0, (timestampMs - this.previousFrame) / 1000);
        this.previousFrame = active ? timestampMs : -1; this.previousSimulation = now;
        if (frozen && !fresh && !player.gameOver) return false;
        this.clock = now;
        const feedback = player.feedback, dx = player.x - player.previousX, dz = player.z - player.previousZ;
        const speed = Math.hypot(dx, dz) * GAME_CONFIG.timing.simulationHz;
        const moving = !frozen && speed > .006;
        const movementHeading = moving ? Math.atan2(dx, dz) : player.heading;
        let aim = movementHeading, aiming = false, fullBody = false;
        this.lower = moving ? "move" : "idle";
        if (moving) this.movingPhase += dt * speed / (2.8 * HERO_CLIPS.move.duration);
        this.lowerPhase = moving ? this.movingPhase : now / HERO_CLIPS.idle.duration;
        this.upper = this.lower; this.upperPhase = this.lowerPhase; this.upperSequence = -1;
        if (player.gameOver) {
            if (this.dying) this.deathTime = Math.min(HERO_CLIPS.death.duration, this.deathTime + presentationDelta);
            this.dying = true; this.clock += this.deathTime;
            this.upper = "death"; this.upperPhase = this.deathTime / HERO_CLIPS.death.duration;
            fullBody = true; aim = fresh ? player.heading : this.heading;
        } else {
            const hurtAge = now - feedback.hurtTick / GAME_CONFIG.timing.simulationHz;
            const attackAge = now - feedback.attackTick / GAME_CONFIG.timing.simulationHz;
            if (feedback.castPhase) {
                aim = feedback.castHeading; aiming = true; fullBody = feedback.castLocksMovement;
                this.upper = feedback.castPhase === 1 ? "windup" : feedback.castPhase === 2 ? "channel" : feedback.castProgress < .4 ? "attack" : "recovery";
                this.upperPhase = this.upper === "channel" ? now / HERO_CLIPS.channel.duration : this.upper === "attack" ? feedback.castProgress / .4
                    : this.upper === "recovery" ? (feedback.castProgress - .4) / .6 : feedback.castProgress;
            } else if (feedback.attackTick >= 0 && attackAge >= 0 && attackAge < feedback.attackDuration) {
                this.upper = "attack"; this.upperPhase = attackAge / feedback.attackDuration;
                this.upperSequence = feedback.attackTick; aim = feedback.attackHeading; aiming = true;
            }
            if (feedback.hurtTick >= 0 && hurtAge >= 0 && hurtAge < HERO_CLIPS.hurt.duration) {
                this.upper = "hurt"; this.upperPhase = hurtAge / HERO_CLIPS.hurt.duration; this.upperSequence = feedback.hurtTick;
            }
        }
        if (fullBody) { this.lower = this.upper; this.lowerPhase = this.upperPhase; }
        // Back-facing shots use a backwards stride, never an anatomically impossible 180° waist twist.
        const difference = Math.abs(angle(aim - movementHeading));
        this.reverse = moving && aiming && !fullBody && difference > (this.reverse ? Math.PI * .45 : Math.PI * .55);
        const heading = fullBody || !moving && aiming ? aim : movementHeading + (this.reverse ? Math.PI : 0);
        const turnDelta = player.gameOver ? presentationDelta : dt;
        this.heading = fresh ? heading : this.heading + angle(heading - this.heading) * (1 - Math.exp(-24 * turnDelta));
        if (this.reverse) this.lowerPhase = -this.lowerPhase;
        const twist = aiming && moving && !fullBody ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle(aim - this.heading))) : 0;
        this.twist = fresh ? twist : this.twist + (twist - this.twist) * (1 - Math.exp(-30 * turnDelta));
        return true;
    }
}

import { expect, test } from "vitest";
import { HeroPose } from "../src/presentation/HeroPose";
import { HERO_CLIPS, HERO_POSES } from "../src/presentation/HeroClips.generated";
import { PlayerFeedback } from "../src/core/PlayerFeedback";
import { ticksForSeconds } from "../src/core/GameConfig";
import type { PlayerRenderState } from "../src/core/CombatState";

function fixture() {
    const feedback = new PlayerFeedback();
    const player: { -readonly [K in keyof PlayerRenderState]: PlayerRenderState[K] } = { entitySlot: 0, animationTime: 0, x: 0, z: 0, previousX: 0, previousZ: 0, heading: 0,
        healthRatio: 1, invulnerable: false, shieldReady: false, ward: 0, dashing: false, gameOver: false, feedback };
    return { pose: new HeroPose(), weights: new Array<number>(HERO_POSES).fill(0), player, feedback };
}

test("hero attack and cast use authoritative phase/heading, and interruption blends from the current pose", () => {
    const { pose, player, feedback, weights } = fixture();
    feedback.attackTick = 0; feedback.attackDuration = .4; feedback.attackHeading = 1.2;
    player.animationTime = .2;
    pose.write(weights, player, 200, true, false);
    expect(weights[10]).toBe(.5); expect(weights[11]).toBe(.5); expect(pose.heading).toBe(1.2);
    feedback.castPhase = 1; feedback.castProgress = .6; feedback.castHeading = -.8;
    pose.write(weights, player, 200, true, false);
    expect(weights[10]).toBe(.5);
    player.animationTime = .3;
    pose.write(weights, player, 300, true, false);
    expect(weights[15]).toBeCloseTo(.2); expect(weights[16]).toBeCloseTo(.8); expect(pose.heading).toBe(-.8);
    const interrupted = [...weights]; feedback.castPhase = 0; feedback.attackTick = -1;
    pose.write(weights, player, 300, true, false);
    weights.forEach((weight, i) => expect(weight).toBeCloseTo(interrupted[i]));
    player.animationTime = .5; pose.write(weights, player, 500, true, false);
    expect(weights.slice(0, HERO_CLIPS.idle.offset).every(weight => Math.abs(weight) < 1e-6)).toBe(true);
});

test("death finishes after simulation stops, freezes while suspended, holds its endpoint and resets on replacement", () => {
    const { pose, player, weights } = fixture();
    pose.write(weights, player, 0, true, false);
    player.gameOver = true; pose.write(weights, player, 10, true, false);
    for (let i = 1; i <= 12; i++) pose.write(weights, player, 10 + i * 100, true, false);
    const halfway = [...weights]; pose.suspend();
    pose.write(weights, player, 5000, false, false);
    expect(weights).toEqual(halfway);
    pose.write(weights, player, 10000, true, false);
    expect(weights).toEqual(halfway);
    for (let i = 1; i <= 30; i++) pose.write(weights, player, 10000 + i * 100, true, false);
    expect(weights[37]).toBe(1); expect(weights.reduce((a, b) => a + b, 0)).toBe(1);
    pose.write(weights, player, 100000, true, false); expect(weights[37]).toBe(1);
    pose.reset(); player.gameOver = false; pose.write(weights, player, 100001, true, false);
    expect(weights[38]).toBe(1); expect(weights[37]).toBe(0);
});

test("actual hurt has priority over casting; frozen actors do not restart their locomotion clock", () => {
    const { pose, player, feedback, weights } = fixture();
    feedback.hurtTick = ticksForSeconds(1); feedback.castPhase = 2; player.animationTime = 1.1;
    pose.write(weights, player, 0, true, false);
    expect(weights.slice(26, 30).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    pose.write(weights, player, 16, true, true); const frozen = [...weights];
    player.animationTime = 2; pose.write(weights, player, 1000, true, true);
    expect(weights).toEqual(frozen);
});

test("slow presentation frames still finish death within the clip duration", () => {
    const { pose, player, weights } = fixture(); player.gameOver = true;
    pose.write(weights, player, 0, true, false);
    pose.write(weights, player, 1000, true, false);
    expect(weights[37]).toBe(0);
    pose.write(weights, player, 3000, true, false);
    expect(weights[37]).toBe(1);
});

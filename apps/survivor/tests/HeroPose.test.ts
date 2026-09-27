import { expect, test } from "vitest";
import { HeroPose } from "../src/presentation/HeroPose";
import { PlayerFeedback } from "../src/core/PlayerFeedback";
import type { PlayerRenderState } from "../src/core/CombatState";

function fixture() {
    const feedback = new PlayerFeedback();
    const player: { -readonly [K in keyof PlayerRenderState]: PlayerRenderState[K] } = { entitySlot: 0, animationTime: 0, x: 0, z: 0, previousX: 0, previousZ: 0, heading: 0,
        healthRatio: 1, invulnerable: false, shieldReady: false, ward: 0, dashing: false, gameOver: false, feedback };
    return { pose: new HeroPose(), player, feedback };
}

test("mobile attacks preserve the stride and separate travel heading from upper-body aim", () => {
    const { pose, player, feedback } = fixture();
    player.x = .03; player.animationTime = .2;
    feedback.attackTick = 0; feedback.attackDuration = .4; feedback.attackHeading = 0;
    pose.write(player, 200, true, false);
    expect(pose.lower).toBe("move"); expect(pose.upper).toBe("attack"); expect(pose.upperPhase).toBe(.5);
    expect(pose.heading).toBeCloseTo(Math.PI / 2); expect(pose.twist).toBeCloseTo(-Math.PI / 2);
    player.animationTime = .3; pose.write(player, 300, true, false);
    expect(pose.lowerPhase).toBeGreaterThan(0);
    feedback.castPhase = 1; feedback.castProgress = .6; feedback.castHeading = .4;
    pose.write(player, 300, true, false);
    expect(pose.lower).toBe("move"); expect(pose.upper).toBe("windup"); expect(pose.upperPhase).toBe(.6);
    feedback.castPhase = 0; feedback.attackTick = -1; pose.write(player, 300, true, false);
    expect(pose.lower).toBe("move"); expect(pose.upper).toBe("move");
});

test("only authoritative movement locks occupy both layers; recovery can resume locomotion", () => {
    const { pose, player, feedback } = fixture();
    feedback.castPhase = 2; feedback.castLocksMovement = true;
    player.animationTime = 1; pose.write(player, 1000, true, false);
    expect(pose.lower).toBe("channel"); expect(pose.upper).toBe("channel");
    feedback.castPhase = 3; feedback.castProgress = .7; feedback.castLocksMovement = false; player.z = .03;
    player.animationTime = 1.2; pose.write(player, 1200, true, false);
    expect(pose.lower).toBe("move"); expect(pose.upper).toBe("recovery");
});

test("aiming backwards reverses the stride and limits spine twist without changing authoritative heading", () => {
    const { pose, player, feedback } = fixture();
    player.z = .03; feedback.attackTick = 0; feedback.attackDuration = 1; feedback.attackHeading = Math.PI;
    pose.write(player, 0, true, false);
    player.animationTime = .1; pose.write(player, 100, true, false);
    expect(pose.reverse).toBe(true); expect(pose.lowerPhase).toBeLessThan(0);
    expect(pose.heading).toBeCloseTo(Math.PI); expect(pose.twist).toBeCloseTo(0); expect(player.heading).toBe(0);
});

test("hurt replaces only the upper layer while moving and freezing preserves the evaluated pose", () => {
    const { pose, player, feedback } = fixture();
    feedback.hurtTick = 0; feedback.castPhase = 2; player.x = .03; player.animationTime = .1;
    pose.write(player, 100, true, false);
    expect(pose.lower).toBe("move"); expect(pose.upper).toBe("hurt");
    const phase = pose.lowerPhase, heading = pose.heading;
    player.animationTime = 2; expect(pose.write(player, 2000, true, true)).toBe(false);
    expect(pose.lowerPhase).toBe(phase); expect(pose.heading).toBe(heading);
});

test("death finishes on stopped simulation time, suspends without catching up, and resets", () => {
    const { pose, player, feedback } = fixture();
    player.x = .03; feedback.attackTick = 0; feedback.attackDuration = 1;
    pose.write(player, 0, true, false);
    expect(Math.abs(pose.twist)).toBeGreaterThan(1);
    player.gameOver = true; pose.write(player, 10, true, false);
    pose.write(player, 1010, true, false);
    expect(pose.lower).toBe("death"); expect(pose.upper).toBe("death");
    const halfway = pose.upperPhase; pose.suspend();
    pose.write(player, 5000, false, false); expect(pose.upperPhase).toBe(halfway);
    pose.write(player, 10000, true, false); expect(pose.upperPhase).toBe(halfway);
    pose.write(player, 12000, true, false); expect(pose.upperPhase).toBe(1);
    expect(pose.twist).toBeCloseTo(0);
    pose.write(player, 20000, true, false); expect(pose.upperPhase).toBe(1);
    pose.reset(); player.gameOver = false; player.x = 0; feedback.attackTick = -1; pose.write(player, 20001, true, false);
    expect(pose.upper).toBe("idle");
});

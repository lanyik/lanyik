import { expect, test } from "vitest";
import { ACTOR_POSES, writeActorPose } from "../src/presentation/ActorPose";
import { ActorAction } from "../src/core/CombatWorld";

test("attack poses follow simulation progress without wrapping or retaining movement weights", () => {
    const weights = new Array(ACTOR_POSES).fill(0);
    writeActorPose(weights, .3, ActorAction.Moving, 0);
    expect(weights.slice(0, 8).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    writeActorPose(weights, 400, ActorAction.Cast, .5);
    expect(weights.slice(0, 8)).toEqual(new Array(8).fill(0));
    expect(weights[11]).toBe(.5); expect(weights[12]).toBe(.5);
    writeActorPose(weights, 800, ActorAction.Melee, 1);
    expect(weights[15]).toBe(1); expect(weights[8]).toBe(0);
    writeActorPose(weights, 900, ActorAction.Idle, 0);
    expect(weights).toEqual(new Array(ACTOR_POSES).fill(0));
});

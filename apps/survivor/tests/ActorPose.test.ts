import { expect, test } from "vitest";
import { ACTOR_POSES, HERO_POSES, IDLE_POSES, writeActorPose } from "../src/presentation/ActorPose";
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
    expect(weights.slice(0, 16)).toEqual(new Array(16).fill(0));
    expect(weights[16]).toBe(1);
});

test.each([HERO_POSES, ACTOR_POSES])("idle loops independently of movement and attacks for %i poses", count => {
    const weights = new Array(count).fill(0), offset = count - IDLE_POSES;
    writeActorPose(weights, .875, ActorAction.Idle, 1);
    expect(weights.slice(0, offset).every(weight => weight === 0)).toBe(true);
    expect(weights[offset + 3]).toBe(.5); expect(weights[offset]).toBe(.5);
    const last = [...weights];
    writeActorPose(weights, 1.875, ActorAction.Idle, 0);
    expect(weights).toEqual(last);
    writeActorPose(weights, .125, ActorAction.Idle, 0);
    expect(weights).not.toEqual(last);
    writeActorPose(weights, .5, ActorAction.Moving, 0);
    expect(weights.slice(offset).every(weight => weight === 0)).toBe(true);
});

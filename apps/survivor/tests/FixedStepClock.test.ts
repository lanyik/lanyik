import { describe, expect, test } from "vitest";
import { COMBAT_STEP_MS, FixedStepClock } from "../src/core/FixedStepClock";

describe("FixedStepClock", () => {
    test("advances fixed steps independently from frame cadence", () => {
        const clock = new FixedStepClock();
        clock.setRunning(true);
        expect(clock.sample(100)).toEqual({ steps: 0, alpha: 0, clampedMs: 0 });
        const partial = clock.sample(100 + COMBAT_STEP_MS * 2.5);
        expect(partial.steps).toBe(2); expect(partial.alpha).toBeCloseTo(.5, 3); expect(partial.clampedMs).toBe(0);
        expect(clock.sample(100 + COMBAT_STEP_MS * 3)).toEqual({ steps: 1, alpha: 0, clampedMs: 0 });
    });

    test("does not backfill paused or long background time", () => {
        const clock = new FixedStepClock();
        clock.setRunning(true);
        clock.sample(0);
        clock.sample(10);
        clock.setRunning(false);
        expect(clock.sample(10_000)).toMatchObject({ steps: 0, clampedMs: 0 });
        clock.setRunning(true);
        expect(clock.sample(10_000)).toMatchObject({ steps: 0, clampedMs: 0 });
        // 250 ms of accepted wall time plus the retained sub-step remainder.
        expect(clock.sample(20_000)).toEqual({ steps: 30, alpha: .2, clampedMs: 9750 });
    });
});

test.each([60, 120, 144, 240])("a minute at %i render Hz advances exactly 7200 logic ticks without over-ticking", hz => {
    const clock = new FixedStepClock(); clock.setRunning(true); clock.sample(0);
    let steps = 0;
    for (let frame = 1; frame <= hz * 60; frame++) steps += clock.sample(frame * 1000 / hz).steps;
    expect(steps).toBe(7200);
});

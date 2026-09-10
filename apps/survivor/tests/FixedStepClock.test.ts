import { describe, expect, test } from "vitest";
import { COMBAT_STEP_MS, FixedStepClock } from "../src/core/FixedStepClock";

describe("FixedStepClock", () => {
    test("advances fixed steps independently from frame cadence", () => {
        const clock = new FixedStepClock();
        clock.setRunning(true);
        expect(clock.sample(100)).toEqual({ steps: 0, alpha: 0, clampedMs: 0 });
        expect(clock.sample(100 + COMBAT_STEP_MS * 2.5)).toEqual({ steps: 2, alpha: 0.5, clampedMs: 0 });
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
        expect(clock.sample(20_000)).toEqual({ steps: 13, alpha: 0, clampedMs: 9750 });
    });
});

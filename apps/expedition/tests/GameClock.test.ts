import { describe, expect, it } from "vitest";
import { GameClock, type GameSpeed } from "../src/core/GameClock";

describe("GameClock", () => {
    it.each([30, 60, 144])("advances the same game time at %i Hz", frequency => {
        for (const speed of [1, 2, 4] as const) {
            const clock = new GameClock();
            clock.setSpeed(speed);
            clock.setRunning(true);
            for (let frame = 0; frame <= frequency * 10; frame += 1) {
                clock.sample(frame * 1000 / frequency);
            }
            expect(clock.elapsedMs).toBe(10_000 * speed);
        }
    });

    it("preserves partial ticks across pause and speed changes without charging the stopped interval", () => {
        const clock = new GameClock();
        clock.setRunning(true);
        clock.sample(0);
        clock.sample(60);
        clock.setRunning(false);
        clock.sample(5000);
        clock.setSpeed(4);
        clock.setRunning(true);
        clock.sample(10_000);
        expect(clock.sample(10_010)).toBe(true);
        expect(clock.tick).toBe(1);
        clock.setSpeed(2);
        clock.sample(20_000);
        clock.sample(20_050);
        expect(clock.tick).toBe(2);
    });

    it("bounds a stalled frame and discards excess real time instead of building a catch-up backlog", () => {
        const clock = new GameClock();
        clock.setSpeed(4);
        clock.setRunning(true);
        clock.sample(0);
        clock.sample(60_000);
        expect(clock.tick).toBe(10);
        clock.sample(60_025);
        expect(clock.tick).toBe(11);
    });

    it("rejects invalid timestamps and speeds without corrupting the next valid step", () => {
        const clock = new GameClock();
        clock.setRunning(true);
        clock.sample(100);
        for (const timestamp of [-1, -0.0001, NaN, Infinity, Number.MAX_SAFE_INTEGER, 99]) {
            expect(() => clock.sample(timestamp)).toThrow(RangeError);
        }
        expect(() => clock.setSpeed(3 as GameSpeed)).toThrow(RangeError);
        clock.sample(200);
        expect(clock.tick).toBe(1);
    });
});

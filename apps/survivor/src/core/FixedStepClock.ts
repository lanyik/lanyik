import { GAME_CONFIG, SIMULATION_STEP_MS } from "./GameConfig";
export const COMBAT_STEP_MS = SIMULATION_STEP_MS;
// Accumulate integer microseconds * Hz, avoiding a rounded 8,333us timestep at 120Hz.
const STEP_PHASE = 1_000_000;
const MAX_FRAME_MICROSECONDS = GAME_CONFIG.timing.maxCatchUpMs * 1000;

interface ClockSample {
    readonly steps: number;
    readonly alpha: number;
    readonly clampedMs: number;
}

/** Fixed gameplay time with a bounded catch-up window and render interpolation. */
export class FixedStepClock {
    private running = false;
    private previousTimestamp: number | undefined;
    private remainder = 0;

    public setRunning(running: boolean): void {
        if (this.running === running) return;
        this.running = running;
        this.previousTimestamp = undefined;
    }

    public reset(): void {
        this.previousTimestamp = undefined;
        this.remainder = 0;
    }

    public sample(timestampMs: number): ClockSample {
        const timestamp = Math.round(timestampMs * 1000);
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
            throw new RangeError("Frame timestamp must be a non-negative finite time");
        }
        if (!this.running) return { steps: 0, alpha: 0, clampedMs: 0 };
        const previous = this.previousTimestamp;
        if (previous !== undefined && timestamp < previous) throw new RangeError("Frame timestamps must be monotonic");
        this.previousTimestamp = timestamp;
        if (previous === undefined) return { steps: 0, alpha: this.remainder / STEP_PHASE, clampedMs: 0 };
        const elapsed = timestamp - previous, accepted = Math.min(elapsed, MAX_FRAME_MICROSECONDS);
        this.remainder += accepted * GAME_CONFIG.timing.simulationHz;
        const steps = Math.floor(this.remainder / STEP_PHASE);
        this.remainder -= steps * STEP_PHASE;
        return { steps, alpha: this.remainder / STEP_PHASE, clampedMs: (elapsed - accepted) / 1000 };
    }
}

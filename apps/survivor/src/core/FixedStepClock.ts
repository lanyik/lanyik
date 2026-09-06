export const COMBAT_STEP_MS = 20;
const STEP_MICROSECONDS = COMBAT_STEP_MS * 1000;
const MAX_FRAME_MICROSECONDS = 250_000;

export interface ClockSample {
    readonly steps: number;
    readonly alpha: number;
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
        if (!this.running) return { steps: 0, alpha: 0 };
        const previous = this.previousTimestamp;
        if (previous !== undefined && timestamp < previous) throw new RangeError("Frame timestamps must be monotonic");
        this.previousTimestamp = timestamp;
        if (previous === undefined) return { steps: 0, alpha: this.remainder / STEP_MICROSECONDS };
        this.remainder += Math.min(timestamp - previous, MAX_FRAME_MICROSECONDS);
        const steps = Math.floor(this.remainder / STEP_MICROSECONDS);
        this.remainder -= steps * STEP_MICROSECONDS;
        return { steps, alpha: this.remainder / STEP_MICROSECONDS };
    }
}

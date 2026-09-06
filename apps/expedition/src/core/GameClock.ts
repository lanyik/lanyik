export const GAME_SPEEDS = [1, 2, 4] as const;
export type GameSpeed = typeof GAME_SPEEDS[number];
export const GAME_STEP_MS = 100;
const STEP_MICROSECONDS = GAME_STEP_MS * 1000;
const MAX_FRAME_MICROSECONDS = 250_000;

/** Fixed game time. Absolute frame timestamps avoid per-frame rounding drift. */
export class GameClock {
    private ticks = 0;
    private speedValue: GameSpeed = 1;
    private running = false;
    private previousTimestamp: number | undefined;
    private remainder = 0;

    public get tick(): number { return this.ticks; }
    public get elapsedMs(): number { return this.ticks * GAME_STEP_MS; }
    public get speed(): GameSpeed { return this.speedValue; }

    public setRunning(running: boolean): void {
        if (this.running === running) return;
        this.running = running;
        this.previousTimestamp = undefined;
    }

    public setSpeed(speed: GameSpeed): void {
        if (!(GAME_SPEEDS as readonly number[]).includes(speed)) {
            throw new RangeError("Unsupported game speed");
        }
        if (this.speedValue === speed) return;
        this.speedValue = speed;
        this.previousTimestamp = undefined;
    }

    public sample(timestampMs: number): boolean {
        const timestamp = Math.round(timestampMs * 1000);
        if (!Number.isSafeInteger(timestamp) || timestampMs < 0) {
            throw new RangeError("Frame timestamp must be a non-negative finite time");
        }
        if (!this.running) return false;
        const previous = this.previousTimestamp;
        if (previous !== undefined && timestamp < previous) {
            throw new RangeError("Frame timestamps must be monotonic");
        }
        this.previousTimestamp = timestamp;
        if (previous === undefined) return false;

        const elapsed = Math.min(timestamp - previous, MAX_FRAME_MICROSECONDS);
        const available = this.remainder + elapsed * this.speedValue;
        const steps = Math.floor(available / STEP_MICROSECONDS);
        const nextTick = this.ticks + steps;
        if (!Number.isSafeInteger(nextTick * GAME_STEP_MS)) {
            throw new RangeError("Game time exceeds the supported range");
        }
        this.remainder = available % STEP_MICROSECONDS;
        this.ticks = nextTick;
        return steps > 0;
    }
}

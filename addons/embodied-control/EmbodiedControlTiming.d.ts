export type TimedMotionTick = (elapsedMs: number, tickMs: number, durationMs: number) => void;
export declare function runTimedMotion(options: {
    requestedDurationMs: number;
    tickMs: number;
    realTime: boolean;
    applyTick: TimedMotionTick;
}): Promise<void>;

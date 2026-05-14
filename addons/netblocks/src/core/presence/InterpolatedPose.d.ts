import { PoseSnapshot } from '../codec/PoseCodec';
export declare class InterpolatedPose {
    private _prev?;
    private _next?;
    private _scratch;
    constructor();
    /** Push a freshly-received snapshot. */
    push(snapshot: PoseSnapshot, ts: number): void;
    /** Has any snapshot ever been received. */
    get hasData(): boolean;
    /** ms of the most recent snapshot. */
    get latestTs(): number;
    /**
     * Sample the smoothed pose at `now`. The returned object is reused across
     * calls — clone it if you need to retain it.
     */
    sample(now: number): PoseSnapshot;
}

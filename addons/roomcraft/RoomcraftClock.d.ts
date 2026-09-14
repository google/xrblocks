import type { NetSession } from '../netblocks/src/index';
export interface MotionClockSnapshot {
    epoch: string;
    authority: string;
    term: number;
    elapsed: number;
}
export interface RoomcraftMotionClockState {
    authority: string;
    synchronized: boolean;
    /** Half the measured round-trip delay, not a guarantee of clock accuracy. */
    uncertaintyMs?: number;
}
export declare function readMotionClock(value: unknown): MotionClockSnapshot;
interface ClockOptions {
    epoch: string;
    authority?: string;
    term?: number;
    initialTime?: number;
    now?: () => number;
    onChange(): void;
    onError(error: Error): void;
}
type ClockSession = Pick<NetSession, 'localPeerId' | 'events' | 'isOpen' | 'addEventListener' | 'removeEventListener'> & {
    users: Pick<ReadonlyMap<string, unknown>, 'keys' | 'has'>;
};
/** A scene timeline estimated from monotonic round trips, never wall clocks. */
export declare class RoomcraftClock {
    private readonly session;
    private readonly options;
    private readonly now;
    private readonly cleanups;
    private epoch;
    private authority;
    private term;
    private offsetMs;
    private synced;
    private failed;
    private bestRtt?;
    private bestAt;
    private sampleCount;
    private serial;
    private request?;
    private timeout?;
    private refresh?;
    private started;
    private disposed;
    constructor(session: ClockSession, options: ClockOptions);
    readonly read: () => number;
    get pending(): boolean;
    get state(): RoomcraftMotionClockState;
    snapshot(): MotionClockSnapshot;
    start(): void;
    /** Reconcile elections independently of scene edits, but never switch epochs. */
    reconcile(snapshot: MotionClockSnapshot, receivedAt: number): void;
    /** Switch epochs only with an accepted scene revision; include queue time. */
    adopt(snapshot: MotionClockSnapshot, receivedAt: number, redirected?: boolean): void;
    resync(): void;
    dispose(): void;
    private isNewerAuthority;
    private elect;
    private probe;
    private receiveReply;
    private schedule;
    private cancelSamples;
    private on;
    private send;
    private guard;
}
export {};

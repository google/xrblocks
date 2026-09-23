import * as THREE from 'three';
/**
 * Fixed-capacity ring buffer of timestamped camera poses.
 *
 * The passthrough video pipeline delivers RGB pixels with some latency, so
 * the camera pose at snapshot time is slightly *newer* than the pixels being
 * snapshotted. Recording the device-camera pose every frame lets a capture be
 * paired with the pose closest to the frame's `captureTime`, instead of the
 * pose at the moment `detect()` happened to run.
 *
 * Entries are preallocated once; {@link push} copies into the next slot, so
 * steady-state recording does not allocate.
 */
export declare class PoseRing {
    private readonly entries;
    private next;
    private count;
    constructor(capacity?: number);
    /** Number of poses currently stored. */
    get size(): number;
    /** Record a pose. `t` is a `performance.now()`-timebase timestamp. */
    push(t: number, worldFromView: THREE.Matrix4): void;
    /** Remove all stored poses. */
    clear(): void;
    /**
     * The stored pose whose timestamp is nearest to `t`, or `null` when the
     * ring is empty or the nearest sample is further than `maxAgeMs` away.
     * Returns a reference to ring-internal storage — copy before holding on to
     * it across further {@link push} calls.
     */
    lookup(t: number, maxAgeMs?: number): THREE.Matrix4 | null;
    /**
     * How far the nearest stored pose is from `t`, in milliseconds, or `null`
     * when the ring is empty. Small values mean the capture was paired with a
     * pose recorded at essentially the right instant.
     */
    matchErrorMs(t: number): number | null;
    /**
     * Estimated camera speed around time `t`, from the earliest and latest
     * stored poses within `±halfWindowMs`. Returns `null` when the window holds
     * fewer than two sufficiently separated samples.
     */
    velocityAround(t: number, halfWindowMs?: number): {
        linearMetersPerSec: number;
        angularRadPerSec: number;
    } | null;
    private nearest;
}

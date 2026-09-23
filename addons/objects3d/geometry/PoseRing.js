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
class PoseRing {
    constructor(capacity = 120) {
        this.next = 0;
        this.count = 0;
        this.entries = Array.from({ length: Math.max(1, capacity) }, () => ({
            t: 0,
            worldFromView: new THREE.Matrix4(),
        }));
    }
    /** Number of poses currently stored. */
    get size() {
        return this.count;
    }
    /** Record a pose. `t` is a `performance.now()`-timebase timestamp. */
    push(t, worldFromView) {
        const entry = this.entries[this.next];
        entry.t = t;
        entry.worldFromView.copy(worldFromView);
        this.next = (this.next + 1) % this.entries.length;
        this.count = Math.min(this.count + 1, this.entries.length);
    }
    /** Remove all stored poses. */
    clear() {
        this.next = 0;
        this.count = 0;
    }
    /**
     * The stored pose whose timestamp is nearest to `t`, or `null` when the
     * ring is empty or the nearest sample is further than `maxAgeMs` away.
     * Returns a reference to ring-internal storage — copy before holding on to
     * it across further {@link push} calls.
     */
    lookup(t, maxAgeMs = 500) {
        const best = this.nearest(t);
        return best && best.delta <= maxAgeMs ? best.entry.worldFromView : null;
    }
    /**
     * How far the nearest stored pose is from `t`, in milliseconds, or `null`
     * when the ring is empty. Small values mean the capture was paired with a
     * pose recorded at essentially the right instant.
     */
    matchErrorMs(t) {
        return this.nearest(t)?.delta ?? null;
    }
    /**
     * Estimated camera speed around time `t`, from the earliest and latest
     * stored poses within `±halfWindowMs`. Returns `null` when the window holds
     * fewer than two sufficiently separated samples.
     */
    velocityAround(t, halfWindowMs = 90) {
        let earliest = null;
        let latest = null;
        for (let i = 0; i < this.count; ++i) {
            const entry = this.entries[i];
            if (Math.abs(entry.t - t) > halfWindowMs)
                continue;
            if (!earliest || entry.t < earliest.t)
                earliest = entry;
            if (!latest || entry.t > latest.t)
                latest = entry;
        }
        if (!earliest || !latest)
            return null;
        const dtSeconds = (latest.t - earliest.t) / 1000;
        if (dtSeconds < 0.02)
            return null;
        const positionA = new THREE.Vector3().setFromMatrixPosition(earliest.worldFromView);
        const positionB = new THREE.Vector3().setFromMatrixPosition(latest.worldFromView);
        const quaternionA = new THREE.Quaternion().setFromRotationMatrix(earliest.worldFromView);
        const quaternionB = new THREE.Quaternion().setFromRotationMatrix(latest.worldFromView);
        return {
            linearMetersPerSec: positionB.distanceTo(positionA) / dtSeconds,
            angularRadPerSec: quaternionA.angleTo(quaternionB) / dtSeconds,
        };
    }
    nearest(t) {
        let best = null;
        let bestDelta = Infinity;
        for (let i = 0; i < this.count; ++i) {
            const entry = this.entries[i];
            const delta = Math.abs(entry.t - t);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = entry;
            }
        }
        return best ? { entry: best, delta: bestDelta } : null;
    }
}

export { PoseRing };

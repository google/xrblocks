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
export class PoseRing {
  private readonly entries: {t: number; worldFromView: THREE.Matrix4}[];
  private next = 0;
  private count = 0;

  constructor(capacity = 120) {
    this.entries = Array.from({length: Math.max(1, capacity)}, () => ({
      t: 0,
      worldFromView: new THREE.Matrix4(),
    }));
  }

  /** Number of poses currently stored. */
  get size(): number {
    return this.count;
  }

  /** Record a pose. `t` is a `performance.now()`-timebase timestamp. */
  push(t: number, worldFromView: THREE.Matrix4): void {
    const entry = this.entries[this.next];
    entry.t = t;
    entry.worldFromView.copy(worldFromView);
    this.next = (this.next + 1) % this.entries.length;
    this.count = Math.min(this.count + 1, this.entries.length);
  }

  /** Remove all stored poses. */
  clear(): void {
    this.next = 0;
    this.count = 0;
  }

  /**
   * The stored pose whose timestamp is nearest to `t`, or `null` when the
   * ring is empty or the nearest sample is further than `maxAgeMs` away.
   * Returns a reference to ring-internal storage — copy before holding on to
   * it across further {@link push} calls.
   */
  lookup(t: number, maxAgeMs = 500): THREE.Matrix4 | null {
    const best = this.nearest(t);
    return best && best.delta <= maxAgeMs ? best.entry.worldFromView : null;
  }

  /**
   * How far the nearest stored pose is from `t`, in milliseconds, or `null`
   * when the ring is empty. Small values mean the capture was paired with a
   * pose recorded at essentially the right instant.
   */
  matchErrorMs(t: number): number | null {
    return this.nearest(t)?.delta ?? null;
  }

  private nearest(t: number): {
    entry: {t: number; worldFromView: THREE.Matrix4};
    delta: number;
  } | null {
    let best: {t: number; worldFromView: THREE.Matrix4} | null = null;
    let bestDelta = Infinity;
    for (let i = 0; i < this.count; ++i) {
      const entry = this.entries[i];
      const delta = Math.abs(entry.t - t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = entry;
      }
    }
    return best ? {entry: best, delta: bestDelta} : null;
  }
}

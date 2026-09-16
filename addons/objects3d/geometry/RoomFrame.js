import * as THREE from 'three';
import { yawDelta90, wrapQuarterPi } from './YawEstimation.js';

/**
 * Estimation of a room's dominant horizontal axis ("Manhattan frame") from a
 * depth mesh.
 *
 * Snapping object yaws to the *session origin's* X/Z axes assumes the user
 * happened to be facing a wall when the session started, which on a headset is
 * essentially never true. Estimating the room's own axes from the geometry the
 * device already reconstructs removes that assumption: a box whose orientation
 * is ill-determined can then fall back to something physically meaningful
 * instead of an arbitrary grid.
 *
 * All functions are pure (no `xb.core` dependencies): they take a
 * `THREE.Mesh` and are safe to unit-test, or to run server-side in Node.
 */
const HALF_PI = Math.PI / 2;
const DEFAULTS = {
    // Triangle budget per call. The full-resolution depth mesh is ~47k
    // triangles (a 23.7k-vertex grid), so 20k visits roughly every other one;
    // the estimate is an area-weighted histogram, so subsampling costs little.
    maxTriangles: 20000,
    // Edge-length gate in metres. Triangles on real surfaces at room range are
    // a few centimetres across; the "skirts" the camera-grid mesh stretches
    // over depth discontinuities are typically 0.3 m or longer. 0.2 keeps the
    // former and drops the latter.
    maxEdge: 0.2,
    // |normal.y| threshold: 0.25 admits surfaces within asin(0.25) ≈ 14.5° of
    // vertical (walls, cabinet and furniture fronts) and rejects floors,
    // ceilings and table tops.
    maxAbsNy: 0.25,
    // Square metres of voting area below which the histogram peak is treated
    // as noise (a single chair back is ~0.3 m²; one wall is several m²).
    minSupportArea: 1.0,
    // Metres from the viewer beyond which triangles are ignored: depth noise
    // grows with range and the mesh is unreliable past ~6 m.
    maxRange: 6,
};
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();
const _centroid = new THREE.Vector3();
/**
 * Estimate the room's dominant horizontal axis from a depth mesh.
 *
 * Every near-vertical triangle votes for its normal's yaw, weighted by area,
 * in the `4θ` domain so that the four walls of a rectangular room reinforce
 * each other rather than cancelling. The vote is then refined around the
 * histogram peak so one large wall cannot drag the answer.
 *
 * @param mesh - Depth mesh; `matrixWorld` is applied to its vertices.
 * @param options - See {@link RoomFrameOptions}.
 * @returns The estimated frame, or `null` when too little vertical surface was
 *   visible to say anything honest.
 */
function estimateRoomYawFromMesh(mesh, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.['position'];
    if (!position || position.count < 3)
        return null;
    const index = geometry.getIndex();
    const triangleCount = index ? index.count / 3 : position.count / 3;
    if (triangleCount < 1)
        return null;
    const stride = Math.max(1, Math.ceil(triangleCount / opts.maxTriangles));
    mesh.updateMatrixWorld();
    const matrixWorld = mesh.matrixWorld;
    const maxEdgeSq = opts.maxEdge * opts.maxEdge;
    const maxRangeSq = opts.maxRange * opts.maxRange;
    // Weighted circular sums in the 4-theta domain, plus a 1-degree histogram
    // over [0, 90) used to locate the dominant peak.
    let sumCos = 0;
    let sumSin = 0;
    let sumWeight = 0;
    let kept = 0;
    const BINS = 90;
    const histogram = new Float64Array(BINS);
    const binAngles = new Float64Array(BINS);
    for (let t = 0; t < triangleCount; t += stride) {
        const base = t * 3;
        const i0 = index ? index.getX(base) : base;
        const i1 = index ? index.getX(base + 1) : base + 1;
        const i2 = index ? index.getX(base + 2) : base + 2;
        _a.fromBufferAttribute(position, i0).applyMatrix4(matrixWorld);
        _b.fromBufferAttribute(position, i1).applyMatrix4(matrixWorld);
        _c.fromBufferAttribute(position, i2).applyMatrix4(matrixWorld);
        _ab.subVectors(_b, _a);
        _ac.subVectors(_c, _a);
        if (_ab.lengthSq() > maxEdgeSq ||
            _ac.lengthSq() > maxEdgeSq ||
            _b.distanceToSquared(_c) > maxEdgeSq) {
            continue;
        }
        _n.crossVectors(_ab, _ac);
        const doubleArea = _n.length();
        if (doubleArea < 1e-8)
            continue;
        _n.multiplyScalar(1 / doubleArea);
        if (Math.abs(_n.y) > opts.maxAbsNy)
            continue;
        if (opts.viewerPosition) {
            _centroid
                .copy(_a)
                .add(_b)
                .add(_c)
                .multiplyScalar(1 / 3);
            if (_centroid.distanceToSquared(opts.viewerPosition) > maxRangeSq) {
                continue;
            }
        }
        const area = doubleArea / 2;
        const theta = Math.atan2(_n.x, _n.z);
        sumCos += area * Math.cos(4 * theta);
        sumSin += area * Math.sin(4 * theta);
        sumWeight += area;
        kept++;
        const wrapped = ((theta % HALF_PI) + HALF_PI) % HALF_PI;
        const bin = Math.min(BINS - 1, Math.floor((wrapped / HALF_PI) * BINS));
        histogram[bin] += area;
        binAngles[bin] += area * wrapped;
    }
    if (sumWeight < opts.minSupportArea || kept === 0)
        return null;
    const confidence = Math.min(1, Math.hypot(sumCos, sumSin) / sumWeight);
    // Refine around the histogram peak: a weighted mean over the peak bin and
    // its two neighbours on each side, which is robust to one dominant wall
    // skewing the global circular mean.
    let peak = 0;
    for (let i = 1; i < BINS; ++i) {
        if (histogram[i] > histogram[peak])
            peak = i;
    }
    let refinedWeight = 0;
    let refinedSum = 0;
    const peakCentre = ((peak + 0.5) / BINS) * HALF_PI;
    for (let d = -2; d <= 2; ++d) {
        const i = (peak + d + BINS) % BINS;
        const w = histogram[i];
        if (w <= 0)
            continue;
        const mean = binAngles[i] / w;
        // Unwrap relative to the peak so bins either side of the 0/90 seam blend.
        refinedSum += w * (peakCentre + yawDelta90(mean, peakCentre));
        refinedWeight += w;
    }
    const yaw = refinedWeight > 0
        ? (((refinedSum / refinedWeight) % HALF_PI) + HALF_PI) % HALF_PI
        : (((0.25 * Math.atan2(sumSin, sumCos)) % HALF_PI) + HALF_PI) % HALF_PI;
    return { yaw, confidence, supportArea: sumWeight, triangles: kept };
}
/** Drift beyond which the accumulated frame is assumed stale. */
const DRIFT_TOLERANCE_RAD = (20 * Math.PI) / 180;
/**
 * Running estimate of the room frame across multiple captures.
 *
 * Each `detect()` sees a different slice of the room, so accumulating genuinely
 * improves the estimate. There is no reference-space reset event to hook, so
 * staleness is detected by drift instead: two consecutive estimates that both
 * disagree with the accumulated value clear it and re-seed.
 */
class RoomFrameAccumulator {
    constructor() {
        this.sumCos = 0;
        this.sumSin = 0;
        this.sumWeight = 0;
        this.consecutiveOutliers = 0;
        this.latest = null;
    }
    /** The accumulated frame, or `null` before any usable estimate. */
    get current() {
        return this.latest;
    }
    /**
     * Fold one per-capture estimate into the running frame.
     *
     * @param frame - Estimate from {@link estimateRoomYawFromMesh}, or `null`.
     * @returns The updated accumulated frame.
     */
    push(frame) {
        if (!frame)
            return this.latest;
        if (this.latest) {
            const drift = Math.abs(yawDelta90(frame.yaw, this.latest.yaw));
            if (drift > DRIFT_TOLERANCE_RAD) {
                this.consecutiveOutliers++;
                if (this.consecutiveOutliers >= 2) {
                    // The room frame really has moved (or the reference space reset).
                    this.reset();
                }
                else {
                    // One disagreement could be a bad capture; keep the current frame.
                    return this.latest;
                }
            }
            else {
                this.consecutiveOutliers = 0;
            }
        }
        const w = frame.supportArea * frame.confidence;
        this.sumCos += w * Math.cos(4 * frame.yaw);
        this.sumSin += w * Math.sin(4 * frame.yaw);
        this.sumWeight += w;
        if (this.sumWeight <= 0)
            return this.latest;
        const yaw = (((0.25 * Math.atan2(this.sumSin, this.sumCos)) % HALF_PI) + HALF_PI) %
            HALF_PI;
        this.latest = {
            yaw,
            confidence: Math.min(1, Math.hypot(this.sumCos, this.sumSin) / this.sumWeight),
            supportArea: frame.supportArea,
            triangles: frame.triangles,
        };
        return this.latest;
    }
    /** Discard all accumulated evidence. */
    reset() {
        this.sumCos = 0;
        this.sumSin = 0;
        this.sumWeight = 0;
        this.consecutiveOutliers = 0;
        this.latest = null;
    }
}
/**
 * Signed angle from the room frame to `yaw`, in `[-π/4, π/4)`. Near zero means
 * the object is aligned with the room's walls.
 */
function yawRelativeToRoom(yaw, frame) {
    return wrapQuarterPi(yaw - (frame?.yaw ?? 0));
}

export { RoomFrameAccumulator, estimateRoomYawFromMesh, yawRelativeToRoom };

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
import * as THREE from 'three';
/** Estimated room orientation. */
export interface RoomFrame {
    /** Dominant horizontal axis of the room, wrapped into `[0, π/2)`. */
    yaw: number;
    /**
     * Mean resultant length of the vote in the 4θ domain, in `[0, 1]`. High for
     * a rectangular room, low for a curved or cluttered one.
     */
    confidence: number;
    /** Total area of vertical surface that voted, in m². */
    supportArea: number;
    /** Number of triangles that passed all filters. */
    triangles: number;
}
/** Tuning for {@link estimateRoomYawFromMesh}. */
export interface RoomFrameOptions {
    /** Cap on triangles visited; the mesh is strided down to this. */
    maxTriangles?: number;
    /**
     * Reject triangles with any edge longer than this, in metres. Essential:
     * the depth mesh is a camera-grid mesh, so triangles spanning a depth
     * discontinuity become long "skirts" whose normals are silhouette
     * artefacts rather than real surfaces.
     */
    maxEdge?: number;
    /** Keep only surfaces whose normal is within this of horizontal. */
    maxAbsNy?: number;
    /** Minimum total voting area before a result is trusted at all. */
    minSupportArea?: number;
    /** Viewer position; triangles beyond `maxRange` of it are ignored. */
    viewerPosition?: THREE.Vector3;
    /** Range cap in metres — depth noise grows with distance. */
    maxRange?: number;
}
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
export declare function estimateRoomYawFromMesh(mesh: THREE.Mesh, options?: RoomFrameOptions): RoomFrame | null;
/**
 * Running estimate of the room frame across multiple captures.
 *
 * Each `detect()` sees a different slice of the room, so accumulating genuinely
 * improves the estimate. There is no reference-space reset event to hook, so
 * staleness is detected by drift instead: two consecutive estimates that both
 * disagree with the accumulated value clear it and re-seed.
 */
export declare class RoomFrameAccumulator {
    private sumCos;
    private sumSin;
    private sumWeight;
    private consecutiveOutliers;
    private latest;
    /** The accumulated frame, or `null` before any usable estimate. */
    get current(): RoomFrame | null;
    /**
     * Fold one per-capture estimate into the running frame.
     *
     * @param frame - Estimate from {@link estimateRoomYawFromMesh}, or `null`.
     * @returns The updated accumulated frame.
     */
    push(frame: RoomFrame | null): RoomFrame | null;
    /** Discard all accumulated evidence. */
    reset(): void;
}
/**
 * Signed angle from the room frame to `yaw`, in `[-π/4, π/4)`. Near zero means
 * the object is aligned with the room's walls.
 */
export declare function yawRelativeToRoom(yaw: number, frame: RoomFrame | null): number;

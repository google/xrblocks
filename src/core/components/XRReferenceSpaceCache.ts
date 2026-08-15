import * as THREE from 'three';

const REFERENCE_SPACE_TYPES: XRReferenceSpaceType[] = [
  'viewer',
  'local',
  'local-floor',
  'bounded-floor',
  'unbounded',
];

const tempMatRel = new THREE.Matrix4();
const tempMatPose = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempOrientation = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);

/**
 * Manages and caches WebXR reference spaces for the active XR session.
 */
export class XRReferenceSpaceCache {
  private spaces = new Map<XRReferenceSpaceType, XRReferenceSpace>();
  private session: XRSession | null = null;

  /**
   * Called when an XR session starts to reset the cache and request all reference spaces.
   * @param session - The newly started WebXR session.
   */
  onXRSessionStart(session: XRSession): void {
    this.spaces.clear();
    this.session = session;
    session.addEventListener(
      'end',
      () => {
        if (this.session === session) this.session = null;
        this.spaces.clear();
      },
      {once: true}
    );

    for (const type of REFERENCE_SPACE_TYPES) {
      session
        .requestReferenceSpace(type)
        .then((space) => {
          // These settle after the session may already have ended, and a late
          // write would leave a dead session's space in the cache for the next
          // one to pick up.
          if (this.session !== session) return;
          this.spaces.set(type, space);
          console.debug(
            `[XRReferenceSpaceCache] Cached reference space "${type}"`
          );
        })
        .catch((error) => {
          console.debug(
            `[XRReferenceSpaceCache] Reference space "${type}" not available`,
            error
          );
        });
    }
  }

  /**
   * Synchronously returns a reference space if it has already been cached.
   * @param type - The reference space type to check.
   */
  getCached(type: XRReferenceSpaceType): XRReferenceSpace | undefined {
    return this.spaces.get(type);
  }

  /**
   * Converts a pose from a source reference space to a target reference space using the active XRFrame.
   * @param pose - The pose in the source reference space.
   * @param from - The source reference space type or XRSpace instance.
   * @param to - The target reference space type or XRSpace instance.
   * @param frame - The active XR frame.
   * @returns The converted pose in the target reference space, or null if reference spaces or relative pose cannot be resolved.
   */
  convertPose(
    pose: XRRigidTransform,
    from: XRReferenceSpaceType | XRSpace,
    to: XRReferenceSpaceType | XRSpace,
    frame: XRFrame
  ): XRRigidTransform | null {
    const fromSpace = typeof from === 'string' ? this.getCached(from) : from;
    const toSpace = typeof to === 'string' ? this.getCached(to) : to;

    if (!fromSpace || !toSpace || !frame) {
      return null;
    }

    const relativePose = frame.getPose(fromSpace, toSpace);
    if (!relativePose) {
      return null;
    }

    tempMatRel.fromArray(relativePose.transform.matrix);
    tempMatPose.fromArray(pose.matrix);
    tempMatRel.multiply(tempMatPose);
    tempMatRel.decompose(tempPosition, tempOrientation, tempScale);

    return new XRRigidTransform(tempPosition, tempOrientation);
  }
}

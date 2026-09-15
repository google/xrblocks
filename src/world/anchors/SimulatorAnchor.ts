/** A pose expressed as plain arrays, so it can be stored as JSON. */
export interface StorablePose {
  /** Position as `[x, y, z]`. */
  position: [number, number, number];
  /** Orientation quaternion as `[x, y, z, w]`. */
  orientation: [number, number, number, number];
}

/**
 * A stand-in anchor for environments with no WebXR anchor support.
 *
 * The desktop simulator has no tracking system to anchor against, so this
 * holds the pose itself. It is deliberately a separate type rather than a
 * silent substitute: anchoring here proves the app's own wiring, not that the
 * platform can re-localise anything, and callers can tell the difference via
 * {@link SimulatorAnchor.isSimulatorAnchor}.
 */
export class SimulatorAnchor {
  /** Marks the instance so it can be recognised after type erasure. */
  readonly isSimulatorAnchor = true;

  /** Stands in for `XRAnchor.anchorSpace`; never a real tracked space. */
  readonly anchorSpace = {} as XRSpace;

  /** The pose this anchor was created at. */
  readonly pose: {
    position: {x: number; y: number; z: number};
    orientation: {x: number; y: number; z: number; w: number};
  };

  /**
   * @param handle - Identifier used as this anchor's persistent handle.
   * @param pose - Pose to hold.
   */
  constructor(
    private readonly handle: string,
    pose: XRRigidTransform
  ) {
    this.pose = {
      position: {
        x: pose.position?.x ?? 0,
        y: pose.position?.y ?? 0,
        z: pose.position?.z ?? 0,
      },
      orientation: {
        x: pose.orientation?.x ?? 0,
        y: pose.orientation?.y ?? 0,
        z: pose.orientation?.z ?? 0,
        w: pose.orientation?.w ?? 1,
      },
    };
  }

  /**
   * Returns this anchor's handle.
   * @returns The handle it was constructed with.
   */
  requestPersistentHandle = async (): Promise<string> => this.handle;

  /** Matches the `XRAnchor.delete` shape; nothing to release. */
  delete(): void {}

  /**
   * The held pose in storable form.
   * @returns The pose as plain arrays.
   */
  toStorablePose(): StorablePose {
    return {
      position: [
        this.pose.position.x,
        this.pose.position.y,
        this.pose.position.z,
      ],
      orientation: [
        this.pose.orientation.x,
        this.pose.orientation.y,
        this.pose.orientation.z,
        this.pose.orientation.w,
      ],
    };
  }

  /**
   * Rebuilds an anchor from a stored pose.
   * @param handle - Handle to restore under.
   * @param pose - Previously stored pose.
   * @returns The rebuilt anchor.
   */
  static fromStorablePose(handle: string, pose: StorablePose): SimulatorAnchor {
    return new SimulatorAnchor(handle, {
      position: {
        x: pose.position[0],
        y: pose.position[1],
        z: pose.position[2],
      },
      orientation: {
        x: pose.orientation[0],
        y: pose.orientation[1],
        z: pose.orientation[2],
        w: pose.orientation[3],
      },
    } as XRRigidTransform);
  }

  /**
   * Whether an anchor is simulated rather than platform-provided.
   * @param anchor - Anchor to test.
   * @returns True when the anchor is a {@link SimulatorAnchor}.
   */
  static isSimulatorAnchor(anchor: unknown): anchor is SimulatorAnchor {
    return !!anchor && (anchor as SimulatorAnchor).isSimulatorAnchor === true;
  }
}

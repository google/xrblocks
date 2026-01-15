import * as THREE from 'three';

export type SimulatorPlaneType = 'horizontal' | 'vertical';

export interface SimulatorPlane {
  /** 'horizontal' or 'vertical' */
  type: SimulatorPlaneType;

  /** Total surface area in square meters */
  area: number;

  /** * The center point of the plane in World Space.
   * This corresponds to the origin of the plane's local coordinate system.
   */
  position: THREE.Vector3;

  /** * Rotation of the plane in World Space.
   * Applying this rotation to (0,1,0) yields the plane's normal.
   */
  quaternion: THREE.Quaternion;

  /** * The boundary points of the plane in Local Space (X, Z).
   * Since +Y is normal, these points lie on the flat surface.
   */
  polygon: THREE.Vector2[];
}

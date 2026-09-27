import * as THREE from "three";
//#region src/addons/aruco/ArucoVisuals.d.ts
/** Tuning for {@link createArucoAnchorVisuals}. */
export interface ArucoAnchorVisualsOptions {
  /**
   * Printed edge length of the marker in metres, which the outline square
   * matches. @defaultValue {@link DEFAULT_ARUCO_MARKER_SIZE_METERS}
   */
  markerSizeMeters?: number;
  /** Length of each axis arm in metres. @defaultValue 0.12 */
  axisLengthMeters?: number;
  /** Radius of each axis arm in metres. @defaultValue 0.005 */
  axisRadiusMeters?: number;
  /** Edge thickness of the outline square in metres. @defaultValue 0.008 */
  outlineThicknessMeters?: number;
  /** Outline square colour. @defaultValue 0xffffff */
  outlineColor?: THREE.ColorRepresentation;
}
/**
 * A marker overlay group. `dispose()` releases its geometries and materials, and
 * matters for any caller that builds a fresh tracker per calibration session:
 * three.js does not free GPU resources when an object leaves the scene graph.
 */
export interface ArucoAnchorVisuals extends THREE.Group {
  dispose(): void;
}
/**
 * Builds the axes + outline overlay for a tracked Aruco.
 *
 * @param options - See {@link ArucoAnchorVisualsOptions}.
 * @returns A group to add as a child of an `ArucoTracker`.
 */
export declare function createArucoAnchorVisuals(options?: ArucoAnchorVisualsOptions): ArucoAnchorVisuals;
//#endregion
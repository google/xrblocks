/**
 * Public barrel export for the `objects3d` addon.
 *
 * Import from this file (or from `'xrblocks/addons/objects3d'`) to access the
 * addon's public API surface.
 */
export { Detected3DObject } from './Detected3DObject';
export { Object3DDetector } from './Object3DDetector';
export type { Object3DDetectorOptions } from './Object3DDetector';
export { uvToNdc } from './geometry/DepthSampling';
export { box2dIoU, snapBoxToFloor, unionDetections } from './geometry/Fusion';
export type { FusionRecord } from './geometry/Fusion';
export type { InternalObb, ObbFitOptions } from './geometry/ObbFitting';
export { categorize, isFlatLabel, isSurfaceLabel, isTinyFlatLabel, FLAT_LABEL_RE, LIGHT_LABEL_RE, SMALL_LABEL_RE, SURFACE_LABEL_RE, TINY_FLAT_LABEL_RE, } from './labels/Categories';
export type { ObjectCategory } from './labels/Categories';
export type { MaskLike } from './geometry/DepthSampling';
export { SAM_MODEL_ID } from './masks/SamMask';

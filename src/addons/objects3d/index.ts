/**
 * Public barrel export for the `objects3d` addon.
 *
 * Import from this file (or from `'xrblocks/addons/objects3d'`) to access the
 * addon's public API surface.
 */

export {Detected3DObject} from './Detected3DObject';
export {Object3DDetector} from './Object3DDetector';
export type {
  Object3DDetectorOptions,
  Object3DDetectorDiagnostics,
} from './Object3DDetector';

// Pure helpers worth reusing from application code.
export {uvToNdc, sampleDepthInMask} from './geometry/DepthSampling';
export {buildFrozenCamera} from './geometry/FrozenCamera';
export type {FrozenCameraMatrices} from './geometry/FrozenCamera';
export {PoseRing} from './geometry/PoseRing';

// Yaw estimation and the room ("Manhattan") frame.
export {
  canonicalizeYawObb,
  combineYawCandidates,
  convexHullXZ,
  localToWorldXZ,
  minAreaRectXZ,
  pcaYawConfidence,
  pcaYawXZ,
  ransacVerticalPlane,
  worldToLocalXZ,
  wrapPi,
  wrapQuarterPi,
  yawDelta90,
} from './geometry/YawEstimation';
export type {
  MinAreaRect,
  PointXZ,
  ScatterXZ,
  VerticalPlaneFit,
  YawCandidate,
  YawEstimate,
} from './geometry/YawEstimation';
export {
  estimateRoomYawFromMesh,
  RoomFrameAccumulator,
  yawRelativeToRoom,
} from './geometry/RoomFrame';
export type {RoomFrame, RoomFrameOptions} from './geometry/RoomFrame';
export {
  buildYawAlignedObb,
  estimateObjectYaw,
  resolveYaw,
} from './geometry/ObbFitting';
export type {OrientationMode, OrientationOptions} from './geometry/ObbFitting';
export {fitYawOBB} from './geometry/ObbFitting';
export {box2dIoU, snapBoxToFloor, unionDetections} from './geometry/Fusion';
export type {FusionRecord} from './geometry/Fusion';
export type {InternalObb, ObbFitOptions} from './geometry/ObbFitting';
export {
  categorize,
  isFlatLabel,
  isSurfaceLabel,
  isTinyFlatLabel,
  FLAT_LABEL_RE,
  LIGHT_LABEL_RE,
  SMALL_LABEL_RE,
  SURFACE_LABEL_RE,
  TINY_FLAT_LABEL_RE,
} from './labels/Categories';
export type {ObjectCategory} from './labels/Categories';
export type {MaskLike} from './geometry/DepthSampling';
export {SAM_MODEL_ID} from './masks/SamMask';

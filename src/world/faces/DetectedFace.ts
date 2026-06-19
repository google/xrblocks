import * as THREE from 'three';

/**
 * A single facial landmark point. MediaPipe's FaceLandmarker emits 478
 * of these per face (468 from the canonical face mesh + 10 iris points).
 */
export interface FaceLandmark {
  /**
   * Normalized horizontal coordinate [0.0, 1.0] in screen space,
   * where 0.0 is the left edge and 1.0 is the right edge.
   */
  x: number;
  /**
   * Normalized vertical coordinate [0.0, 1.0] in screen space,
   * where 0.0 is the top edge and 1.0 is the bottom edge.
   */
  y: number;
  /**
   * Raw estimated depth value relative to the camera. Smaller magnitude
   * means closer to the camera; the value is in the same arbitrary
   * normalized space as `x` and `y`.
   */
  z: number;
  /**
   * The back-projected 3D position in WebXR world space, measured in
   * meters. Null or undefined if depth projection was unsuccessful.
   */
  worldPosition?: THREE.Vector3;
}

/**
 * A single blendshape category and its activation weight. The category
 * names follow the ARKit blendshape vocabulary used by MediaPipe's
 * Face Landmarker (e.g. `jawOpen`, `mouthSmileLeft`, `eyeBlinkRight`).
 */
export interface FaceBlendshape {
  /**
   * The category name (ARKit / FaceLandmarker convention).
   */
  categoryName: string;
  /**
   * Activation weight in `[0.0, 1.0]`. Zero means the blendshape is
   * fully off; one means fully on. MediaPipe applies internal
   * smoothing so consecutive frames don't jitter.
   */
  score: number;
}

/**
 * Common facial landmark anchor names. These map to specific indices
 * in the 478-point MediaPipe FaceLandmarker mesh and are exposed for
 * convenience so callers can read e.g. the nose tip without memorising
 * the index 1.
 */
export enum FaceLandmarkName {
  NoseTip = 'noseTip',
  Chin = 'chin',
  LeftEyeOuterCorner = 'leftEyeOuterCorner',
  LeftEyeInnerCorner = 'leftEyeInnerCorner',
  RightEyeOuterCorner = 'rightEyeOuterCorner',
  RightEyeInnerCorner = 'rightEyeInnerCorner',
  LeftPupil = 'leftPupil',
  RightPupil = 'rightPupil',
  MouthLeftCorner = 'mouthLeftCorner',
  MouthRightCorner = 'mouthRightCorner',
  UpperLipCenter = 'upperLipCenter',
  LowerLipCenter = 'lowerLipCenter',
  ForeheadCenter = 'foreheadCenter',
}

/**
 * Maps the named anchors above to FaceLandmarker mesh indices. Source:
 * MediaPipe FaceLandmarker canonical face mesh topology, plus the iris
 * sub-model (indices 468..477) for pupil centres.
 */
const LANDMARK_INDEX: Record<FaceLandmarkName, number> = {
  [FaceLandmarkName.NoseTip]: 1,
  [FaceLandmarkName.Chin]: 152,
  [FaceLandmarkName.LeftEyeOuterCorner]: 263,
  [FaceLandmarkName.LeftEyeInnerCorner]: 362,
  [FaceLandmarkName.RightEyeOuterCorner]: 33,
  [FaceLandmarkName.RightEyeInnerCorner]: 133,
  [FaceLandmarkName.LeftPupil]: 473,
  [FaceLandmarkName.RightPupil]: 468,
  [FaceLandmarkName.MouthLeftCorner]: 291,
  [FaceLandmarkName.MouthRightCorner]: 61,
  [FaceLandmarkName.UpperLipCenter]: 13,
  [FaceLandmarkName.LowerLipCenter]: 14,
  [FaceLandmarkName.ForeheadCenter]: 10,
};

/**
 * Represents a single human face detected in physical space.
 * Inherits from `THREE.Object3D` to fit naturally into the Three.js
 * scene graph, positioning itself at the estimated nose tip of the
 * tracked face. When a facial transformation matrix is emitted by the
 * backend it is decomposed onto `position`, `quaternion`, and `scale`
 * so the Object3D directly represents the rigid head pose.
 */
export class DetectedFace extends THREE.Object3D {
  /**
   * Creates an instance of DetectedFace.
   *
   * @param faceId - A unique tracking identifier for this face.
   * @param landmarks - The 478 raw + 3D-projected facial landmarks.
   * @param detection2DBoundingBox - The 2D bounding box of the face in
   *     normalized screen space.
   * @param blendshapes - Optional 52 ARKit-style blendshape weights.
   *     Empty when the backend was configured with
   *     `outputFaceBlendshapes: false`.
   * @param facialTransformationMatrix - Optional 4x4 rigid head pose
   *     matrix in world space. Null when the backend was configured
   *     with `outputFacialTransformationMatrixes: false`.
   */
  constructor(
    public faceId: number,
    public landmarks: FaceLandmark[],
    public detection2DBoundingBox: THREE.Box2,
    public blendshapes: FaceBlendshape[] = [],
    public facialTransformationMatrix: THREE.Matrix4 | null = null
  ) {
    super();
    // Default Object3D position to the projected nose tip so consumers
    // can parent objects to `face.position` without first decoding a
    // landmark index.
    const nose = this.getLandmarkPosition(FaceLandmarkName.NoseTip);
    if (nose) {
      this.position.copy(nose);
    }
    // If a rigid facial transformation matrix is available, decompose
    // it onto position/quaternion/scale. This overrides the nose-tip
    // default with a more stable head pose suitable for parenting
    // glasses or masks.
    if (this.facialTransformationMatrix) {
      this.facialTransformationMatrix.decompose(
        this.position,
        this.quaternion,
        this.scale
      );
    }
  }

  /**
   * Returns the 3D world-space position of a named facial landmark.
   *
   * @param name - The landmark name to look up.
   * @returns A clone of the landmark's world position, or `null` if the
   *     index is out of range or depth back-projection was unsuccessful.
   */
  getLandmarkPosition(name: FaceLandmarkName): THREE.Vector3 | null {
    const index = LANDMARK_INDEX[name];
    if (index === undefined) return null;
    const lm = this.landmarks[index];
    return lm && lm.worldPosition ? lm.worldPosition.clone() : null;
  }

  /**
   * Returns the score for a blendshape category, or `0` if the category
   * isn't present in the current detection.
   *
   * @param categoryName - The ARKit category name, e.g. `jawOpen`.
   */
  getBlendshape(categoryName: string): number {
    const bs = this.blendshapes.find((b) => b.categoryName === categoryName);
    return bs ? bs.score : 0;
  }
}

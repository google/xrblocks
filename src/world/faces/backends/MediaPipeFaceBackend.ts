import * as THREE from 'three';
import type * as MEDIAPIPE from '@mediapipe/tasks-vision';
import {
  CameraParametersSnapshot,
  transformRgbUvToWorld,
} from '../../../camera/CameraUtils';
import {DetectedFace, FaceBlendshape, FaceLandmark} from '../DetectedFace';
import {BaseFaceBackend, FaceBackendContext} from '../FaceDetectorBackend';
import {
  MEDIAPIPE_MODULE_URL,
  MediaPipeVisionWorkerClient,
} from '../../shared/MediaPipeVisionWorker';

/**
 * Convert a raw MediaPipe `FaceLandmarkerResult` into an array of
 * `DetectedFace` objects with world-space positions, blendshape
 * weights, and rigid head transforms.
 *
 * Extracted as a free function so unit tests can drive it directly
 * without standing up the full backend lifecycle.
 *
 * For each landmark we try a depth-mesh raycast (`transformRgbUvToWorld`)
 * first; when the ray misses the mesh we fall back to back-projecting
 * through the camera frustum, placing the point ~0.5 m from the camera
 * modulated by the landmark's relative z. The 0.5 m default is tuned
 * for selfie / desktop sim use; passthrough Quest views typically hit
 * the depth mesh path so the fallback rarely runs there.
 */
export function processFaceLandmarkerResult(
  result: MEDIAPIPE.FaceLandmarkerResult,
  depthMeshSnapshot: THREE.Mesh,
  cameraParametersSnapshot: CameraParametersSnapshot
): DetectedFace[] {
  const detectedFaces: DetectedFace[] = [];

  for (let i = 0; i < result.faceLandmarks.length; i++) {
    const mpLandmarks = result.faceLandmarks[i];

    const landmarks: FaceLandmark[] = [];
    let xmin = 1;
    let ymin = 1;
    let xmax = 0;
    let ymax = 0;

    for (let j = 0; j < mpLandmarks.length; j++) {
      const lm = mpLandmarks[j];

      xmin = Math.min(xmin, lm.x);
      ymin = Math.min(ymin, lm.y);
      xmax = Math.max(xmax, lm.x);
      ymax = Math.max(ymax, lm.y);

      // Transform screen UV to WebXR world position via depth mesh
      // raycast (preferred) or camera-frustum back-projection
      // fallback when the ray misses the mesh.
      const uv = new THREE.Vector2(lm.x, lm.y);
      const worldCoords = transformRgbUvToWorld(
        uv,
        depthMeshSnapshot,
        cameraParametersSnapshot
      );

      let wp: THREE.Vector3 | undefined;
      if (worldCoords) {
        wp = worldCoords.worldPosition;
      } else {
        const origin = new THREE.Vector3().applyMatrix4(
          cameraParametersSnapshot.worldFromView
        );
        const clipVec = new THREE.Vector3(
          2 * lm.x - 1,
          2 * (1.0 - lm.y) - 1,
          -1
        );
        const direction = clipVec
          .applyMatrix4(cameraParametersSnapshot.worldFromClip)
          .sub(origin)
          .normalize();
        // Faces sit ~0.5 m from the camera in selfie/sim use, modulate
        // by the landmark's z so the back of the head stays behind
        // the front of the face along the view ray.
        wp = origin.addScaledVector(direction, 0.5 + (lm.z || 0));
      }

      landmarks.push({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        worldPosition: wp,
      });
    }

    const boundingBox = new THREE.Box2(
      new THREE.Vector2(xmin, ymin),
      new THREE.Vector2(xmax, ymax)
    );

    // Blendshapes are one Classifications object per face. Each
    // `categories` entry has `categoryName` and `score`. The browser
    // model emits them already smoothed across frames.
    const blendshapes: FaceBlendshape[] = [];
    const mpBlendshapes = result.faceBlendshapes?.[i];
    if (mpBlendshapes && mpBlendshapes.categories) {
      for (const c of mpBlendshapes.categories) {
        blendshapes.push({
          categoryName: c.categoryName,
          score: c.score,
        });
      }
    }

    // Facial transformation matrixes are stored as a column-major
    // Float32Array(16). THREE.Matrix4.fromArray() consumes the same
    // layout directly.
    let facialTransform: THREE.Matrix4 | null = null;
    const mpMatrix = result.facialTransformationMatrixes?.[i];
    if (mpMatrix && mpMatrix.data) {
      facialTransform = new THREE.Matrix4().fromArray(mpMatrix.data);
    }

    const face = new DetectedFace(
      i,
      landmarks,
      boundingBox,
      blendshapes,
      facialTransform
    );

    detectedFaces.push(face);
  }

  return detectedFaces;
}

/**
 * Face Landmark detector backend implementation using MediaPipe's
 * FaceLandmarker. Runs locally on the device, but offloads the
 * inference to a Web Worker so heavy detection passes (~30 ms on a
 * modern laptop, much more on mobile) don't stall the render loop.
 *
 * Pipeline per detect():
 *   1. Main thread captures an `ImageData` snapshot from the device
 *      camera (already async).
 *   2. Convert to `ImageBitmap` once and transfer it (zero-copy) to
 *      the worker.
 *   3. Worker runs `landmarker.detect()` and posts back the structured-
 *      clonable result.
 *   4. Main thread runs `processFaceLandmarkerResult` (depth-mesh
 *      raycasts + camera-frustum back-projection) which has to live on
 *      the render thread because it touches the live depth mesh and
 *      camera matrices.
 *
 * Emits 478 facial landmarks per face plus optional 52 ARKit-style
 * blendshape weights and an optional rigid 4x4 facial transformation
 * matrix.
 */
export class MediaPipeFaceBackend extends BaseFaceBackend {
  private client = new MediaPipeVisionWorkerClient('MediaPipeFaceBackend');
  private initializationPromise: Promise<void>;

  constructor(context: FaceBackendContext) {
    super(context);
    this.initializationPromise = this.tryInitializeFaceLandmarker();
  }

  protected override async isAvailable(): Promise<boolean> {
    try {
      await this.initializationPromise;
      return true;
    } catch (e) {
      console.error('MediaPipe Face Landmarker is not available:', e);
      return false;
    }
  }

  protected override async getSnapshot(): Promise<{
    imageData: ImageData;
  } | null> {
    const imageData = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'imageData',
    });
    if (!imageData) return null;
    return {imageData};
  }

  protected override async detect(
    snapshot: {imageData: ImageData},
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedFace[]> {
    await this.initializationPromise;

    const workerResult = (await this.client.detect(
      snapshot.imageData
    )) as MEDIAPIPE.FaceLandmarkerResult | null;

    if (
      !workerResult ||
      !workerResult.faceLandmarks ||
      workerResult.faceLandmarks.length === 0
    ) {
      return [];
    }

    return processFaceLandmarkerResult(
      workerResult,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
  }

  /**
   * Tear down the worker. Safe to call multiple times.
   */
  dispose() {
    this.client.dispose();
  }

  private async tryInitializeFaceLandmarker(): Promise<void> {
    const facesOptions = this.context.options.faces.backendConfig.mediapipe;
    await this.client.init({
      mediapipeModuleUrl: MEDIAPIPE_MODULE_URL,
      wasmFilesUrl: facesOptions.wasmFilesUrl,
      taskName: 'FaceLandmarker',
      taskOptions: {
        baseOptions: {
          modelAssetPath: facesOptions.modelAssetPath,
          // CPU delegate in the worker. GPU would need an OffscreenCanvas
          // surface and MediaPipe's wasm pipeline only spins one up when it
          // finds a real DOM canvas, which workers don't have.
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numFaces: facesOptions.numFaces,
        minFaceDetectionConfidence: facesOptions.minFaceDetectionConfidence,
        minFacePresenceConfidence: facesOptions.minFacePresenceConfidence,
        minTrackingConfidence: facesOptions.minTrackingConfidence,
        outputFaceBlendshapes: facesOptions.outputFaceBlendshapes,
        outputFacialTransformationMatrixes:
          facesOptions.outputFacialTransformationMatrixes,
      },
    });
  }
}

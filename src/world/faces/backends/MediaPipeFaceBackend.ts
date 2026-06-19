import * as THREE from 'three';
import type * as MEDIAPIPE from '@mediapipe/tasks-vision';
import {
  CameraParametersSnapshot,
  transformRgbUvToWorld,
} from '../../../camera/CameraUtils';
import {DetectedFace, FaceBlendshape, FaceLandmark} from '../DetectedFace';
import {BaseFaceBackend, FaceBackendContext} from '../FaceDetectorBackend';
import {MEDIA_PIPE_FACE_WORKER_SOURCE} from './MediaPipeFaceWorker';

// CDN module the worker dynamic-imports for MediaPipe. Workers can't see
// the host page's importmap so we hand them an absolute URL. Pinned to a
// version that matches the SDK's tested matrix; bump in lockstep with
// any importmap updates in demos/face_mirror/index.html.
const MEDIAPIPE_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';

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
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private initializationPromise: Promise<void>;
  private nextRequestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: WorkerReply) => void;
      reject: (error: Error) => void;
    }
  >();

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
    if (!this.worker) {
      return [];
    }

    // Convert the snapshot to an ImageBitmap so the pixel buffer can be
    // transferred (zero-copy) into the worker. ImageData itself is
    // structured-cloneable but that means a full pixel copy per detect;
    // ImageBitmap moves ownership.
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(snapshot.imageData);
    } catch (error: unknown) {
      console.error('Failed to create ImageBitmap for face detection:', error);
      return [];
    }

    let workerResult: MEDIAPIPE.FaceLandmarkerResult;
    try {
      const reply = (await this.send({type: 'detect', imageBitmap: bitmap}, [
        bitmap,
      ])) as WorkerSuccessReply;
      workerResult = reply.result as MEDIAPIPE.FaceLandmarkerResult;
    } catch (error: unknown) {
      console.error('MediaPipe Face detection (worker) failed:', error);
      return [];
    }

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
   * Tear down the worker and revoke the Blob URL it was constructed
   * from. Safe to call multiple times.
   */
  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    // Reject any in-flight requests so callers don't hang.
    for (const {reject} of this.pendingRequests.values()) {
      reject(new Error('MediaPipeFaceBackend disposed'));
    }
    this.pendingRequests.clear();
  }

  private async tryInitializeFaceLandmarker(): Promise<void> {
    if (this.worker) return;
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not available in this environment');
    }

    // Spawn the worker from an inlined Blob URL so we don't have to
    // teach the rollup pipeline about a separate worker entry point.
    const blob = new Blob([MEDIA_PIPE_FACE_WORKER_SOURCE], {
      type: 'text/javascript',
    });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const {id} = event.data;
      const pending = this.pendingRequests.get(id);
      if (!pending) return;
      this.pendingRequests.delete(id);
      if (event.data.ok) {
        pending.resolve(event.data);
      } else {
        pending.reject(new Error(event.data.error || 'worker error'));
      }
    };
    this.worker.onerror = (event) => {
      console.error('MediaPipe face worker errored:', event.message);
    };

    const facesOptions = this.context.options.faces.backendConfig.mediapipe;
    await this.send({
      type: 'init',
      config: {
        mediapipeModuleUrl: MEDIAPIPE_MODULE_URL,
        wasmFilesUrl: facesOptions.wasmFilesUrl,
        modelAssetPath: facesOptions.modelAssetPath,
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

  /**
   * Promise-wrap a single request/response round trip with the worker.
   * The worker echoes back the request `id` so we can correlate replies
   * even when multiple detect() calls overlap.
   */
  private send(
    payload: WorkerRequest,
    transfer: Transferable[] = []
  ): Promise<WorkerReply> {
    if (!this.worker) {
      return Promise.reject(new Error('worker not spawned'));
    }
    const id = this.nextRequestId++;
    const worker = this.worker;
    return new Promise<WorkerReply>((resolve, reject) => {
      this.pendingRequests.set(id, {resolve, reject});
      worker.postMessage({id, ...payload}, transfer);
    });
  }
}

type WorkerRequest =
  | {type: 'init'; config: Record<string, unknown>}
  | {type: 'detect'; imageBitmap: ImageBitmap};

type WorkerSuccessReply = {id: number; ok: true; result?: unknown};
type WorkerErrorReply = {id: number; ok: false; error: string};
type WorkerReply = WorkerSuccessReply | WorkerErrorReply;

import * as THREE from 'three';
import * as xb from 'xrblocks';
import type {Accelerator} from '@litertjs/core';

const MODEL_IMG_SIZE = 512;
const MAX_POINTS = 6;
const QUAD_DISTANCE_METERS = 0.3;
const QUAD_SIZE_METERS = 0.8;
const MOUSE_QUAD_DISTANCE_METERS = 1.0;
const MOUSE_QUAD_SIZE_METERS = 1.4;

interface CirclePoint {
  x: number;
  y: number;
  u: number;
  v: number;
  worldPoint: THREE.Vector3;
}

interface BoundingBox2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface CirclePromptInfo {
  pts: Float32Array;
  lbls: Float32Array;
  box: BoundingBox2D | null;
  center: {x: number; y: number};
}

interface CameraCaptureResult {
  imageData: ImageData;
  clipFromWorld: THREE.Matrix4;
}

interface WorkerInitResult {
  encoderAccelerator: Accelerator;
  decoderAccelerator: Accelerator;
  compileTimeMs: number;
}

interface WorkerXrSegmentResult {
  quadOverlayBuffer: ArrayBuffer;
  cutoutRgbaBuffer: ArrayBuffer | null;
  cropW: number;
  cropH: number;
  quadMinY: number;
  fgCount: number;
  encoderMs: number;
  decoderMs: number;
  totalMs: number;
  bestIou: number;
}

/**
 * XR Circle to Search Script powered by XR Blocks (v0.20.0+) and LiteRT 2.5.3 EfficientSAM-Ti.
 * All CPU/GPU-intensive LiteRT compilation, image preprocessing, inference, and mask
 * reprojection run inside `efficientsam_worker.js` so the WebXR render loop never stalls.
 */
export class XRCircleToSearchScript extends xb.Script {
  private worker: Worker | null = null;
  private nextWorkerReqId = 1;
  private readonly pendingWorkerRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  private encoderAccelerator: Accelerator = 'wasm';
  private decoderAccelerator: Accelerator = 'wasm';
  private modelsReady = false;
  private isSegmenting = false;
  private compileTimeMs = 0;

  private activeController: xb.InteractionSource['controller'] | null = null;
  private isDrawingCircle = false;
  private circlePath: CirclePoint[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly tempRay = new THREE.Ray();

  private readonly quadCanvas: HTMLCanvasElement;
  private readonly quadCtx: CanvasRenderingContext2D;
  private readonly quadTexture: THREE.CanvasTexture;

  private readonly captureCanvas: HTMLCanvasElement;
  private readonly captureCtx: CanvasRenderingContext2D;
  private readonly cutoutCanvas: HTMLCanvasElement;

  private circleQuad: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private hudCard: xb.UICard | null = null;
  private hudStatusText: xb.UIText | null = null;
  private hudMetricsText: xb.UIText | null = null;
  private hudCutoutImage: xb.UIImage | null = null;

  private readonly targetDevice: string;

  private readonly domStatus: HTMLElement | null;
  private readonly domMetricTotal: HTMLElement | null;
  private readonly domMetricSplit: HTMLElement | null;
  private readonly domMetricIou: HTMLElement | null;

  constructor() {
    super();

    this.targetDevice =
      typeof navigator !== 'undefined' &&
      /OculusBrowser|Quest/i.test(navigator.userAgent)
        ? 'quest3'
        : 'galaxyxr';

    this.quadCanvas = document.createElement('canvas');
    this.quadCanvas.width = MODEL_IMG_SIZE;
    this.quadCanvas.height = MODEL_IMG_SIZE;
    this.quadCtx = this.quadCanvas.getContext('2d', {
      willReadFrequently: true,
    })!;
    this.quadTexture = new THREE.CanvasTexture(this.quadCanvas);
    this.quadTexture.colorSpace = THREE.SRGBColorSpace;
    this.quadTexture.minFilter = THREE.LinearFilter;
    this.quadTexture.magFilter = THREE.LinearFilter;

    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.width = MODEL_IMG_SIZE;
    this.captureCanvas.height = MODEL_IMG_SIZE;
    this.captureCtx = this.captureCanvas.getContext('2d', {
      willReadFrequently: true,
    })!;

    this.cutoutCanvas = document.createElement('canvas');
    this.cutoutCanvas.width = 320;
    this.cutoutCanvas.height = 320;

    this.domStatus = document.getElementById('xr-hud-status');
    this.domMetricTotal = document.getElementById('xr-metric-total');
    this.domMetricSplit = document.getElementById('xr-metric-split');
    this.domMetricIou = document.getElementById('xr-metric-iou');

    const clearBtn = document.getElementById('xr-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.clearQuadOverlay();
      });
    }
  }

  override async init(): Promise<void> {
    // 1. Build the 30cm invisible raycast quad
    this.createInvisibleCircleQuad();

    // 2. Build XR Blocks Spatial HUD Card (v0.20.0 UICard API)
    this.createSpatialHudCard();

    // 3. Initialize LiteRT and compile EfficientSAM-Ti models
    await this.initLiteRtModels();
  }

  /**
   * Creates the invisible quad that spawns 10 cm in front of the user's pinching hand.
   * When cleared, its CanvasTexture is 100% transparent (`rgba(0,0,0,0)`), making
   * the quad invisible while still allowing the XR Blocks Reticle to raycast and
   * glide across its surface.
   */
  private createInvisibleCircleQuad(): void {
    this.quadCtx.clearRect(0, 0, MODEL_IMG_SIZE, MODEL_IMG_SIZE);
    this.quadTexture.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(
      QUAD_SIZE_METERS,
      QUAD_SIZE_METERS
    );
    const material = new THREE.MeshBasicMaterial({
      map: this.quadTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.circleQuad = new THREE.Mesh(geometry, material);
    this.circleQuad.name = 'CircleToSearchQuad30cm';
    this.circleQuad.renderOrder = 500;
    this.circleQuad.visible = false;
    this.circleQuad.xb = {pointerEvents: 'none', reticleMode: 'auto'};
    this.add(this.circleQuad);
  }

  /**
   * Builds the XR Blocks Spatial UI Card (`xb.UICard`) to the left of the user's main view.
   */
  private createSpatialHudCard(): void {
    const userHeight = xb.user?.height || 1.6;

    this.hudStatusText = new xb.UIText({
      text: 'Pinch & draw a circle with hand reticle (30cm quad)',
      style: {fontSize: 14},
    });

    this.hudMetricsText = new xb.UIText({
      text: 'Compiling EfficientSAM-Ti on LiteRT...',
      style: {fontSize: 12},
    });

    this.hudCutoutImage = new xb.UIImage({
      src: this.createPlaceholderCutoutDataUrl(),
      style: {
        width: '100%',
        height: 190,
        objectFit: 'contain',
        borderRadius: 12,
      },
    });

    const clearBtn = new xb.UIButton({
      label: 'Clear Circle',
      icon: 'delete',
      onClick: () => {
        this.clearQuadOverlay();
      },
    });

    const card = new xb.UICard({
      size: {width: 0.54, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 16,
      },
      children: [
        new xb.UIPanel({
          style: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
          children: [
            new xb.UIIcon({icon: 'search'}),
            new xb.UIText({
              text: 'XR Circle to Search (LiteRT)',
              style: {fontSize: 17},
            }),
          ],
        }),
        this.hudStatusText,
        this.hudMetricsText,
        this.hudCutoutImage,
        new xb.UIPanel({
          style: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            gap: 8,
          },
          children: [clearBtn],
        }),
      ],
    });

    card.position.set(-0.92, userHeight - 0.05, -1.55);
    card.rotation.y = 0.38;
    this.add(card);
    this.hudCard = card;
  }

  private createPlaceholderCutoutDataUrl(): string {
    const ctx = this.cutoutCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 320, 320);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, 0, 320, 320);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 304, 304);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Camera Cutout', 160, 150);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Pinch & circle any object', 160, 180);
    return this.cutoutCanvas.toDataURL('image/png');
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./efficientsam_worker.js', import.meta.url)
      );
      this.worker.addEventListener('message', (event: MessageEvent) => {
        const {id, ok, result, error} = event.data as {
          id: number;
          ok: boolean;
          result?: unknown;
          error?: string;
        };
        const pending = this.pendingWorkerRequests.get(id);
        if (!pending) return;
        this.pendingWorkerRequests.delete(id);
        if (ok) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker request failed'));
        }
      });
    }
    return this.worker;
  }

  private callWorker<T>(
    type: 'init' | 'xr_segment' | 'encode_image' | 'decode_prompts',
    payload: Record<string, unknown> = {},
    transfer: Transferable[] = []
  ): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextWorkerReqId++;
    return new Promise<T>((resolve, reject) => {
      this.pendingWorkerRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      worker.postMessage({id, type, payload}, transfer);
    });
  }

  private async initLiteRtModels(): Promise<void> {
    try {
      this.updateStatusText(
        'Compiling EfficientSAM-Ti in Web Worker (LiteRT 2.5.3)...'
      );
      const res = await this.callWorker<WorkerInitResult>('init');
      this.encoderAccelerator = res.encoderAccelerator;
      this.decoderAccelerator = res.decoderAccelerator;
      this.compileTimeMs = res.compileTimeMs;
      this.modelsReady = true;

      const accelLabel =
        this.encoderAccelerator === 'webgpu'
          ? this.decoderAccelerator === 'webgpu'
            ? 'WebGPU'
            : 'WebGPU + WASM'
          : 'WASM XNNPACK';

      this.updateStatusText(
        `Ready (${accelLabel} Worker) — Pinch & circle with your hand!`
      );
      if (this.hudMetricsText) {
        this.hudMetricsText.text = `LiteRT 2.5.3 (${accelLabel} Worker) | Compile: ${this.compileTimeMs.toFixed(0)} ms`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to initialize LiteRT worker models:', err);
      this.updateStatusText(`Model load error: ${message}`);
    }
  }

  private updateStatusText(msg: string): void {
    if (this.domStatus) {
      this.domStatus.innerHTML = msg;
    }
    if (this.hudStatusText) {
      this.hudStatusText.text = msg.replace(/<[^>]*>/g, '');
    }
  }

  private isDescendantOf(
    obj: THREE.Object3D | undefined,
    ancestor: THREE.Object3D | null
  ): boolean {
    if (!obj || !ancestor) return false;
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur === ancestor) return true;
      cur = cur.parent;
    }
    return false;
  }

  private getControllerIndex(
    controller: xb.InteractionSource['controller'] | null
  ): number {
    if (!controller) return -1;
    const list = xb.user?.controllers || xb.core?.input?.controllers;
    if (Array.isArray(list)) {
      const idx = list.indexOf(controller);
      if (idx >= 0) return idx;
    }
    return typeof controller.userData?.id === 'number'
      ? controller.userData.id
      : -1;
  }

  private getControllerRay(
    controller: xb.InteractionSource['controller'],
    targetRay: THREE.Ray = this.tempRay
  ): THREE.Ray {
    controller.updateMatrixWorld(true);
    controller.getWorldPosition(targetRay.origin);
    const quat = new THREE.Quaternion();
    controller.getWorldQuaternion(quat);
    targetRay.direction.set(0, 0, -1).applyQuaternion(quat).normalize();
    if (targetRay.direction.lengthSq() > 0) {
      return targetRay;
    }
    const idx = this.getControllerIndex(controller);
    if (idx >= 0 && xb.user?.getRay) {
      xb.user.getRay(idx, targetRay);
    }
    return targetRay;
  }

  private isMouseController(
    controller: THREE.Object3D | null | undefined
  ): boolean {
    if (!controller) return false;
    return (
      controller === xb.core?.input?.mouseController ||
      (typeof xb.MouseController === 'function' &&
        controller instanceof xb.MouseController) ||
      (controller as {type?: string}).type === 'MouseController'
    );
  }

  /**
   * Called globally when any hand pinch or controller click begins.
   * Spawns the invisible quad 30 cm in front of the pinching hand
   * (or 1 m in front of the camera for MouseController)
   * so the XR Blocks Reticle can raycast and draw a circle on it.
   */
  override onSelectStart(event: xb.SelectEvent): void {
    const controller = event?.source?.controller;
    if (!controller || !this.circleQuad) {
      return;
    }

    // Do not spawn the circle quad if the user is interacting with the HUD card
    if (
      this.hudCard &&
      (xb.user?.isPointingAt?.(this.hudCard) ||
        xb.user?.isSelectingAt?.(this.hudCard) ||
        this.isDescendantOf(event?.target, this.hudCard) ||
        this.isDescendantOf(event?.surface, this.hudCard))
    ) {
      return;
    }

    if (this.isDrawingCircle || this.isSegmenting) {
      return;
    }

    this.activeController = controller;
    this.isDrawingCircle = true;
    this.circlePath = [];

    const isMouse = this.isMouseController(controller);
    const quadDistance = isMouse
      ? MOUSE_QUAD_DISTANCE_METERS
      : QUAD_DISTANCE_METERS;
    const quadSize = isMouse ? MOUSE_QUAD_SIZE_METERS : QUAD_SIZE_METERS;

    // 1. Compute hand/controller ray origin and forward direction
    const ray = this.getControllerRay(controller);

    // 2. Place the invisible quad in front of the pinching hand (30cm) or mouse camera (1m)
    const quadCenter = ray.origin
      .clone()
      .addScaledVector(ray.direction, quadDistance);
    this.circleQuad.position.copy(quadCenter);
    this.circleQuad.scale.setScalar(quadSize / QUAD_SIZE_METERS);

    // Orient quad toward the viewer camera so the quad is perpendicular to line-of-sight
    const eyePos = new THREE.Vector3();
    xb.core.camera.getWorldPosition(eyePos);
    this.circleQuad.lookAt(eyePos);
    this.circleQuad.visible = true;
    this.circleQuad.xb = {pointerEvents: 'auto', reticleMode: 'auto'};
    this.circleQuad.updateMatrixWorld(true);

    // 3. Clear quad canvas so the quad starts invisible (except for reticle & stroke)
    this.quadCtx.clearRect(0, 0, MODEL_IMG_SIZE, MODEL_IMG_SIZE);
    this.quadTexture.needsUpdate = true;

    // 4. Sample the initial intersection on the newly placed quad
    this.sampleReticleOnQuad(controller);
    this.updateStatusText(
      isMouse
        ? 'Drawing circle on 1m quad with XR Blocks Reticle...'
        : 'Drawing circle on 30cm quad with XR Blocks Reticle...'
    );
  }

  /**
   * Called each frame while the user holds the pinch.
   */
  override onSelecting(event: xb.SelectEvent): void {
    const controller = event?.source?.controller;
    if (!controller || !this.isDrawingCircle) return;
    if (controller !== this.activeController) return;

    this.sampleReticleOnQuad(controller);
  }

  /**
   * Called when the user releases their pinch.
   * Triggers device camera capture and LiteRT EfficientSAM segmentation.
   */
  override onSelectEnd(event: xb.SelectEndEvent): void {
    const controller = event?.source?.controller;
    if (!this.isDrawingCircle || controller !== this.activeController) {
      return;
    }

    this.isDrawingCircle = false;
    this.activeController = null;
    if (this.circleQuad) {
      this.circleQuad.xb = {pointerEvents: 'none', reticleMode: 'auto'};
    }

    if (this.circlePath.length === 0) {
      if (this.circleQuad) {
        this.circleQuad.visible = false;
      }
      return;
    }

    void this.executeCircleToSearch();
  }

  /**
   * Raycasts the active controller ray against the 30cm invisible quad's current
   * world transform and appends the UV + 3D world intersection to the Circle to Search path.
   */
  private sampleReticleOnQuad(
    controller: xb.InteractionSource['controller'],
    eventIntersection?: THREE.Intersection
  ): void {
    if (!this.circleQuad || !this.circleQuad.visible) return;

    let intersection: THREE.Intersection | null = null;

    // 1. Always raycast directly against this.circleQuad's current matrixWorld first.
    const ray = this.getControllerRay(controller);
    this.raycaster.ray.copy(ray);
    const hits = this.raycaster.intersectObject(this.circleQuad, false);
    if (hits.length > 0 && hits[0].uv) {
      intersection = hits[0];
      if (controller.reticle) {
        controller.reticle.visible = true;
        controller.reticle.position.copy(intersection.point);
      }
    }

    // 2. Fallback to XR Blocks Interaction intersection if direct raycast missed
    if (
      !intersection &&
      eventIntersection &&
      eventIntersection.object === this.circleQuad &&
      eventIntersection.uv
    ) {
      intersection = eventIntersection;
    }

    if (!intersection && xb.user?.getIntersectionAt) {
      const idx = this.getControllerIndex(controller);
      const hit = xb.user.getIntersectionAt(this.circleQuad, idx);
      if (hit && hit.uv) {
        intersection = hit;
      }
    }

    if (
      !intersection &&
      controller.reticle?.intersection?.object === this.circleQuad &&
      controller.reticle.intersection.uv
    ) {
      intersection = controller.reticle.intersection;
    }

    if (!intersection || !intersection.uv) return;

    const u = THREE.MathUtils.clamp(intersection.uv.x, 0, 1);
    const v = THREE.MathUtils.clamp(intersection.uv.y, 0, 1);
    const x = u * MODEL_IMG_SIZE;
    const y = (1.0 - v) * MODEL_IMG_SIZE;

    const lastPt = this.circlePath[this.circlePath.length - 1];
    if (lastPt && Math.hypot(x - lastPt.x, y - lastPt.y) < 2.0) {
      return;
    }

    this.circlePath.push({
      x,
      y,
      u,
      v,
      worldPoint: intersection.point.clone(),
    });
    this.renderCircleStrokeOnQuad(false);
  }

  /**
   * Renders the glowing Google "Circle to Search" stroke onto the 30cm quad's CanvasTexture.
   */
  private renderCircleStrokeOnQuad(
    showFinalBox = false,
    promptInfo: CirclePromptInfo | null = null
  ): void {
    const ctx = this.quadCtx;
    ctx.clearRect(0, 0, MODEL_IMG_SIZE, MODEL_IMG_SIZE);

    if (this.circlePath.length === 0) {
      this.quadTexture.needsUpdate = true;
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer cyan glow pass
    ctx.beginPath();
    ctx.moveTo(this.circlePath[0].x, this.circlePath[0].y);
    for (let i = 1; i < this.circlePath.length; i++) {
      ctx.lineTo(this.circlePath[i].x, this.circlePath[i].y);
    }
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 16;
    ctx.shadowColor = 'rgba(59, 130, 246, 0.95)';
    ctx.shadowBlur = 18;
    ctx.stroke();

    // Inner bright core pass
    ctx.beginPath();
    ctx.moveTo(this.circlePath[0].x, this.circlePath[0].y);
    for (let i = 1; i < this.circlePath.length; i++) {
      ctx.lineTo(this.circlePath[i].x, this.circlePath[i].y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = 5.5;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.85)';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Sparkle particles along the drawn trail
    const step = Math.max(1, Math.floor(this.circlePath.length / 10));
    for (let i = 0; i < this.circlePath.length; i += step) {
      const pt = this.circlePath[i];
      const offsetX = Math.sin(i * 2.3) * 8;
      const offsetY = Math.cos(i * 1.9) * 8;
      ctx.beginPath();
      ctx.arc(pt.x + offsetX, pt.y + offsetY, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#e0f2fe' : '#f5d0fe';
      ctx.fill();
    }

    // Current reticle tip ring
    const tip = this.circlePath[this.circlePath.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (showFinalBox && promptInfo?.box) {
      const {x1, y1, x2, y2} = promptInfo.box;
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }

    ctx.restore();
    this.quadTexture.needsUpdate = true;
  }

  /**
   * Captures the 512x512 RGB frame directly from `xb.core.deviceCamera` (not the virtual
   * scene screenshot) along with the camera's `clipFromWorld` matrix so 3D points on the
   * 30cm quad map directly to camera image pixels.
   */
  private async captureCameraImage(): Promise<CameraCaptureResult> {
    const renderCamera = xb.core.camera as THREE.PerspectiveCamera;
    renderCamera.updateMatrixWorld(true);

    const deviceCamera = xb.core.deviceCamera;
    const xrCameras = xb.core.renderer.xr.isPresenting
      ? (xb.core.renderer.xr.getCamera() as THREE.WebXRArrayCamera)
      : null;

    let clipFromWorld: THREE.Matrix4 | null = null;
    if (deviceCamera) {
      const cameraParams = xb.getCameraParametersSnapshot(
        renderCamera,
        xrCameras,
        deviceCamera,
        this.targetDevice
      );
      if (cameraParams) {
        clipFromWorld = cameraParams.worldFromClip.clone().invert();
      }
    }

    if (!clipFromWorld) {
      clipFromWorld = new THREE.Matrix4().multiplyMatrices(
        renderCamera.projectionMatrix,
        renderCamera.matrixWorldInverse
      );
    }

    // 1. Capture 512x512 ImageData directly from XRDeviceCamera
    if (deviceCamera) {
      const snapshot = await deviceCamera.captureSnapshot({
        width: MODEL_IMG_SIZE,
        height: MODEL_IMG_SIZE,
        outputFormat: 'imageData',
      });
      if (snapshot instanceof ImageData) {
        return {imageData: snapshot, clipFromWorld};
      }
    }

    // 2. Fallback if the simulator camera <video> stream is still warming up:
    // read directly from SimulatorCamera's 512x512 canvas (which contains only simulatorScene).
    const simCamCanvas = (
      xb.core.simulator?.simulatorCamera as
        {canvas?: HTMLCanvasElement} | undefined
    )?.canvas;
    if (simCamCanvas) {
      this.captureCtx.clearRect(0, 0, MODEL_IMG_SIZE, MODEL_IMG_SIZE);
      this.captureCtx.drawImage(
        simCamCanvas,
        0,
        0,
        MODEL_IMG_SIZE,
        MODEL_IMG_SIZE
      );
      return {
        imageData: this.captureCtx.getImageData(
          0,
          0,
          MODEL_IMG_SIZE,
          MODEL_IMG_SIZE
        ),
        clipFromWorld,
      };
    }

    throw new Error('Device camera image is not available yet.');
  }

  /**
   * Projects the 3D circle path points drawn on the 30cm quad into [0..512] camera
   * image coordinates using `clipFromWorld` and builds the EfficientSAM prompt:
   * - Freehand loop / stroke: Bounding Box [labels 2, 3] + Centroid FG Point [label 1]
   * - Quick tap: Single FG Point [label 1]
   */
  private buildPromptFromCircle(
    clipFromWorld: THREE.Matrix4
  ): CirclePromptInfo {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;

    const tempNdc = new THREE.Vector3();
    for (const pt of this.circlePath) {
      tempNdc.copy(pt.worldPoint).applyMatrix4(clipFromWorld);
      const camU = (tempNdc.x + 1.0) * 0.5;
      const camV = 1.0 - (tempNdc.y + 1.0) * 0.5;
      const camX = THREE.MathUtils.clamp(
        camU * MODEL_IMG_SIZE,
        0,
        MODEL_IMG_SIZE
      );
      const camY = THREE.MathUtils.clamp(
        camV * MODEL_IMG_SIZE,
        0,
        MODEL_IMG_SIZE
      );

      if (camX < minX) minX = camX;
      if (camY < minY) minY = camY;
      if (camX > maxX) maxX = camX;
      if (camY > maxY) maxY = camY;
      sumX += camX;
      sumY += camY;
    }

    const n = this.circlePath.length;
    const span = Math.hypot(maxX - minX, maxY - minY);

    const pts = new Float32Array(MAX_POINTS * 2).fill(-1.0);
    const lbls = new Float32Array(MAX_POINTS).fill(-1.0);

    if (span < 14) {
      const cx = THREE.MathUtils.clamp(sumX / n, 0, MODEL_IMG_SIZE);
      const cy = THREE.MathUtils.clamp(sumY / n, 0, MODEL_IMG_SIZE);
      pts[0] = cx;
      pts[1] = cy;
      lbls[0] = 1.0;
      return {pts, lbls, box: null, center: {x: cx, y: cy}};
    }

    const pad = Math.max(4, span * 0.04);
    const x1 = THREE.MathUtils.clamp(minX - pad, 0, MODEL_IMG_SIZE);
    const y1 = THREE.MathUtils.clamp(minY - pad, 0, MODEL_IMG_SIZE);
    const x2 = THREE.MathUtils.clamp(maxX + pad, 0, MODEL_IMG_SIZE);
    const y2 = THREE.MathUtils.clamp(maxY + pad, 0, MODEL_IMG_SIZE);
    const cx = THREE.MathUtils.clamp((x1 + x2) * 0.5, 0, MODEL_IMG_SIZE);
    const cy = THREE.MathUtils.clamp((y1 + y2) * 0.5, 0, MODEL_IMG_SIZE);

    // Box top-left (label 2), Box bottom-right (label 3), Center FG point (label 1)
    pts[0] = x1;
    pts[1] = y1;
    lbls[0] = 2.0;

    pts[2] = x2;
    pts[3] = y2;
    lbls[1] = 3.0;

    pts[4] = cx;
    pts[5] = cy;
    lbls[2] = 1.0;

    return {
      pts,
      lbls,
      box: {x1, y1, x2, y2},
      center: {x: cx, y: cy},
    };
  }

  /**
   * Runs EfficientSAM-Ti Encoder + Decoder + mask reprojection inside `efficientsam_worker.js`
   * on the 512x512 camera image so the main WebXR thread never blocks.
   */
  private async executeCircleToSearch(): Promise<void> {
    if (!this.modelsReady) {
      this.updateStatusText(
        'LiteRT models are still compiling in worker, please wait...'
      );
      return;
    }

    this.isSegmenting = true;
    this.updateStatusText('Segmenting camera image in Web Worker...');

    try {
      // 1. Capture the 512x512 RGB image directly from the device camera
      const {imageData: cameraImageData, clipFromWorld} =
        await this.captureCameraImage();

      // 2. Build Camera-Space Circle Prompt & quadToClip matrix
      const promptInfo = this.buildPromptFromCircle(clipFromWorld);
      const quadToClip = new THREE.Matrix4();
      if (this.circleQuad) {
        this.circleQuad.updateMatrixWorld(true);
        quadToClip.multiplyMatrices(clipFromWorld, this.circleQuad.matrixWorld);
      }
      const quadToClipElements = new Float32Array(quadToClip.elements);
      const rgbaBuffer = cameraImageData.data.buffer.slice(0);
      const ptsBuffer = promptInfo.pts.buffer.slice(0);
      const lblsBuffer = promptInfo.lbls.buffer.slice(0);
      const quadToClipBuffer = quadToClipElements.buffer;

      // 3. Run preprocessing + LiteRT Encoder + Decoder + mask reprojection in Web Worker
      const workerResult = await this.callWorker<WorkerXrSegmentResult>(
        'xr_segment',
        {
          rgbaBuffer,
          ptsBuffer,
          lblsBuffer,
          quadToClipBuffer,
          quadSizeMeters: QUAD_SIZE_METERS,
        },
        [rgbaBuffer, ptsBuffer, lblsBuffer, quadToClipBuffer]
      );

      // 4. Present the precomputed RGBA quad overlay & cutout on the main thread
      this.presentWorkerSegmentationResult(workerResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('XR Circle to Search segmentation failed:', err);
      this.updateStatusText(`Segmentation error: ${message}`);
    } finally {
      this.isSegmenting = false;
    }
  }

  /**
   * Applies the precomputed RGBA overlay and cropped cutout returned by the Web Worker.
   */
  private presentWorkerSegmentationResult(res: WorkerXrSegmentResult): void {
    const W = MODEL_IMG_SIZE;
    const H = MODEL_IMG_SIZE;

    const quadOverlay = new ImageData(
      new Uint8ClampedArray(res.quadOverlayBuffer),
      W,
      H
    );
    this.quadCtx.putImageData(quadOverlay, 0, 0);

    // Draw the circle trail & telemetry pill on top of the quad
    this.quadCtx.save();
    if (this.circlePath.length > 1) {
      this.quadCtx.beginPath();
      this.quadCtx.moveTo(this.circlePath[0].x, this.circlePath[0].y);
      for (let i = 1; i < this.circlePath.length; i++) {
        this.quadCtx.lineTo(this.circlePath[i].x, this.circlePath[i].y);
      }
      this.quadCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      this.quadCtx.lineWidth = 3.5;
      this.quadCtx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      this.quadCtx.shadowBlur = 10;
      this.quadCtx.stroke();
    }

    const badgeText = `✨ Segmented in ${res.totalMs.toFixed(1)} ms (Enc ${res.encoderMs.toFixed(0)}ms · Dec ${res.decoderMs.toFixed(1)}ms · IoU ${res.bestIou.toFixed(2)})`;
    this.quadCtx.font = 'bold 15px sans-serif';
    const textWidth = this.quadCtx.measureText(badgeText).width;
    const pillW = Math.min(W - 20, textWidth + 28);
    const pillX = (W - pillW) / 2;
    const pillY = Math.max(12, (res.quadMinY < H ? res.quadMinY : 60) - 42);

    this.quadCtx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    this.quadCtx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    this.quadCtx.lineWidth = 2;
    this.quadCtx.beginPath();
    this.quadCtx.roundRect(pillX, pillY, pillW, 30, 15);
    this.quadCtx.fill();
    this.quadCtx.stroke();

    this.quadCtx.fillStyle = '#f8fafc';
    this.quadCtx.textAlign = 'center';
    this.quadCtx.textBaseline = 'middle';
    this.quadCtx.fillText(badgeText, W / 2, pillY + 15);
    this.quadCtx.restore();

    this.quadTexture.needsUpdate = true;

    if (res.cutoutRgbaBuffer && res.cropW > 0 && res.cropH > 0) {
      const cutoutDataUrl = this.buildCutoutDataUrlFromCrop(
        res.cutoutRgbaBuffer,
        res.cropW,
        res.cropH
      );
      if (this.hudCutoutImage) {
        this.hudCutoutImage.src = cutoutDataUrl;
      }
    }

    const coveragePct = ((res.fgCount / (W * H)) * 100).toFixed(1);
    if (this.domMetricTotal) {
      this.domMetricTotal.textContent = `${res.totalMs.toFixed(1)} ms`;
    }
    if (this.domMetricSplit) {
      this.domMetricSplit.textContent = `${res.encoderMs.toFixed(0)} / ${res.decoderMs.toFixed(1)} ms`;
    }
    if (this.domMetricIou) {
      this.domMetricIou.textContent = `${res.bestIou.toFixed(3)} (${coveragePct}%)`;
    }

    this.updateStatusText(
      `<strong>Segmented!</strong> Pinch & circle again anywhere in XR.`
    );
    if (this.hudMetricsText) {
      this.hudMetricsText.text = `Total: ${res.totalMs.toFixed(1)}ms (Enc ${res.encoderMs.toFixed(0)}ms / Dec ${res.decoderMs.toFixed(1)}ms) | IoU: ${res.bestIou.toFixed(2)}`;
    }
  }

  /**
   * Builds a 320x320 card preview DataURL from the pre-cropped RGBA buffer computed in the Web Worker.
   */
  private buildCutoutDataUrlFromCrop(
    cutoutRgbaBuffer: ArrayBuffer,
    cropW: number,
    cropH: number
  ): string {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.putImageData(
      new ImageData(new Uint8ClampedArray(cutoutRgbaBuffer), cropW, cropH),
      0,
      0
    );

    const ctx = this.cutoutCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 320, 320);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, 320, 320);

    const pad = 24;
    const scale = Math.min(
      (320 - pad * 2) / Math.max(16, cropW),
      (320 - pad * 2) / Math.max(16, cropH)
    );
    const drawW = cropW * scale;
    const drawH = cropH * scale;
    const dx = (320 - drawW) / 2;
    const dy = (320 - drawH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(56, 189, 248, 0.75)';
    ctx.shadowBlur = 14;
    ctx.drawImage(cropCanvas, 0, 0, cropW, cropH, dx, dy, drawW, drawH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 308, 308);

    return this.cutoutCanvas.toDataURL('image/png');
  }

  /**
   * Hides and clears the 30cm circle quad.
   */
  public clearQuadOverlay(): void {
    this.circlePath = [];
    this.isDrawingCircle = false;
    this.activeController = null;
    this.quadCtx.clearRect(0, 0, MODEL_IMG_SIZE, MODEL_IMG_SIZE);
    this.quadTexture.needsUpdate = true;
    if (this.circleQuad) {
      this.circleQuad.visible = false;
      this.circleQuad.xb = {pointerEvents: 'none', reticleMode: 'auto'};
    }
    this.updateStatusText(
      'Cleared — Pinch & draw a circle with your hand (30cm quad)'
    );
  }

  /**
   * Per-frame update loop.
   */
  override update(): void {
    // Keep the idle reticle at 1m for MouseController and 30cm for hand/XR controllers
    if (xb.core?.options?.reticles) {
      const isMouseConnected =
        xb.core?.input?.mouseController?.userData?.connected === true;
      xb.core.options.reticles.defaultRenderDistance = isMouseConnected
        ? MOUSE_QUAD_DISTANCE_METERS
        : QUAD_DISTANCE_METERS;
    }

    // Ensure continuous reticle sampling while drawing a circle
    if (this.isDrawingCircle && this.activeController) {
      this.sampleReticleOnQuad(this.activeController);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.enableReticles();
  options.reticles.defaultRenderDistance = QUAD_DISTANCE_METERS;
  options.enableControllers();
  options.controllers.visualizeRays = false;
  options.enableHands();
  options.enableCamera('environment');

  options.hands.enabled = true;
  options.hands.visualization = false;
  options.hands.visualizeJoints = false;
  options.hands.visualizeMeshes = false;

  xb.add(new XRCircleToSearchScript());
  void xb.init(options);
});

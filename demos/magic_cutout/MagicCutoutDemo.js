import * as THREE from 'three';
import * as xb from 'xrblocks';

import {SegmenterClient} from './SegmenterClient.js';
import {
  STYLES,
  computeMaskBounds,
  computeStickerDimensions,
  extractForegroundMask,
  renderCutout,
  renderPreviewOverlay,
} from './cutout.js';

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const TEXT = '#f8fafc';
const MUTED = '#cbd5e1';
const ACCENT = '#67e8f9';
const PANEL = '#101827dd';
const CONTROL = '#1e293bcc';
const CONTROL_HOVER = '#334155';
const CONTROL_ACTIVE = '#0f172a';
const ACTIVE = '#155e75';
const ACTIVE_HOVER = '#0e7490';
const ACTIVE_PRESS = '#164e63';
const DISABLED_BG = '#0f172a99';
const DISABLED_BORDER = '#334155';
const DISABLED_TEXT = '#64748b';
const VIEWFINDER_SIZE = 228;
const CUTOUT_MAX_INNER = 204;
const DEFAULT_PLACEMENT_DEPTH_METERS = 1.1;
const STICKER_SURFACE_OFFSET_METERS = 0.03;
const MAX_STICKERS = 12;

const STYLE_LABELS = {
  sticker: 'Sticker',
  glow: 'Glow',
  clean: 'Clean',
};

class ViewfinderPanel extends xb.UIPanel {
  constructor(onSelectPoint, options) {
    super(options);
    this.name = 'Magic cutout viewfinder';
    this.onSelectPoint = onSelectPoint;
    this.pendingPoint = null;
  }

  onObjectSelectStart(event) {
    event.stopPropagation();
    event.stopGlobalPropagation?.();
    this.pendingPoint = normalizedHit(event);
  }

  onObjectSelectEnd(event) {
    event.stopPropagation();
    event.stopGlobalPropagation?.();
    const point = normalizedHit(event) ?? this.pendingPoint;
    this.pendingPoint = null;
    if (point) {
      this.onSelectPoint(point);
    }
  }
}

export class MagicCutoutDemo extends xb.Script {
  constructor({segmenter} = {}) {
    super();
    this.name = 'Magic cutout demo';
    this.segmenter = segmenter ?? new SegmenterClient();
    this.style = 'sticker';
    this.busy = false;
    this.disposed = false;
    this.modelReady = false;
    this.operationId = 0;
    this.currentSegmentation = null;
    this.currentCutout = null;
    this.stickers = [];
    this.textures = new Set();

    // Scratch vectors allocated once to avoid per-interaction allocations.
    this.viewerPos = new THREE.Vector3();
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3();
    this.uvVec = new THREE.Vector2();

    this.modelStatus = {
      text: 'Loading 6.2 MB on-device MagicTouch segmenter…',
      color: MUTED,
    };

    this.buildUi();
  }

  buildUi() {
    this.preview = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Live camera viewfinder',
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        borderRadius: 14,
      },
    });
    this.viewfinder = new ViewfinderPanel(
      (point) => void this.segmentAtPoint(point),
      {
        style: {
          position: 'relative',
          width: VIEWFINDER_SIZE,
          height: VIEWFINDER_SIZE,
          overflow: 'hidden',
          borderRadius: 10,
        },
        children: [this.preview],
      }
    );
    this.viewfinderFrame = new xb.UIPanel({
      style: {
        width: VIEWFINDER_SIZE,
        height: VIEWFINDER_SIZE,
        borderRadius: 14,
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      },
      children: [this.viewfinder],
    });

    this.cutoutImage = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Segmented cutout preview',
      style: {
        width: CUTOUT_MAX_INNER,
        height: CUTOUT_MAX_INNER,
        objectFit: 'fill',
      },
    });
    this.cutoutFrame = new xb.UIPanel({
      style: {
        width: VIEWFINDER_SIZE,
        height: VIEWFINDER_SIZE,
        borderRadius: 14,
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      },
      children: [this.cutoutImage],
    });

    this.styleButtons = STYLES.map((styleKey) => {
      const button = this.createButton(
        STYLE_LABELS[styleKey],
        () => this.setStyle(styleKey),
        {width: 96}
      );
      button.styleKey = styleKey;
      return button;
    });

    this.segmentCenterButton = this.createButton(
      'Segment Center',
      () => void this.segmentAtPoint({u: 0.5, v: 0.5}),
      {width: 156}
    );
    this.liveViewButton = this.createButton(
      'Live View',
      () => this.showLiveView(),
      {width: 112}
    );
    this.pinButton = this.createButton(
      'Pin in Room',
      () => this.pinCurrentCutout(),
      {width: 136, accent: true}
    );
    this.undoButton = this.createButton('Undo', () => this.undoSticker(), {
      width: 96,
    });
    this.clearButton = this.createButton(
      'Clear (0)',
      () => this.clearStickers(),
      {width: 112}
    );

    this.statusText = new xb.UIText({
      text: this.modelStatus.text,
      style: {
        width: '100%',
        fontSize: 15,
        color: this.modelStatus.color,
        textAlign: 'center',
      },
    });
    this.statsText = new xb.UIText({
      text: 'Runs entirely on-device. No camera frames leave your browser.',
      style: {width: '100%', fontSize: 14, color: ACCENT, textAlign: 'center'},
    });

    const card = new xb.UICard({
      size: {width: 0.78, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        gap: 10,
        padding: 24,
        justifyContent: 'flex-start',
        backgroundColor: PANEL,
      },
      children: [
        new xb.UIText({
          text: 'ON-DEVICE MAGIC CUTOUT',
          style: {
            fontSize: 22,
            fontWeight: 'bold',
            color: TEXT,
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: 'Tap any object in the viewfinder to cut it out locally, then pin it in 3D space.',
          style: {fontSize: 15, color: MUTED, textAlign: 'center'},
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 16, justifyContent: 'center'},
          children: [this.viewfinderFrame, this.cutoutFrame],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
          children: this.styleButtons,
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10, justifyContent: 'center'},
          children: [
            this.segmentCenterButton,
            this.liveViewButton,
            this.pinButton,
          ],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10, justifyContent: 'center'},
          children: [this.undoButton, this.clearButton],
        }),
        this.statusText,
        this.statsText,
      ],
    });
    card.name = 'Magic cutout demo card';
    this.card = card;
    this.add(card);
    this.refreshStyleUi();
    this.refreshStickerControls();
  }

  init() {
    this.card.position.set(-0.48, xb.user.height - 0.02, -1.25);
    this.card.rotation.y = 0.24;
    this.camera = xb.core.deviceCamera;
    this.depth = xb.core.depth;
    this.renderCamera = xb.core.camera;
    this.renderer = xb.core.renderer;
    this.onCameraStateChange = (event) => this.updateCameraState(event);
    this.camera?.addEventListener('statechange', this.onCameraStateChange);
    if (this.camera?.state === 'streaming') {
      this.preview.src = this.camera.texture;
      this.updateViewfinderAspect();
    }
    void this.loadModel();
  }

  async loadModel() {
    try {
      await this.segmenter.init();
      if (this.disposed) return;
      this.modelReady = true;
      const fallback = this.segmenter.fallbackReason
        ? ` (${this.segmenter.fallbackReason})`
        : '';
      this.setModelStatus(
        `Ready: ${this.segmenter.delegate} · ${this.segmenter.loadMs} ms load · ${this.segmenter.warmupMs} ms warm-up${fallback}.`,
        ACCENT
      );
    } catch (error) {
      if (this.disposed) return;
      this.setModelStatus(`Segmenter failed: ${messageFor(error)}`, '#fb7185');
    }
  }

  updateCameraState(event) {
    if (event.state === 'streaming') {
      if (!this.previewOverlayTexture) {
        this.preview.src = this.camera.texture;
      }
      this.updateViewfinderAspect();
      if (!this.busy) this.restoreModelStatus();
    } else if (!this.busy) {
      this.setStatus(`Camera ${event.state}. Waiting for a live frame…`, MUTED);
    }
  }

  updateViewfinderAspect() {
    const width = this.camera?.width;
    const height = this.camera?.height;
    if (!width || !height) return;
    const scale = Math.min(VIEWFINDER_SIZE / width, VIEWFINDER_SIZE / height);
    this.viewfinder.style.width = Math.max(1, Math.round(width * scale));
    this.viewfinder.style.height = Math.max(1, Math.round(height * scale));
  }

  updateCutoutPreviewSize(width, height) {
    const scale = Math.min(
      CUTOUT_MAX_INNER / Math.max(1, width),
      CUTOUT_MAX_INNER / Math.max(1, height)
    );
    this.cutoutImage.style.width = Math.max(1, Math.round(width * scale));
    this.cutoutImage.style.height = Math.max(1, Math.round(height * scale));
  }

  setStyle(style) {
    if (!STYLES.includes(style) || this.style === style) return;
    this.style = style;
    this.refreshStyleUi();
    if (this.currentSegmentation) {
      this.renderCurrentCutout();
    }
  }

  refreshStyleUi() {
    for (const button of this.styleButtons) {
      const active = button.styleKey === this.style;
      button.style.backgroundColor = active ? ACTIVE : CONTROL;
      button.style.borderColor = active ? ACCENT : '#475569';
      button.style[':hover'] = {
        backgroundColor: active ? ACTIVE_HOVER : CONTROL_HOVER,
        borderColor: active ? ACCENT : '#94a3b8',
      };
      button.style[':active'] = {
        backgroundColor: active ? ACTIVE_PRESS : CONTROL_ACTIVE,
      };
      button.labelText.style.color = active ? '#ffffff' : TEXT;
    }
  }

  refreshStickerControls() {
    const count = this.stickers.length;
    this.clearButton.labelText.text = `Clear (${count})`;
    this.undoButton.disabled = count === 0;
    this.clearButton.disabled = count === 0;
    this.pinButton.disabled = !this.currentCutout;
    this.undoButton.labelText.style.color = count === 0 ? DISABLED_TEXT : TEXT;
    this.clearButton.labelText.style.color = count === 0 ? DISABLED_TEXT : TEXT;
    this.pinButton.labelText.style.color = !this.currentCutout
      ? DISABLED_TEXT
      : '#ffffff';
  }

  showLiveView() {
    this.previewOverlayTexture = this.replaceTexture(
      this.previewOverlayTexture,
      undefined
    );
    if (this.camera?.state === 'streaming' && this.camera.texture) {
      this.preview.src = this.camera.texture;
    } else {
      this.preview.src = EMPTY_IMAGE;
    }
  }

  resolveTargetDevice() {
    return (
      this.camera?.targetDevice ??
      xb.resolveDeviceCameraTarget() ??
      xb.detectDeviceCameraTarget()
    );
  }

  capturePoseSnapshot() {
    const xrCamera = this.renderer?.xr?.getCamera?.() ?? null;
    const targetDevice = this.resolveTargetDevice();
    const cameraParams =
      this.renderCamera && this.camera
        ? xb.getCameraParametersSnapshot(
            this.renderCamera,
            xrCamera,
            this.camera,
            targetDevice
          )
        : null;

    const depthMesh = this.depth?.depthMesh;
    let depthSnapshot = null;
    if (depthMesh) {
      const sourceGeometry = this.depth.options?.depthMesh
        ?.updateFullResolutionGeometry
        ? depthMesh.geometry
        : depthMesh.downsampledGeometry || depthMesh.geometry;
      let clonedGeometry = null;
      let material = null;
      try {
        clonedGeometry = sourceGeometry.clone();
        clonedGeometry.computeBoundingSphere?.();
        clonedGeometry.computeBoundingBox?.();
        material = new THREE.MeshBasicMaterial();
        depthSnapshot = new THREE.Mesh(clonedGeometry, material);
        depthMesh.getWorldPosition(depthSnapshot.position);
        depthMesh.getWorldQuaternion(depthSnapshot.quaternion);
        depthMesh.getWorldScale(depthSnapshot.scale);
        depthSnapshot.updateMatrixWorld(true);
      } catch (error) {
        clonedGeometry?.dispose();
        material?.dispose();
        throw error;
      }
    }

    return {cameraParams, depthSnapshot};
  }

  resolvePlacement(bounds, pose) {
    const u = bounds.centerU;
    const v = bounds.centerV;
    this.uvVec.set(u, v);

    if (pose?.cameraParams) {
      this.rayOrigin.setFromMatrixPosition(pose.cameraParams.worldFromView);
      if (pose.depthSnapshot) {
        const hit = xb.transformRgbUvToWorld(
          this.uvVec,
          pose.depthSnapshot,
          pose.cameraParams
        );
        if (hit) {
          return {
            worldPosition: hit.worldPosition.clone(),
            viewerPosition: this.rayOrigin.clone(),
            depthInMeters: hit.depthInMeters,
            clipFromViewElements: Array.from(
              pose.cameraParams.clipFromView.elements
            ),
            usedDepth: true,
          };
        }
      }

      this.rayDir
        .set(2 * u - 1, 2 * (1 - v) - 1, -1)
        .applyMatrix4(pose.cameraParams.worldFromClip)
        .sub(this.rayOrigin)
        .normalize();
      return {
        worldPosition: this.rayOrigin
          .clone()
          .addScaledVector(this.rayDir, DEFAULT_PLACEMENT_DEPTH_METERS),
        viewerPosition: this.rayOrigin.clone(),
        depthInMeters: DEFAULT_PLACEMENT_DEPTH_METERS,
        clipFromViewElements: Array.from(
          pose.cameraParams.clipFromView.elements
        ),
        usedDepth: false,
      };
    }

    if (this.renderCamera) {
      this.renderCamera.getWorldPosition(this.rayOrigin);
      this.renderCamera.getWorldDirection(this.rayDir);
      return {
        worldPosition: this.rayOrigin
          .clone()
          .addScaledVector(this.rayDir, DEFAULT_PLACEMENT_DEPTH_METERS),
        viewerPosition: this.rayOrigin.clone(),
        depthInMeters: DEFAULT_PLACEMENT_DEPTH_METERS,
        clipFromViewElements: Array.from(
          this.renderCamera.projectionMatrix.elements
        ),
        usedDepth: false,
      };
    }

    return {
      worldPosition: new THREE.Vector3(0, xb.user.height, -1.1),
      viewerPosition: new THREE.Vector3(0, xb.user.height, 0),
      depthInMeters: DEFAULT_PLACEMENT_DEPTH_METERS,
      clipFromViewElements: null,
      usedDepth: false,
    };
  }

  async segmentAtPoint(point = {u: 0.5, v: 0.5}) {
    if (this.busy || this.disposed) return;
    if (!this.modelReady) {
      this.restoreModelStatus();
      return;
    }
    if (!this.camera || this.camera.state !== 'streaming') {
      this.setStatus('Camera is not ready yet.', '#fbbf24');
      return;
    }

    this.busy = true;
    const opId = ++this.operationId;
    let pose = null;
    this.setStatus('Capturing camera frame…', MUTED);

    try {
      if (!this.camera.isUsingXRCameraAccess) {
        try {
          await this.camera.waitForFreshFrame?.();
        } catch {
          // Freshness is best-effort.
        }
      }
      if (this.disposed || opId !== this.operationId) return;
      if (this.camera.state !== 'streaming') {
        this.setStatus(
          'Camera stopped before the frame was captured.',
          '#fbbf24'
        );
        return;
      }

      const snapshot = await this.camera.captureSnapshot({
        outputFormat: 'imageData',
      });
      if (this.disposed || opId !== this.operationId) return;
      if (!snapshot) {
        this.setStatus(
          'Camera snapshot is unavailable. Try again when the preview is moving.',
          '#fbbf24'
        );
        return;
      }

      // Only clone the depth mesh once a valid camera snapshot is ready.
      pose = this.capturePoseSnapshot();
      this.setStatus('Segmenting selected object on-device…', MUTED);

      const maskResult = await this.segmenter.segmentAt(snapshot, point);
      if (this.disposed || opId !== this.operationId) return;

      const alpha = extractForegroundMask(
        maskResult,
        snapshot.width,
        snapshot.height,
        point
      );
      const boundsResult = computeMaskBounds(
        alpha,
        snapshot.width,
        snapshot.height
      );
      if (!boundsResult.ok) {
        this.setStatus(
          boundsResult.reason === 'full_frame'
            ? 'Selection covered the entire frame. Tap closer to a distinct object.'
            : 'No distinct object found at that spot. Try tapping the center of an object.',
          '#fbbf24'
        );
        return;
      }

      const overlay = renderPreviewOverlay(snapshot, alpha, point);
      this.previewOverlayTexture = this.replaceTexture(
        this.previewOverlayTexture,
        this.textureFromImage(overlay)
      );
      this.preview.src = this.previewOverlayTexture;

      const placement = this.resolvePlacement(boundsResult.bounds, pose);
      this.currentSegmentation = {
        image: snapshot,
        alpha,
        bounds: boundsResult.bounds,
        placement,
        ms: maskResult.ms,
        delegate: maskResult.delegate,
      };
      this.renderCurrentCutout();
      this.setStatus(
        'Cutout ready. Switch styles or press Pin in Room.',
        ACCENT
      );
    } catch (error) {
      if (!this.disposed) {
        this.setStatus(`Segmentation failed: ${messageFor(error)}`, '#fb7185');
      }
    } finally {
      if (pose?.depthSnapshot) {
        disposeDepthSnapshot(pose.depthSnapshot);
      }
      if (opId === this.operationId) {
        this.busy = false;
      }
    }
  }

  renderCurrentCutout() {
    if (!this.currentSegmentation) return;
    const {image, alpha, bounds, placement, ms, delegate} =
      this.currentSegmentation;
    const cutout = renderCutout(image, alpha, bounds, {style: this.style});
    this.updateCutoutPreviewSize(cutout.width, cutout.height);
    this.cutoutTexture = this.replaceTexture(
      this.cutoutTexture,
      this.textureFromImage(cutout)
    );
    this.cutoutImage.src = this.cutoutTexture;
    this.currentCutout = {
      cutout,
      imageWidth: image.width,
      imageHeight: image.height,
      placement,
      ms,
      delegate,
    };
    this.refreshStickerControls();
    const depthLabel = placement.usedDepth
      ? `${placement.depthInMeters.toFixed(2)} m depth`
      : 'no depth mesh (1.10 m fallback)';
    this.statsText.text = `${delegate} · ${ms} ms · ${cutout.width}×${cutout.height} · ${depthLabel}`;
  }

  pinCurrentCutout() {
    if (!this.currentCutout || this.disposed) return;

    if (this.stickers.length >= MAX_STICKERS) {
      const oldest = this.stickers.shift();
      this.disposeSticker(oldest);
    }

    const {cutout, imageWidth, imageHeight, placement} = this.currentCutout;
    const {widthMeters, heightMeters} = computeStickerDimensions(
      cutout.width,
      cutout.height,
      imageWidth,
      imageHeight,
      placement.depthInMeters,
      placement.clipFromViewElements
    );

    const stickerTexture = this.textureFromImage(cutout);
    const geometry = new THREE.PlaneGeometry(widthMeters, heightMeters);
    const material = new THREE.MeshBasicMaterial({
      map: stickerTexture,
      transparent: true,
      alphaTest: 0.02,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);

    const sticker = new THREE.Group();
    sticker.name = 'Spatial cutout sticker';
    sticker.add(mesh);

    this.viewerPos.copy(placement.viewerPosition);
    this.rayDir.copy(this.viewerPos).sub(placement.worldPosition).normalize();
    sticker.position
      .copy(placement.worldPosition)
      .addScaledVector(this.rayDir, STICKER_SURFACE_OFFSET_METERS);
    sticker.lookAt(this.viewerPos.x, sticker.position.y, this.viewerPos.z);

    sticker.xb = {
      pointerEvents: 'auto',
      reticleMode: 'auto',
      manipulation: {
        actions: {
          translate: {
            faceCamera: true,
            mode: 'yaw',
            pushPull: true,
            minDistance: 0.35,
            maxDistance: 6,
          },
          rotate: true,
          scale: {minScale: 0.3, maxScale: 3.5},
        },
      },
    };

    this.add(sticker);
    this.stickers.push(sticker);
    this.refreshStickerControls();
    this.setStatus(
      placement.usedDepth
        ? `Pinned cutout in room at ${placement.depthInMeters.toFixed(2)} m.`
        : 'Pinned cutout in front of view (depth unavailable).',
      ACCENT
    );
  }

  undoSticker() {
    const latest = this.stickers.pop();
    if (!latest) return;
    this.disposeSticker(latest);
    this.refreshStickerControls();
    this.setStatus('Removed latest spatial cutout.', MUTED);
  }

  clearStickers() {
    while (this.stickers.length > 0) {
      this.disposeSticker(this.stickers.pop());
    }
    this.refreshStickerControls();
    this.setStatus('Cleared all spatial cutouts.', MUTED);
  }

  disposeSticker(sticker) {
    if (!sticker) return;
    sticker.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials) {
          if (material.map) {
            this.textures.delete(material.map);
            material.map.dispose();
          }
          material.dispose();
        }
      }
    });
    sticker.removeFromParent();
  }

  textureFromImage(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context) {
      const imageData =
        typeof ImageData !== 'undefined' && image instanceof ImageData
          ? image
          : createImageData(context, image);
      context.putImageData(imageData, 0, 0);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.textures.add(texture);
    return texture;
  }

  replaceTexture(previous, next) {
    if (previous) {
      previous.dispose();
      this.textures.delete(previous);
    }
    return next;
  }

  createButton(label, onClick, {width, accent = false} = {}) {
    const labelText = new xb.UIText({
      text: label,
      style: {
        fontSize: 16,
        fontWeight: 'bold',
        color: TEXT,
        textAlign: 'center',
      },
    });
    const button = new xb.UIButton({
      ariaLabel: label,
      onClick,
      style: {
        width,
        height: 40,
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 12,
        backgroundColor: accent ? ACTIVE : CONTROL,
        borderWidth: 1,
        borderColor: accent ? ACCENT : '#475569',
        alignItems: 'center',
        justifyContent: 'center',
        ':hover': {
          backgroundColor: accent ? ACTIVE_HOVER : CONTROL_HOVER,
          borderColor: accent ? ACCENT : '#94a3b8',
        },
        ':active': {
          backgroundColor: accent ? ACTIVE_PRESS : CONTROL_ACTIVE,
        },
        ':disabled': {
          backgroundColor: DISABLED_BG,
          borderColor: DISABLED_BORDER,
        },
      },
      children: [labelText],
    });
    button.labelText = labelText;
    return button;
  }

  setModelStatus(message, color = MUTED) {
    this.modelStatus = {text: message, color};
    this.restoreModelStatus();
  }

  restoreModelStatus() {
    this.setStatus(this.modelStatus.text, this.modelStatus.color);
  }

  setStatus(message, color = MUTED) {
    this.statusText.text = message;
    this.statusText.style.color = color;
  }

  dispose() {
    this.disposed = true;
    this.operationId++;
    this.camera?.removeEventListener('statechange', this.onCameraStateChange);
    this.clearStickers();
    this.previewOverlayTexture = this.replaceTexture(
      this.previewOverlayTexture,
      undefined
    );
    this.cutoutTexture = this.replaceTexture(this.cutoutTexture, undefined);
    for (const texture of this.textures) texture.dispose();
    this.textures.clear();
    this.segmenter.dispose();
  }
}

function createImageData(context, image) {
  if (typeof ImageData !== 'undefined') {
    try {
      return new ImageData(
        new Uint8ClampedArray(image.data),
        image.width,
        image.height
      );
    } catch {
      // Fallback for test environments without full ImageData constructor support.
    }
  }
  const out = context.createImageData(image.width, image.height);
  out.data.set(image.data);
  return out;
}

function disposeDepthSnapshot(depthSnapshot) {
  depthSnapshot.geometry?.dispose?.();
  if (depthSnapshot.material) {
    const materials = Array.isArray(depthSnapshot.material)
      ? depthSnapshot.material
      : [depthSnapshot.material];
    for (const material of materials) {
      material.dispose?.();
    }
  }
}

function normalizedHit(event) {
  const uv = event?.intersection?.uv;
  if (!uv) return null;
  return {
    u: THREE.MathUtils.clamp(uv.x, 0, 1),
    v: THREE.MathUtils.clamp(1 - uv.y, 0, 1),
  };
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

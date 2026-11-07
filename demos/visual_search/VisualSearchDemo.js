import * as THREE from 'three';
import * as xb from 'xrblocks';

import {SearchClient} from './SearchClient.js';
import {
  CACHED_LABEL,
  DOWNLOAD_LABEL,
  LOADED_LABEL,
  TOTAL_BYTES,
} from './modelConfig.js';
import * as modelStore from './modelStore.js';
import {
  MAX_QUERY_LENGTH,
  cleanQuery,
  describe,
  locate,
  squareGrid,
} from './search.js';

/** One-tap queries; all but keys are in the simulator's living room. */
export const PRESETS = Object.freeze([
  'lamp',
  'sofa',
  'table',
  'book',
  'cup',
  'painting',
  'television',
  'keys',
]);
/** Where the marker goes along the camera ray when there is no depth hit. */
export const FALLBACK_DISTANCE_M = 1.5;
/** Marker spin per frame, in radians, around the axis facing the viewer. */
export const SPIN_PER_FRAME = 0.02;
/** Depth hits outside this range are treated as missing. */
export const MIN_DEPTH_M = 0.2;
export const MAX_DEPTH_M = 8;

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const TEXT = '#f8fafc';
const MUTED = '#cbd5e1';
const ACCENT = '#67e8f9';
const WARN = '#fbbf24';
const ERROR = '#fb7185';
const PANEL = '#101827ee';
const VIEWFINDER_WIDTH = 420;
const CONFIDENCE_COLORS = {strong: '#4ade80', possible: WARN, none: '#94a3b8'};
const RELOAD = 'Load the model again to keep searching.';

/**
 * Open-vocabulary visual search: type or tap what you are looking for, and
 * CLIP compares that text with crops of the camera frame on this device. The
 * best region is outlined on the card and pinned in the room.
 */
export class VisualSearchDemo extends xb.Script {
  constructor({
    client = new SearchClient(),
    store = modelStore,
    now = () => performance.now(),
  } = {}) {
    super();
    this.name = 'Visual search demo';
    this.client = client;
    this.store = store;
    this.now = now;
    this.cached = false;
    this.supported = false;
    this.busy = false;
    this.stopping = false;
    this.disposed = false;
    this.query = '';
    this.lastMatch = null;
    this.frameTexture = null;
    this.previousLoaded = client.loaded;
    this.createPanel();
    this.createMarker();
  }

  createPanel() {
    const button = (label, onClick, style) =>
      new xb.UIButton({
        label,
        onClick,
        style: {flexGrow: 1, fontSize: 20, ...style},
      });
    this.status = new xb.UIText({
      text: 'Checking this browser.',
      style: {fontSize: 18, color: MUTED},
    });
    this.metrics = new xb.UIText({
      text: 'Runs entirely on-device. No camera frames leave your browser.',
      style: {fontSize: 16, color: ACCENT},
    });
    this.preview = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Camera view',
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
        borderRadius: 12,
      },
    });
    this.box = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        zIndex: 1,
        width: '0%',
        height: '0%',
        left: '0%',
        top: '0%',
        borderWidth: 4,
        borderColor: ACCENT,
        borderRadius: 8,
        backgroundColor: '#00000000',
        opacity: 0,
      },
    });
    this.viewfinder = new xb.UIPanel({
      ariaLabel: 'Search view',
      style: {
        position: 'relative',
        width: VIEWFINDER_WIDTH,
        height: Math.round((VIEWFINDER_WIDTH * 9) / 16),
        overflow: 'hidden',
        borderRadius: 12,
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#334155',
      },
      children: [this.preview, this.box],
    });
    this.loadButton = button(DOWNLOAD_LABEL, () => this.onLoadButton());
    this.queryInput = new xb.UITextInput({
      ariaLabel: 'What to look for',
      placeholder: 'What are you looking for? Enter searches.',
      maxLength: MAX_QUERY_LENGTH,
      style: {height: 52, fontSize: 20, flexGrow: 1},
      onInput: (value) => {
        this.query = value;
        this.refreshControls();
      },
      onSubmit: (value) => void this.search(value),
    });
    this.searchButton = button('Search', () => void this.search(this.query), {
      flexGrow: 0,
      width: 120,
    });
    this.liveButton = button('Live view', () => this.showLive(), {
      flexGrow: 0,
      width: 140,
    });
    this.presetButtons = PRESETS.map((preset) =>
      button(preset, () => void this.search(preset), {
        flexBasis: 0,
        fontSize: 18,
      })
    );
    this.buttons = [
      this.loadButton,
      this.searchButton,
      this.liveButton,
      ...this.presetButtons,
    ];
    const half = Math.ceil(PRESETS.length / 2);
    this.card = new xb.UICard({
      size: {width: 1.1, height: 'auto'},
      manipulation: true,
      edge: {scale: true},
      style: {gap: 10, padding: 18, backgroundColor: PANEL},
      children: [
        new xb.UIText({
          text: 'ON-DEVICE VISUAL SEARCH',
          style: {fontSize: 26, fontWeight: 'bold', color: TEXT},
        }),
        new xb.UIText({
          text: `Say what you are looking for in words and CLIP finds it in the camera view. ~${Math.round(TOTAL_BYTES / 1e6)} MB one-time download for Chrome.`,
          style: {fontSize: 17, color: MUTED},
        }),
        this.loadButton,
        this.status,
        new xb.UIPanel({
          style: {flexDirection: 'row', justifyContent: 'center'},
          children: [this.viewfinder],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 8, alignItems: 'center'},
          children: [this.queryInput, this.searchButton],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 6},
          children: this.presetButtons.slice(0, half),
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 6},
          children: this.presetButtons.slice(half),
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
          children: [this.liveButton],
        }),
        this.metrics,
      ],
    });
    this.card.name = 'Visual search card';
    this.add(this.card);
  }

  /** A ring and a label that mark the match in the room. */
  createMarker() {
    this.marker = new THREE.Group();
    this.marker.name = 'Visual search marker';
    this.marker.visible = false;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.ring = new THREE.Mesh(
      // A gap in the ring makes the spin in its own plane visible.
      new THREE.TorusGeometry(0.06, 0.008, 12, 48, Math.PI * 1.6),
      ringMaterial
    );
    this.ring.renderOrder = 10;
    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 12),
      ringMaterial
    );
    this.dot.renderOrder = 10;
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 128;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.labelTexture,
        depthTest: false,
        transparent: true,
      })
    );
    this.label.scale.set(0.32, 0.08, 1);
    this.label.position.set(0, 0.11, 0);
    this.label.renderOrder = 11;
    this.marker.add(this.ring, this.dot, this.label);
    this.spin = 0;
    this.viewerPosition = new THREE.Vector3();
    // Raycasts from the UI should never hit the marker.
    this.marker.traverse((object) => {
      object.raycast = () => {};
    });
    this.add(this.marker);
  }

  init() {
    if (this.disposed) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.card.position.set(0, xb.user.height - 0.15, -1.1);
    this.camera = xb.core.deviceCamera;
    if (this.camera) {
      this.onCameraStateChange = () => this.showLive();
      this.camera.addEventListener('statechange', this.onCameraStateChange);
    }
    this.showLive();
    this.initializing = this.checkAvailability();
    return this.initializing;
  }

  async checkAvailability() {
    const operation = this.begin('checking');
    try {
      await this.client.check();
      if (!this.isCurrent(operation)) return;
      this.supported = true;
      const cached = await this.store.inspectCache();
      if (!this.isCurrent(operation)) return;
      this.cached = cached.complete === true;
      this.status.text = this.cached
        ? 'Model cached. Choose Load to start searching.'
        : 'Download the model once, then search the camera view on this device.';
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.showError(error, this.supported ? 'Error' : 'Unsupported');
      }
    } finally {
      this.finish(operation);
    }
  }

  onLoadButton() {
    if (this.operation?.type === 'loading') return this.cancelLoad();
    // A cache-only click never becomes download consent after eviction.
    return this.loadModel({allowDownload: !this.cached});
  }

  async loadModel({allowDownload = false} = {}) {
    if (!this.canStart() || !this.supported || this.client.loaded) return;
    const operation = this.begin('loading');
    try {
      const cached = await this.store.inspectCache();
      if (!this.isCurrent(operation)) return;
      this.cached = cached.complete === true;
      if (!this.cached) {
        if (!allowDownload) {
          throw new Error('The cached model is incomplete. Choose Download.');
        }
        await this.store.prepareStorage(cached.missingBytes);
        if (!this.isCurrent(operation)) return;
        this.status.text = 'Downloading the search model.';
        await this.client.download({
          onProgress: (event) => {
            if (!this.isCurrent(operation)) return;
            const percent = Math.floor((event.loaded / event.total) * 100);
            this.status.text = `Downloading: ${percent}% of ${Math.round(event.total / 1e6)} MB`;
          },
        });
        if (!this.isCurrent(operation)) return;
        this.cached = true;
      }
      this.status.text = 'Loading the search model.';
      const result = await this.client.load();
      if (!this.isCurrent(operation)) return;
      this.loadMs = result.loadMs;
      this.status.text = `Ready in ${((result.loadMs + result.warmupMs) / 1000).toFixed(1)} s. Type or tap what to find.`;
    } catch (error) {
      if (this.isCurrent(operation)) this.showError(error);
    } finally {
      if (!this.disposed && operation.canceled) {
        this.status.text =
          'Loading canceled. Choose the button above to retry.';
      }
      this.finish(operation);
    }
  }

  async cancelLoad() {
    if (this.operation?.type !== 'loading' || this.stopping) return;
    this.stopping = true;
    this.operation.canceled = true;
    this.status.text = 'Canceling.';
    this.refreshControls();
    try {
      await this.client.stop();
    } catch (error) {
      if (!this.disposed) this.showError(error);
    } finally {
      this.stopping = false;
      this.refreshControls();
    }
  }

  /**
   * Captures the current camera frame and finds `query` in it.
   * @param {string} query
   * @returns {Promise<ReturnType<typeof locate> | null>} The match, or null
   *   when the search could not run.
   */
  async search(query) {
    const text = cleanQuery(query);
    if (!text) {
      this.status.text = 'Type what to look for, or tap a suggestion.';
      return null;
    }
    if (!this.client.loaded || !this.canStart()) return null;
    if (!this.camera || this.camera.state !== 'streaming') {
      this.setStatus('Camera is not ready yet.', WARN);
      return null;
    }
    const operation = this.begin('searching');
    let pose = null;
    this.query = text;
    if (this.queryInput.value !== text) this.queryInput.value = text;
    this.setStatus(`Looking for ${text}…`, MUTED);
    try {
      if (!this.camera.isUsingXRCameraAccess) {
        try {
          await this.camera.waitForFreshFrame();
        } catch {
          // Freshness is best-effort.
        }
      }
      const snapshot = await this.camera.captureSnapshot({
        outputFormat: 'imageData',
      });
      if (!this.isCurrent(operation)) return null;
      if (!snapshot) {
        this.setStatus(
          'Camera snapshot is unavailable. Try again in a moment.',
          WARN
        );
        return null;
      }
      // Read the pose right after the pixels so the marker uses the same view.
      pose = this.capturePose();
      const {width, height} = snapshot;
      const tiles = squareGrid(width, height);
      this.showFrame(snapshot);
      const started = this.now();
      const result = await this.client.search(
        {data: snapshot.data, width, height},
        tiles,
        text
      );
      if (!this.isCurrent(operation)) return null;
      const match = locate(
        result.scores,
        result.probabilities,
        tiles,
        width,
        height
      );
      this.lastMatch = match;
      this.showMatch(text, match, pose);
      const total = this.now() - started;
      this.metrics.text = `${tiles.length} crops · score ${match.score.toFixed(3)} · ${Math.round(result.visionMs)} ms image + ${Math.round(result.textMs)} ms text · ${Math.round(total)} ms total`;
      return match;
    } catch (error) {
      if (this.isCurrent(operation)) this.showError(error);
      return null;
    } finally {
      // Like ObjectDetector.detectObjects(): the depth copy is freed on every
      // path, including stale operations and errors.
      disposePose(pose);
      this.finish(operation);
    }
  }

  /**
   * Camera matrices and a depth mesh copy for placing the marker later. The
   * caller owns the copy and frees it with disposePose().
   */
  capturePose() {
    try {
      const params = xb.getCameraParametersSnapshot(
        xb.core.camera,
        xb.core.renderer?.xr?.getCamera?.() ?? null,
        this.camera,
        // Honors options.deviceCamera.targetDevice and ?camera= when set.
        this.camera?.targetDevice ?? xb.detectDeviceCameraTarget()
      );
      if (!params) return null;
      const depth = xb.core.depth;
      const depthMesh = depth?.depthMesh;
      // Same geometry choice as the SDK's ObjectDetector: the downsampled
      // mesh is the one kept up to date unless full resolution is requested.
      const source = depth?.options?.depthMesh?.updateFullResolutionGeometry
        ? depthMesh?.geometry
        : depthMesh?.downsampledGeometry || depthMesh?.geometry;
      let depthSnapshot = null;
      let geometry = null;
      try {
        if (source) {
          geometry = source.clone();
          geometry.computeBoundingSphere();
          geometry.computeBoundingBox();
          depthSnapshot = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial()
          );
          depthMesh.getWorldPosition(depthSnapshot.position);
          depthMesh.getWorldQuaternion(depthSnapshot.quaternion);
          depthMesh.getWorldScale(depthSnapshot.scale);
          depthSnapshot.updateMatrixWorld(true);
        }
      } catch (error) {
        geometry?.dispose();
        depthSnapshot?.material.dispose();
        throw error;
      }
      return {params, depthSnapshot};
    } catch (error) {
      console.warn('Visual search: camera pose unavailable', error);
      return null;
    }
  }

  showMatch(query, match, pose) {
    const color = CONFIDENCE_COLORS[match.confidence];
    this.setStatus(describe(query, match), color);
    const found = match.confidence !== 'none';
    const {u0, v0, u1, v1} = match.box;
    this.box.style.left = `${u0 * 100}%`;
    this.box.style.top = `${v0 * 100}%`;
    this.box.style.width = `${(u1 - u0) * 100}%`;
    this.box.style.height = `${(v1 - v0) * 100}%`;
    this.box.style.borderColor = color;
    this.box.style.opacity = found ? 1 : 0;
    this.placeMarker(query, match, pose);
  }

  placeMarker(query, match, pose) {
    if (match.confidence === 'none' || !pose?.params) {
      this.marker.visible = false;
      return;
    }
    const uv = new THREE.Vector2(match.center.u, match.center.v);
    let position = null;
    let source = 'ray';
    if (pose.depthSnapshot) {
      const hit = xb.transformRgbUvToWorld(uv, pose.depthSnapshot, pose.params);
      // A hit at the camera means the depth mesh is not populated yet.
      if (
        hit &&
        hit.depthInMeters >= MIN_DEPTH_M &&
        hit.depthInMeters <= MAX_DEPTH_M
      ) {
        position = hit.worldPosition;
        source = 'depth';
      }
    }
    if (!position) {
      const origin = new THREE.Vector3().applyMatrix4(
        pose.params.worldFromView
      );
      const direction = new THREE.Vector3(2 * uv.x - 1, 1 - 2 * uv.y, -1)
        .applyMatrix4(pose.params.worldFromClip)
        .sub(origin)
        .normalize();
      position = origin.addScaledVector(direction, FALLBACK_DISTANCE_M);
    }
    this.marker.position.copy(position);
    this.placement = {source, position: position.clone()};
    const color = CONFIDENCE_COLORS[match.confidence];
    this.ring.material.color.set(color);
    this.drawLabel(cleanQuery(query), color);
    this.marker.visible = true;
  }

  drawLabel(text, color) {
    const context = this.labelCanvas.getContext('2d');
    if (!context) return;
    const {width, height} = this.labelCanvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#0f172acc';
    context.beginPath();
    context.roundRect(4, 4, width - 8, height - 8, 40);
    context.fill();
    context.lineWidth = 6;
    context.strokeStyle = color;
    context.stroke();
    context.fillStyle = TEXT;
    context.font = 'bold 56px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2, width - 48);
    this.labelTexture.needsUpdate = true;
  }

  /** Shows the frame that was searched, so the outline lines up with it. */
  showFrame(snapshot) {
    const canvas = document.createElement('canvas');
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    canvas.getContext('2d')?.putImageData(snapshot, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.frameTexture?.dispose();
    this.frameTexture = texture;
    this.preview.src = texture;
    this.box.style.opacity = 0;
    this.fitViewfinder(snapshot.width, snapshot.height);
  }

  showLive() {
    if (this.disposed) return;
    this.box.style.opacity = 0;
    this.frameTexture?.dispose();
    this.frameTexture = null;
    if (this.camera?.state === 'streaming' && this.camera.texture) {
      this.preview.src = this.camera.texture;
      this.fitViewfinder(this.camera.width, this.camera.height);
    } else {
      this.preview.src = EMPTY_IMAGE;
    }
  }

  fitViewfinder(width, height) {
    if (!width || !height) return;
    this.viewfinder.style.width = VIEWFINDER_WIDTH;
    this.viewfinder.style.height = Math.round(
      (VIEWFINDER_WIDTH * height) / width
    );
  }

  update() {
    if (!this.marker.visible) return;
    // Face the viewer, then spin in that plane; a slow spin makes the marker
    // easy to spot against busy backgrounds.
    this.spin = (this.spin + SPIN_PER_FRAME) % (Math.PI * 2);
    const viewer = xb.core.camera;
    if (viewer) this.ring.lookAt(viewer.getWorldPosition(this.viewerPosition));
    this.ring.rotateZ(this.spin);
  }

  refreshControls() {
    const busy = this.busy || !!this.stopping;
    const unavailable = this.disposed || !this.supported;
    const loading = this.operation?.type === 'loading';
    const label = loading
      ? 'Cancel'
      : this.client.loaded
        ? LOADED_LABEL
        : this.cached
          ? CACHED_LABEL
          : DOWNLOAD_LABEL;
    if (this.loadButton.label !== label) this.loadButton.label = label;
    this.loadButton.disabled = loading
      ? !!this.stopping
      : unavailable || busy || this.client.loaded;
    const canSearch = !unavailable && !busy && this.client.loaded;
    this.searchButton.disabled = !canSearch || !cleanQuery(this.query);
    for (const preset of this.presetButtons) preset.disabled = !canSearch;
    this.liveButton.disabled = this.disposed || busy;
    const unloaded =
      !this.disposed && this.previousLoaded && !this.client.loaded && !busy;
    this.previousLoaded = this.client.loaded;
    if (unloaded && !this.status.text.endsWith(RELOAD)) {
      this.status.text = `${this.status.text} ${RELOAD}`.trim();
    }
  }

  canStart() {
    return !this.disposed && !this.busy && !this.stopping;
  }

  begin(type) {
    this.operation = {type, canceled: false};
    this.busy = true;
    this.refreshControls();
    return this.operation;
  }

  isCurrent(operation) {
    return (
      !this.disposed && this.operation === operation && !operation.canceled
    );
  }

  finish(operation) {
    if (this.operation !== operation) return;
    this.operation = undefined;
    this.busy = false;
    this.refreshControls();
  }

  setStatus(message, color = MUTED) {
    this.status.text = message;
    this.status.style.color = color;
  }

  showError(error, prefix = 'Error') {
    console.error('Visual search:', error);
    if (!this.disposed) {
      this.setStatus(`${prefix}: ${error?.message ?? String(error)}`, ERROR);
    }
  }

  dispose() {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    if (this.operation) this.operation.canceled = true;
    for (const button of this.buttons) button.onClick = undefined;
    this.camera?.removeEventListener('statechange', this.onCameraStateChange);
    this.frameTexture?.dispose();
    this.labelTexture.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.dot.geometry.dispose();
    this.label.material.dispose();
    this.disposing = this.client
      .dispose()
      .catch((error) => console.error('Visual search:', error));
    return this.disposing;
  }
}

/** Frees the depth mesh copy made by capturePose(). */
function disposePose(pose) {
  pose?.depthSnapshot?.geometry.dispose();
  pose?.depthSnapshot?.material.dispose();
}

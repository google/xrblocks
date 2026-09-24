import * as THREE from 'three';
import * as xb from 'xrblocks';

import {Upscaler} from './Upscaler.js';
import {cropCenter} from './tiling.js';

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const TEXT = '#f8fafc';
const MUTED = '#cbd5e1';
const ACCENT = '#67e8f9';
const PANEL = '#101827dd';
const CONTROL = '#1e293bcc';
const ACTIVE = '#155e75';
const VIEWFINDER_WIDTH = 260;

export class SuperResolutionDemo extends xb.Script {
  constructor() {
    super();
    this.name = 'Super-resolution demo';
    this.upscaler = new Upscaler();
    this.cropSize = 128;
    this.busy = false;
    this.disposed = false;
    this.modelReady = false;
    this.textures = new Set();
    this.modelStatus = {
      text: 'Loading 3.5 MB on-device upscaler…',
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
    this.cropOutline = new xb.UIPanel({
      style: {
        position: 'absolute',
        width: '50%',
        height: '50%',
        left: '25%',
        top: '25%',
        zIndex: 1,
        borderWidth: 3,
        borderColor: ACCENT,
        backgroundColor: '#00000000',
      },
    });
    this.viewfinder = new xb.UIPanel({
      style: {
        position: 'relative',
        width: VIEWFINDER_WIDTH,
        height: VIEWFINDER_WIDTH,
        overflow: 'hidden',
        borderRadius: 14,
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#334155',
      },
      children: [this.preview, this.cropOutline],
    });

    this.resultImage = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Super-resolution result',
      style: {
        width: 260,
        height: 260,
        objectFit: 'contain',
        borderRadius: 14,
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#334155',
      },
    });

    this.cropButtons = [64, 128, 256].map((size) =>
      this.createButton(`${size}px`, () => this.setCropSize(size), {width: 78})
    );
    this.beforeButton = this.createButton(
      'Before',
      () => this.showResult(false),
      {width: 116}
    );
    this.afterButton = this.createButton('After', () => this.showResult(true), {
      width: 116,
    });
    this.enhanceButton = this.createButton(
      'Enhance',
      () => void this.enhance(),
      {
        width: 248,
        accent: true,
      }
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
      size: {width: 0.82, height: 'auto'},
      manipulation: true,
      edge: {scale: true},
      style: {gap: 12, padding: 18, backgroundColor: PANEL},
      children: [
        new xb.UIText({
          text: 'ON-DEVICE SUPER-RESOLUTION',
          style: {
            fontSize: 22,
            fontWeight: 'bold',
            color: TEXT,
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: 'Aim the center square, then enhance a crop with LiteRT.js.',
          style: {fontSize: 15, color: MUTED, textAlign: 'center'},
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 16, justifyContent: 'center'},
          children: [this.viewfinder, this.resultImage],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
          children: this.cropButtons,
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', justifyContent: 'center'},
          children: [this.enhanceButton],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10, justifyContent: 'center'},
          children: [this.beforeButton, this.afterButton],
        }),
        this.statusText,
        this.statsText,
      ],
    });
    card.name = 'Super-resolution demo card';
    this.card = card;
    this.add(card);
    this.refreshCropUi();
    this.showResult(true);
  }

  init() {
    this.card.position.set(0, xb.user.height, -1.25);
    this.camera = xb.core.deviceCamera;
    this.onCameraStateChange = (event) => this.updateCameraState(event);
    this.camera.addEventListener('statechange', this.onCameraStateChange);
    if (this.camera.state === 'streaming') {
      this.preview.src = this.camera.texture;
      this.updateViewfinderAspect();
    }
    this.updateCropOutline();
    void this.loadModel();
  }

  async loadModel() {
    try {
      await this.upscaler.init();
      if (this.disposed) return;
      this.modelReady = true;
      const fallback = this.upscaler.fallbackReason
        ? ` (${this.upscaler.fallbackReason})`
        : '';
      const cpuNote =
        this.upscaler.backend === 'wasm' ? ' Slow CPU fallback.' : '';
      this.setModelStatus(
        `Ready: ${this.backendLabel()} · ${this.upscaler.loadMs} ms load · ${this.upscaler.warmupMs} ms warm-up${fallback}.${cpuNote}`,
        ACCENT
      );
    } catch (error) {
      if (this.disposed) return;
      this.setModelStatus(`Upscaler failed: ${messageFor(error)}`, '#fb7185');
    }
  }

  updateCameraState(event) {
    if (event.state === 'streaming') {
      this.preview.src = this.camera.texture;
      this.updateViewfinderAspect();
      this.updateCropOutline();
      if (!this.busy) this.restoreModelStatus();
    } else if (!this.busy) {
      this.setStatus(`Camera ${event.state}. Waiting for a live frame…`, MUTED);
    }
  }

  setCropSize(size) {
    if (this.busy) return;
    this.cropSize = size;
    this.refreshCropUi();
  }

  refreshCropUi() {
    for (const button of this.cropButtons) {
      const active = button.cropSize === this.cropSize;
      button.style.backgroundColor = active ? ACTIVE : CONTROL;
      button.labelText.style.color = active ? '#ffffff' : TEXT;
    }
    this.updateCropOutline();
  }

  updateViewfinderAspect() {
    const width = this.camera?.width;
    const height = this.camera?.height;
    if (!width || !height) return;
    this.viewfinder.style.width = VIEWFINDER_WIDTH;
    this.viewfinder.style.height = Math.round(
      (VIEWFINDER_WIDTH * height) / width
    );
  }

  updateCropOutline() {
    const cameraWidth = this.camera?.width || this.cropSize;
    const cameraHeight = this.camera?.height || this.cropSize;
    const side = Math.min(cameraWidth, cameraHeight, this.cropSize);
    const widthFraction = side / cameraWidth;
    const heightFraction = side / cameraHeight;
    this.cropOutline.style.width = `${Math.round(widthFraction * 100)}%`;
    this.cropOutline.style.height = `${Math.round(heightFraction * 100)}%`;
    this.cropOutline.style.left = `${Math.round((1 - widthFraction) * 50)}%`;
    this.cropOutline.style.top = `${Math.round((1 - heightFraction) * 50)}%`;
  }

  async enhance() {
    if (this.busy) return;
    if (!this.modelReady) {
      this.restoreModelStatus();
      return;
    }
    if (!this.camera || this.camera.state !== 'streaming') {
      this.setStatus('Camera is not ready yet.', '#fbbf24');
      return;
    }
    if (this.camera.isUsingXRCameraAccess) {
      this.setStatus(
        'This XR camera path exposes a live texture but not snapshots yet.',
        '#fbbf24'
      );
      return;
    }

    this.busy = true;
    this.setStatus('Capturing camera crop…', MUTED);
    try {
      try {
        await this.camera.waitForFreshFrame();
      } catch (_error) {
        // Freshness is best-effort.
      }
      if (this.camera.state !== 'streaming') {
        this.setStatus(
          'Camera stopped before the snapshot was captured.',
          '#fbbf24'
        );
        return;
      }
      const snapshot = this.camera.getSnapshot({outputFormat: 'imageData'});
      if (!snapshot) {
        this.setStatus(
          'Camera snapshot is unavailable. Try again when the preview is moving.',
          '#fbbf24'
        );
        return;
      }
      const crop = cropCenter(snapshot, this.cropSize);
      this.beforeTexture = this.replaceTexture(
        this.beforeTexture,
        this.textureFromImage(crop, this.upscaler.scale)
      );
      this.afterTexture = this.replaceTexture(this.afterTexture, undefined);
      this.showResult(false);
      this.setStatus('Enhancing…', MUTED);
      const result = await this.upscaler.upscale(crop, (done, total) => {
        this.setStatus(`Enhancing… tile ${done}/${total}`, MUTED);
      });
      if (this.disposed) return;
      this.afterTexture = this.replaceTexture(
        this.afterTexture,
        this.textureFromImage(result.image, 1)
      );
      this.showResult(true);
      this.setStatus('Enhancement complete.', ACCENT);
      this.statsText.text = `${this.backendLabel()} · ${result.tiles} tiles · ${result.ms} ms · ${result.image.width}×${result.image.height}`;
    } catch (error) {
      if (!this.disposed)
        this.setStatus(`Enhance failed: ${messageFor(error)}`, '#fb7185');
    } finally {
      this.busy = false;
    }
  }

  textureFromImage(image, displayScale) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width * displayScale;
    canvas.height = image.height * displayScale;
    const context = canvas.getContext('2d');
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    source
      .getContext('2d')
      .putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
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

  showResult(after) {
    this.resultImage.src = after
      ? this.afterTexture || EMPTY_IMAGE
      : this.beforeTexture || EMPTY_IMAGE;
    this.beforeButton.style.backgroundColor = after ? CONTROL : ACTIVE;
    this.afterButton.style.backgroundColor = after ? ACTIVE : CONTROL;
    this.beforeButton.labelText.style.color = after ? TEXT : '#ffffff';
    this.afterButton.labelText.style.color = after ? '#ffffff' : TEXT;
  }

  createButton(label, onClick, {width, accent = false} = {}) {
    const labelText = new xb.UIText({
      text: label,
      style: {
        fontSize: 17,
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
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 12,
        backgroundColor: accent ? ACTIVE : CONTROL,
        borderWidth: 1,
        borderColor: accent ? ACCENT : '#475569',
        alignItems: 'center',
        justifyContent: 'center',
      },
      children: [labelText],
    });
    button.labelText = labelText;
    const match = label.match(/^(\d+)px$/);
    if (match) button.cropSize = Number(match[1]);
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

  backendLabel() {
    return this.upscaler.backend === 'webgpu' ? 'WebGPU' : 'WASM';
  }

  dispose() {
    this.disposed = true;
    this.camera?.removeEventListener('statechange', this.onCameraStateChange);
    for (const texture of this.textures) texture.dispose();
    this.textures.clear();
    this.upscaler.dispose();
  }
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

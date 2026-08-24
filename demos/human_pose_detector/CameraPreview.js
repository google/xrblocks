import * as xb from 'xrblocks';

// Small picture-in-picture view of what the pose model is actually being fed.
//
// The demo otherwise draws nothing camera-related, so a camera that never
// starts, or one pointed at the wrong thing, looks identical to "no person in
// frame". This makes that difference visible.
//
// The preview is mirrored with CSS so it reads like a selfie. The frames handed
// to MediaPipe are deliberately left alone: pose landmarks are named from the
// subject's point of view (landmark 11 is the subject's left shoulder), so
// mirroring the input would silently swap every left/right joint and produce a
// plausible-looking but wrong skeleton.
const PREVIEW_WIDTH = 200;

export class CameraPreview extends xb.Script {
  init() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed; bottom: 12px; right: 12px; width: ${PREVIEW_WIDTH}px;
      background: rgba(15, 18, 25, 0.85); border: 1px solid #4796e3;
      border-radius: 8px; overflow: hidden; z-index: 100;
      font-family: sans-serif; color: #e2e8f0;
    `;

    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    // Mirrored for display only, so the preview reads like a selfie. The frames
    // handed to MediaPipe are never flipped. Click to toggle, since some
    // capture paths already deliver a mirrored stream.
    this.mirrored = true;
    this.applyMirror();
    this.canvas.title = 'click to flip the preview';
    this.canvas.style.cursor = 'pointer';
    this.canvas.addEventListener('click', () => {
      this.mirrored = !this.mirrored;
      this.applyMirror();
    });

    this.status = document.createElement('div');
    this.status.style.cssText =
      'font-size: 11px; padding: 5px 7px; text-align: center;';
    this.status.textContent = 'waiting for camera...';

    this.container.append(this.canvas, this.status);
    document.body.appendChild(this.container);

    this.lastFrameAtMs = 0;
  }

  applyMirror() {
    this.canvas.style.cssText = `width: 100%; display: block; cursor: pointer;
      transform: scaleX(${this.mirrored ? -1 : 1});`;
  }

  update() {
    // Throttle: the preview is a debugging aid, not something worth a
    // full-resolution readback every frame.
    const now = performance.now();
    if (now - this.lastFrameAtMs < 100) return;
    this.lastFrameAtMs = now;
    void this.drawFrame();
  }

  async drawFrame() {
    const camera = xb.core.deviceCamera;
    if (!camera?.loaded) {
      this.status.textContent = 'camera not available';
      this.status.style.color = '#ff8080';
      return;
    }

    let frame;
    try {
      frame = await camera.getSnapshot({outputFormat: 'imageData'});
    } catch {
      frame = null;
    }
    if (!frame) {
      this.status.textContent = 'camera returned no frame';
      this.status.style.color = '#ff8080';
      return;
    }

    if (this.canvas.width !== frame.width) {
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
    }
    this.context.putImageData(frame, 0, 0);

    const poses = xb.core.world?.humans?.poses ?? [];
    this.status.textContent = poses.length
      ? `tracking ${poses.length} person${poses.length > 1 ? 's' : ''}`
      : 'camera live, no person detected';
    this.status.style.color = poses.length ? '#5ad469' : '#a0aec0';
  }

  dispose() {
    this.container?.remove();
    super.dispose();
  }
}

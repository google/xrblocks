import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import type {MeshBasicNodeMaterial} from 'three/webgpu';

import {XRDeviceCamera} from '../../camera/XRDeviceCamera.js';
import {isWebGPURenderer, type WebGLOrWebGPURenderer} from '../RendererTypes';

// Use a small canvas since a full size canvas can consume a lot of memory and
// cause toDataUrl to be slow.
const DEFAULT_CANVAS_WIDTH = 640;

function flipBufferVertically(
  buffer: Uint8Array,
  width: number,
  height: number
) {
  const bytesPerRow = width * 4;
  const tempRow = new Uint8Array(bytesPerRow);
  for (let y = 0; y < height / 2; y++) {
    const topRowY = y;
    const bottomRowY = height - 1 - y;
    const topRowOffset = topRowY * bytesPerRow;
    const bottomRowOffset = bottomRowY * bytesPerRow;
    tempRow.set(buffer.subarray(topRowOffset, topRowOffset + bytesPerRow));
    buffer.set(
      buffer.subarray(bottomRowOffset, bottomRowOffset + bytesPerRow),
      topRowOffset
    );
    buffer.set(tempRow, bottomRowOffset);
  }
}

/**
 * Writes `renderer.xr.isPresenting`. Both backends expose it, but the WebGPU
 * renderer's type marks the accessor read-only.
 */
function setXrPresenting(renderer: WebGLOrWebGPURenderer, value: boolean) {
  (renderer.xr as unknown as {isPresenting: boolean}).isPresenting = value;
}

class PendingScreenshotRequest {
  constructor(
    public resolve: (value: string) => void,
    public reject: (reason?: Error) => void,
    public overlayOnCamera: boolean
  ) {}
}

export class ScreenshotSynthesizer {
  private pendingScreenshotRequests: PendingScreenshotRequest[] = [];
  private virtualCanvas?: HTMLCanvasElement;
  private virtualBuffer = new Uint8Array();
  // Smaller resolution render target than the main render target.
  private virtualRenderTarget?: THREE.RenderTarget;
  private virtualRealCanvas?: HTMLCanvasElement;
  private virtualRealBuffer = new Uint8Array();
  private virtualRealRenderTarget?: THREE.RenderTarget;
  private fullScreenQuad?: FullScreenQuad;
  private webgpuQuad?: {
    mesh: THREE.Mesh<THREE.PlaneGeometry, MeshBasicNodeMaterial>;
    camera: THREE.Camera;
  };
  private renderTargetWidth = DEFAULT_CANVAS_WIDTH;
  private virtualCaptureInFlight = false;
  private virtualRealCaptureInFlight = false;

  onAfterRender(
    renderer: WebGLOrWebGPURenderer,
    renderSceneFn: () => void,
    deviceCamera?: XRDeviceCamera
  ) {
    if (this.pendingScreenshotRequests.length == 0) {
      return;
    }

    const haveVirtualOnlyRequests = this.pendingScreenshotRequests.every(
      (request) => !request.overlayOnCamera
    );
    if (haveVirtualOnlyRequests && !this.virtualCaptureInFlight) {
      this.virtualCaptureInFlight = true;
      this.createVirtualImageDataURL(renderer, renderSceneFn)
        .then((virtualImageDataUrl) => {
          this.resolveVirtualOnlyRequests(virtualImageDataUrl);
        })
        .catch((error: Error) => {
          this.rejectVirtualOnlyRequests(error);
        })
        .finally(() => {
          this.virtualCaptureInFlight = false;
        });
    }

    const haveVirtualAndRealReqeusts = this.pendingScreenshotRequests.some(
      (request) => request.overlayOnCamera
    );
    if (
      haveVirtualAndRealReqeusts &&
      deviceCamera &&
      !this.virtualRealCaptureInFlight
    ) {
      this.virtualRealCaptureInFlight = true;
      this.createVirtualRealImageDataURL(renderer, renderSceneFn, deviceCamera)
        .then((virtualRealImageDataUrl) => {
          if (virtualRealImageDataUrl) {
            this.resolveVirtualRealRequests(virtualRealImageDataUrl);
          }
        })
        .catch((error: Error) => {
          this.rejectVirtualRealRequests(error);
        })
        .finally(() => {
          this.virtualRealCaptureInFlight = false;
        });
    } else if (haveVirtualAndRealReqeusts && !deviceCamera) {
      this.rejectVirtualRealRequests(new Error('No device camera provided'));
    }
  }

  private async createVirtualImageDataURL(
    renderer: WebGLOrWebGPURenderer,
    renderSceneFn: () => void
  ) {
    const mainRenderTarget = renderer.getRenderTarget();
    const isRenderingStereo =
      renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length == 2;
    const mainRenderTargetSize = new THREE.Vector2();
    if (mainRenderTarget) {
      mainRenderTargetSize.set(mainRenderTarget.width, mainRenderTarget.height);
    } else {
      renderer.getSize(mainRenderTargetSize);
    }
    const mainRenderTargetSingleViewWidth = isRenderingStereo
      ? mainRenderTargetSize.x / 2
      : mainRenderTargetSize.x;
    const scaledHeight = Math.round(
      mainRenderTargetSize.y *
        (this.renderTargetWidth / mainRenderTargetSingleViewWidth)
    );
    if (
      !this.virtualRenderTarget ||
      this.virtualRenderTarget.width != this.renderTargetWidth
    ) {
      this.virtualRenderTarget?.dispose();
      this.virtualRenderTarget = this.createRenderTarget(
        renderer,
        this.renderTargetWidth,
        scaledHeight
      );
    }
    const xrIsPresenting = renderer.xr.isPresenting;
    setXrPresenting(renderer, false);
    const virtualRenderTarget = this.virtualRenderTarget;
    renderer.setRenderTarget(virtualRenderTarget as THREE.WebGLRenderTarget);
    renderer.clearColor();
    renderer.clearDepth();
    renderSceneFn();
    renderer.setRenderTarget(
      mainRenderTarget as THREE.WebGLRenderTarget | null
    );
    setXrPresenting(renderer, xrIsPresenting);

    const expectedBufferLength =
      virtualRenderTarget.width * virtualRenderTarget.height * 4;
    if (this.virtualBuffer.length != expectedBufferLength) {
      this.virtualBuffer = new Uint8Array(expectedBufferLength);
    }
    const buffer = this.virtualBuffer;
    await this.readRenderTargetInto(renderer, virtualRenderTarget, buffer);
    const canvas =
      this.virtualCanvas ||
      (this.virtualCanvas = document.createElement('canvas'));
    canvas.width = virtualRenderTarget.width;
    canvas.height = virtualRenderTarget.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    const imageData = new ImageData(
      new Uint8ClampedArray(buffer),
      virtualRenderTarget.width,
      virtualRenderTarget.height
    );
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }

  private resolveVirtualOnlyRequests(virtualImageDataUrl: string) {
    let remainingRequests = 0;
    for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
      const request = this.pendingScreenshotRequests[i];
      if (!request.overlayOnCamera) {
        request.resolve(virtualImageDataUrl);
      } else {
        this.pendingScreenshotRequests[remainingRequests++] = request;
      }
    }
    this.pendingScreenshotRequests.length = remainingRequests;
  }

  private rejectVirtualOnlyRequests(error: Error) {
    let remainingRequests = 0;
    for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
      const request = this.pendingScreenshotRequests[i];
      if (!request.overlayOnCamera) {
        request.reject(error);
      } else {
        this.pendingScreenshotRequests[remainingRequests++] = request;
      }
    }
    this.pendingScreenshotRequests.length = remainingRequests;
  }

  private async createVirtualRealImageDataURL(
    renderer: WebGLOrWebGPURenderer,
    renderSceneFn: () => void,
    deviceCamera: XRDeviceCamera
  ) {
    if (!deviceCamera.loaded) {
      console.debug('Waiting for device camera to be loaded');
      return null;
    }
    const mainRenderTarget = renderer.getRenderTarget();
    const isRenderingStereo =
      renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length == 2;
    const mainRenderTargetSize = new THREE.Vector2();
    if (mainRenderTarget) {
      mainRenderTargetSize.set(mainRenderTarget.width, mainRenderTarget.height);
    } else {
      renderer.getSize(mainRenderTargetSize);
    }
    const mainRenderTargetSingleViewWidth = isRenderingStereo
      ? mainRenderTargetSize.x / 2
      : mainRenderTargetSize.x;
    const scaledHeight = Math.round(
      mainRenderTargetSize.y *
        (this.renderTargetWidth / mainRenderTargetSingleViewWidth)
    );
    if (
      !this.virtualRealRenderTarget ||
      this.virtualRealRenderTarget.height != scaledHeight
    ) {
      this.virtualRealRenderTarget?.dispose();
      this.virtualRealRenderTarget = this.createRenderTarget(
        renderer,
        this.renderTargetWidth,
        scaledHeight
      );
    }

    const renderTarget = this.virtualRealRenderTarget;
    renderer.setRenderTarget(renderTarget as THREE.WebGLRenderTarget);
    const xrIsPresenting = renderer.xr.isPresenting;
    setXrPresenting(renderer, false);
    if (isWebGPURenderer(renderer)) {
      const quad = await this.getWebGPUQuad();
      quad.mesh.material.map = deviceCamera.texture;
      renderer.render(quad.mesh, quad.camera);
    } else {
      const quad = this.getFullScreenQuad();
      (quad.material as THREE.MeshBasicMaterial).map = deviceCamera.texture;
      quad.render(renderer);
    }
    renderSceneFn();
    setXrPresenting(renderer, xrIsPresenting);
    renderer.setRenderTarget(
      mainRenderTarget as THREE.WebGLRenderTarget | null
    );

    if (
      this.virtualRealBuffer.length !=
      renderTarget.width * renderTarget.height * 4
    ) {
      this.virtualRealBuffer = new Uint8Array(
        renderTarget.width * renderTarget.height * 4
      );
    }
    const buffer = this.virtualRealBuffer;
    await this.readRenderTargetInto(renderer, renderTarget, buffer);
    const canvas =
      this.virtualRealCanvas ||
      (this.virtualRealCanvas = document.createElement('canvas'));
    canvas.width = renderTarget.width;
    canvas.height = renderTarget.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    const imageData = new ImageData(
      new Uint8ClampedArray(buffer),
      renderTarget.width,
      renderTarget.height
    );
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }

  private resolveVirtualRealRequests(virtualRealImageDataUrl: string) {
    let remainingRequests = 0;
    for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
      const request = this.pendingScreenshotRequests[i];
      if (request.overlayOnCamera) {
        request.resolve(virtualRealImageDataUrl);
      } else {
        this.pendingScreenshotRequests[remainingRequests++] = request;
      }
    }
    this.pendingScreenshotRequests.length = remainingRequests;
  }

  private rejectVirtualRealRequests(error: Error) {
    let remainingRequests = 0;
    for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
      const request = this.pendingScreenshotRequests[i];
      if (request.overlayOnCamera) {
        request.reject(error);
      } else {
        this.pendingScreenshotRequests[remainingRequests++] = request;
      }
    }
    this.pendingScreenshotRequests.length = remainingRequests;
  }

  private createRenderTarget(
    renderer: WebGLOrWebGPURenderer,
    width: number,
    height: number
  ): THREE.RenderTarget {
    // WebGLRenderer wants a WebGLRenderTarget; WebGPURenderer renders into the
    // base class.
    return isWebGPURenderer(renderer)
      ? new THREE.RenderTarget(width, height, {
          colorSpace: THREE.SRGBColorSpace,
        })
      : new THREE.WebGLRenderTarget(width, height, {
          colorSpace: THREE.SRGBColorSpace,
        });
  }

  /**
   * Reads `target` into `buffer` as top-down RGBA8. WebGL readbacks are
   * bottom-up, native WebGPU readbacks are top-down but row-padded to 256
   * bytes, and the WebGPU renderer's WebGL2 fallback is bottom-up again (the
   * same conventions as SimulatorDepthWebGPURenderer).
   */
  private async readRenderTargetInto(
    renderer: WebGLOrWebGPURenderer,
    target: THREE.RenderTarget,
    buffer: Uint8Array
  ): Promise<void> {
    const width = target.width;
    const height = target.height;
    if (!isWebGPURenderer(renderer)) {
      await renderer.readRenderTargetPixelsAsync(
        target as THREE.WebGLRenderTarget,
        0,
        0,
        width,
        height,
        buffer
      );
      flipBufferVertically(buffer, width, height);
      return;
    }
    const readback = (await renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      width,
      height
    )) as Uint8Array;
    const rowBytes = width * 4;
    const srcStride =
      readback.length > buffer.length
        ? Math.ceil(rowBytes / 256) * 256
        : rowBytes;
    const isWebGLFallback =
      'isWebGLBackend' in renderer.backend &&
      renderer.backend.isWebGLBackend === true;
    for (let y = 0; y < height; y++) {
      const srcRow = isWebGLFallback ? height - 1 - y : y;
      const srcOffset = srcRow * srcStride;
      buffer.set(
        readback.subarray(srcOffset, srcOffset + rowBytes),
        y * rowBytes
      );
    }
  }

  /** Full-screen textured quad for the WebGPU device-camera overlay path. */
  private async getWebGPUQuad() {
    if (!this.webgpuQuad) {
      const {MeshBasicNodeMaterial} = await import('three/webgpu');
      this.webgpuQuad = {
        mesh: new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new MeshBasicNodeMaterial({transparent: true})
        ),
        camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      };
    }
    return this.webgpuQuad;
  }

  private getFullScreenQuad() {
    if (!this.fullScreenQuad) {
      this.fullScreenQuad = new FullScreenQuad(
        new THREE.MeshBasicMaterial({transparent: true})
      );
    }
    return this.fullScreenQuad;
  }

  /**
   * Requests a screenshot from the scene as a DataURL.
   * @param overlayOnCamera - If true, overlays the image on a camera image
   *     without any projection or aspect ratio correction.
   * @returns Promise which returns the screenshot as a data uri.
   */
  async getScreenshot(overlayOnCamera = false): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.pendingScreenshotRequests.push(
        new PendingScreenshotRequest(resolve, reject, overlayOnCamera)
      );
    });
  }
}

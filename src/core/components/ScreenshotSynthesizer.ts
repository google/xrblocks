import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

import {XRDeviceCamera} from '../../camera/XRDeviceCamera.js';

function flipBufferVertically(
    buffer: Uint8Array, width: number, height: number) {
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
        topRowOffset);
    buffer.set(tempRow, bottomRowOffset);
  }
}

class PendingScreenshotRequest {
  constructor(
      public resolve: (value: string) => void,
      public reject: (reason?: Error) => void, public overlayOnCamera: boolean) {}
}

export class ScreenshotSynthesizer {
  private pendingScreenshotRequests: PendingScreenshotRequest[] = [];
  private virtualCanvas?: HTMLCanvasElement;
  private virtualBuffer = new Uint8Array();
  private virtualRealCanvas?: HTMLCanvasElement;
  private virtualRealBuffer = new Uint8Array();
  private realVirtualRenderTarget?: THREE.WebGLRenderTarget;
  private fullScreenQuad?: FullScreenQuad;

  async onAfterRender(
      renderer: THREE.WebGLRenderer, deviceCamera?: XRDeviceCamera) {
    if (this.pendingScreenshotRequests.length == 0) {
      return;
    }

    const renderTarget = renderer.getRenderTarget();
    if (renderTarget == null) {
      throw new Error('Expecting render target');
    }
    const haveVirtualOnlyRequests = this.pendingScreenshotRequests.every(
        (request) => !request.overlayOnCamera);
    if (haveVirtualOnlyRequests) {
      this.createVirtualImageDataURL(renderer).then((virtualImageDataUrl) => {
        this.resolveVirtualOnlyRequests(virtualImageDataUrl);
      });
    }

    const haveVirtualAndRealReqeusts = this.pendingScreenshotRequests.some(
        (request) => request.overlayOnCamera);
    if (haveVirtualAndRealReqeusts && deviceCamera) {
      this.createVirtualRealImageDataURL(renderer, deviceCamera)
          .then((virtualRealImageDataUrl) => {
            if (virtualRealImageDataUrl) {
              this.resolveVirtualRealRequests(virtualRealImageDataUrl);
            }
          });
    } else if (haveVirtualAndRealReqeusts) {
      throw new Error('No device camera provided');
    }
  }

  private async createVirtualImageDataURL(renderer: THREE.WebGLRenderer) {
    const renderTarget = renderer.getRenderTarget()!;
    if (this.virtualBuffer.length !=
        renderTarget.width * renderTarget.height * 4) {
      this.virtualBuffer =
          new Uint8Array(renderTarget.width * renderTarget.height * 4);
    }
    const buffer = this.virtualBuffer;
    await renderer.readRenderTargetPixelsAsync(
        renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);

    flipBufferVertically(buffer, renderTarget.width, renderTarget.height);
    const canvas = this.virtualCanvas ||
        (this.virtualCanvas = document.createElement('canvas'));
    canvas.width = renderTarget.width;
    canvas.height = renderTarget.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    const imageData = new ImageData(
        new Uint8ClampedArray(buffer), renderTarget.width, renderTarget.height);
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

  private async createVirtualRealImageDataURL(
      renderer: THREE.WebGLRenderer, deviceCamera: XRDeviceCamera) {
    if (!deviceCamera.loaded) {
      console.log('Waiting for device camera to be loaded');
      return null;
    }
    if (!this.realVirtualRenderTarget) {
      this.realVirtualRenderTarget = new THREE.WebGLRenderTarget(640, 480);
    }
    const virtualRenderTarget = renderer.getRenderTarget()!;

    const renderTarget = this.realVirtualRenderTarget;
    renderer.setRenderTarget(renderTarget);
    const quad = this.getFullScreenQuad();
    (quad.material as THREE.MeshBasicMaterial).map = deviceCamera.texture;
    quad.render(renderer);
    (quad.material as THREE.MeshBasicMaterial).map =
        virtualRenderTarget.texture;
    quad.render(renderer);
    renderer.setRenderTarget(virtualRenderTarget);

    if (this.virtualRealBuffer.length !=
        renderTarget.width * renderTarget.height * 4) {
      this.virtualRealBuffer =
          new Uint8Array(renderTarget.width * renderTarget.height * 4);
    }
    const buffer = this.virtualRealBuffer;
    await renderer.readRenderTargetPixelsAsync(
        renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);

    flipBufferVertically(buffer, renderTarget.width, renderTarget.height);
    const canvas = this.virtualRealCanvas ||
        (this.virtualRealCanvas = document.createElement('canvas'));
    canvas.width = renderTarget.width;
    canvas.height = renderTarget.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    const imageData = new ImageData(
        new Uint8ClampedArray(buffer), renderTarget.width, renderTarget.height);
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

  private getFullScreenQuad() {
    if (!this.fullScreenQuad) {
      this.fullScreenQuad =
          new FullScreenQuad(new THREE.MeshBasicMaterial({transparent: true}));
    }
    return this.fullScreenQuad;
  }

  /**
   * Requests a screenshot from the scene as a DataURL.
   * @param overlayOnCamera - If true, overlays the image on a camera image
   *     without any projection or aspect ratio correction.
   * @returns Promise which returns the screenshot.
   */
  async getScreenshot(overlayOnCamera = false) {
    return await new Promise((resolve, reject) => {
      this.pendingScreenshotRequests.push(
          new PendingScreenshotRequest(resolve, reject, overlayOnCamera));
    });
  }
}

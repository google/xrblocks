import type * as THREE from 'three';

export function readWebGLPixels(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  width: number,
  height: number,
  buffer: THREE.TypedArray
): Promise<THREE.TypedArray> {
  if (
    typeof navigator !== 'undefined' &&
    /HeadlessChrome/i.test(navigator.userAgent)
  ) {
    const context = renderer.getContext() as WebGL2RenderingContext;
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer);
    return Promise.resolve(buffer);
  }
  return renderer.readRenderTargetPixelsAsync(
    target,
    0,
    0,
    width,
    height,
    buffer
  );
}

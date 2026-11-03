import type * as THREE from 'three';

const swiftShaderContexts = new WeakMap<WebGL2RenderingContext, boolean>();

function usesSwiftShader(context: WebGL2RenderingContext): boolean {
  const cached = swiftShaderContexts.get(context);
  if (cached !== undefined) return cached;
  const extension = context.getExtension('WEBGL_debug_renderer_info');
  const renderer = context.getParameter(
    extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER
  );
  const swiftShader = /swiftshader/i.test(String(renderer));
  swiftShaderContexts.set(context, swiftShader);
  return swiftShader;
}

export function readWebGLPixels(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  width: number,
  height: number,
  buffer: THREE.TypedArray
): Promise<THREE.TypedArray> {
  const context = renderer.getContext() as WebGL2RenderingContext;
  if (usesSwiftShader(context)) {
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

type WebGPULimitRequest = number | 'adapter';

interface NavigatorWithGPU {
  gpu?: {
    requestAdapter?: (options?: {
      featureLevel?: 'core' | 'compatibility';
      xrCompatible?: boolean;
    }) => Promise<{limits?: object} | null>;
  };
}

/**
 * Elevated WebGPU device limits requested by default (clamped to what the
 * hardware adapter supports) so compute-heavy subsystems such as
 * `@sparkjsdev/radix` 3DGS projection, compaction, and radix sorting are not
 * artificially capped at the WebGPU specification minimums (e.g., 256 texture
 * array layers, 128 MiB storage buffer binding, 16 KiB workgroup storage, and
 * 8 storage buffers per shader stage).
 */
export const WEBGPU_RADIX_BASELINE_LIMITS: Readonly<Record<string, number>> = {
  maxTextureDimension1D: 16384,
  maxTextureDimension2D: 16384,
  maxTextureArrayLayers: 2048,
  maxBufferSize: 1 << 30, // 1 GiB
  maxStorageBufferBindingSize: 256 << 20, // 256 MiB
  maxComputeWorkgroupStorageSize: 32768,
  maxColorAttachmentBytesPerSample: 64,
  maxStorageBuffersPerShaderStage: 10,
  maxStorageBuffersInVertexStage: 10,
  maxStorageBuffersInFragmentStage: 10,
};

const WEBGPU_SPEC_DEFAULT_LIMITS: Readonly<Record<string, number>> = {
  maxTextureDimension1D: 8192,
  maxTextureDimension2D: 8192,
  maxTextureArrayLayers: 256,
  maxBufferSize: 256 << 20,
  maxStorageBufferBindingSize: 128 << 20,
  maxComputeWorkgroupStorageSize: 16384,
  maxColorAttachmentBytesPerSample: 32,
  maxStorageBuffersPerShaderStage: 8,
  maxStorageBuffersInVertexStage: 8,
  maxStorageBuffersInFragmentStage: 8,
};

async function isImmersiveXRSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.xr) return false;
  for (const mode of ['immersive-ar', 'immersive-vr'] as const) {
    try {
      if (await navigator.xr.isSessionSupported(mode)) return true;
    } catch {
      // A failed support check means this mode can't be entered anyway.
    }
  }
  return false;
}

async function requestWebGPUAdapter(
  xrCompatible: boolean
): Promise<{limits?: object} | null | 'missing'> {
  if (typeof navigator === 'undefined') return 'missing';
  const navWithGpu = navigator as unknown as NavigatorWithGPU;
  if (typeof navWithGpu.gpu?.requestAdapter !== 'function') return 'missing';
  try {
    return await navWithGpu.gpu.requestAdapter({
      featureLevel: 'compatibility',
      xrCompatible,
    });
  } catch {
    return null;
  }
}

function clampLimitsToAdapter(
  adapterLimits: object | undefined,
  requested: Record<string, WebGPULimitRequest>
): Record<string, number> | undefined {
  if (!adapterLimits || Object.keys(requested).length === 0) return undefined;
  const supported = adapterLimits as Record<string, unknown>;
  const limits: Record<string, number> = {};
  for (const [name, request] of Object.entries(requested)) {
    const available = supported[name];
    if (typeof available !== 'number') continue;
    const lowerIsBetter = name.startsWith('min');
    const value =
      request === 'adapter'
        ? available
        : lowerIsBetter
          ? Math.max(request, available)
          : Math.min(request, available);
    const specDefault = WEBGPU_SPEC_DEFAULT_LIMITS[name];
    if (
      specDefault === undefined ||
      (lowerIsBetter ? value < specDefault : value > specDefault)
    ) {
      limits[name] = value;
    }
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
}

/**
 * Whether this device supports immersive WebXR yet cannot run WebXR over WebGPU.
 *
 * On Android XR (Chrome 136+), 2D `navigator.gpu` is enabled by default while
 * WebXR+WebGPU (`XRGPUBinding`) remains gated behind experimental flags.
 * Checking WebXR+WebGPU availability up front lets `Core.init()` pass
 * `forceWebGL: true` before `WebGPURenderer` locks the canvas to `'webgpu'`, so
 * immersive sessions and TSL subsystems (`@sparkjsdev/radix`) run on WebGL2.
 */
export async function isWebGPUXRUnavailable(): Promise<boolean> {
  if (!(await isImmersiveXRSupported())) return false;
  if (
    typeof (globalThis as {XRGPUBinding?: unknown}).XRGPUBinding === 'undefined'
  ) {
    return true;
  }
  return (await requestWebGPUAdapter(true)) === null;
}

/**
 * Resolves `forceWebGL` and adapter-clamped `requiredLimits` for `Core.init()`
 * in a single `navigator.gpu.requestAdapter()` round-trip, requesting an
 * `xrCompatible` adapter only when immersive WebXR is supported on the device.
 */
export async function resolveWebGPURendererSetup(options?: {
  forceWebGL?: boolean;
  requiredLimits?: Record<string, WebGPULimitRequest>;
}): Promise<{
  forceWebGL: boolean;
  requiredLimits?: Record<string, number>;
}> {
  if (options?.forceWebGL === true) {
    return {forceWebGL: true};
  }

  const immersiveSupported = await isImmersiveXRSupported();
  if (
    options?.forceWebGL === undefined &&
    immersiveSupported &&
    typeof (globalThis as {XRGPUBinding?: unknown}).XRGPUBinding === 'undefined'
  ) {
    return {forceWebGL: true};
  }

  const adapter = await requestWebGPUAdapter(immersiveSupported);
  if (
    options?.forceWebGL === undefined &&
    immersiveSupported &&
    adapter === null
  ) {
    return {forceWebGL: true};
  }

  const requiredLimits =
    adapter && adapter !== 'missing'
      ? clampLimitsToAdapter(adapter.limits, {
          ...WEBGPU_RADIX_BASELINE_LIMITS,
          ...options?.requiredLimits,
        })
      : undefined;
  return {forceWebGL: false, requiredLimits};
}

/**
 * Forwards `xrManager.getFramebufferScaleFactor()` and `xrManager.getFoveation()`
 * into `XRGPUBinding.createProjectionLayer({ scaleFactor })` on a Three.js WebGPU
 * `XRManager` instance without mutating `globalThis.XRGPUBinding.prototype`.
 *
 * Three.js `0.186.0` passes `scaleFactor: this._framebufferScaleFactor` and
 * calls `this.setFoveation(this.getFoveation())` on its WebGL `XRProjectionLayer`
 * path, but omits both inside `XRManager._initWebGPUSession()`. Forwarding them
 * here ensures `options.setFramebufferScaleFactor(...)` and `foveationLevel`
 * configure the WebGPU XR projection layer consistently.
 */
export function forwardWebGPUXRFramebufferScaleFactor(xrManager: object): void {
  const manager = xrManager as {
    getFramebufferScaleFactor?: () => number;
    getFoveation?: () => number | undefined;
    getWebGPUBinding?: () => {
      createProjectionLayer?: (init?: Record<string, unknown>) => unknown;
    } | null;
  };
  if (typeof manager.getWebGPUBinding !== 'function') return;

  const originalGetWebGPUBinding = manager.getWebGPUBinding.bind(manager);
  const patchedBindings = new WeakSet<object>();

  manager.getWebGPUBinding = () => {
    const binding = originalGetWebGPUBinding();
    if (
      binding &&
      typeof binding === 'object' &&
      typeof binding.createProjectionLayer === 'function' &&
      !patchedBindings.has(binding)
    ) {
      patchedBindings.add(binding);
      const originalCreateProjectionLayer =
        binding.createProjectionLayer.bind(binding);
      binding.createProjectionLayer = (init?: Record<string, unknown>) => {
        const scaleFactor = manager.getFramebufferScaleFactor?.();
        const resolvedInit =
          typeof scaleFactor === 'number' &&
          Number.isFinite(scaleFactor) &&
          scaleFactor > 0 &&
          scaleFactor !== 1 &&
          init?.scaleFactor === undefined
            ? {...init, scaleFactor}
            : init;
        const layer = originalCreateProjectionLayer(resolvedInit);
        const foveation = manager.getFoveation?.();
        if (
          layer &&
          typeof layer === 'object' &&
          typeof foveation === 'number' &&
          Number.isFinite(foveation) &&
          (layer as {fixedFoveation?: number | null}).fixedFoveation == null
        ) {
          try {
            (layer as {fixedFoveation?: number | null}).fixedFoveation =
              Math.min(1, Math.max(0, foveation));
          } catch {
            // Non-fatal if an experimental XRGPUBinding exposes fixedFoveation read-only.
          }
        }
        return layer;
      };
    }
    return binding;
  };
}

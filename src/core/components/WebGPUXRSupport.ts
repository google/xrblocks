/**
 * Whether this device can run immersive WebXR but not WebXR with WebGPU, as in
 * browsers without the WebXR/WebGPU binding. `WebGPURenderer` has to use its
 * WebGL backend to enter an immersive session on such devices.
 */
export async function isWebGPUXRUnavailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.xr) return false;
  const globals = globalThis as {XRGPUBinding?: unknown};
  if (typeof globals.XRGPUBinding !== 'undefined') return false;
  for (const mode of ['immersive-ar', 'immersive-vr'] as const) {
    try {
      if (await navigator.xr.isSessionSupported(mode)) return true;
    } catch {
      // A failed support check means this mode can't be entered anyway.
    }
  }
  return false;
}

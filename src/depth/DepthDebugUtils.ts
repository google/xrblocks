import type {Depth, DepthArray} from './Depth';

/**
 * Generates a visual representation of the current depth buffer on a
 * {@link Depth} instance and triggers a download for debugging.
 * @param depth - The depth subsystem instance.
 * @param viewIndex - The depth view index to visualize.
 */
export function visualizeDepth(depth: Depth, viewIndex = 0) {
  const depthArray = depth.depthArray[viewIndex];
  if (!depthArray) {
    console.warn('Cannot visualize depth map: no depth data available.');
    return;
  }
  visualizeDepthMap(depthArray, depth.width, depth.height);
}

/**
 * Generates a visual representation of a depth map, normalized to 0-1 range,
 * and triggers a download for debugging.
 * @param depthArray - The raw depth data array.
 * @param width - The depth map width in pixels.
 * @param height - The depth map height in pixels.
 */
export function visualizeDepthMap(
  depthArray: DepthArray,
  width: number,
  height: number
) {
  if (!width || !height || depthArray.length === 0) {
    console.warn('Cannot visualize depth map: missing dimensions or data.');
    return;
  }

  // Find Min/Max for normalization, ignoring 0/invalid depth.
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < depthArray.length; ++i) {
    const val = depthArray[i];
    if (val > 0) {
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  if (min === Infinity) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    max = min + 1;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < depthArray.length; ++i) {
    const raw = depthArray[i];
    const normalized = raw === 0 ? 0 : (raw - min) / (max - min);
    const byteVal = Math.floor(normalized * 255);

    const stride = i * 4;
    data[stride] = byteVal;
    data[stride + 1] = byteVal;
    data[stride + 2] = byteVal;
    data[stride + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  const timestamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', '_')
    .replace(/:/g, '-');
  const link = document.createElement('a');
  link.download = `depth_debug_${timestamp}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

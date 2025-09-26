import * as THREE from 'three';

import {Depth} from '../depth/Depth';
import {clamp} from '../utils/utils';

import {XRDeviceCamera} from './XRDeviceCamera';

export const aspectRatios = {
  depth: 1.0,
  RGB: 4 / 3
};

/**
 * Parameters for RGB to depth UV mapping (manually calibrated for aspect
 * ratios. For RGB and depth, 4:3 and 1:1, respectively.
 */
export const rgbToDepthParams = {
  scale: 1,
  scaleX: 0.75,
  scaleY: 0.63,
  translateU: 0.2,
  translateV: -0.02,
  k1: -0.046,
  k2: 0,
  k3: 0,
  p1: 0,
  p2: 0,
  xc: 0,
  yc: 0,
};

/**
 * Maps a UV coordinate from a RGB space to a destination depth space,
 * applying Brown-Conrady distortion and affine transformations based on
 * aspect ratios. If the simulator camera is used, no transformation is applied.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param xrDeviceCamera - The device camera instance.
 * @returns The transformed UV coordinate in the depth image space, or null if
 *     inputs are invalid.
 */
export function transformRgbToDepthUv(
    rgbUv: {u: number, v: number}, xrDeviceCamera?: XRDeviceCamera) {
  if (xrDeviceCamera?.simulatorCamera) {
    // The simulator camera crops the viewport image to match its aspect ratio,
    // while the depth map covers the entire viewport, so we adjust for this.
    const viewportAspect = window.innerWidth / window.innerHeight;
    const cameraAspect = xrDeviceCamera.simulatorCamera.width /
        xrDeviceCamera.simulatorCamera.height;
    let {u, v} = rgbUv;

    if (viewportAspect > cameraAspect) {
      // The camera image is a centered vertical slice of the full render.
      const relativeWidth = cameraAspect / viewportAspect;
      u = u * relativeWidth + (1.0 - relativeWidth) / 2.0;
    } else {
      // The camera image is a centered horizontal slice of the full render.
      const relativeHeight = viewportAspect / cameraAspect;
      v = v * relativeHeight + (1.0 - relativeHeight) / 2.0;
    }
    return {u, v: 1.0 - v};
  }

  if (!aspectRatios || !aspectRatios.depth || !aspectRatios.RGB) {
    console.error('Invalid aspect ratios provided.');
    return null;
  }

  // Determine the relative scaling required to fit the overlay within the base
  let relativeScaleX, relativeScaleY;
  if (aspectRatios.depth > aspectRatios.RGB) {
    // Base is wider than overlay ("letterboxing")
    relativeScaleY = 1.0;
    relativeScaleX = aspectRatios.RGB / aspectRatios.depth;
  } else {
    // Base is narrower than overlay ("pillarboxing")
    relativeScaleX = 1.0;
    relativeScaleY = aspectRatios.depth / aspectRatios.RGB;
  }

  // Convert input source UV [0, 1] to a normalized coordinate space [-0.5, 0.5]
  const u_norm = rgbUv.u - 0.5;
  const v_norm = rgbUv.v - 0.5;

  // Apply the FORWARD Brown-Conrady distortion model
  const u_centered = u_norm - rgbToDepthParams.xc;
  const v_centered = v_norm - rgbToDepthParams.yc;
  const r2 = u_centered * u_centered + v_centered * v_centered;
  const radial = 1 + rgbToDepthParams.k1 * r2 + rgbToDepthParams.k2 * r2 * r2 +
      rgbToDepthParams.k3 * r2 * r2 * r2;
  const tanX = 2 * rgbToDepthParams.p1 * u_centered * v_centered +
      rgbToDepthParams.p2 * (r2 + 2 * u_centered * u_centered);
  const tanY = rgbToDepthParams.p1 * (r2 + 2 * v_centered * v_centered) +
      2 * rgbToDepthParams.p2 * u_centered * v_centered;
  const u_distorted = u_centered * radial + tanX + rgbToDepthParams.xc;
  const v_distorted = v_centered * radial + tanY + rgbToDepthParams.yc;

  // Apply initial aspect ratio scaling and translation
  const u_fitted = u_distorted * relativeScaleX + rgbToDepthParams.translateU;
  const v_fitted = v_distorted * relativeScaleY + rgbToDepthParams.translateV;

  // Apply the final user-controlled scaling (zoom and stretch)
  const finalNormX =
      u_fitted * rgbToDepthParams.scale * rgbToDepthParams.scaleX;
  const finalNormY =
      v_fitted * rgbToDepthParams.scale * rgbToDepthParams.scaleY;

  // Convert the final normalized coordinate back to a UV coordinate [0, 1]
  const finalU = finalNormX + 0.5;
  const finalV = finalNormY + 0.5;

  return {u: finalU, v: 1.0 - finalV};
}

/**
 * Retrieves the world space position of a given RGB UV coordinate.
 * Note: it is essential that the coordinates, depth array, and projection
 * matrix all correspond to the same view ID (e.g., 0 for left). It is also
 * advised that all of these are obtained at the same time.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param depthArray - Array containing depth data.
 * @param viewProjectionMatrix - XRView object with corresponding
 * projection matrix.
 * @param matrixWorld - Matrix for view-to-world translation.
 * @param xrDeviceCamera - The device camera instance.
 * @param xrDepth - The SDK's Depth module.
 * @returns Vertex at (u, v) in world space.
 */
export function transformRgbUvToWorld(
    rgbUv: {u: number, v: number},
    depthArray: number[]|Uint16Array|Float32Array,
    viewProjectionMatrix: THREE.Matrix4, matrixWorld: THREE.Matrix4,
    xrDeviceCamera?: XRDeviceCamera, xrDepth = Depth.instance) {
  if (!depthArray || !viewProjectionMatrix || !matrixWorld || !xrDepth)
    return null;
  const depthUV = transformRgbToDepthUv(rgbUv, xrDeviceCamera);
  if (!depthUV) {
    return null;
  }

  const {u: depthU, v: depthV} = depthUV;
  const depthX =
      Math.round(clamp(depthU * xrDepth.width, 0, xrDepth.width - 1));

  // Invert depthV for array access, as image arrays are indexed from top-left.
  const depthY =
      Math.round(clamp((1.0 - depthV) * xrDepth.height, 0, xrDepth.height - 1));
  const rawDepthValue = depthArray[depthY * xrDepth.width + depthX];
  const depthInMeters = xrDepth.rawValueToMeters * rawDepthValue;

  // Convert UV to normalized device coordinates and create a point on the near
  // plane.
  const viewSpacePosition =
      new THREE.Vector3(2.0 * (depthU - 0.5), 2.0 * (depthV - 0.5), -1);

  const viewProjectionMatrixInverse = viewProjectionMatrix.clone().invert();

  // Unproject the point from clip space to view space and scale it along the
  // ray from the camera to the correct depth. Camera looks down -Z axis.
  viewSpacePosition.applyMatrix4(viewProjectionMatrixInverse);
  viewSpacePosition.multiplyScalar(-depthInMeters / viewSpacePosition.z);

  const worldPosition = viewSpacePosition.clone().applyMatrix4(matrixWorld);
  return worldPosition;
}

/**
 * Asynchronously crops a base64 encoded image using a THREE.Box2 bounding box.
 * This function creates an in-memory image, draws a specified portion of it to
 * a canvas, and then returns the canvas content as a new base64 string.
 * @param base64Image - The base64 string of the source image. Can be a raw
 *     string or a full data URI.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for
 *     cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
export async function cropImage(base64Image: string, boundingBox: THREE.Box2) {
  if (!base64Image) {
    throw new Error('No image data provided for cropping.');
  }

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = (err) => {
      console.error('Error loading image for cropping:', err);
      reject(new Error('Failed to load image for cropping.'));
    };
    img.src = base64Image.startsWith('data:image') ?
        base64Image :
        `data:image/png;base64,${base64Image}`;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Create a unit box and find the intersection to clamp coordinates.
  const unitBox =
      new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
  const clampedBox = boundingBox.clone().intersect(unitBox);

  const cropSize = new THREE.Vector2();
  clampedBox.getSize(cropSize);

  // If the resulting crop area has no size, return an empty image.
  if (cropSize.x === 0 || cropSize.y === 0) {
    return 'data:image/png;base64,';
  }

  // Calculate absolute pixel values from relative coordinates.
  const sourceX = img.width * clampedBox.min.x;
  const sourceY = img.height * clampedBox.min.y;
  const sourceWidth = img.width * cropSize.x;
  const sourceHeight = img.height * cropSize.y;

  // Set canvas size to the cropped image size.
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  // Draw the cropped portion of the source image onto the canvas.
  ctx.drawImage(
      img, sourceX, sourceY, sourceWidth, sourceHeight,  // Source rectangle
      0, 0, sourceWidth, sourceHeight  // Destination rectangle
  );

  return canvas.toDataURL('image/png');
}

import * as THREE from 'three';

import {Depth} from '../depth/Depth';
import {clamp} from '../utils/utils';
import {DEFAULT_RGB_TO_DEPTH_PARAMS} from './CameraOptions';

import {XRDeviceCamera} from './XRDeviceCamera';

export const aspectRatios = {
  depth: 1.0,
  RGB: 4 / 3,
};

/**
 * Maps a UV coordinate from a RGB space to a destination depth space,
 * applying Brown-Conrady distortion and affine transformations based on
 * aspect ratios. If the simulator camera is used, no transformation is applied.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param xrDeviceCamera - The device camera instance.
 * @returns The transformed UV coordinate in the render camera clip space, or null if
 *     inputs are invalid.
 */
export function transformRgbToRenderCameraClip(
  rgbUv: {u: number; v: number},
  xrDeviceCamera?: XRDeviceCamera
): THREE.Vector2 | null {
  if (xrDeviceCamera?.simulatorCamera) {
    // The simulator camera crops the viewport image to match its aspect ratio,
    // while the depth map covers the entire viewport, so we adjust for this.
    const viewportAspect = window.innerWidth / window.innerHeight;
    const cameraAspect =
      xrDeviceCamera.simulatorCamera.width /
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

    return new THREE.Vector2(2 * u - 1, 2 * v - 1);
  }
  if (!aspectRatios || !aspectRatios.depth || !aspectRatios.RGB) {
    console.error('Invalid aspect ratios provided.');
    return null;
  }
  const params =
    xrDeviceCamera?.rgbToDepthParams ?? DEFAULT_RGB_TO_DEPTH_PARAMS;

  // Determine the relative scaling required to fit the overlay within the base.
  let relativeScaleX, relativeScaleY;
  if (aspectRatios.depth > aspectRatios.RGB) {
    // Base is wider than overlay ("letterboxing").
    relativeScaleY = 1.0;
    relativeScaleX = aspectRatios.RGB / aspectRatios.depth;
  } else {
    // Base is narrower than overlay ("pillarboxing").
    relativeScaleX = 1.0;
    relativeScaleY = aspectRatios.depth / aspectRatios.RGB;
  }

  // Convert input source UV [0, 1] to normalized coordinates in [-0.5, 0.5].
  const u_norm = rgbUv.u - 0.5;
  const v_norm = rgbUv.v - 0.5;

  // Apply the FORWARD Brown-Conrady distortion model.
  const u_centered = u_norm - params.xc;
  const v_centered = v_norm - params.yc;
  const r2 = u_centered * u_centered + v_centered * v_centered;
  const radial =
    1 + params.k1 * r2 + params.k2 * r2 * r2 + params.k3 * r2 * r2 * r2;
  const tanX =
    2 * params.p1 * u_centered * v_centered +
    params.p2 * (r2 + 2 * u_centered * u_centered);
  const tanY =
    params.p1 * (r2 + 2 * v_centered * v_centered) +
    2 * params.p2 * u_centered * v_centered;
  const u_distorted = u_centered * radial + tanX + params.xc;
  const v_distorted = v_centered * radial + tanY + params.yc;

  // Apply initial aspect ratio scaling and translation.
  const u_fitted = u_distorted * relativeScaleX + params.translateU;
  const v_fitted = v_distorted * relativeScaleY + params.translateV;

  // Apply the final user-controlled scaling (zoom and stretch).
  const finalNormX = u_fitted * params.scale * params.scaleX;
  const finalNormY = v_fitted * params.scale * params.scaleY;

  return new THREE.Vector2(2 * finalNormX, 2 * finalNormY);
}

/**
 * Maps a UV coordinate from a RGB space to a destination depth space,
 * applying Brown-Conrady distortion and affine transformations based on
 * aspect ratios. If the simulator camera is used, no transformation is applied.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param renderCameraWorldFromClip - Render camera world from clip, i.e. inverse of the View Projection matrix.
 * @param depthCameraClipFromWorld - Depth camera clip from world, i.e.
 * @param xrDeviceCamera - The device camera instance.
 * @returns The transformed UV coordinate in the depth image space, or null if
 *     inputs are invalid.
 */
export function transformRgbToDepthUv(
  rgbUv: {u: number; v: number},
  renderCameraWorldFromClip: THREE.Matrix4,
  depthCameraClipFromWorld: THREE.Matrix4,
  xrDeviceCamera?: XRDeviceCamera
) {
  // Render camera clip space coordinates.
  const clipCoords = transformRgbToRenderCameraClip(rgbUv, xrDeviceCamera);
  if (!clipCoords) {
    return null;
  }

  // Backwards project from the render camera to depth camera.
  const depthClipCoord = new THREE.Vector4(clipCoords.x, clipCoords.y, 1, 1);
  depthClipCoord.applyMatrix4(renderCameraWorldFromClip);
  depthClipCoord.applyMatrix4(depthCameraClipFromWorld);
  depthClipCoord.multiplyScalar(1 / depthClipCoord.w);
  const finalU = 0.5 * depthClipCoord.x + 0.5;
  const finalV = 1.0 - (0.5 * depthClipCoord.y + 0.5);

  return {u: finalU, v: finalV};
}

/**
 * Retrieves the world space position of a given RGB UV coordinate.
 * Note: it is essential that the coordinates, depth array, and projection
 * matrix all correspond to the same view ID (e.g., 0 for left). It is also
 * advised that all of these are obtained at the same time.
 *
 * @param rgbUv - The RGB UV coordinate, e.g., \{ u: 0.5, v: 0.5 \}.
 * @param depthArray - Array containing depth data.
 * @param projectionMatrix - XRView object with corresponding
 * projection matrix.
 * @param matrixWorld - Rendering camera's model matrix.
 * @param xrDeviceCamera - The device camera instance.
 * @param xrDepth - The SDK's Depth module.
 * @returns Vertex at (u, v) in world space.
 */
export function transformRgbUvToWorld(
  rgbUv: {u: number; v: number},
  depthArray: number[] | Uint16Array | Float32Array,
  projectionMatrix: THREE.Matrix4,
  matrixWorld: THREE.Matrix4,
  xrDeviceCamera?: XRDeviceCamera,
  xrDepth: Depth | undefined = Depth.instance
): THREE.Vector3 {
  if (!depthArray || !projectionMatrix || !matrixWorld || !xrDepth) {
    throw new Error('Missing parameter in transformRgbUvToWorld');
  }
  const worldFromClip = matrixWorld
    .clone()
    .invert()
    .premultiply(projectionMatrix)
    .invert();
  const depthProjectionMatrixInverse = xrDepth.depthProjectionMatrices[0]
    .clone()
    .invert();
  const depthClipFromWorld = xrDepth.depthViewProjectionMatrices[0];
  const depthModelMatrix = xrDepth.depthViewMatrices[0].clone().invert();
  const depthUV = transformRgbToDepthUv(
    rgbUv,
    worldFromClip,
    depthClipFromWorld,
    xrDeviceCamera
  );
  if (!depthUV) {
    throw new Error('Failed to get depth UV');
  }

  const {u: depthU, v: depthV} = depthUV;
  const depthX = Math.round(
    clamp(depthU * xrDepth.width, 0, xrDepth.width - 1)
  );

  // Invert depthV for array access, as image arrays are indexed from top-left.
  const depthY = Math.round(
    clamp((1.0 - depthV) * xrDepth.height, 0, xrDepth.height - 1)
  );
  const rawDepthValue = depthArray[depthY * xrDepth.width + depthX];
  const depthInMeters = xrDepth.rawValueToMeters * rawDepthValue;

  // Convert UV to normalized device coordinates and create a point on the near
  // plane.
  const viewSpacePosition = new THREE.Vector3(
    2.0 * (depthU - 0.5),
    2.0 * (depthV - 0.5),
    -1
  );

  // Unproject the point from clip space to view space and scale it along the
  // ray from the camera to the correct depth. Camera looks down -Z axis.
  viewSpacePosition.applyMatrix4(depthProjectionMatrixInverse);
  viewSpacePosition.multiplyScalar(-depthInMeters / viewSpacePosition.z);

  const worldPosition = viewSpacePosition
    .clone()
    .applyMatrix4(depthModelMatrix);
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
    img.src = base64Image.startsWith('data:image')
      ? base64Image
      : `data:image/png;base64,${base64Image}`;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Create a unit box and find the intersection to clamp coordinates.
  const unitBox = new THREE.Box2(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1, 1)
  );
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
    img,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight, // Source rectangle
    0,
    0,
    sourceWidth,
    sourceHeight // Destination rectangle
  );

  return canvas.toDataURL('image/png');
}

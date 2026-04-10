import * as THREE from 'three';

import {XRDeviceCamera} from './XRDeviceCamera';

import {
  MOOHAN_PROJECTION_MATRIX,
  getMoohanCameraPose,
} from './GalaxyXRCameraParams';

export type DeviceCameraParameters = {
  projectionMatrix: THREE.Matrix4;
  getCameraPose: (
    camera: THREE.Camera,
    xrCameras: THREE.WebXRArrayCamera,
    target: THREE.Matrix4
  ) => void;
};

export const DEVICE_CAMERA_PARAMETERS: {[key: string]: DeviceCameraParameters} =
  {
    galaxyxr: {
      projectionMatrix: MOOHAN_PROJECTION_MATRIX,
      getCameraPose: getMoohanCameraPose,
    },
  };

export function getDeviceCameraClipFromView(
  renderCamera: THREE.PerspectiveCamera,
  deviceCamera: XRDeviceCamera,
  targetDevice: string
): THREE.Matrix4 {
  if (deviceCamera.simulatorCamera) {
    const simulatorCamera = new THREE.PerspectiveCamera();
    // The simulator camera captures a 1x1 image by cropping the center.
    // If aspect > 1 (landscape), the height is the limiting factor, so the fov is unchanged.
    // If aspect < 1 (portrait), the width is the limiting factor, so the new vertical fov is the original horizontal fov.
    const originalAspect = renderCamera.aspect;
    if (originalAspect > 1.0) {
      simulatorCamera.fov = renderCamera.fov;
    } else {
      const vFovRad = THREE.MathUtils.degToRad(renderCamera.fov);
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * originalAspect);
      simulatorCamera.fov = THREE.MathUtils.radToDeg(hFovRad);
    }
    simulatorCamera.aspect = 1.0;
    simulatorCamera.near = renderCamera.near;
    simulatorCamera.far = renderCamera.far;
    simulatorCamera.updateProjectionMatrix();
    return simulatorCamera.projectionMatrix;
  } else {
    return DEVICE_CAMERA_PARAMETERS[targetDevice].projectionMatrix;
  }
}

export function getDeviceCameraWorldFromView(
  renderCamera: THREE.PerspectiveCamera,
  xrCameras: THREE.WebXRArrayCamera | null,
  deviceCamera: XRDeviceCamera,
  targetDevice: string
): THREE.Matrix4 {
  if (deviceCamera?.simulatorCamera) {
    return renderCamera.matrixWorld.clone();
  } else if (xrCameras && xrCameras.cameras.length > 0) {
    const target = new THREE.Matrix4();
    DEVICE_CAMERA_PARAMETERS[targetDevice].getCameraPose(
      renderCamera,
      xrCameras,
      target
    );
    return target;
  }
  throw new Error('No XR cameras available');
}

export function getDeviceCameraWorldFromClip(
  renderCamera: THREE.PerspectiveCamera,
  xrCameras: THREE.WebXRArrayCamera | null,
  deviceCamera: XRDeviceCamera,
  targetDevice: string
): THREE.Matrix4 {
  const projectionMatrix = getDeviceCameraClipFromView(
    renderCamera,
    deviceCamera,
    targetDevice
  );
  const viewMatrix = getDeviceCameraWorldFromView(
    renderCamera,
    xrCameras,
    deviceCamera,
    targetDevice
  ).invert();
  return new THREE.Matrix4()
    .multiplyMatrices(projectionMatrix, viewMatrix)
    .invert();
}

export type CameraParametersSnapshot = {
  clipFromView: THREE.Matrix4;
  viewFromClip: THREE.Matrix4;
  worldFromView: THREE.Matrix4;
  worldFromClip: THREE.Matrix4;
};

export function getCameraParametersSnapshot(
  camera: THREE.PerspectiveCamera,
  xrCameras: THREE.WebXRArrayCamera | null,
  deviceCamera: XRDeviceCamera,
  targetDevice: string
): CameraParametersSnapshot {
  const clipFromView = getDeviceCameraClipFromView(
    camera,
    deviceCamera,
    targetDevice
  );
  if (!clipFromView) {
    throw new Error('Could not get clip from view');
  }
  return {
    clipFromView: clipFromView,
    viewFromClip: clipFromView.clone().invert(),
    worldFromClip: getDeviceCameraWorldFromClip(
      camera,
      xrCameras,
      deviceCamera,
      targetDevice
    ),
    worldFromView: getDeviceCameraWorldFromView(
      camera,
      xrCameras,
      deviceCamera,
      targetDevice
    ),
  };
}

/**
 * Raycasts to the depth mesh to find the world position and normal at a given UV coordinate.
 * @param rgbUv - The UV coordinate to raycast from.
 * @param depthMeshSnapshot - The depth mesh to raycast against.
 * @param depthTransformParameters - The depth transform parameters.
 * @returns The world position, normal, and depth at the given UV coordinate.
 */
export function transformRgbUvToWorld(
  rgbUv: THREE.Vector2,
  depthMeshSnapshot: THREE.Mesh,
  cameraParametersSnapshot: {
    worldFromView: THREE.Matrix4;
    worldFromClip: THREE.Matrix4;
  }
): {
  worldPosition: THREE.Vector3;
  worldNormal: THREE.Vector3;
  depthInMeters: number;
} | null {
  const origin = new THREE.Vector3().applyMatrix4(
    cameraParametersSnapshot.worldFromView
  );
  const direction = new THREE.Vector3(
    2 * rgbUv.x - 1,
    2 * (1.0 - rgbUv.y) - 1,
    -1
  )
    .applyMatrix4(cameraParametersSnapshot.worldFromClip)
    .sub(origin)
    .normalize();

  const raycaster = new THREE.Raycaster(origin, direction);
  const intersections = raycaster.intersectObject(depthMeshSnapshot);
  if (intersections.length === 0) {
    console.warn('No intersections found for UV:', rgbUv);
    return null;
  }
  const intersection = intersections[0];
  return {
    worldPosition: intersection.point,
    worldNormal: intersection
      .face!.normal!.clone()
      .applyQuaternion(depthMeshSnapshot.quaternion),
    depthInMeters: intersection.distance,
  };
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

/**
 * Asynchronously crops an ImageData object using a THREE.Box2 bounding box.
 * This function draws a specified portion of the ImageData to a canvas,
 * and then returns the canvas content as a new base64 string.
 * @param imageData - The source ImageData object.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
export async function cropImageData(
  imageData: ImageData,
  boundingBox: THREE.Box2
): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const unitBox = new THREE.Box2(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1, 1)
  );
  const clampedBox = boundingBox.clone().intersect(unitBox);
  const cropSize = new THREE.Vector2();
  clampedBox.getSize(cropSize);

  if (cropSize.x === 0 || cropSize.y === 0) {
    return 'data:image/png;base64,';
  }

  const sourceX = Math.floor(imageData.width * clampedBox.min.x);
  const sourceY = Math.floor(imageData.height * clampedBox.min.y);
  const sourceWidth = Math.ceil(imageData.width * cropSize.x);
  const sourceHeight = Math.ceil(imageData.height * cropSize.y);

  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  ctx.putImageData(
    imageData,
    -sourceX,
    -sourceY,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight
  );

  return canvas.toDataURL('image/png');
}

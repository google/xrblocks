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

type BoundingBoxCanvasResult = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
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
 * @param cameraParametersSnapshot - Parameters of the device camera relative to the render camera's world.
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
 * Helper function to prepare a canvas for the bounding box for rendering purposes.
 * Calculates the clamped bounding box and returns the canvas, context, and dimensions.
 */
function createBoundingBoxCanvasResult(
  width: number,
  height: number,
  boundingBox: THREE.Box2
): BoundingBoxCanvasResult | null {
  const unitBox = new THREE.Box2(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1, 1)
  );
  const clampedBox = boundingBox.clone().intersect(unitBox);

  const cropSize = new THREE.Vector2();
  clampedBox.getSize(cropSize);

  if (cropSize.x === 0 || cropSize.y === 0) {
    return null;
  }

  const sourceX = Math.floor(width * clampedBox.min.x);
  const sourceY = Math.floor(height * clampedBox.min.y);
  const sourceWidth = Math.ceil(width * cropSize.x);
  const sourceHeight = Math.ceil(height * cropSize.y);

  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const ctx = canvas.getContext('2d')!;

  return {canvas, ctx, sourceX, sourceY, sourceWidth, sourceHeight};
}

/**
 * Asynchronously crops an image (provided as a base64 string or ImageData) using a THREE.Box2 bounding box.
 * This function draws a specified portion of the image to a canvas and returns the canvas content as a new base64 string.
 * @param imageSource - The source image as a base64 string or ImageData object.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
export async function cropImage(
  imageSource: string | ImageData,
  boundingBox: THREE.Box2
): Promise<string> {
  if (!imageSource) {
    throw new Error('No image data provided for cropping.');
  }

  let width: number;
  let height: number;
  let drawOp: (
    ctx: CanvasRenderingContext2D,
    canvasResult: BoundingBoxCanvasResult
  ) => void;

  if (typeof imageSource === 'string') {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = (err) => {
        console.error('Error loading image for cropping:', err);
        reject(new Error('Failed to load image for cropping.'));
      };
      img.src = imageSource.startsWith('data:image')
        ? imageSource
        : `data:image/png;base64,${imageSource}`;
    });
    width = img.width;
    height = img.height;
    drawOp = (ctx, canvasResult) => {
      ctx.drawImage(
        img,
        canvasResult.sourceX,
        canvasResult.sourceY,
        canvasResult.sourceWidth,
        canvasResult.sourceHeight,
        0,
        0,
        canvasResult.sourceWidth,
        canvasResult.sourceHeight
      );
    };
  } else if (imageSource instanceof ImageData) {
    width = imageSource.width;
    height = imageSource.height;
    drawOp = (ctx, canvasResult) => {
      ctx.putImageData(
        imageSource,
        -canvasResult.sourceX,
        -canvasResult.sourceY,
        canvasResult.sourceX,
        canvasResult.sourceY,
        canvasResult.sourceWidth,
        canvasResult.sourceHeight
      );
    };
  } else {
    console.warn('Unsupported image source type for cropping.');
    return 'data:image/png;base64,';
  }

  const canvasResult = createBoundingBoxCanvasResult(
    width,
    height,
    boundingBox
  );
  if (!canvasResult) {
    console.warn('Unable to create CanvasResult for cropping.');
    return 'data:image/png;base64,';
  }

  drawOp(canvasResult.ctx, canvasResult);

  return canvasResult.canvas.toDataURL('image/png');
}

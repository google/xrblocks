import {
  DEFAULT_DEVICE_CAMERA_HEIGHT,
  DEFAULT_DEVICE_CAMERA_WIDTH,
} from '../constants';
import {deepFreeze, deepMerge} from '../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../utils/Types';

/**
 * Parameters for RGB to depth UV mapping given different aspect ratios.
 * These parameters define the distortion model and affine transformations
 * required to align the RGB camera feed with the depth map.
 */
export interface RgbToDepthParams {
  scale: number;
  scaleX: number;
  scaleY: number;
  translateU: number;
  translateV: number;
  k1: number;
  k2: number;
  k3: number;
  p1: number;
  p2: number;
  xc: number;
  yc: number;
}

/**
 * Default parameters for rgb to depth projection.
 * For RGB and depth, 4:3 and 1:1, respectively.
 */
export const DEFAULT_RGB_TO_DEPTH_PARAMS: RgbToDepthParams = {
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
 * Configuration options for the device camera.
 */
export class DeviceCameraOptions {
  enabled = false;
  /**
   * Constraints for `getUserMedia`. This will guide the initial camera
   * selection.
   */
  videoConstraints?: MediaTrackConstraints;
  /**
   * Hint for performance optimization on frequent captures.
   */
  willCaptureFrequently = false;
  /**
   * Parameters for RGB to depth UV mapping given different aspect ratios.
   */
  rgbToDepthParams: RgbToDepthParams = {...DEFAULT_RGB_TO_DEPTH_PARAMS};
  cameraLabel?: string;
  /**
   * The `DEVICE_CAMERA_PARAMETERS` key (such as `'galaxyxr'`, `'aura'` or
   * `'quest3'`) whose intrinsics and pose describe the headset camera. When
   * unset, the profile comes from the user agent, which cannot tell Aura from
   * Galaxy XR. A valid `?camera=<profile>` URL parameter overrides this. Read or
   * switch the active profile at runtime with `XRDeviceCamera.targetDevice`.
   */
  targetDevice?: string;

  constructor(options?: DeepReadonly<DeepPartial<DeviceCameraOptions>>) {
    deepMerge(this, options);
  }
}

// Base configuration for all common capture settings.
const baseCaptureOptions = {
  enabled: true,
  videoConstraints: {
    width: {ideal: DEFAULT_DEVICE_CAMERA_WIDTH},
    height: {ideal: DEFAULT_DEVICE_CAMERA_HEIGHT},
  },
};

export const xrDeviceCameraEnvironmentOptions = deepFreeze(
  new DeviceCameraOptions({
    ...baseCaptureOptions,
    videoConstraints: {
      ...baseCaptureOptions.videoConstraints,
      facingMode: 'environment',
    },
  })
);

export const xrDeviceCameraUserOptions = deepFreeze(
  new DeviceCameraOptions({
    ...baseCaptureOptions,
    videoConstraints: {
      ...baseCaptureOptions.videoConstraints,
      facingMode: 'user',
    },
  })
);

export const xrDeviceCameraEnvironmentContinuousOptions = deepFreeze(
  new DeviceCameraOptions({
    ...xrDeviceCameraEnvironmentOptions,
    willCaptureFrequently: true,
  })
);

export const xrDeviceCameraUserContinuousOptions = deepFreeze(
  new DeviceCameraOptions({
    ...xrDeviceCameraUserOptions,
    willCaptureFrequently: true,
  })
);

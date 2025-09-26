
import {DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH} from '../constants';
import {deepFreeze, deepMerge} from '../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../utils/Types';

export class DeviceCameraOptions {
  enabled = false;
  /**
   * Constraints for `getUserMedia`. This will guide the initial camera
   * selection. *
   */
  videoConstraints?: MediaTrackConstraints;
  /**
   * Hint for performance optimization on frequent captures.
   */
  willCaptureFrequently = false;

  constructor(options?: DeepReadonly<DeepPartial<DeviceCameraOptions>>) {
    deepMerge(this, options);
  }
}

// Base configuration for all common capture settings
const baseCaptureOptions = {
  enabled: true,
  videoConstraints: {
    width: {ideal: DEFAULT_DEVICE_CAMERA_WIDTH},
    height: {ideal: DEFAULT_DEVICE_CAMERA_HEIGHT},
  }
};

export const xrDeviceCameraEnvironmentOptions =
    deepFreeze(new DeviceCameraOptions({
      ...baseCaptureOptions,
      videoConstraints:
          {...baseCaptureOptions.videoConstraints, facingMode: 'environment'}
    }));

export const xrDeviceCameraUserOptions = deepFreeze(new DeviceCameraOptions({
  ...baseCaptureOptions,
  videoConstraints: {...baseCaptureOptions.videoConstraints, facingMode: 'user'}
}));

export const xrDeviceCameraEnvironmentContinuousOptions =
    deepFreeze(new DeviceCameraOptions({
      ...xrDeviceCameraEnvironmentOptions,
      willCaptureFrequently: true,
    }));

export const xrDeviceCameraUserContinuousOptions =
    deepFreeze(new DeviceCameraOptions({
      ...xrDeviceCameraUserOptions,
      willCaptureFrequently: true,
    }));

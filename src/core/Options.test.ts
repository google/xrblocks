import {describe, expect, it} from 'vitest';

import {Options} from './Options';

describe('Options', () => {
  it('enables device camera when object detection is enabled', () => {
    const options = new Options().enableObjectDetection();

    expect(options.permissions.camera).toBe(true);
    expect(options.deviceCamera.enabled).toBe(true);
    expect(options.world.objects.enabled).toBe(true);
  });

  it('keeps device camera settings made before a helper enables the camera', () => {
    const options = new Options();
    options.deviceCamera.targetDevice = 'aura';
    options.deviceCamera.willCaptureFrequently = true;

    options.enableObjectDetection();

    expect(options.deviceCamera.targetDevice).toBe('aura');
    expect(options.deviceCamera.willCaptureFrequently).toBe(true);
    expect(options.deviceCamera.enabled).toBe(true);
    expect(options.deviceCamera.videoConstraints?.facingMode).toBe(
      'environment'
    );
  });

  it('switches the facing mode without dropping other camera settings', () => {
    const options = new Options().enableCamera();
    options.deviceCamera.targetDevice = 'quest3';

    options.enableCamera('user');

    expect(options.deviceCamera.videoConstraints?.facingMode).toBe('user');
    expect(options.deviceCamera.targetDevice).toBe('quest3');
    expect(Object.isFrozen(options.deviceCamera.videoConstraints)).toBe(false);
  });
});

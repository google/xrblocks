import {expect, it} from 'vitest';
import {Options} from './Options';

it('enables dependent camera features without losing explicit camera settings', () => {
  const options = new Options();
  options.deviceCamera.targetDevice = 'aura';
  options.deviceCamera.willCaptureFrequently = true;
  options.enableObjectDetection();
  options.enableCamera('user');
  expect(options.permissions.camera).toBe(true);
  expect(options.deviceCamera.enabled).toBe(true);
  expect(options.deviceCamera.targetDevice).toBe('aura');
  expect(options.deviceCamera.willCaptureFrequently).toBe(true);
  expect(options.deviceCamera.videoConstraints?.facingMode).toBe('user');
});

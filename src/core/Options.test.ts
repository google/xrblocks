import {describe, expect, it} from 'vitest';

import {Options} from './Options';

describe('Options', () => {
  it('enables device camera when object detection is enabled', () => {
    const options = new Options().enableObjectDetection();

    expect(options.permissions.camera).toBe(true);
    expect(options.deviceCamera.enabled).toBe(true);
    expect(options.world.objects.enabled).toBe(true);
  });
});

import {describe, it, expect} from 'vitest';

import {SegmentationOptions} from './SegmentationOptions';

describe('SegmentationOptions', () => {
  it('disables segmentation by default', () => {
    const opts = new SegmentationOptions();
    expect(opts.enabled).toBe(false);
  });

  it('defaults to the mediapipe backend with the selfie multiclass model', () => {
    const opts = new SegmentationOptions();
    expect(opts.backendConfig.activeBackend).toBe('mediapipe');
    expect(opts.backendConfig.mediapipe.modelAssetPath).toContain(
      'selfie_multiclass'
    );
    expect(opts.backendConfig.mediapipe.wasmFilesUrl).toContain(
      '@mediapipe/tasks-vision'
    );
  });

  it('enable() turns segmentation on and returns the instance', () => {
    const opts = new SegmentationOptions();
    const returned = opts.enable();
    expect(opts.enabled).toBe(true);
    expect(returned).toBe(opts);
  });

  it('deep-merges constructor overrides while keeping unspecified defaults', () => {
    const opts = new SegmentationOptions({
      backendConfig: {
        mediapipe: {
          modelAssetPath: 'model://custom',
        },
      },
    });
    // Overridden field takes the new value.
    expect(opts.backendConfig.mediapipe.modelAssetPath).toBe('model://custom');
    // Untouched fields keep their defaults.
    expect(opts.backendConfig.mediapipe.outputCategoryMask).toBe(true);
    expect(opts.backendConfig.activeBackend).toBe('mediapipe');
  });
});

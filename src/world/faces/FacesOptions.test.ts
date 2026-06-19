import {describe, it, expect} from 'vitest';

import {FacesOptions} from './FacesOptions';

describe('FacesOptions', () => {
  it('disables face detection by default', () => {
    const opts = new FacesOptions();
    expect(opts.enabled).toBe(false);
  });

  it('defaults to the mediapipe backend with the public model URL', () => {
    const opts = new FacesOptions();
    expect(opts.backendConfig.activeBackend).toBe('mediapipe');
    expect(opts.backendConfig.mediapipe.modelAssetPath).toContain(
      'face_landmarker'
    );
    expect(opts.backendConfig.mediapipe.wasmFilesUrl).toContain(
      '@mediapipe/tasks-vision'
    );
  });

  it('opts users into blendshapes and the facial transformation matrix', () => {
    // Both are the most actionable downstream signals (lipsync, head pose).
    // Keep them ON by default so consumers do not silently miss them.
    const opts = new FacesOptions();
    expect(opts.backendConfig.mediapipe.outputFaceBlendshapes).toBe(true);
    expect(
      opts.backendConfig.mediapipe.outputFacialTransformationMatrixes
    ).toBe(true);
  });

  it('uses balanced confidence thresholds (0.5 across the three gates)', () => {
    const opts = new FacesOptions();
    const mp = opts.backendConfig.mediapipe;
    expect(mp.minFaceDetectionConfidence).toBe(0.5);
    expect(mp.minFacePresenceConfidence).toBe(0.5);
    expect(mp.minTrackingConfidence).toBe(0.5);
  });

  it('deep-merges constructor overrides while keeping unspecified defaults', () => {
    const opts = new FacesOptions({
      backendConfig: {
        mediapipe: {
          numFaces: 4,
          minFaceDetectionConfidence: 0.8,
        },
      },
    });
    // Overridden fields take the new value.
    expect(opts.backendConfig.mediapipe.numFaces).toBe(4);
    expect(opts.backendConfig.mediapipe.minFaceDetectionConfidence).toBeCloseTo(
      0.8
    );
    // Untouched fields keep their defaults so partial config does not zero
    // out unrelated tuning.
    expect(opts.backendConfig.mediapipe.minTrackingConfidence).toBe(0.5);
    expect(opts.backendConfig.mediapipe.outputFaceBlendshapes).toBe(true);
    expect(opts.backendConfig.activeBackend).toBe('mediapipe');
  });

  it('enable() flips enabled and returns the instance for chaining', () => {
    const opts = new FacesOptions();
    const ret = opts.enable();
    expect(opts.enabled).toBe(true);
    expect(ret).toBe(opts);
  });
});

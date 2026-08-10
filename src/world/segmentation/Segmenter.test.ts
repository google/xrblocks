// Stub AudioContext before Script (via THREE.AudioListener) is imported.
// Use plain JS functions rather than vi.fn() so vi.restoreAllMocks() cannot
// clear the implementation (mirrors the pattern in Core.test.ts).
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {
      createGain: function () {
        return {connect: function () {}};
      },
      destination: {},
    };
  });
});

import {describe, it, expect, vi} from 'vitest';

import {Segmenter} from './Segmenter';
import type {SegmentationMask} from './SegmentationMask';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal stand-ins for the two injected dependencies. */
const fakeOptions = {
  segmentation: {
    backendConfig: {activeBackend: 'mediapipe'},
    pollingIntervalMs: 66,
  },
} as Parameters<Segmenter['init']>[0]['options'];

const fakeCamera = {} as Parameters<Segmenter['init']>[0]['deviceCamera'];

function makeSegmenter(): Segmenter {
  const s = new Segmenter();
  s.init({options: fakeOptions, deviceCamera: fakeCamera});
  return s;
}

/**
 * Bypasses real MediaPipe initialisation by replacing the private backend
 * cache entry with a pre-resolved mock whose `run()` delegates to `runImpl`.
 */
function injectMockBackend(
  segmenter: Segmenter,
  runImpl: () => Promise<SegmentationMask | null>
) {
  const backend = {run: vi.fn(runImpl)};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (segmenter as any)._backends.set('mediapipe', Promise.resolve(backend));
  return backend;
}

function makeMask(id = 1): SegmentationMask {
  return {data: new Uint8Array([id]), width: 1, height: 1};
}

/** Flush all pending microtasks (enough for Promise chains of depth ≤ 3). */
function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Segmenter', () => {
  describe('latestMask', () => {
    it('caches the mask returned by the most recently completed inference', async () => {
      const segmenter = makeSegmenter();
      const mask = makeMask(7);
      injectMockBackend(segmenter, () => Promise.resolve(mask));

      await segmenter.runSegmentation();

      expect(segmenter.latestMask).toBe(mask);
    });
  });

  describe('runSegmentation deduplication', () => {
    it('coalesces concurrent calls — one MediaPipe inference per cycle', async () => {
      const segmenter = makeSegmenter();
      const mask = makeMask(3);

      // Use a deferred promise so we can confirm both calls are in-flight
      // simultaneously before resolving.
      let resolveRun!: (m: SegmentationMask | null) => void;
      const runDeferred = new Promise<SegmentationMask | null>((resolve) => {
        resolveRun = resolve;
      });
      const backend = injectMockBackend(segmenter, () => runDeferred);

      const p1 = segmenter.runSegmentation();
      const p2 = segmenter.runSegmentation();

      resolveRun(mask);
      const [r1, r2] = await Promise.all([p1, p2]);

      // Only one MediaPipe inference should have been dispatched.
      expect(backend.run).toHaveBeenCalledTimes(1);
      // Both callers receive the same result.
      expect(r1).toBe(mask);
      expect(r2).toBe(mask);
    });

    it('starts a fresh inference after the previous one completes', async () => {
      const segmenter = makeSegmenter();
      const backend = injectMockBackend(segmenter, () =>
        Promise.resolve(makeMask(5))
      );

      await segmenter.runSegmentation();
      await segmenter.runSegmentation();

      expect(backend.run).toHaveBeenCalledTimes(2);
    });
  });

  describe('continuous loop via update()', () => {
    it('does not trigger a second inference within the pollingIntervalMs window', async () => {
      const segmenter = makeSegmenter(); // pollingIntervalMs = 66
      const backend = injectMockBackend(segmenter, () =>
        Promise.resolve(makeMask())
      );

      segmenter.update(0); // starts first inference
      await flushMicrotasks(); // settle it

      // All of these are within the 66 ms interval.
      segmenter.update(10);
      segmenter.update(40);
      segmenter.update(65);

      expect(backend.run).toHaveBeenCalledTimes(1);
    });

    it('triggers a fresh inference after the interval elapses', async () => {
      const segmenter = makeSegmenter(); // pollingIntervalMs = 66
      const backend = injectMockBackend(segmenter, () =>
        Promise.resolve(makeMask())
      );

      segmenter.update(0);
      await flushMicrotasks();

      segmenter.update(66); // exactly at the boundary
      await flushMicrotasks();

      expect(backend.run).toHaveBeenCalledTimes(2);
    });

    it('does not start a new inference while one is already in-flight', async () => {
      const segmenter = makeSegmenter();

      // Hold the inference open with a deferred promise.
      let resolveRun!: (m: SegmentationMask | null) => void;
      const runDeferred = new Promise<SegmentationMask | null>((resolve) => {
        resolveRun = resolve;
      });
      const backend = injectMockBackend(segmenter, () => runDeferred);

      segmenter.update(0); // starts inference, still in-flight

      // Even though the interval has elapsed, the in-flight guard prevents
      // a second inference from stacking.
      segmenter.update(200);
      segmenter.update(400);

      resolveRun(makeMask());
      await flushMicrotasks();

      expect(backend.run).toHaveBeenCalledTimes(1);
    });

    it('disposes cached backends and clears latestMask', async () => {
      const segmenter = makeSegmenter();
      const dispose = vi.fn();
      const backend = {
        run: vi.fn(() => Promise.resolve(makeMask())),
        dispose,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (segmenter as any)._backends.set('mediapipe', Promise.resolve(backend));

      await segmenter.runSegmentation();
      expect(segmenter.latestMask).not.toBeNull();

      segmenter.dispose();
      await flushMicrotasks();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(segmenter.latestMask).toBeNull();
      await expect(segmenter.runSegmentation()).resolves.toBeNull();
    });
  });
});

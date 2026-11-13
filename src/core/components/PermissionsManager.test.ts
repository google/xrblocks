import {afterEach, expect, it, vi} from 'vitest';
import {PermissionsManager} from './PermissionsManager';

afterEach(() => vi.unstubAllGlobals());

it.each([
  {microphone: false, fallback: true, error: 'NotFoundError', granted: true},
  {microphone: false, fallback: false, error: 'NotFoundError', granted: false},
  {microphone: true, fallback: true, error: 'NotFoundError', granted: false},
  {microphone: false, fallback: true, error: 'NotAllowedError', granted: false},
])(
  'allows a camera hardware fallback without bypassing required permissions: %j',
  async ({microphone, fallback, error, granted}) => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => {
          throw Object.assign(new Error('Native media unavailable'), {
            name: error,
          });
        },
      },
    });
    const result = await new PermissionsManager().checkAndRequestPermissions(
      {camera: true, microphone},
      {allowVideoFallback: fallback}
    );
    expect(result.granted).toBe(granted);
  }
);

it('stops the acquired media tracks once permission is established', async () => {
  const stop = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: {getUserMedia: async () => ({getTracks: () => [{stop}]})},
  });
  expect(
    (
      await new PermissionsManager().checkAndRequestPermissions({
        microphone: true,
      })
    ).granted
  ).toBe(true);
  expect(stop).toHaveBeenCalledOnce();
});

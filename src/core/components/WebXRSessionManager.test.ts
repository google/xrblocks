import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {WebXRSessionManager} from './WebXRSessionManager';

let manager: WebXRSessionManager | undefined;
afterEach(async () => {
  await manager?.dispose();
  manager = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function session() {
  const result = Object.assign(new EventTarget(), {
    end: vi.fn(async () => {
      result.dispatchEvent(new Event('end'));
    }),
  });
  return result as unknown as XRSession;
}

it.each([
  {
    supported: ['immersive-ar'],
    fallback: true,
    required: ['hand-tracking'],
    expected: 'immersive-ar',
  },
  {
    supported: ['immersive-vr'],
    fallback: true,
    required: ['hand-tracking'],
    expected: 'immersive-vr',
  },
  {
    supported: ['immersive-vr'],
    fallback: false,
    required: [],
    expected: undefined,
  },
  {
    supported: ['immersive-vr'],
    fallback: true,
    required: ['camera-access'],
    expected: undefined,
  },
  {
    supported: ['immersive-vr'],
    fallback: true,
    required: ['depth-sensing'],
    expected: undefined,
  },
])(
  'requests a supported mode without weakening required capabilities: %j',
  async ({supported, fallback, required, expected}) => {
    const nativeSession = session();
    const requestSession = vi.fn(async () => nativeSession);
    vi.stubGlobal('navigator', {
      xr: {
        isSessionSupported: async (mode: string) => supported.includes(mode),
        requestSession,
      },
    });
    manager = new WebXRSessionManager(
      {xr: {setSession: async () => {}}} as unknown as THREE.WebGLRenderer,
      {requiredFeatures: required, optionalFeatures: ['depth-sensing']},
      'immersive-ar',
      fallback
    );
    await manager.initialize();
    expect(manager.isXRSupported()).toBe(expected !== undefined);
    if (!expected) {
      expect(() => manager!.startSession()).toThrow();
      expect(requestSession).not.toHaveBeenCalled();
      return;
    }
    manager.startSession();
    await vi.waitFor(() => expect(manager!.currentSession).toBe(nativeSession));
    const [mode, configuration] = requestSession.mock.calls[0] as unknown as [
      string,
      XRSessionInit,
    ];
    expect(mode).toBe(expected);
    expect(configuration.requiredFeatures).toEqual(required);
    expect(configuration.optionalFeatures).toContain('depth-sensing');
  }
);

it.each(['request', 'setup'] as const)(
  'ends a late native session without adopting it after disposal during %s',
  async (stage) => {
    const requested = Promise.withResolvers<XRSession>();
    const setup = Promise.withResolvers<void>();
    const nativeSession = session();
    const setSession = vi.fn(() => setup.promise);
    vi.stubGlobal('navigator', {
      xr: {
        isSessionSupported: async () => true,
        requestSession: () => requested.promise,
      },
    });
    manager = new WebXRSessionManager(
      {xr: {setSession}} as unknown as THREE.WebGLRenderer,
      {},
      'immersive-vr'
    );
    await manager.initialize();
    manager.startSession();
    try {
      if (stage === 'setup') {
        requested.resolve(nativeSession);
        await vi.waitFor(() => expect(setSession).toHaveBeenCalledOnce());
      }
      await manager.dispose();
      requested.resolve(nativeSession);
      setup.resolve();
      await vi.waitFor(() => expect(nativeSession.end).toHaveBeenCalledOnce());
      expect(manager.currentSession).toBeUndefined();
      expect(() => manager!.startSession()).toThrow(/disposed/);
    } finally {
      requested.resolve(nativeSession);
      setup.resolve();
    }
  }
);

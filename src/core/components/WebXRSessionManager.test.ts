// @vitest-environment jsdom

import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from './WebXRSessionManager';

describe('WebXRSessionManager mode selection', () => {
  let manager: WebXRSessionManager | undefined;

  afterEach(async () => {
    await manager?.dispose();
    manager = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createManager(fallbackToVR = true, sessionInit: XRSessionInit = {}) {
    const setSession = vi.fn<THREE.WebGLRenderer['xr']['setSession']>();
    setSession.mockResolvedValue(undefined);
    manager = new WebXRSessionManager(
      {xr: {setSession}} as unknown as THREE.WebGLRenderer,
      sessionInit,
      'immersive-ar',
      fallbackToVR
    );
    return manager;
  }

  function createSession() {
    const events = new EventTarget();
    return Object.assign(events, {
      end: vi.fn(async () => events.dispatchEvent(new Event('end'))),
    }) as unknown as XRSession;
  }

  it('selects immersive AR when it is supported', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async () => true
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockResolvedValue(createSession());
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    const sessionManager = createManager();
    const ready = vi.fn();
    sessionManager.addEventListener(WebXRSessionEventType.READY, ready);

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());

    expect(isSessionSupported).toHaveBeenCalledOnce();
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-ar');
    expect(ready).toHaveBeenCalledOnce();
    expect(requestSession).toHaveBeenCalledWith(
      'immersive-ar',
      expect.objectContaining({optionalFeatures: []})
    );
  });

  it('falls back to immersive VR when only VR is supported', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockResolvedValue(createSession());
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    const sessionManager = createManager(true, {
      requiredFeatures: ['depth-sensing', 'hand-tracking'],
      optionalFeatures: ['local-floor'],
    });
    const ready = vi.fn();
    const unsupported = vi.fn();
    sessionManager.addEventListener(WebXRSessionEventType.READY, ready);
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());

    expect(isSessionSupported.mock.calls.map(([mode]) => mode)).toEqual([
      'immersive-ar',
      'immersive-vr',
    ]);
    expect(ready).toHaveBeenCalledOnce();
    expect(unsupported).not.toHaveBeenCalled();
    expect(requestSession).toHaveBeenCalledWith(
      'immersive-vr',
      expect.objectContaining({
        requiredFeatures: ['hand-tracking'],
        optionalFeatures: ['local-floor', 'depth-sensing'],
      })
    );
  });

  it('reports unsupported when WebXR is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const sessionManager = createManager();
    const unsupported = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );

    await sessionManager.initialize();

    expect(unsupported).toHaveBeenCalledOnce();
    expect(sessionManager.isXRSupported()).toBe(false);
  });

  it('can disable the VR fallback', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async () => false
    );
    vi.stubGlobal('navigator', {xr: {isSessionSupported}});
    const sessionManager = createManager(false);
    const unsupported = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );

    await sessionManager.initialize();

    expect(isSessionSupported).toHaveBeenCalledOnce();
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-ar');
    expect(unsupported).toHaveBeenCalledOnce();
  });
});

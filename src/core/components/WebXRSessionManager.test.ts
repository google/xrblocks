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

  function createManager(
    fallbackToVR = true,
    sessionInit: XRSessionInit = {},
    setSession = vi
      .fn<THREE.WebGLRenderer['xr']['setSession']>()
      .mockResolvedValue(undefined),
    mode: XRSessionMode = 'immersive-ar'
  ) {
    manager = new WebXRSessionManager(
      {xr: {setSession}} as unknown as THREE.WebGLRenderer,
      sessionInit,
      mode,
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
    expect(sessionManager.getSessionMode()).toBe('immersive-vr');
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

  it('does not start a passive offer after a READY listener starts a session', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockResolvedValue(createSession());
    const offerSession = vi
      .fn<NonNullable<XRSystem['offerSession']>>()
      .mockResolvedValue(createSession());
    vi.stubGlobal('navigator', {
      xr: {isSessionSupported, requestSession, offerSession},
    });
    const sessionManager = createManager();
    sessionManager.addEventListener(WebXRSessionEventType.READY, () => {
      sessionManager.startSession();
    });

    await sessionManager.initialize();
    await vi.waitFor(() => expect(sessionManager.currentSession).toBeDefined());

    expect(requestSession).toHaveBeenCalledOnce();
    expect(offerSession).not.toHaveBeenCalled();
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

  it('does not fall back when camera-access is required', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    vi.stubGlobal('navigator', {xr: {isSessionSupported}});
    const sessionManager = createManager(true, {
      requiredFeatures: ['camera-access'],
    });
    const unsupported = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );

    await sessionManager.initialize();

    expect(isSessionSupported).toHaveBeenCalledOnce();
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-ar');
    expect(sessionManager.getSessionMode()).toBe('immersive-ar');
    expect(unsupported).toHaveBeenCalledOnce();
  });

  it('reports a failed VR fallback as unsupported', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockRejectedValue(
        new DOMException('unsupported features', 'NotSupportedError')
      );
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionManager = createManager();
    const unsupported = vi.fn();
    const sessionError = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );
    sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_ERROR,
      sessionError
    );

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(unsupported).toHaveBeenCalledOnce());

    expect(sessionManager.isXRSupported()).toBe(false);
    expect(sessionError).not.toHaveBeenCalled();
  });

  it('keeps non-NotSupported request failures retryable', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockRejectedValue(
        new DOMException('permission denied', 'NotAllowedError')
      );
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionManager = createManager();
    const unsupported = vi.fn();
    const sessionError = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );
    sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_ERROR,
      sessionError
    );

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(sessionError).toHaveBeenCalledOnce());

    expect(unsupported).not.toHaveBeenCalled();
    expect(sessionManager.isXRSupported()).toBe(true);
  });

  it('clears the request guard before dispatching SESSION_ERROR so listeners can retry', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockRejectedValueOnce(
        new DOMException('permission denied', 'NotAllowedError')
      )
      .mockResolvedValueOnce(createSession());
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionManager = createManager();
    let retryError: unknown;
    sessionManager.addEventListener(WebXRSessionEventType.SESSION_ERROR, () => {
      try {
        sessionManager.startSession();
      } catch (error) {
        retryError = error;
      }
    });

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(sessionManager.currentSession).toBeDefined());

    expect(requestSession).toHaveBeenCalledTimes(2);
    expect(retryError).toBeUndefined();
  });

  it.each(['immersive-vr', 'immersive-ar'] as const)(
    'only warns when a passive %s offerSession is dismissed',
    async (mode) => {
      const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
        async (supportedMode) => supportedMode === mode
      );
      const offerSession = vi
        .fn<NonNullable<XRSystem['offerSession']>>()
        .mockRejectedValue(
          new DOMException('offer dismissed', 'NotAllowedError')
        );
      vi.stubGlobal('navigator', {
        xr: {isSessionSupported, requestSession: vi.fn(), offerSession},
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessionManager = createManager(false, {}, undefined, mode);
      const sessionError = vi.fn();
      sessionManager.addEventListener(
        WebXRSessionEventType.SESSION_ERROR,
        sessionError
      );

      await sessionManager.initialize();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(warn).toHaveBeenCalledOnce();
      expect(sessionError).not.toHaveBeenCalled();
      expect(sessionManager.isXRSupported()).toBe(true);
    }
  );

  it('keeps renderer setup errors retryable even when they are NotSupportedError', async () => {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockResolvedValue(createSession());
    const setSession = vi
      .fn<THREE.WebGLRenderer['xr']['setSession']>()
      .mockRejectedValue(
        new DOMException('renderer failed', 'NotSupportedError')
      );
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionManager = createManager(true, {}, setSession);
    const unsupported = vi.fn();
    const sessionError = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );
    sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_ERROR,
      sessionError
    );

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(sessionError).toHaveBeenCalledOnce());

    expect(unsupported).not.toHaveBeenCalled();
    expect(sessionManager.isXRSupported()).toBe(true);
  });

  it('ignores a late offerSession rejection after a newer session starts', async () => {
    const offer = Promise.withResolvers<XRSession>();
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => mode === 'immersive-vr'
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockResolvedValue(createSession());
    vi.stubGlobal('navigator', {
      xr: {
        isSessionSupported,
        requestSession,
        offerSession: vi.fn(() => offer.promise),
      },
    });
    const sessionManager = createManager();
    const unsupported = vi.fn();
    const sessionError = vi.fn();
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );
    sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_ERROR,
      sessionError
    );

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(sessionManager.currentSession).toBeDefined());
    offer.reject(new DOMException('offer dismissed', 'NotAllowedError'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(sessionManager.currentSession).toBeDefined();
    expect(unsupported).not.toHaveBeenCalled();
    expect(sessionError).not.toHaveBeenCalled();
  });
});

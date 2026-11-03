// @vitest-environment jsdom

import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from './WebXRSessionManager';

describe('WebXRSessionManager VR fallback', () => {
  let manager: WebXRSessionManager | undefined;

  afterEach(async () => {
    await manager?.dispose();
    manager = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createManager({
    sessionInit = {},
    mode = 'immersive-ar',
    fallbackToVR = true,
  }: {
    sessionInit?: XRSessionInit;
    mode?: XRSessionMode;
    fallbackToVR?: boolean;
  } = {}) {
    const setSession = vi
      .fn<THREE.WebGLRenderer['xr']['setSession']>()
      .mockResolvedValue(undefined);
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

  function stubXR(supportedModes: XRSessionMode[]) {
    const isSessionSupported = vi.fn<XRSystem['isSessionSupported']>(
      async (mode) => supportedModes.includes(mode)
    );
    const requestSession = vi
      .fn<XRSystem['requestSession']>()
      .mockResolvedValue(createSession());
    vi.stubGlobal('navigator', {xr: {isSessionSupported, requestSession}});
    return {isSessionSupported, requestSession};
  }

  function listen(sessionManager: WebXRSessionManager) {
    const ready = vi.fn();
    const unsupported = vi.fn();
    sessionManager.addEventListener(WebXRSessionEventType.READY, ready);
    sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      unsupported
    );
    return {ready, unsupported};
  }

  const checkedModes = (
    isSessionSupported: ReturnType<typeof stubXR>['isSessionSupported']
  ) => isSessionSupported.mock.calls.map(([mode]) => mode);

  it('uses immersive AR without checking VR when AR is supported', async () => {
    const {isSessionSupported, requestSession} = stubXR([
      'immersive-ar',
      'immersive-vr',
    ]);
    const sessionManager = createManager();
    const {ready} = listen(sessionManager);

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());

    expect(checkedModes(isSessionSupported)).toEqual(['immersive-ar']);
    expect(ready).toHaveBeenCalledOnce();
    expect(requestSession.mock.calls[0][0]).toBe('immersive-ar');
  });

  it('falls back to immersive VR when only VR is supported', async () => {
    const {isSessionSupported, requestSession} = stubXR(['immersive-vr']);
    const sessionManager = createManager({
      sessionInit: {
        requiredFeatures: ['hand-tracking'],
        optionalFeatures: ['local-floor'],
      },
    });
    const {ready, unsupported} = listen(sessionManager);

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());

    expect(checkedModes(isSessionSupported)).toEqual([
      'immersive-ar',
      'immersive-vr',
    ]);
    expect(sessionManager.isXRSupported()).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(unsupported).not.toHaveBeenCalled();
    expect(requestSession).toHaveBeenCalledWith('immersive-vr', {
      requiredFeatures: ['hand-tracking'],
      optionalFeatures: ['local-floor'],
    });
  });

  it('reports unsupported when neither AR nor VR is supported', async () => {
    const {isSessionSupported} = stubXR([]);
    const sessionManager = createManager();
    const {ready, unsupported} = listen(sessionManager);

    await sessionManager.initialize();

    expect(checkedModes(isSessionSupported)).toEqual([
      'immersive-ar',
      'immersive-vr',
    ]);
    expect(sessionManager.isXRSupported()).toBe(false);
    expect(ready).not.toHaveBeenCalled();
    expect(unsupported).toHaveBeenCalledOnce();
  });

  it('can disable the VR fallback', async () => {
    const {isSessionSupported} = stubXR(['immersive-vr']);
    const sessionManager = createManager({fallbackToVR: false});
    const {unsupported} = listen(sessionManager);

    await sessionManager.initialize();

    expect(checkedModes(isSessionSupported)).toEqual(['immersive-ar']);
    expect(unsupported).toHaveBeenCalledOnce();
  });

  it.each(['camera-access', 'depth-sensing'])(
    'does not fall back when %s is required',
    async (feature) => {
      const {isSessionSupported} = stubXR(['immersive-vr']);
      const sessionManager = createManager({
        sessionInit: {requiredFeatures: [feature]},
      });
      const {ready, unsupported} = listen(sessionManager);

      await sessionManager.initialize();

      expect(checkedModes(isSessionSupported)).toEqual(['immersive-ar']);
      expect(ready).not.toHaveBeenCalled();
      expect(unsupported).toHaveBeenCalledOnce();
    }
  );

  it('still falls back when depth-sensing is only optional', async () => {
    const {requestSession} = stubXR(['immersive-vr']);
    const sessionManager = createManager({
      sessionInit: {optionalFeatures: ['depth-sensing']},
    });

    await sessionManager.initialize();
    sessionManager.startSession();
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());

    expect(requestSession.mock.calls[0][0]).toBe('immersive-vr');
  });

  it('does not try a fallback for an immersive VR request', async () => {
    const {isSessionSupported} = stubXR([]);
    const sessionManager = createManager({mode: 'immersive-vr'});
    const {unsupported} = listen(sessionManager);

    await sessionManager.initialize();

    expect(checkedModes(isSessionSupported)).toEqual(['immersive-vr']);
    expect(unsupported).toHaveBeenCalledOnce();
  });
});

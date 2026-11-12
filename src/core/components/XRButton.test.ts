import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PermissionsManager} from './PermissionsManager';
import {WebXRSessionManager} from './WebXRSessionManager';
import {XRButton} from './XRButton';

function session() {
  const events = new EventTarget();
  return Object.assign(events, {
    end: vi.fn(async () => events.dispatchEvent(new Event('end'))),
  }) as unknown as XRSession;
}
const requestSession = vi.fn<XRSystem['requestSession']>();
const setSession = vi.fn<THREE.WebGLRenderer['xr']['setSession']>();
const getUserMedia = vi.fn<MediaDevices['getUserMedia']>();
const release: Array<() => void> = [];
let manager: WebXRSessionManager;
let button: XRButton;
const alert = () =>
  button.domElement.querySelector<HTMLElement>('[role="alert"]')!;
beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requestSession.mockReset().mockResolvedValue(session());
  setSession.mockReset().mockResolvedValue(undefined);
  getUserMedia
    .mockReset()
    .mockResolvedValue({getTracks: () => []} as unknown as MediaStream);
  vi.stubGlobal('navigator', {
    xr: {isSessionSupported: async () => true, requestSession},
    mediaDevices: {getUserMedia},
  });
  manager = new WebXRSessionManager(
    {xr: {setSession}} as unknown as THREE.WebGLRenderer,
    {},
    'immersive-vr'
  );
  button = new XRButton(
    manager,
    new PermissionsManager(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true,
    undefined,
    {microphone: true, camera: false, geolocation: false}
  );
  document.body.append(button.domElement);
  await manager.initialize();
});
afterEach(async () => {
  for (const resolve of release.splice(0)) resolve();
  button.dispose();
  await manager.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('XR entry through browser permission and session boundaries', () => {
  it('shows permission denial without requesting XR and lets the user retry', async () => {
    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('Microphone denied'), {name: 'NotAllowedError'})
    );
    button.xrButtonElement.click();
    await vi.waitFor(() => expect(alert().hidden).toBe(false));
    expect(alert().textContent).toContain('Microphone denied');
    expect(requestSession).not.toHaveBeenCalled();
    expect(button.xrButtonElement.disabled).toBe(false);
    button.xrButtonElement.click();
    await vi.waitFor(() => expect(manager.currentSession).toBeDefined());
    expect(alert().hidden).toBe(true);
  });

  it('prevents duplicate XR or simulator entry while native request/setup is pending and while XR is active', async () => {
    const requested = Promise.withResolvers<XRSession>();
    const setup = Promise.withResolvers<void>();
    const nativeSession = session();
    release.push(() => {
      requested.resolve(nativeSession);
      setup.resolve();
    });
    requestSession.mockReturnValue(requested.promise);
    setSession.mockReturnValue(setup.promise);
    const startSimulator = vi.fn();
    button.startSimulator = startSimulator;
    button.xrButtonElement.click();
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());
    button.xrButtonElement.click();
    button.simulatorButtonElement.click();
    expect(requestSession).toHaveBeenCalledOnce();
    expect(startSimulator).not.toHaveBeenCalled();
    requested.resolve(nativeSession);
    await vi.waitFor(() => expect(setSession).toHaveBeenCalledOnce());
    expect(button.xrButtonElement.disabled).toBe(true);
    expect(() => manager.startSession()).toThrow();
    setup.resolve();
    await vi.waitFor(() => expect(manager.currentSession).toBe(nativeSession));
    button.simulatorButtonElement.click();
    expect(startSimulator).not.toHaveBeenCalled();
    button.xrButtonElement.click();
    await vi.waitFor(() => expect(manager.currentSession).toBeUndefined());
    button.simulatorButtonElement.click();
    await vi.waitFor(() => expect(startSimulator).toHaveBeenCalledOnce());
  });

  it.each(['request', 'setup'] as const)(
    'recovers from native %s failure and releases any acquired session',
    async (stage) => {
      const error = new Error('Native XR unavailable');
      const nativeSession = session();
      requestSession.mockResolvedValue(nativeSession);
      if (stage === 'request') requestSession.mockRejectedValueOnce(error);
      else setSession.mockRejectedValueOnce(error);
      button.xrButtonElement.click();
      await vi.waitFor(() => expect(alert().hidden).toBe(false));
      expect(manager.currentSession).toBeUndefined();
      expect(button.xrButtonElement.disabled).toBe(false);
      if (stage === 'setup') expect(nativeSession.end).toHaveBeenCalledOnce();
      const retry = session();
      requestSession.mockResolvedValue(retry);
      button.xrButtonElement.click();
      await vi.waitFor(() => expect(manager.currentSession).toBe(retry));
      expect(alert().hidden).toBe(true);
    }
  );

  it('does not enter XR after disposal during a native permission grant and stops the granted tracks', async () => {
    const pending = Promise.withResolvers<MediaStream>();
    const stop = vi.fn();
    const stream = {getTracks: () => [{stop}]} as unknown as MediaStream;
    release.push(() => pending.resolve(stream));
    getUserMedia.mockReturnValue(pending.promise);
    button.xrButtonElement.click();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    button.dispose();
    pending.resolve(stream);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(requestSession).not.toHaveBeenCalled();
    expect(button.domElement.isConnected).toBe(false);
  });
});

describe('simulator entry', () => {
  it('keeps failed entry available for retry and excludes XR while startup is pending', async () => {
    const pending = Promise.withResolvers<void>();
    release.push(() => pending.resolve());
    const start = vi.fn(() => pending.promise);
    button.startSimulator = start;
    button.simulatorButtonElement.click();
    button.simulatorButtonElement.click();
    button.xrButtonElement.click();
    expect(start).toHaveBeenCalledOnce();
    expect(requestSession).not.toHaveBeenCalled();
    expect(button.domElement.isConnected).toBe(true);
    pending.reject(new Error('Runtime load failed'));
    await vi.waitFor(() => expect(alert().hidden).toBe(false));
    expect(button.simulatorButtonElement.disabled).toBe(false);
    start.mockResolvedValue(undefined);
    button.simulatorButtonElement.click();
    await vi.waitFor(() => expect(button.domElement.isConnected).toBe(false));
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('keeps a disposed entry inert after a late simulator failure', async () => {
    const pending = Promise.withResolvers<void>();
    release.push(() => pending.resolve());
    const start = vi.fn(() => pending.promise);
    button.startSimulator = start;
    button.simulatorButtonElement.click();
    button.dispose();
    pending.reject(new Error('Late runtime failure'));
    await pending.promise.catch(() => {});
    await Promise.resolve();
    button.simulatorButtonElement.click();
    button.xrButtonElement.click();
    expect(start).toHaveBeenCalledOnce();
    expect(requestSession).not.toHaveBeenCalled();
    expect(button.domElement.isConnected).toBe(false);
    expect(alert().hidden).toBe(true);
  });
});

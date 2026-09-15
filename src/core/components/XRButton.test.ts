// @vitest-environment jsdom

import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PermissionsManager} from './PermissionsManager';
import {WebXRSessionManager} from './WebXRSessionManager';
import {XRButton} from './XRButton';

function createSession() {
  const events = new EventTarget();
  return Object.assign(events, {
    end: vi.fn(async () => {
      events.dispatchEvent(new Event('end'));
    }),
  }) as unknown as XRSession;
}

async function flushRequests() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('XR entry feedback', () => {
  const requestSession = vi.fn<XRSystem['requestSession']>();
  const setSession = vi.fn<THREE.WebGLRenderer['xr']['setSession']>();
  let manager: WebXRSessionManager;
  let permissions: PermissionsManager;
  let button: XRButton;

  beforeEach(async () => {
    requestSession.mockReset();
    setSession.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('navigator', {
      xr: {
        isSessionSupported: vi.fn().mockResolvedValue(true),
        requestSession,
      },
    });
    manager = new WebXRSessionManager(
      {xr: {setSession}} as unknown as THREE.WebGLRenderer,
      {requiredFeatures: ['hand-tracking']},
      'immersive-vr'
    );
    permissions = new PermissionsManager();
    button = new XRButton(manager, permissions);
    document.body.appendChild(button.domElement);
    await manager.initialize();
  });

  afterEach(async () => {
    button.dispose();
    await manager.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('shows a rejected XR request instead of silently leaving Enter XR unchanged', async () => {
    requestSession.mockRejectedValue(
      new DOMException(
        'The requested session configuration is not supported.',
        'NotSupportedError'
      )
    );

    button.xrButtonElement.click();
    await flushRequests();

    expect(button.domElement.textContent).toContain('NotSupportedError');
    expect(button.domElement.textContent).toContain(
      'The requested session configuration is not supported.'
    );
    expect(
      button.domElement.querySelector<HTMLElement>('[role="alert"]')?.hidden
    ).toBe(false);
    expect(button.xrButtonElement.disabled).toBe(false);
  });

  it('shows pending entry and prevents duplicate requests while the browser is responding', async () => {
    const pending = Promise.withResolvers<XRSession>();
    requestSession.mockReturnValue(pending.promise);

    button.xrButtonElement.click();
    expect(button.xrButtonElement.textContent).toContain('ENTERING XR');
    expect(button.xrButtonElement.disabled).toBe(true);
    button.xrButtonElement.click();
    await flushRequests();
    expect(requestSession).toHaveBeenCalledOnce();

    pending.resolve(createSession());
    await flushRequests();
    expect(button.xrButtonElement.textContent).toBe('END XR');
    expect(button.xrButtonElement.disabled).toBe(false);
  });

  it('clears the error and successfully retries a rejected request', async () => {
    const session = createSession();
    requestSession
      .mockRejectedValueOnce(new Error('First request failed.'))
      .mockResolvedValueOnce(session);

    button.xrButtonElement.click();
    await flushRequests();
    button.xrButtonElement.click();
    await flushRequests();

    expect(requestSession).toHaveBeenCalledTimes(2);
    expect(manager.currentSession).toBe(session);
    expect(button.xrButtonElement.textContent).toBe('END XR');
    expect(button.domElement.textContent).not.toContain(
      'First request failed.'
    );
  });

  it('shows denied browser permissions without requesting an XR session', async () => {
    vi.spyOn(permissions, 'checkAndRequestPermissions').mockResolvedValue({
      granted: false,
      status: 'denied',
      error: 'Microphone permission was denied.',
    });

    button.xrButtonElement.click();
    await flushRequests();

    expect(button.domElement.textContent).toContain(
      'Microphone permission was denied.'
    );
    expect(button.xrButtonElement.disabled).toBe(false);
    expect(requestSession).not.toHaveBeenCalled();
  });

  it('shows rejected permission checks and allows retry', async () => {
    vi.spyOn(permissions, 'checkAndRequestPermissions').mockRejectedValue(
      new Error('The permission check failed.')
    );

    button.xrButtonElement.click();
    await flushRequests();

    expect(button.domElement.textContent).toContain(
      'The permission check failed.'
    );
    expect(button.xrButtonElement.disabled).toBe(false);
    expect(requestSession).not.toHaveBeenCalled();
  });

  it('ends a session whose renderer setup fails so another attempt is possible', async () => {
    const session = createSession();
    requestSession.mockResolvedValue(session);
    setSession.mockRejectedValue(new Error('XR rendering could not start.'));

    button.xrButtonElement.click();
    await flushRequests();

    expect(session.end).toHaveBeenCalledOnce();
    expect(manager.currentSession).toBeUndefined();
    expect(button.domElement.textContent).toContain(
      'XR rendering could not start.'
    );
    expect(button.xrButtonElement.disabled).toBe(false);
  });

  it('keeps the request guard active while renderer setup is still pending', async () => {
    const pending = Promise.withResolvers<void>();
    setSession.mockReturnValue(pending.promise);
    requestSession.mockResolvedValue(createSession());

    manager.startSession();
    await flushRequests();
    expect(() => manager.startSession()).toThrow(
      'Waiting for session to start'
    );

    pending.resolve();
    await flushRequests();
    expect(manager.currentSession).toBeDefined();
    expect(requestSession).toHaveBeenCalledOnce();
  });

  it('does not start XR if the entry UI was disposed during permission setup', async () => {
    const pending =
      Promise.withResolvers<
        Awaited<ReturnType<PermissionsManager['checkAndRequestPermissions']>>
      >();
    vi.spyOn(permissions, 'checkAndRequestPermissions').mockReturnValue(
      pending.promise
    );

    button.xrButtonElement.click();
    button.dispose();
    pending.resolve({granted: true, status: 'granted'});
    await flushRequests();

    expect(requestSession).not.toHaveBeenCalled();
    expect(button.domElement.isConnected).toBe(false);
  });

  it('publishes the original request failure for session listeners', async () => {
    const error = new DOMException(
      'Session permission denied.',
      'SecurityError'
    );
    const onError = vi.fn();
    manager.addEventListener('sessionerror', onError);
    requestSession.mockRejectedValue(error);

    manager.startSession();
    await flushRequests();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({error}));
  });

  it('does not publish a late request failure after disposal', async () => {
    const pending = Promise.withResolvers<XRSession>();
    const onError = vi.fn();
    manager.addEventListener('sessionerror', onError);
    requestSession.mockReturnValue(pending.promise);

    manager.startSession();
    button.dispose();
    await manager.dispose();
    pending.reject(new Error('The pending request failed after disposal.'));
    await flushRequests();

    expect(onError).not.toHaveBeenCalled();
  });
});

import {afterEach, describe, expect, it, vi} from 'vitest';
import {Registry} from '../../core/components/Registry';
import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from '../../core/components/WebXRSessionManager';
import {callInitWithDependencyInjection} from '../../utils/DependencyInjection';
import {UIExitButton} from './UIExitButton';

afterEach(() => vi.restoreAllMocks());

function manager() {
  return new WebXRSessionManager(
    {} as ConstructorParameters<typeof WebXRSessionManager>[0],
    {},
    'immersive-ar'
  );
}

describe('exit control', () => {
  it('follows session availability and stops following it after disposal', () => {
    const sessionManager = manager();
    const button = new UIExitButton({sessionManager});
    expect(button.visible).toBe(false);
    sessionManager.currentSession = {} as XRSession;
    sessionManager.dispatchEvent({
      type: WebXRSessionEventType.SESSION_START,
      session: sessionManager.currentSession,
    });
    expect(button.visible).toBe(true);
    sessionManager.currentSession = undefined;
    sessionManager.dispatchEvent({type: WebXRSessionEventType.SESSION_END});
    expect(button.visible).toBe(false);
    button.dispose();
    sessionManager.currentSession = {} as XRSession;
    sessionManager.dispatchEvent({
      type: WebXRSessionEventType.SESSION_START,
      session: sessionManager.currentSession,
    });
    expect(button.visible).toBe(false);
  });

  it('ends the native session through the injected manager and can retry after a failure', async () => {
    const sessionManager = manager();
    const registry = new Registry();
    registry.register(sessionManager, WebXRSessionManager);
    const button = new UIExitButton();
    await callInitWithDependencyInjection(button, registry, undefined);
    const end = vi
      .fn()
      .mockRejectedValueOnce(new Error('Native session failure'))
      .mockResolvedValue(undefined);
    const session = {
      end,
      removeEventListener: () => {},
    } as unknown as XRSession;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      sessionManager.currentSession = session;
      await expect(button.handleExit()).resolves.toBeUndefined();
      expect(sessionManager.currentSession).toBeUndefined();
      sessionManager.currentSession = session;
      await button.handleExit();
      expect(end).toHaveBeenCalledTimes(2);
      expect(sessionManager.currentSession).toBeUndefined();
    } finally {
      button.dispose();
    }
  });
});

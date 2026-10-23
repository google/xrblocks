import {describe, expect, it, vi} from 'vitest';

import {Registry} from '../../core/components/Registry';
import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from '../../core/components/WebXRSessionManager';
import {callInitWithDependencyInjection} from '../../utils/DependencyInjection';
import {DEFAULT_EXIT_BUTTON_STYLE, UIExitButton} from './UIExitButton';

describe('UIExitButton', () => {
  it('initializes with default label, ariaLabel, and style', () => {
    const button = new UIExitButton();

    expect(button.label).toBe('X');
    expect(button.ariaLabel).toBe('Exit XR');
    expect(button.style.position).toBe('absolute');
    expect(button.style.top).toBe(-48);
    expect(button.style.left).toBe(0);
    expect(button.style.width).toBe(36);
    expect(button.style.height).toBe(36);
    expect(button.style.borderRadius).toBe(18);
    expect(button.style.fontSize).toBe(16);
    expect(button.style.fontWeight).toBe('bold');
    expect(DEFAULT_EXIT_BUTTON_STYLE.width).toBe(36);
  });

  it('allows overriding style, label, and ariaLabel', () => {
    const button = new UIExitButton({
      label: 'Close',
      ariaLabel: 'Close Demo',
      style: {
        top: -60,
        width: 48,
        height: 48,
      },
    });

    expect(button.label).toBe('Close');
    expect(button.ariaLabel).toBe('Close Demo');
    expect(button.style.top).toBe(-60);
    expect(button.style.width).toBe(48);
    expect(button.style.height).toBe(48);
    expect(button.style.borderRadius).toBe(18); // Preserves non-overridden defaults
  });

  it('declares WebXRSessionManager as an optional dependency', () => {
    expect(UIExitButton.optionalDependencies).toEqual({
      sessionManager: WebXRSessionManager,
    });
  });

  it('starts hidden and follows the active session lifecycle', () => {
    const manager = createSessionManager();
    const button = new UIExitButton({sessionManager: manager});

    expect(button.visible).toBe(false);
    manager.currentSession = {} as XRSession;
    manager.dispatchEvent({
      type: WebXRSessionEventType.SESSION_START,
      session: manager.currentSession!,
    });
    expect(button.visible).toBe(true);

    manager.currentSession = undefined;
    manager.dispatchEvent({type: WebXRSessionEventType.SESSION_END});
    expect(button.visible).toBe(false);
  });

  it('invokes custom onClick callback', async () => {
    const onClick = vi.fn();
    const button = new UIExitButton({onClick});

    await button.handleExit(onClick);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('invokes custom onExit callback', async () => {
    const onExit = vi.fn();
    const button = new UIExitButton({onExit});

    await button.handleExit();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ends active session via constructor-injected sessionManager', async () => {
    const mockManager = createSessionManager();
    mockManager.currentSession = {} as XRSession;
    vi.spyOn(mockManager, 'endSession').mockResolvedValue(undefined);

    const button = new UIExitButton({sessionManager: mockManager});
    await button.handleExit();
    expect(mockManager.endSession).toHaveBeenCalledTimes(1);
  });

  it('ends active session via init({sessionManager}) dependency injection', async () => {
    const mockManager = createSessionManager();
    mockManager.currentSession = {} as XRSession;
    vi.spyOn(mockManager, 'endSession').mockResolvedValue(undefined);

    const button = new UIExitButton();
    button.init({sessionManager: mockManager});
    await button.handleExit();
    expect(mockManager.endSession).toHaveBeenCalledTimes(1);
  });

  it('integrates with callInitWithDependencyInjection and Registry', async () => {
    const registry = new Registry();
    const mockManager = createSessionManager();
    mockManager.currentSession = {} as XRSession;
    vi.spyOn(mockManager, 'endSession').mockResolvedValue(undefined);

    registry.register(mockManager, WebXRSessionManager);

    const button = new UIExitButton();
    await callInitWithDependencyInjection(button, registry, undefined);

    await button.handleExit();
    expect(mockManager.endSession).toHaveBeenCalledTimes(1);
  });

  it('allows dependency injection when no session manager is registered', async () => {
    const button = new UIExitButton();

    await expect(
      callInitWithDependencyInjection(button, new Registry(), undefined)
    ).resolves.toBeUndefined();
    expect(button.visible).toBe(false);
  });

  it('does not try to end a session when none is active', async () => {
    const mockManager = createSessionManager();
    const endSession = vi.spyOn(mockManager, 'endSession');
    const button = new UIExitButton({sessionManager: mockManager});

    await button.handleExit();

    expect(button.visible).toBe(false);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('handles session end failure gracefully', async () => {
    const mockManager = createSessionManager();
    mockManager.currentSession = {} as XRSession;
    vi.spyOn(mockManager, 'endSession').mockRejectedValue(
      new Error('Session error')
    );

    const button = new UIExitButton({sessionManager: mockManager});
    await expect(button.handleExit()).resolves.not.toThrow();
  });
});

function createSessionManager(): WebXRSessionManager {
  return new WebXRSessionManager(
    {} as ConstructorParameters<typeof WebXRSessionManager>[0],
    {},
    'immersive-ar'
  );
}

import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {UICard} from './UICard';
import {DEFAULT_EXIT_BUTTON_STYLE, UIExitButton} from './UIExitButton';
import {UIOverlay} from './UIOverlay';

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

  it('invokes parent closeApp method if available', async () => {
    const closeApp = vi.fn();
    const parent = new THREE.Object3D() as THREE.Object3D & {
      closeApp: () => void;
    };
    parent.closeApp = closeApp;

    const overlay = new UIOverlay({exitButton: true});
    parent.add(overlay);

    await overlay.exitButton!.handleExit();
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('ends active session from session getter or parent', async () => {
    const mockSession = {
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as XRSession;

    const button = new UIExitButton({session: mockSession});
    await button.handleExit();
    expect(mockSession.end).toHaveBeenCalledTimes(1);
  });

  it('ends active session from scene graph xrSession property', async () => {
    const mockSession = {
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as XRSession;

    const parent = new THREE.Object3D() as THREE.Object3D & {
      xrSession: XRSession;
    };
    parent.xrSession = mockSession;

    const overlay = new UIOverlay({exitButton: true});
    parent.add(overlay);

    await overlay.exitButton!.handleExit();
    expect(mockSession.end).toHaveBeenCalledTimes(1);
  });

  it('ends active session from global xb.core.renderer.xr if present', async () => {
    const mockSession = {
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as XRSession;

    (globalThis as unknown as {xb: unknown}).xb = {
      core: {
        renderer: {
          xr: {
            getSession: () => mockSession,
          },
        },
      },
    };

    try {
      const button = new UIExitButton();
      await button.handleExit();
      expect(mockSession.end).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as unknown as {xb?: unknown}).xb;
    }
  });

  it('creates exit button on UIOverlay when exitButton option is true', () => {
    const overlay = new UIOverlay({exitButton: true});

    expect(overlay.exitButton).toBeDefined();
    expect(overlay.exitButton).toBeInstanceOf(UIExitButton);
    expect(overlay.children[0]).toBe(overlay.exitButton);
  });

  it('configures custom exitButton on UIOverlay', () => {
    const onExit = vi.fn();
    const overlay = new UIOverlay({
      exitButton: {onExit, label: 'Quit'},
    });

    expect(overlay.exitButton).toBeDefined();
    expect(overlay.exitButton?.label).toBe('Quit');
  });

  it('creates exit button on UICard when exitButton option is true', () => {
    const card = new UICard({
      size: {width: 500, height: 300},
      exitButton: true,
    });

    expect(card.exitButton).toBeDefined();
    expect(card.exitButton).toBeInstanceOf(UIExitButton);
    expect(card.children[0]).toBe(card.exitButton);
  });
});

import {Container, Text} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from '../../core/components/WebXRSessionManager';
import type {WebGLOrWebGPURenderer} from '../../core/RendererTypes';
import {HitRegistry} from '../../interaction/HitRegistry';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {createUIBackend} from '../internal/UIKitBackend';
import type {UnifiedPanelLayer} from '../primitives/layers/UnifiedPanelLayer';
import {ui} from '../UI';
import {UICard, measureUICardMinContentWidth} from './UICard';
import {UIExitButton} from './UIExitButton';
import {UIText} from './UIText';

const cleanups: Array<() => void> = [];

afterEach(() => {
  UIExitButton.alwaysVisible = false;
  ui.theme = 'grayGlass';
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

function mountCard(card: UICard) {
  const backend = createUIBackend();
  const mount = backend.createMount(card);
  cleanups.push(() => {
    mount.dispose();
    backend.dispose();
  });
  const viewport = {width: 800, height: 600};
  let mappings = mount.commit(ui.theme, viewport, 0)!;
  return {
    mount,
    commit() {
      mappings = mount.commit(ui.theme, viewport, 0) ?? mappings;
    },
    physical(element: THREE.Object3D) {
      return mappings.find((mapping) => mapping.logical === element)!
        .physical as Container;
    },
    registerHits() {
      const registry = new HitRegistry();
      for (const {physical, logical, options} of mappings) {
        registry.register(physical, logical, options);
      }
      return registry;
    },
  };
}

async function waitForLayout(
  view: ReturnType<typeof mountCard>,
  assertion: () => void
) {
  await vi.waitFor(() => {
    view.mount.update(0.016);
    view.mount.object.updateMatrixWorld(true);
    assertion();
  });
}

function createSessionRig() {
  const renderer = {
    xr: {setSession: vi.fn().mockResolvedValue(undefined)},
  } as unknown as WebGLOrWebGPURenderer;
  const sessionManager = new WebXRSessionManager(renderer, {}, 'immersive-ar');
  const createSession = (endImpl?: () => Promise<void>) => {
    const endListeners = new Set<() => void>();
    const end = vi.fn(async () => {
      if (endImpl) await endImpl();
      for (const listener of [...endListeners]) listener();
    });
    const session = {
      end,
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'end') endListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'end') endListeners.delete(listener);
      }),
    } as unknown as XRSession;
    return {session, end};
  };
  return {
    sessionManager,
    startSession(endImpl?: () => Promise<void>) {
      const {session, end} = createSession(endImpl);
      sessionManager.currentSession = session;
      sessionManager.dispatchEvent({
        type: WebXRSessionEventType.SESSION_START,
        session,
      });
      return {session, end};
    },
    endSessionEvent() {
      sessionManager.currentSession = undefined;
      sessionManager.dispatchEvent({type: WebXRSessionEventType.SESSION_END});
    },
  };
}

describe('UIExitButton', () => {
  it('stays hidden and zero-height outside XR, expands to a 492x56 pill on session start, and collapses on session end', async () => {
    const {sessionManager, startSession, endSessionEvent} = createSessionRig();
    const header = new UIText({
      text: 'Spatial audio',
      style: {height: 56, flexShrink: 0},
    });
    const exitButton = new UIExitButton();
    exitButton.init({sessionManager});
    const card = new UICard({
      size: {width: 0.54, height: 'auto'},
      style: {padding: 24, gap: 24, justifyContent: 'flex-start'},
      children: [header, exitButton],
    });
    const view = mountCard(card);

    expect(exitButton.label).toBe('Exit app');
    expect(exitButton.ariaLabel).toBe('Exit app');
    expect(exitButton.icon).toBeUndefined();
    expect(exitButton.visible).toBe(false);
    expect(exitButton.style.display).toBe('none');

    await waitForLayout(view, () => {
      expect(view.physical(card).size.peek()).toEqual([540, 104]);
    });
    expect(view.mount.validate()).toEqual([]);
    expect(measureUICardMinContentWidth(card)).toBeLessThan(0.3);

    const hiddenPoint = view
      .physical(exitButton)
      .getWorldPosition(new THREE.Vector3());
    expect(
      view
        .registerHits()
        .intersectionsAt(hiddenPoint)
        .some((hit) => hit.object === view.physical(exitButton))
    ).toBe(false);

    startSession();
    expect(exitButton.visible).toBe(true);
    expect(exitButton.style.display).toBe('flex');
    view.commit();

    await waitForLayout(view, () => {
      expect(view.physical(exitButton).size.peek()).toEqual([492, 56]);
      expect(view.physical(card).size.peek()).toEqual([540, 184]);
    });
    expect(view.mount.validate()).toEqual([]);

    const activePoint = view
      .physical(exitButton)
      .getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Ray(
      activePoint.clone().add(new THREE.Vector3(0, 0, 1)),
      new THREE.Vector3(0, 0, -1)
    );
    const registry = view.registerHits();
    const hits = registry.raycast(new THREE.Scene(), ray, []);
    expect(registry.resolve(hits[0].object).logical).toBe(exitButton);

    endSessionEvent();
    expect(exitButton.visible).toBe(false);
    expect(exitButton.style.display).toBe('none');
    view.commit();

    await waitForLayout(view, () => {
      expect(view.physical(card).size.peek()).toEqual([540, 104]);
    });
    expect(view.mount.validate()).toEqual([]);

    exitButton.dispose();
    startSession();
    expect(exitButton.visible).toBe(false);
    exitButton.init();
    expect(exitButton.visible).toBe(false);
  });

  it('supports per-instance alwaysVisible, explicit visible: true, and live UIExitButton.alwaysVisible overrides', async () => {
    const {sessionManager} = createSessionRig();
    const defaultExit = new UIExitButton({sessionManager});
    const instanceAlwaysExit = new UIExitButton({
      alwaysVisible: true,
      sessionManager,
    });
    const explicitVisibleExit = new UIExitButton({
      visible: true,
      sessionManager,
    });
    const card = new UICard({
      size: {width: 0.54, height: 'auto'},
      style: {padding: 24, gap: 24, justifyContent: 'flex-start'},
      children: [defaultExit, instanceAlwaysExit, explicitVisibleExit],
    });
    const view = mountCard(card);

    await waitForLayout(view, () => {
      expect(defaultExit.visible).toBe(false);
      expect(view.physical(instanceAlwaysExit).size.peek()).toEqual([492, 56]);
      expect(view.physical(explicitVisibleExit).size.peek()).toEqual([492, 56]);
      expect(view.physical(card).size.peek()).toEqual([540, 184]);
    });

    UIExitButton.alwaysVisible = true;
    expect(UIExitButton.alwaysVisible).toBe(true);
    expect(defaultExit.visible).toBe(true);
    expect(defaultExit.style.display).toBe('flex');
    view.commit();

    await waitForLayout(view, () => {
      expect(view.physical(defaultExit).size.peek()).toEqual([492, 56]);
      expect(view.physical(card).size.peek()).toEqual([540, 264]);
    });

    UIExitButton.alwaysVisible = false;
    expect(defaultExit.visible).toBe(false);
    expect(defaultExit.style.display).toBe('none');
    expect(instanceAlwaysExit.visible).toBe(true);
    expect(explicitVisibleExit.visible).toBe(true);
    view.commit();

    await waitForLayout(view, () => {
      expect(view.physical(card).size.peek()).toEqual([540, 184]);
    });

    defaultExit.dispose();
    UIExitButton.alwaysVisible = true;
    expect(defaultExit.visible).toBe(false);

    defaultExit.init();
    expect(defaultExit.visible).toBe(true);
    expect(defaultExit.style.display).toBe('flex');

    UIExitButton.alwaysVisible = false;
    expect(defaultExit.visible).toBe(false);

    defaultExit.dispose();
    defaultExit.init({sessionManager});
    UIExitButton.alwaysVisible = true;
    expect(defaultExit.visible).toBe(true);
    expect(defaultExit.style.display).toBe('flex');
  });

  it('isolates zero padding and Warning state paints across grayGlass, colorful, and highContrast themes', async () => {
    const exitButton = new UIExitButton({
      alwaysVisible: true,
      style: {':hover': {opacity: 0.95}},
    });
    const card = new UICard({
      size: {width: 0.54, height: 'auto'},
      style: {padding: 24},
      children: [exitButton],
    });
    const view = mountCard(card);
    const physical = view.physical(exitButton);
    const layer = physical.getObjectByName(
      'UnifiedPanelLayer'
    ) as UnifiedPanelLayer;
    const label = physical.children.find(
      (child): child is Text => child instanceof Text
    )!;

    for (const preset of ['grayGlass', 'colorful', 'highContrast'] as const) {
      ui.theme = preset;
      exitButton.disabled = false;
      view.commit();
      await waitForLayout(view, () => {
        expect(physical.size.peek()).toEqual([492, 56]);
      });

      expect(physical.paddingInset.peek()).toEqual([0, 0, 0, 0]);
      expect(layer.properties.peek().fillColor).toBe(
        'rgba(255, 154, 154, 0.16)'
      );
      expect(layer.properties.peek().strokeWidth).toBe(0);
      expect(layer.properties.peek().cornerRadius).toBe(36);
      expect(label.properties.peek().text).toBe('Exit app');
      expect(label.properties.peek().color).toBe('#e1e2e8');

      view.mount.present(() => ({
        hovered: true,
        active: false,
        disabled: false,
      }));
      expect(layer.properties.peek().fillColor).toBe(
        'rgba(255, 154, 154, 0.24)'
      );
      expect(layer.properties.peek().strokeWidth).toBe(0);
      expect(label.properties.peek().color).toBe('#e1e2e8');

      view.mount.present(() => ({
        hovered: true,
        active: true,
        disabled: false,
      }));
      expect(layer.properties.peek().fillColor).toBe(
        'rgba(255, 154, 154, 0.3)'
      );
      expect(layer.properties.peek().strokeWidth).toBe(0);
      expect(label.properties.peek().color).toBe('#e1e2e8');

      exitButton.disabled = true;
      view.commit();
      view.mount.present(() => ({
        hovered: false,
        active: false,
        disabled: true,
      }));
      expect(layer.properties.peek().fillColor).toBe(
        'rgba(225, 226, 232, 0.07)'
      );
      expect(layer.properties.peek().strokeWidth).toBe(0);
      expect(label.properties.peek().color).toBe('#a5a6ac');
    }
  });

  it('invokes custom onExit or onClick handlers, or ends the active WebXR session with error recovery', async () => {
    const {sessionManager, startSession} = createSessionRig();
    const {end} = startSession();

    const onExit = vi.fn();
    const onClick = vi.fn();
    const customExit = new UIExitButton({sessionManager, onExit, onClick});
    await customExit.handleExit(onClick);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();

    const clickFallback = new UIExitButton({sessionManager, onClick});
    getSemanticControl(clickFallback)!.activate();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();

    const sessionExit = new UIExitButton({sessionManager});
    await sessionExit.handleExit();
    expect(end).toHaveBeenCalledTimes(1);
    expect(sessionManager.currentSession).toBeUndefined();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    startSession(async () => {
      throw new Error('Device disconnected');
    });
    await expect(sessionExit.handleExit()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to end XR session',
      expect.any(Error)
    );
  });
});

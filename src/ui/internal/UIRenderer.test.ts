import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';
import {ScriptsManager} from '../../core/components/ScriptsManager';
import {Interaction} from '../../interaction/Interaction';

import {ui} from '../UI';
import {UIButton} from '../components/UIButton';
import {UICard} from '../components/UICard';
import {UIOverlay} from '../components/UIOverlay';
import {UITextInput} from '../components/UITextInput';
import type {UIBackend, UIMount} from './UIBackend';
import {createUIBackend} from './UIKitBackend';
import {UIRenderer} from './UIRenderer';

describe('UIRenderer validation', () => {
  it('exposes mounted validation through xb.ui', async () => {
    const overlay = new UIOverlay();
    const scene = new THREE.Scene();
    scene.add(overlay);
    const issue = {
      code: 'outside-viewport' as const,
      severity: 'error' as const,
      element: overlay,
      message: 'Overlay extends outside the viewport.',
    };
    const mount: UIMount = {
      object: new THREE.Group(),
      commit: () => [],
      present: vi.fn(),
      update: vi.fn(),
      validate: () => [issue],
      dispose: vi.fn(),
    };
    const backend: UIBackend = {
      createMount: () => mount,
      dispose: vi.fn(),
    };
    const renderer = new UIRenderer(
      new Interaction({callbacks: new ScriptsManager(async () => {})}),
      async () => ({
        createUIBackend: () => backend,
      })
    );

    await renderer.initialize(scene, {} as THREE.WebGLRenderer);

    expect(ui.validate(overlay)).toEqual({
      ready: true,
      ok: false,
      issues: [issue],
    });

    renderer.dispose();
    expect(ui.validate(overlay)).toMatchObject({ready: false, ok: false});
  });
});

describe('UIRenderer presentation', () => {
  it.each([false, true])(
    'releases old editors before moving text into an earlier root (disconnected source=%s)',
    async (disconnectSource) => {
      const target = new UICard({size: {width: 1, height: 1}});
      const field = new UITextInput({
        ariaLabel: 'Cross-root message',
        value: 'retained draft',
      });
      const source = new UICard({
        size: {width: 1, height: 1},
        children: [field],
      });
      const scene = new THREE.Scene();
      scene.add(target, source);
      const backend = createUIBackend();
      const renderer = new UIRenderer(
        new Interaction({callbacks: new ScriptsManager(async () => {})}),
        async () => ({
          createUIBackend: () => ({
            createMount: (root) => backend.createMount(root),
            dispose: () => backend.dispose(),
          }),
        })
      );
      const selector = 'input[aria-label="Cross-root message"]';
      try {
        await renderer.initialize(scene, {} as THREE.WebGLRenderer);
        const camera = new THREE.PerspectiveCamera();
        renderer.reconcile(0, camera);
        const previous = document.querySelector<HTMLInputElement>(selector)!;
        expect(previous.value).toBe('retained draft');

        if (disconnectSource) source.removeFromParent();
        target.add(field);
        renderer.reconcile(0, camera);
        const current = document.querySelector<HTMLInputElement>(selector)!;
        expect(document.querySelectorAll(selector)).toHaveLength(1);
        expect(previous.isConnected).toBe(false);
        expect(current).not.toBe(previous);
        expect(current.value).toBe('retained draft');
        current.value = 'moved draft';
        current.dispatchEvent(new Event('input'));
        expect(field.value).toBe('moved draft');

        if (disconnectSource) scene.add(source);
        renderer.reconcile(0, camera);
        expect(document.querySelectorAll(selector)).toHaveLength(1);
        expect(document.querySelector(selector)).toBe(current);
      } finally {
        renderer.dispose();
        for (const element of document.querySelectorAll(selector))
          element.remove();
      }
    }
  );

  it('commits durable changes before it presents interaction paint', async () => {
    const button = new UIButton({label: 'Toggle'});
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      children: [button],
    });
    const scene = new THREE.Scene();
    scene.add(card);
    const calls: string[] = [];
    const mount: UIMount = {
      object: new THREE.Group(),
      commit: vi.fn(() => {
        calls.push('commit');
        return [];
      }),
      present: vi.fn(() => calls.push('present')),
      update: vi.fn(),
      validate: () => [],
      dispose: vi.fn(),
    };
    const backend: UIBackend = {
      createMount: () => mount,
      dispose: vi.fn(),
    };
    const renderer = new UIRenderer(
      new Interaction({callbacks: new ScriptsManager(async () => {})}),
      async () => ({
        createUIBackend: () => backend,
      })
    );

    await renderer.initialize(scene, {} as THREE.WebGLRenderer);
    renderer.reconcile(0, new THREE.PerspectiveCamera());
    renderer.present();
    calls.length = 0;

    button.icon = 'check';
    renderer.reconcile(0, new THREE.PerspectiveCamera());
    renderer.present();
    expect(mount.commit).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['commit', 'present']);

    renderer.dispose();
  });
});

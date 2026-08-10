import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {ui} from '../UI';
import {UIButton} from '../components/UIButton';
import {UICard} from '../components/UICard';
import {UIOverlay} from '../components/UIOverlay';
import type {UIBackend, UIMount} from './UIBackend';
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
    const renderer = new UIRenderer({} as never, async () => ({
      createUIBackend: () => backend,
    }));

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
    const renderer = new UIRenderer({} as never, async () => ({
      createUIBackend: () => backend,
    }));

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

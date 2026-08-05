import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {ui} from '../UI';
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
      sync: () => [],
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

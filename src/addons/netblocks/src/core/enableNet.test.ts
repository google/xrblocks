import {describe, expect, it, vi} from 'vitest';

// `enableNet()` reads `xb.core.scene` and `xb.core.scriptsManager`. Mock
// just enough of xrblocks to exercise the registration path without
// booting a real xrblocks Core (and without an AudioContext, which jsdom
// can't satisfy).
const mocks = vi.hoisted(() => {
  const fakeScene = {add: (..._args: unknown[]) => {}};
  const fakeScriptsManager = {initScript: (..._args: unknown[]) => {}};
  const fakeCore: {
    scene: typeof fakeScene;
    scriptsManager: typeof fakeScriptsManager;
    net?: unknown;
  } = {scene: fakeScene, scriptsManager: fakeScriptsManager};
  return {fakeScene, fakeScriptsManager, fakeCore};
});

vi.mock('xrblocks', async () => {
  const THREE = await import('three');
  return {
    core: mocks.fakeCore,
    Script: THREE.Object3D,
  };
});

import {NetCore} from './NetCore';
import {enableNet} from './enableNet';

describe('enableNet()', () => {
  it('creates a NetCore, adds it to the scene, and registers it', () => {
    mocks.fakeCore.net = undefined;
    const sceneAdd = vi.spyOn(mocks.fakeScene, 'add');
    const initScript = vi.spyOn(mocks.fakeScriptsManager, 'initScript');

    const net = enableNet();

    expect(net).toBeInstanceOf(NetCore);
    expect(sceneAdd).toHaveBeenCalledTimes(1);
    expect(initScript).toHaveBeenCalledTimes(1);
    expect(mocks.fakeCore.net).toBe(net);
  });

  it('is idempotent — repeated calls return the same instance', () => {
    mocks.fakeCore.net = undefined;
    const a = enableNet();
    const b = enableNet();
    const c = enableNet();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

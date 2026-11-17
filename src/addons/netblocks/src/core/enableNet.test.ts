import {expect, it, vi} from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {core} from 'xrblocks';
import {enableNet} from './enableNet';

it('registers one real networking owner across repeated enable calls', () => {
  const existing = core.net;
  const before = new Set(core.scene.children);
  try {
    core.net = undefined;
    const net = enableNet();
    expect(enableNet()).toBe(net);
    expect(core.net).toBe(net);
    expect(
      core.scene.children.filter((child) => !before.has(child))
    ).toHaveLength(1);
    for (const child of core.scene.children.filter(
      (child) => !before.has(child)
    ))
      child.removeFromParent();
    net.dispose();
  } finally {
    core.net = existing;
  }
});

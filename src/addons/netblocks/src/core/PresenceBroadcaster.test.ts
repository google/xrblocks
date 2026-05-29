import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

// Mock xrblocks so PresenceBroadcaster's xb.core reads are controllable from
// the test. We mutate `mockCore` between tests; the broadcaster sees the
// changes because it reads `xb.core?.camera` lazily on every update().
const mockCore: {
  camera?: THREE.Camera;
  user?: {hands?: {hands?: unknown[]}};
} = {};
vi.mock('xrblocks', () => ({
  get core() {
    return mockCore;
  },
}));

import {NetMessage} from './codec/MessageCodec';
import {PresenceBroadcaster} from './presence/PresenceBroadcaster';

function makeCamera(): THREE.Camera {
  const c = new THREE.PerspectiveCamera();
  c.position.set(0, 1.6, 0);
  c.updateMatrixWorld(true);
  return c;
}

describe('PresenceBroadcaster', () => {
  let sent: NetMessage[];
  let send: (msg: NetMessage) => void;

  beforeEach(() => {
    sent = [];
    send = (msg) => sent.push(msg);
    mockCore.camera = undefined;
    mockCore.user = undefined;
  });

  it('skips silently when no camera is available', () => {
    const b = new PresenceBroadcaster(send, 60);
    b.update(0);
    expect(sent).toEqual([]);
  });

  it('emits a pose message at the configured cadence', () => {
    mockCore.camera = makeCamera();
    const b = new PresenceBroadcaster(send, 20); // period = 50ms
    b.update(1000);
    expect(sent).toHaveLength(1);
    b.update(1040);
    expect(sent).toHaveLength(1);
    b.update(1060);
    expect(sent).toHaveLength(2);
  });

  it('does not send when disabled', () => {
    mockCore.camera = makeCamera();
    const b = new PresenceBroadcaster(send, 60);
    b.setEnabled(false);
    b.update(1000);
    b.update(2000);
    expect(sent).toEqual([]);
    expect(b.isEnabled()).toBe(false);
  });

  it('sends a head-only frame when no XR session / no hands are available', () => {
    mockCore.camera = makeCamera();
    // user/hands intentionally absent — desktop tab case.
    const b = new PresenceBroadcaster(send, 60);
    b.update(1000);
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('pose');
  });

  it('survives an empty user object (XR not yet started)', () => {
    mockCore.camera = makeCamera();
    mockCore.user = {hands: undefined};
    const b = new PresenceBroadcaster(send, 60);
    expect(() => b.update(1000)).not.toThrow();
    expect(sent).toHaveLength(1);
  });
});

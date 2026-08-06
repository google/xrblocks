import {describe, expect, it, vi} from 'vitest';

// RemoteUserAvatar uses `xb.StylizedFace` to attach a face to the
// default head; stub it with a bare Object3D so the test scaffolding
// doesn't need a real canvas/WebGL pipeline.
vi.mock('xrblocks', async () => {
  const T = await import('three');
  class FakeFace extends T.Object3D {
    dispose = vi.fn();
  }
  return {
    core: undefined,
    StylizedFace: FakeFace,
  };
});

// troika-three-text is lazy-loaded by the avatar for the name label.
// Stub it to a no-op constructor so the dynamic import resolves
// synchronously without touching webgl-sdf-generator.
vi.mock('troika-three-text', async () => {
  const T = await import('three');
  return {
    Text: class extends T.Object3D {
      text = '';
      sync() {}
      dispose() {}
    },
  };
});

import {RemoteUserAvatar} from './RemoteUserAvatar';

describe('RemoteUserAvatar default face', () => {
  it('dispose() releases the face', () => {
    const avatar = new RemoteUserAvatar({peerId: 'peer-1'});
    const disposeSpy = (avatar.face as unknown as {dispose: () => void})
      .dispose;
    avatar.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });
});

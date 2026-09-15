import {describe, expect, it, vi} from 'vitest';

// RemoteUserAvatar uses `xb.StylizedFace` to attach a face to the
// default head; stub it with a bare Object3D so the test scaffolding
// doesn't need a real canvas/WebGL pipeline.
vi.mock('xrblocks', async () => {
  const T = await import('three');
  class FakeFace extends T.Object3D {
    dispose = vi.fn();
  }
  class FakeUIElement extends T.Object3D {
    dispose = vi.fn();
  }
  return {
    core: undefined,
    StylizedFace: FakeFace,
    UICard: FakeUIElement,
    UIText: class extends FakeUIElement {
      text = '';
      constructor(opts?: {text?: string}) {
        super();
        this.text = opts?.text ?? '';
      }
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

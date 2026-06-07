import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

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
  it('attaches a face to the default head so it inherits the head pose', () => {
    const avatar = new RemoteUserAvatar({peerId: 'peer-1'});
    // The face must be parented under the default head sphere — that
    // way it follows head transforms automatically AND disappears
    // when a host app hides the default avatar via
    // `avatar.defaultMesh.visible = false`.
    const headSphere = avatar.defaultMesh.children.find(
      (c) => c instanceof THREE.Mesh
    );
    expect(headSphere).toBeDefined();
    expect(headSphere!.children).toContain(avatar.face);
  });

  it('hiding the default mesh hides the face too', () => {
    const avatar = new RemoteUserAvatar({peerId: 'peer-1'});
    avatar.defaultMesh.visible = false;
    avatar.defaultMesh.updateMatrixWorld(true);
    // Three's visibility cascades down the scene graph; the face is
    // under defaultMesh > headSphere, so the renderer will skip it
    // whenever defaultMesh is invisible. Walk the parents to confirm.
    let node: THREE.Object3D | null = avatar.face;
    let hidden = false;
    while (node) {
      if (!node.visible) {
        hidden = true;
        break;
      }
      node = node.parent;
    }
    expect(hidden).toBe(true);
  });

  it('dispose() releases the face', () => {
    const avatar = new RemoteUserAvatar({peerId: 'peer-1'});
    const disposeSpy = (avatar.face as unknown as {dispose: () => void})
      .dispose;
    avatar.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });
});

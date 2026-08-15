import {Image} from '@pmndrs/uikit';
import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {ui} from '../UI';
import {UICard} from '../components/UICard';
import {UIImage} from '../components/UIImage';
import {UIText} from '../components/UIText';
import {createUIBackend} from './UIKitBackend';

describe('UIKitMount retained updates', () => {
  it('retains existing child nodes when a sibling is added', () => {
    const first = new UIText({text: 'First'});
    const card = new UICard({
      size: {width: 200, height: 100},
      children: [first],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);

    const initial = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;
    const firstNode = initial.find(
      (mapping) => mapping.logical === first
    )!.physical;
    const second = new UIText({text: 'Second'});
    card.add(second);
    const updated = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;

    expect(updated.find((mapping) => mapping.logical === first)!.physical).toBe(
      firstNode
    );

    mount.dispose();
    backend.dispose();
  });

  it('keeps the committed image until its replacement loads', async () => {
    let resolveLoad!: (texture: THREE.Texture) => void;
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );
    const previous = texture();
    const image = new UIImage({src: previous});
    const card = new UICard({
      size: {width: 200, height: 100},
      children: [image],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    const viewport = {width: 800, height: 600};
    const mappings = mount.commit(ui.theme, viewport, 0)!;
    const physical = mappings.find((mapping) => mapping.logical === image)!
      .physical as Image;

    image.src = '/next.png';
    mount.commit(ui.theme, viewport, 0);
    expect(physical.texture.value).toBe(previous);

    const loaded = texture();
    resolveLoad(loaded);
    await Promise.resolve();
    await Promise.resolve();
    mount.commit(ui.theme, viewport, 0);
    expect(physical.texture.value).not.toBe(previous);

    mount.dispose();
    backend.dispose();
  });
});

function texture(): THREE.DataTexture {
  return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
}

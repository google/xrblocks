import {Image} from '@pmndrs/uikit';
import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {ui} from '../UI';
import {UICard} from '../components/UICard';
import {UIImage} from '../components/UIImage';
import {UIText} from '../components/UIText';
import {UITextInput} from '../components/UITextInput';
import {UIPanel} from '../components/UIPanel';
import {UIScrollView} from '../components/UIScrollView';
import {createUIBackend} from './UIKitBackend';

describe('UIKitMount retained updates', () => {
  it.each([
    {earlier: true, subtree: false},
    {earlier: false, subtree: false},
    {earlier: true, subtree: true},
    {earlier: false, subtree: true},
  ])(
    'reparents text without duplicate editors (earlier=$earlier, subtree=$subtree)',
    ({earlier, subtree}) => {
      const onChange = vi.fn();
      const onBlur = vi.fn();
      const field = new UITextInput({
        ariaLabel: 'Moved message',
        value: 'draft',
        onChange,
        onBlur,
      });
      const moved = subtree ? new UIPanel({children: [field]}) : field;
      const source = new UIPanel({children: [moved]});
      const target = new UIPanel();
      const card = new UICard({
        size: {width: 1, height: 1},
        children: earlier ? [target, source] : [source, target],
      });
      const backend = createUIBackend();
      const mount = backend.createMount(card);
      const viewport = {width: 800, height: 600};
      const selector = 'input[aria-label="Moved message"]';
      try {
        mount.commit(ui.theme, viewport, 0);
        const previous = document.querySelector<HTMLInputElement>(selector)!;
        previous.focus();
        previous.value = 'edited draft';
        previous.dispatchEvent(new Event('input'));
        expect(field.focused).toBe(true);

        target.add(moved);
        const mappings = mount.commit(ui.theme, viewport, 0)!;
        const current = document.querySelector<HTMLInputElement>(selector)!;
        expect(document.querySelectorAll(selector)).toHaveLength(1);
        expect(previous.isConnected).toBe(false);
        expect(current).not.toBe(previous);
        expect(current.value).toBe('edited draft');
        expect(field.focused).toBe(false);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited draft');
        expect(onBlur).toHaveBeenCalledOnce();
        expect(
          mappings.filter((mapping) => mapping.logical === field)
        ).toHaveLength(1);

        current.value = 'edited after moving';
        current.dispatchEvent(new Event('input'));
        expect(field.value).toBe('edited after moving');
        expect(mount.commit(ui.theme, viewport, 0)).toBeUndefined();
        expect(document.querySelector(selector)).toBe(current);
      } finally {
        mount.dispose();
        backend.dispose();
        for (const element of document.querySelectorAll(selector))
          element.remove();
      }
    }
  );

  it('measures and clamps a scroll viewport without replacing child hit surfaces', async () => {
    const children = Array.from(
      {length: 3},
      () => new UIPanel({style: {height: 80, flexShrink: 0}})
    );
    const view = new UIScrollView({
      style: {width: 200, height: 100, flexShrink: 0},
      children,
    });
    const card = new UICard({
      size: {width: 1, height: 1},
      style: {padding: 0},
      children: [view],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    const initial = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;
    await vi.waitFor(() => {
      mount.update(0.016);
      expect(view.clientHeight).toBe(100);
    });
    expect(view.scrollHeight).toBe(240);
    view.scrollTo(120);
    expect(
      mount.commit(ui.theme, {width: 800, height: 600}, 0)
    ).toBeUndefined();
    expect(view.scrollTop).toBe(120);
    view.style.height = 180;
    mount.commit(ui.theme, {width: 800, height: 600}, 0);
    await vi.waitFor(() => {
      mount.update(0.016);
      expect(view.clientHeight).toBe(180);
    });
    expect(view.scrollTop).toBe(60);
    expect(
      initial.find((mapping) => mapping.logical === children[0])?.physical
    ).toBeDefined();
    view.remove(children[2]);
    const next = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;
    mount.update(0.016);
    expect(view.scrollTop).toBe(0);
    expect(
      next.find((mapping) => mapping.logical === children[0])?.physical
    ).toBe(
      initial.find((mapping) => mapping.logical === children[0])?.physical
    );
    mount.dispose();
    backend.dispose();
    expect(view.ready).toBe(false);
  });

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

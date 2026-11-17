import {Container, Image, Text} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HitRegistry} from '../../interaction/HitRegistry';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {UICard, measureUICardContentHeight} from '../components/UICard';
import {UIDropdown} from '../components/UIDropdown';
import {UIImage} from '../components/UIImage';
import {UIOverlay} from '../components/UIOverlay';
import {UIPanel} from '../components/UIPanel';
import {UIProgress} from '../components/UIProgress';
import {UIScrollView} from '../components/UIScrollView';
import {UISlider} from '../components/UISlider';
import {UIText} from '../components/UIText';
import {UITextInput} from '../components/UITextInput';
import {UIToggle} from '../components/UIToggle';
import {ui} from '../UI';
import {getUIPresentationObject} from '../UIElement';
import {UICardEdge} from './UICardEdge';
import {UIHitRegion} from './UIHitRegion';
import {createUIBackend} from './UIKitBackend';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

function mountUI(root: UICard | UIOverlay) {
  const backend = createUIBackend();
  const mount = backend.createMount(root);
  cleanups.push(() => {
    mount.dispose();
    backend.dispose();
  });
  const viewport = {width: 800, height: 600};
  let mappings = mount.commit(ui.theme, viewport, 0)!;
  return {
    mount,
    commit() {
      mappings = mount.commit(ui.theme, viewport, 0) ?? mappings;
    },
    physical(element: THREE.Object3D) {
      return mappings.find((mapping) => mapping.logical === element)!
        .physical as Container;
    },
    get mappings() {
      return mappings;
    },
  };
}

function register(view: ReturnType<typeof mountUI>) {
  const registry = new HitRegistry();
  for (const {physical, logical, options} of view.mappings)
    registry.register(physical, logical, options);
  return registry;
}

async function layout(view: ReturnType<typeof mountUI>, assertion: () => void) {
  await vi.waitFor(() => {
    view.mount.update(0.016);
    view.mount.object.updateMatrixWorld(true);
    assertion();
  });
}

function texture(red: number) {
  const source = new THREE.DataTexture(new Uint8Array([red, 0, 0, 255]), 1, 1);
  cleanups.push(() => source.dispose());
  return source;
}

const SIZES = [
  {value: 's', label: 'Small'},
  {value: 'm', label: 'Medium'},
  {value: 'l', label: 'Large', disabled: true},
];

describe('real UIKit mounting and layout', () => {
  it('preserves an edited draft when its subtree moves to an earlier parent', () => {
    const onChange = vi.fn();
    const field = new UITextInput({
      ariaLabel: 'Moved message',
      value: 'draft',
      onChange,
    });
    const moved = new UIPanel({children: [field]});
    const source = new UIPanel({children: [moved]});
    const target = new UIPanel();
    const view = mountUI(
      new UICard({size: {width: 1, height: 1}, children: [target, source]})
    );
    const selector = 'input[aria-label="Moved message"]';
    const previous = document.querySelector<HTMLInputElement>(selector)!;
    previous.focus();
    previous.value = 'edited draft';
    previous.dispatchEvent(new Event('input'));
    target.add(moved);
    view.commit();
    const current = document.querySelector<HTMLInputElement>(selector)!;
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(current.value).toBe('edited draft');
    expect(field.focused).toBe(false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('edited draft');
    current.value = 'edited after moving';
    current.dispatchEvent(new Event('input'));
    expect(field.value).toBe('edited after moving');
  });

  it('clamps scrolling when measured content or viewport dimensions change', async () => {
    const children = Array.from(
      {length: 3},
      () => new UIPanel({style: {height: 80, flexShrink: 0}})
    );
    const scroll = new UIScrollView({
      style: {width: 200, height: 100, flexShrink: 0},
      children,
    });
    const view = mountUI(
      new UICard({
        size: {width: 1, height: 1},
        style: {padding: 0},
        children: [scroll],
      })
    );
    await layout(view, () => expect(scroll.clientHeight).toBe(100));
    expect(scroll.scrollHeight).toBe(240);
    scroll.scrollTo(120);
    expect(scroll.scrollTop).toBe(120);
    scroll.style.height = 180;
    view.commit();
    await layout(view, () => expect(scroll.clientHeight).toBe(180));
    expect(scroll.scrollTop).toBe(60);
    scroll.remove(children[2]);
    view.commit();
    await layout(view, () => expect(scroll.scrollTop).toBe(0));
  });

  it('limits auto-height content to its configured viewport maximum', async () => {
    const scroll = new UIScrollView({
      style: {width: 200, height: 'auto', maxHeight: 150},
      children: [new UIPanel({style: {height: 80, flexShrink: 0}})],
    });
    const view = mountUI(
      new UICard({
        size: {width: 1, height: 1},
        style: {padding: 0, justifyContent: 'flex-start'},
        children: [scroll],
      })
    );
    await layout(view, () => expect(scroll.clientHeight).toBe(80));
    scroll.add(new UIPanel({style: {height: 160, flexShrink: 0}}));
    view.commit();
    await layout(view, () => expect(scroll.clientHeight).toBe(150));
    expect(scroll.scrollHeight).toBe(240);
  });

  it('measures card content without changing its committed size', async () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.1},
      pixelSize: 0.001,
      style: {padding: 10, gap: 10, justifyContent: 'flex-start'},
      children: [
        new UIPanel({style: {height: 80, flexShrink: 0}}),
        new UIPanel({style: {height: 60, flexShrink: 0}}),
      ],
    });
    const view = mountUI(card);
    await layout(view, () =>
      expect(view.physical(card).size.peek()).toEqual([400, 100])
    );
    expect(measureUICardContentHeight(card, 0.3)).toBeCloseTo(0.17);
    view.mount.update(0.016);
    expect(view.physical(card).size.peek()).toEqual([400, 100]);
  });

  it('routes actual ray and touch queries to resize corners or translation', async () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      manipulation: true,
      edge: true,
    });
    const view = mountUI(card);
    const edge = view.mappings.find(
      (mapping) => mapping.physical instanceof UICardEdge
    )!.physical as UICardEdge;
    await layout(view, () => expect(edge.size.peek()?.[0]).toBeGreaterThan(0));
    const depth = edge.getWorldPosition(new THREE.Vector3()).z;
    const corner = new THREE.Vector3(0.285, 0.17, depth);
    const ray = new THREE.Ray(
      new THREE.Vector3(corner.x, corner.y, 1),
      new THREE.Vector3(0, 0, -1)
    );
    let registry = register(view);
    expect(registry.intersectionsAt(corner)[0]?.object).toBe(edge.resizeHandle);
    expect(registry.raycast(new THREE.Scene(), ray, [])[0]?.object).toBe(
      edge.resizeHandle
    );
    const side = new THREE.Vector3(0, 0.12, depth);
    expect(registry.intersectionsAt(side)[0]?.object).toBe(edge);
    expect(edge.containsPoint(new THREE.Vector3())).toBe(false);
    card.manipulation = {actions: {translate: true}};
    view.commit();
    registry = register(view);
    expect(registry.intersectionsAt(corner)[0]?.object).toBe(edge);
    expect(registry.raycast(new THREE.Scene(), ray, [])[0]?.object).toBe(edge);
  });

  it('keeps the current image until replacement bytes are available without disposing caller textures', async () => {
    let resolve!: (value: THREE.Texture) => void;
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const source = texture(10);
    const borrowedDisposed = vi.fn();
    source.addEventListener('dispose', borrowedDisposed);
    const image = new UIImage({src: source});
    const view = mountUI(
      new UICard({size: {width: 200, height: 100}, children: [image]})
    );
    const physical = view.physical(image) as Image;
    image.src = '/next.png';
    view.commit();
    expect(physical.texture.value?.image.data[0]).toBe(10);
    resolve(texture(200));
    await vi.waitFor(() => {
      view.commit();
      expect(physical.texture.value?.image.data[0]).toBe(200);
    });
    view.mount.dispose();
    expect(borrowedDisposed).not.toHaveBeenCalled();
  });

  it('fits an image without changing the caller-owned texture transform', async () => {
    const source = texture(100);
    source.offset.set(0.1, 0.2);
    source.repeat.set(0.7, 0.8);
    source.updateMatrix();
    const before = source.matrix.clone();
    const image = new UIImage({
      src: source,
      style: {width: 120, height: 40, objectFit: 'cover'},
    });
    const view = mountUI(
      new UICard({size: {width: 200, height: 100}, children: [image]})
    );
    await layout(view, () =>
      expect(view.physical(image).size.peek()).toEqual([120, 40])
    );
    expect(source.matrix).toEqual(before);
    expect(source.offset.toArray()).toEqual([0.1, 0.2]);
    expect(source.repeat.toArray()).toEqual([0.7, 0.8]);
    expect((view.physical(image) as Image).texture.value?.image.data[0]).toBe(
      100
    );
  });

  it('moves the toggle thumb and progress fill to match their current values', async () => {
    const toggle = new UIToggle({
      ariaLabel: 'Auto',
      style: {width: 100, height: 40},
    });
    const progress = new UIProgress({
      ariaLabel: 'Upload',
      min: 10,
      max: 50,
      value: 20,
      style: {width: 160, height: 16},
    });
    const view = mountUI(
      new UICard({
        size: {width: 0.4, height: 0.3},
        children: [toggle, progress],
      })
    );
    const thumb = view
      .physical(toggle)
      .getObjectByName('UIToggleThumb') as Container;
    const fill = view
      .physical(progress)
      .getObjectByName('UIProgressFill') as Container;
    await layout(view, () => expect(fill.size.peek()?.[0]).toBe(40));
    const before = thumb.getWorldPosition(new THREE.Vector3());
    toggle.checked = true;
    progress.value = 40;
    view.commit();
    await layout(view, () => expect(fill.size.peek()?.[0]).toBe(120));
    expect(thumb.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(
      before.x
    );
  });

  it('keeps hidden descendants hidden across hover, content updates and parent visibility changes', async () => {
    const label = new UIText({text: 'Brightness'});
    const slider = new UISlider({ariaLabel: 'Brightness', value: 0.5});
    const toggle = new UIToggle({ariaLabel: 'Auto', visible: false});
    const panel = new UIPanel({children: [label, slider, toggle]});
    const view = mountUI(
      new UICard({size: {width: 300, height: 200}, children: [panel]})
    );
    const parts = [
      view
        .physical(label)
        .children.find((child): child is Text => child instanceof Text)!,
      view.physical(slider).children[0].children[2] as Container,
      view.physical(toggle).getObjectByName('UIToggleThumb') as Container,
    ];
    const visible = () => parts.map((part) => part.isVisible.peek());
    await layout(view, () => expect(visible()).toEqual([true, true, false]));
    panel.visible = false;
    label.text = 'Saved';
    view.commit();
    view.mount.present(() => ({hovered: true, active: false, disabled: false}));
    view.mount.update(0.016);
    expect(visible()).toEqual([false, false, false]);
    panel.visible = true;
    view.commit();
    view.mount.update(0.016);
    expect(visible()).toEqual([true, true, false]);
    toggle.visible = true;
    view.commit();
    view.mount.update(0.016);
    expect(visible()).toEqual([true, true, true]);
  });
});

describe('dropdown layout and hit routing', () => {
  it('updates the selected label and closes with no remaining list hits', async () => {
    const dropdown = new UIDropdown({
      ariaLabel: 'Size',
      options: SIZES,
      value: 'm',
    });
    const view = mountUI(
      new UICard({size: {width: 0.4, height: 0.5}, children: [dropdown]})
    );
    const label = view
      .physical(dropdown)
      .getObjectByName('UIDropdownLabel') as Text;
    expect(label.properties.peek().text).toBe('Medium');
    getSemanticControl(dropdown)!.activate();
    view.commit();
    const option = dropdown.children[0].children[0];
    const row = view.physical(option);
    await layout(view, () => expect(row.size.peek()?.[1]).toBeGreaterThan(0));
    const point = row.getWorldPosition(new THREE.Vector3());
    expect(
      register(view)
        .intersectionsAt(point)
        .some((hit) => hit.object === row)
    ).toBe(true);
    getSemanticControl(option)!.activate();
    view.commit();
    expect(dropdown.value).toBe('s');
    expect(label.properties.peek().text).toBe('Small');
    expect(
      register(view)
        .intersectionsAt(point)
        .some((hit) => hit.object === row)
    ).toBe(false);
  });

  it('routes an overlapping overlay hit to its open option rather than the panel underneath', async () => {
    const dropdown = new UIDropdown({
      ariaLabel: 'Size',
      options: SIZES,
      style: {zIndex: 3},
    });
    const under = new UIPanel({
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#123456',
      },
    });
    const view = mountUI(
      new UIOverlay({
        style: {width: 300, height: 300},
        children: [dropdown, under],
      })
    );
    getSemanticControl(dropdown)!.activate();
    view.commit();
    const option = dropdown.children[0].children[0];
    const row = view.physical(option);
    await layout(view, () => expect(row.size.peek()?.[1]).toBeGreaterThan(0));
    const point = row.getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Ray(
      point.clone().add(new THREE.Vector3(0, 0, 1)),
      new THREE.Vector3(0, 0, -1)
    );
    const registry = register(view);
    const hits = registry.raycast(new THREE.Scene(), ray, []);
    expect(
      hits.some((hit) => registry.resolve(hit.object).logical === under)
    ).toBe(true);
    expect(registry.resolve(hits[0].object).logical).toBe(option);
  });

  it('reveals a chosen row in a long list without changing the card size', async () => {
    const dropdown = new UIDropdown({
      ariaLabel: 'Long',
      value: '17',
      options: Array.from({length: 20}, (_, index) => ({
        value: String(index),
        label: `Option ${index + 1}`,
      })),
    });
    const card = new UICard({
      size: {width: 0.4, height: 0.5},
      children: [dropdown],
    });
    const view = mountUI(card);
    const scroll = dropdown.children[0] as UIScrollView;
    await layout(view, () => expect(scroll.clientHeight).toBeGreaterThan(0));
    const before = view.physical(card).size.peek()?.slice();
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    getSemanticControl(dropdown)!.activate();
    view.commit();
    const chosen = getUIPresentationObject(scroll.children[17]) as Container;
    await layout(view, () => expect(scroll.scrollTop).toBeGreaterThan(0));
    expect(
      new UIHitRegion(chosen).containsPoint(
        chosen.getWorldPosition(new THREE.Vector3())
      )
    ).toBe(true);
    expect(view.physical(card).size.peek()).toEqual(before);
  });
});

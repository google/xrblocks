import {Container, Image, Text} from '@pmndrs/uikit';
import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {ui} from '../UI';
import {
  UICard,
  measureUICardContentHeight,
  measureUICardMinContentWidth,
} from '../components/UICard';
import {UIImage} from '../components/UIImage';
import {UIText} from '../components/UIText';
import {UITextInput} from '../components/UITextInput';
import {UIOverlay} from '../components/UIOverlay';
import {UIPanel} from '../components/UIPanel';
import {UIScrollView} from '../components/UIScrollView';
import {UIButton} from '../components/UIButton';
import {UISlider} from '../components/UISlider';
import {UIToggle} from '../components/UIToggle';
import {GradientPanel} from '../primitives/GradientPanel';
import {createThemeSnapshot, type UITheme} from '../UITheme';
import {parseColorWithAlpha} from '../utils/ColorUtils';
import type {UIPresentationState} from './UIBackend';
import {createUIBackend} from './UIKitBackend';

describe('UIKitMount retained updates', () => {
  it('passes alpha-hex paints through to GradientPanel unchanged', () => {
    const alphaHex = '#282c3466';
    const panel = new UIPanel({style: {backgroundColor: alphaHex}});
    const backend = createUIBackend();
    const mount = backend.createMount(panel);

    const mappings = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;
    const physical = mappings.find(
      (mapping) => mapping.logical === panel
    )!.physical;

    expect(physical).toBeInstanceOf(GradientPanel);
    expect(
      (
        physical as unknown as {
          fillColorSignal: {value: unknown};
        }
      ).fillColorSignal.value
    ).toBe(alphaHex);

    mount.dispose();
    backend.dispose();
  });

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

  it('measures card content height at a width and restores the committed layout', async () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.1},
      pixelSize: 0.001,
      style: {padding: 10, gap: 10, justifyContent: 'flex-start'},
      children: [
        new UIPanel({style: {height: 80, flexShrink: 0}}),
        new UIPanel({style: {height: 60, flexShrink: 0}}),
      ],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    mount.commit(ui.theme, {width: 800, height: 600}, 0);
    const node = () =>
      mount.object.children[0] as unknown as {
        size: {peek(): [number, number]};
      };
    await vi.waitFor(() => {
      mount.update(0.016);
      expect(node().size.peek()).toEqual([400, 100]);
    });

    expect(measureUICardContentHeight(card, 0.3)).toBeCloseTo(0.17);
    mount.update(0.016);
    expect(node().size.peek()).toEqual([400, 100]);

    mount.dispose();
    backend.dispose();
    expect(measureUICardContentHeight(card, 0.3)).toBeUndefined();
  });

  it('measures the narrowest width at which card content fits', async () => {
    const card = new UICard({
      size: {width: 0.5, height: 0.2},
      pixelSize: 0.001,
      style: {padding: 10},
      children: [
        new UIPanel({
          style: {flexDirection: 'row', gap: 10},
          children: [
            new UIPanel({style: {width: 150, height: 40, flexShrink: 0}}),
            new UIPanel({style: {width: 150, height: 40, flexShrink: 0}}),
          ],
        }),
      ],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    mount.commit(ui.theme, {width: 800, height: 600}, 0);
    const node = () =>
      mount.object.children[0] as unknown as {
        size: {peek(): [number, number]};
      };
    await vi.waitFor(() => {
      mount.update(0.016);
      expect(node().size.peek()).toEqual([500, 200]);
    });

    // 10 + 150 + 10 + 150 + 10 layout pixels.
    expect(measureUICardMinContentWidth(card)).toBeCloseTo(0.33, 3);
    mount.update(0.016);
    expect(node().size.peek()).toEqual([500, 200]);

    const yoga = (
      node() as unknown as {node: {yogaNode: {calculateLayout(): void}}}
    ).node.yogaNode;
    const calculateLayoutSpy = vi.spyOn(yoga, 'calculateLayout');
    card.size = {width: 0.45, height: 0.18};
    mount.commit(ui.theme, {width: 800, height: 600}, 1);
    expect(measureUICardMinContentWidth(card)).toBeCloseTo(0.33, 3);
    expect(calculateLayoutSpy).not.toHaveBeenCalled();

    const childRow = card.children[0] as UIPanel;
    childRow.style = {flexDirection: 'row', gap: 20};
    mount.commit(ui.theme, {width: 800, height: 600}, 2);
    expect(measureUICardMinContentWidth(card)).toBeCloseTo(0.34, 3);
    expect(calculateLayoutSpy).toHaveBeenCalled();

    mount.dispose();
    backend.dispose();
  });

  it('counts content that overflows to the left toward the minimum width', async () => {
    const card = new UICard({
      size: {width: 0.5, height: 0.2},
      pixelSize: 0.001,
      style: {padding: 10, alignItems: 'flex-end'},
      children: [new UIPanel({style: {width: 300, height: 40, flexShrink: 0}})],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    mount.commit(ui.theme, {width: 800, height: 600}, 0);
    await vi.waitFor(() => {
      mount.update(0.016);
      expect(measureUICardMinContentWidth(card)).toBeDefined();
    });

    // 10 + 300 + 10 layout pixels.
    expect(measureUICardMinContentWidth(card)).toBeCloseTo(0.32, 3);

    mount.dispose();
    backend.dispose();
  });

  it('routes ray and touch hits on edge corners to the resize handle', async () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      manipulation: true,
      edge: true,
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    let mappings = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;
    const edgeMapping = () =>
      mappings.find((mapping) => mapping.physical.name === 'UICardEdge')!;
    await vi.waitFor(() => {
      mount.update(0.016);
      const edge = edgeMapping().physical as unknown as {
        size: {value?: [number, number]};
      };
      expect(edge.size.value?.[0]).toBeGreaterThan(0);
    });
    const handle = mappings.find(
      (mapping) => mapping.physical.name === 'UICardResizeHandle'
    )!.physical;
    expect(handle.xb?.manipulationHandle).toEqual({action: 'resize'});

    const {containsPoint, touchTarget} = edgeMapping().options!;
    expect(containsPoint!(new THREE.Vector3(0.225, 0.11, 0))).toBe(true);
    expect(containsPoint!(new THREE.Vector3(0, 0.12, 0))).toBe(true);
    expect(containsPoint!(new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(touchTarget!(new THREE.Vector3(0.225, 0.11, 0))).toBe(handle);
    expect(touchTarget!(new THREE.Vector3(0, 0.12, 0))).toBeUndefined();

    const intersections: THREE.Intersection[] = [];
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0.225, 0.11, 1),
      new THREE.Vector3(0, 0, -1)
    );
    edgeMapping().physical.raycast(raycaster, intersections);
    expect(intersections[0]?.object).toBe(handle);

    card.manipulation = {actions: {translate: true}};
    mappings = mount.commit(ui.theme, {width: 800, height: 600}, 0) ?? mappings;
    expect(
      edgeMapping().options!.touchTarget!(new THREE.Vector3(0.225, 0.11, 0))
    ).toBeUndefined();

    mount.dispose();
    backend.dispose();
  });

  it('honors single-line button labels and updates wrapping without replacing the text node', () => {
    const button = new UIButton({
      label: 'Miniature city',
      style: {whiteSpace: 'nowrap', fontSize: 36},
    });
    const card = new UICard({
      size: {width: 500, height: 70},
      children: [button],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    const viewport = {width: 800, height: 600};
    const mappings = mount.commit(ui.theme, viewport, 0)!;
    const physical = mappings.find(
      (mapping) => mapping.logical === button
    )!.physical;
    const label = physical.children.find(
      (child): child is Text => child instanceof Text
    )!;
    expect(label).toBeDefined();
    expect(label.properties.peek().wordBreak).toBe('keep-all');
    expect(label.properties.peek().whiteSpace).toBe('normal');
    button.style.whiteSpace = 'normal';
    mount.commit(ui.theme, viewport, 0);
    expect(physical.children).toContain(label);
    expect(label.properties.peek().wordBreak).toBe('break-word');
    mount.dispose();
    backend.dispose();
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

  it('clones caller textures for non-fill objectFit and freezes the crop matrix', () => {
    const source = texture();
    const image = new UIImage({src: source, style: {objectFit: 'cover'}});
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
    const fitted = physical.texture.value as THREE.Texture;

    expect(fitted).not.toBe(source);
    expect(fitted.source).toBe(source.source);
    expect(fitted.matrixAutoUpdate).toBe(false);
    // The caller's texture is shared with the rest of the engine: uikit's crop
    // matrix writes must not reach it, and its auto matrix update stays on.
    expect(source.matrixAutoUpdate).toBe(true);

    mount.dispose();
    backend.dispose();
  });

  it('exposes video frame size to the fit crop and refits when it changes', () => {
    const video = {videoWidth: 640, videoHeight: 480, width: 0, height: 0};
    const source = new THREE.Texture(video as unknown as HTMLVideoElement);
    const image = new UIImage({src: source, style: {objectFit: 'cover'}});
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
    const first = physical.texture.value as THREE.Texture;

    // uikit's crop ratio reads source.data.width/.height, which must report the
    // frame size even though a video element's width/height attributes are 0.
    const data = first.source.data as {width: number; height: number};
    expect(data.width).toBe(640);
    expect(data.height).toBe(480);

    // A camera switch feeding new dimensions into the same texture refits.
    video.videoWidth = 1280;
    video.videoHeight = 720;
    expect(data.width).toBe(1280);
    expect(data.height).toBe(720);
    mount.commit(ui.theme, viewport, 0);
    const second = physical.texture.value as THREE.Texture;
    expect(second).not.toBe(first);
    expect(second.source).toBe(source.source);
    expect(second.matrixAutoUpdate).toBe(false);

    mount.dispose();
    backend.dispose();
  });

  it('reports changed hit mappings when overlay stack order changes', () => {
    const overlay = new UIOverlay({style: {width: 200, height: 100}});
    const backend = createUIBackend();
    const mount = backend.createMount(overlay);
    const viewport = {width: 800, height: 600};
    expect(mount.commit(ui.theme, viewport, 0)).toBeDefined();
    expect(mount.commit(ui.theme, viewport, 0)).toBeUndefined();
    expect(mount.commit(ui.theme, viewport, 1)).toBeDefined();

    mount.dispose();
    backend.dispose();
  });

  it('draws the slider fill and thumb above its track', () => {
    const slider = new UISlider({ariaLabel: 'Volume', value: 0.5});
    const card = new UICard({
      size: {width: 200, height: 100},
      children: [slider],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    const physical = mount
      .commit(ui.theme, {width: 800, height: 600}, 0)!
      .find((mapping) => mapping.logical === slider)!.physical;
    const [rail] = physical.children;
    const [track, fill, thumb] = rail.children as Container[];
    const zIndexOffset = (node: Container) =>
      node.properties.peek().zIndexOffset ?? 0;

    expect(track.properties.peek().positionRight).toBe(0);
    expect(fill.properties.peek().width).toBe('50%');
    expect(thumb.properties.peek().positionLeft).toBe('50%');
    expect(zIndexOffset(fill)).toBeGreaterThan(zIndexOffset(track));
    expect(zIndexOffset(thumb)).toBeGreaterThan(zIndexOffset(fill));

    mount.dispose();
    backend.dispose();
  });

  it('renders toggle track and thumb state on retained nodes', () => {
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi'});
    const card = new UICard({
      size: {width: 200, height: 100},
      children: [toggle],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    const viewport = {width: 800, height: 600};
    const {colors} = ui.theme;
    const physical = mount
      .commit(ui.theme, viewport, 0)!
      .find((mapping) => mapping.logical === toggle)!.physical;
    const thumb = physical.getObjectByName('UIToggleThumb') as Container;
    const panel = physical as unknown as {
      fillColorSignal: {value: unknown};
      cornerRadiusSignal: {value: number};
    };
    const track = () => panel.fillColorSignal.value;
    const thumbState = () => {
      const {positionLeft, backgroundColor} = thumb.properties.peek();
      return {positionLeft, backgroundColor};
    };

    expect(physical).toBeInstanceOf(GradientPanel);
    expect(panel.cornerRadiusSignal.value).toBe(18);
    expect(track()).toBe(colors.sliderTrack ?? colors.outline);
    expect(thumbState()).toEqual({
      positionLeft: '0%',
      backgroundColor: colors.text,
    });

    toggle.checked = true;
    mount.commit(ui.theme, viewport, 0);
    const {color: surface} = parseColorWithAlpha(colors.surface);
    expect(track()).toBe(colors.primary);
    expect(thumbState()).toEqual({
      positionLeft: '100%',
      backgroundColor: [surface.r, surface.g, surface.b, 1],
    });

    toggle.disabled = true;
    mount.commit(ui.theme, viewport, 0);
    expect(track()).toBe(colors.disabledSurface);
    expect(thumbState()).toEqual({
      positionLeft: '100%',
      backgroundColor: colors.disabledText,
    });
    expect(physical.getObjectByName('UIToggleThumb')).toBe(thumb);

    mount.dispose();
    backend.dispose();
    expect(thumb.parent).toBeNull();
  });

  it('keeps a restyled toggle sized, hit-testable, and thumb-colored by style', async () => {
    const toggle = new UIToggle({
      ariaLabel: 'Wi-Fi',
      style: {backgroundColor: 'transparent', color: '#ff0000'},
    });
    const card = new UICard({
      size: {width: 200, height: 100},
      children: [toggle],
    });
    const backend = createUIBackend();
    const mount = backend.createMount(card);
    const physical = mount
      .commit(ui.theme, {width: 800, height: 600}, 0)!
      .find((mapping) => mapping.logical === toggle)!.physical as Container;

    expect(physical.xb?.pointerEvents).toBe('auto');
    expect(
      (physical.getObjectByName('UIToggleThumb') as Container).properties.peek()
        .backgroundColor
    ).toBe('#ff0000');
    await vi.waitFor(() => {
      mount.update(0.016);
      expect(physical.size.peek()).toEqual([60, 36]);
    });

    mount.dispose();
    backend.dispose();
  });

  it('applies :checked track and thumb colors only while the toggle is checked', () => {
    const toggle = new UIToggle({
      ariaLabel: 'Wi-Fi',
      style: {':checked': {backgroundColor: '#1e8e3e', color: '#e6f4ea'}},
    });
    const view = mountToggle(toggle);
    const {colors} = ui.theme;
    const offTrack = colors.sliderTrack ?? colors.outline;

    expect(view.track()).toBe(offTrack);
    expect(view.thumb()).toBe(colors.text);
    toggle.checked = true;
    view.commit();
    expect(view.track()).toBe('#1e8e3e');
    expect(view.thumb()).toBe('#e6f4ea');
    toggle.checked = false;
    view.commit();
    expect(view.track()).toBe(offTrack);
    expect(view.thumb()).toBe(colors.text);

    view.dispose();
  });

  it('applies :checked from the toggle theme role', () => {
    const theme = createThemeSnapshot({
      ...ui.theme,
      styles: {
        ...ui.theme.styles,
        toggle: {':checked': {backgroundColor: '#1e8e3e', color: '#e6f4ea'}},
      },
    });
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi', checked: true});
    const view = mountToggle(toggle, theme);

    expect(view.track()).toBe('#1e8e3e');
    expect(view.thumb()).toBe('#e6f4ea');
    toggle.checked = false;
    view.commit();
    expect(view.track()).toBe(theme.colors.sliderTrack ?? theme.colors.outline);
    expect(view.thumb()).toBe(theme.colors.text);

    view.dispose();
  });

  it('lets :disabled override :checked', () => {
    const toggle = new UIToggle({
      ariaLabel: 'Wi-Fi',
      checked: true,
      disabled: true,
      style: {
        ':checked': {backgroundColor: '#1e8e3e', color: '#e6f4ea'},
        ':disabled': {backgroundColor: '#3c4043', color: '#9aa0a6'},
      },
    });
    const view = mountToggle(toggle);

    expect(view.track()).toBe('#3c4043');
    expect(view.thumb()).toBe('#9aa0a6');
    toggle.disabled = false;
    view.commit();
    expect(view.track()).toBe('#1e8e3e');
    expect(view.thumb()).toBe('#e6f4ea');

    view.dispose();
  });

  it('shows :hover over :checked and keeps :checked while hovered', () => {
    const toggle = new UIToggle({
      ariaLabel: 'Wi-Fi',
      checked: true,
      style: {
        ':checked': {backgroundColor: '#1e8e3e', color: '#e6f4ea'},
        ':hover': {backgroundColor: '#137333'},
      },
    });
    const view = mountToggle(toggle);

    view.present({hovered: true});
    expect(view.track()).toBe('#137333');
    expect(view.thumb()).toBe('#e6f4ea');
    view.present({hovered: false});
    expect(view.track()).toBe('#1e8e3e');
    expect(view.thumb()).toBe('#e6f4ea');

    view.dispose();
  });

  it('keeps a base backgroundColor and color in both states without :checked', () => {
    const toggle = new UIToggle({
      ariaLabel: 'Wi-Fi',
      style: {backgroundColor: '#3c4043', color: '#e8eaed'},
    });
    const view = mountToggle(toggle);

    expect(view.track()).toBe('#3c4043');
    expect(view.thumb()).toBe('#e8eaed');
    toggle.checked = true;
    view.commit();
    expect(view.track()).toBe('#3c4043');
    expect(view.thumb()).toBe('#e8eaed');

    view.dispose();
  });
});

function texture(): THREE.DataTexture {
  return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
}

function mountToggle(toggle: UIToggle, theme: UITheme = ui.theme) {
  const card = new UICard({
    size: {width: 200, height: 100},
    children: [toggle],
  });
  const backend = createUIBackend();
  const mount = backend.createMount(card);
  const viewport = {width: 800, height: 600};
  const physical = mount
    .commit(theme, viewport, 0)!
    .find((mapping) => mapping.logical === toggle)!.physical;
  const thumb = physical.getObjectByName('UIToggleThumb') as Container;
  const idle: UIPresentationState = {
    hovered: false,
    active: false,
    disabled: false,
    cursorPointCount: 0,
  };
  return {
    commit: () => mount.commit(theme, viewport, 0),
    present: (state: Partial<UIPresentationState>) =>
      mount.present(() => ({...idle, ...state})),
    track: () =>
      (physical as unknown as {fillColorSignal: {value: unknown}})
        .fillColorSignal.value,
    thumb: () => thumb.properties.peek().backgroundColor,
    dispose: () => {
      mount.dispose();
      backend.dispose();
    },
  };
}

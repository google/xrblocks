import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EditableText, type EditableTextState} from './EditableText';
import type {MeasuredGrapheme, TextMeasurement} from './EditableTextLayout';

let paintFails = false;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  paintFails = false;
  // jsdom has no 2D canvas. This replaces native drawing only, not layout.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        canvas: this,
        measureText: () => ({
          fontBoundingBoxAscent: 12,
          fontBoundingBoxDescent: 3,
        }),
        setTransform() {},
        translate() {},
        clearRect() {},
        fillText() {
          if (paintFails) throw new Error('Native paint failed');
        },
      } as unknown as CanvasRenderingContext2D;
    }
  );
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

function row(
  start: number,
  count: number,
  top = 0,
  left = 0
): MeasuredGrapheme[] {
  return Array.from({length: count}, (_, index) => ({
    start: start + index,
    end: start + index + 1,
    left: left + index * 8,
    right: left + (index + 1) * 8,
    top,
    bottom: top + 20,
  }));
}
function state(
  text: string,
  overrides: Partial<EditableTextState> = {}
): EditableTextState {
  return {text, fontSize: 16, lineHeight: 1.25, focused: true, ...overrides};
}
async function mount(measurement: TextMeasurement, width = 100, height = 60) {
  const carrier = new THREE.Group();
  const root = new Container({
    width,
    height,
    pixelSize: 0.001,
    overflow: 'hidden',
  });
  carrier.add(root);
  const measurer = {measure: vi.fn(() => measurement), dispose: vi.fn()};
  const editable = new EditableText(root, {measurer});
  cleanups.push(() => {
    editable.dispose();
    root.dispose();
  });
  const layout = async () => {
    await vi.waitFor(() => {
      root.update(16);
      expect(editable.content.size.peek()?.[0]).toBeGreaterThan(0);
    });
    carrier.updateMatrixWorld(true);
    editable.afterLayout();
  };
  // Convert an independently chosen layout-space point to world space.
  const point = (x: number, y: number) => {
    const [w, h] = editable.content.size.peek()!;
    return editable.content.localToWorld(
      new THREE.Vector3(
        (x - editable.offsetX) / w - 0.5,
        0.5 - (y - editable.offsetY) / h,
        0
      )
    );
  };
  return {carrier, root, measurer, editable, layout, point};
}

describe('editable text presentation', () => {
  it('maps transformed world points to whole UTF-16 graphemes', async () => {
    const h = await mount({
      direction: 'ltr',
      graphemes: [
        {start: 0, end: 1, left: 0, right: 8, top: 0, bottom: 20},
        {start: 1, end: 3, left: 8, right: 24, top: 0, bottom: 20},
        {start: 3, end: 4, left: 24, right: 32, top: 0, bottom: 20},
      ],
    });
    h.carrier.position.set(1.5, -0.25, 0.75);
    h.carrier.rotation.set(0.3, 0.7, -0.2);
    h.carrier.scale.setScalar(2.5);
    h.editable.update(state('a😀b'));
    await h.layout();
    expect(h.editable.caretAtPoint(h.point(10, 10))).toBe(1);
    expect(h.editable.caretAtPoint(h.point(22, 10))).toBe(3);
    expect(h.editable.caretAtPoint(h.point(32, 10))).toBe(4);
  });

  it('preserves the goal column across a short row', async () => {
    const h = await mount({
      direction: 'ltr',
      graphemes: [...row(0, 4), ...row(5, 1, 20), ...row(7, 4, 40)],
    });
    const initial = state('abcd\ne\nfghi', {
      multiline: true,
      selectionStart: 3,
      selectionEnd: 3,
    });
    h.editable.update(initial);
    await h.layout();
    const down = h.editable.navigate('ArrowDown', {extend: true})!;
    expect(down).toEqual({start: 3, end: 6, direction: 'forward'});
    h.editable.update({
      ...initial,
      selectionStart: down.start,
      selectionEnd: down.end,
      selectionDirection: down.direction,
    });
    const next = h.editable.navigate('ArrowDown', {extend: true})!;
    expect(next).toEqual({start: 3, end: 10, direction: 'forward'});
    h.editable.update({
      ...initial,
      selectionStart: next.end,
      selectionEnd: next.end,
    });
    expect(h.editable.navigate('Home')).toEqual({
      start: 7,
      end: 7,
      direction: 'none',
    });
    expect(h.editable.navigate('End')).toEqual({
      start: 11,
      end: 11,
      direction: 'none',
    });
  });

  it('positions selection geometry on the measured text', async () => {
    const h = await mount({direction: 'ltr', graphemes: row(0, 4)});
    h.editable.update(state('abcd', {selectionStart: 1, selectionEnd: 3}));
    await h.layout();
    const selection = h.editable.content.getObjectByName(
      'EditableTextSelection'
    ) as THREE.Mesh;
    const {start, count} = selection.geometry.drawRange;
    const positions = selection.geometry.getAttribute('position');
    const bounds = new THREE.Box3();
    for (let index = start; index < start + count; index++)
      bounds.expandByPoint(
        new THREE.Vector3().fromBufferAttribute(positions, index)
      );
    expect(bounds.min.x).toBeCloseTo(8);
    expect(bounds.max.x).toBeCloseTo(24);
  });

  it('clamps scrolling and reveals the selected row without fighting manual scrolling', async () => {
    const h = await mount(
      {
        direction: 'ltr',
        graphemes: [...row(0, 2), ...row(2, 2, 20), ...row(4, 2, 40)],
      },
      100,
      20
    );
    const initial = state('abcdef', {
      multiline: true,
      selectionStart: 0,
      selectionEnd: 0,
    });
    h.editable.update(initial);
    await h.layout();
    expect(h.editable.scrollBy(-10)).toBe(false);
    expect(h.editable.scrollBy(1000)).toBe(true);
    expect(h.editable.offsetY).toBe(40);
    expect(h.editable.scrollBy(1)).toBe(false);
    h.editable.update({...initial, color: '#ff0000'});
    expect(h.editable.offsetY).toBe(40);
    h.editable.update({...initial, selectionStart: 6, selectionEnd: 6});
    expect(h.editable.offsetY).toBe(40);
    h.editable.update(initial);
    expect(h.editable.offsetY).toBe(0);
  });

  it('reveals the negative-x end of overflowing RTL input', async () => {
    const h = await mount(
      {
        direction: 'rtl',
        graphemes: [
          {start: 0, end: 1, left: 16, right: 24, top: 0, bottom: 20},
          {start: 1, end: 2, left: 8, right: 16, top: 0, bottom: 20},
          {start: 2, end: 3, left: 0, right: 8, top: 0, bottom: 20},
          {start: 3, end: 4, left: -8, right: 0, top: 0, bottom: 20},
        ],
      },
      24,
      20
    );
    const initial = state('אבגד', {
      direction: 'rtl',
      textAlign: 'right',
      selectionStart: 4,
      selectionEnd: 4,
    });
    h.editable.update(initial);
    await h.layout();
    expect(h.editable.offsetX).toBe(-8);
    expect(h.editable.caretAtPoint(h.point(-8, 10))).toBe(4);
    h.editable.update({...initial, selectionStart: 0, selectionEnd: 0});
    expect(h.editable.caretAtPoint(h.point(24, 10))).toBe(0);
    expect(h.editable.offsetY).toBe(0);
  });

  it.each(['measure', 'paint'] as const)(
    'rejects stale geometry after native %s failure and recovers for the same value',
    async (failure) => {
      const h = await mount({direction: 'ltr', graphemes: row(0, 3)});
      h.editable.update(state('abc'));
      await h.layout();
      expect(h.editable.isReady).toBe(true);
      if (failure === 'measure')
        h.measurer.measure.mockImplementation(() => {
          throw new Error('Native measurement failed');
        });
      else paintFails = true;
      h.editable.update(state('xyz'));
      expect(h.editable.isReady).toBe(false);
      expect(h.editable.error?.kind).toBe('layout-failed');
      expect(h.editable.caretAtPoint(h.point(8, 10))).toBeUndefined();
      expect(h.editable.navigate('End')).toBeUndefined();
      h.measurer.measure.mockReturnValue({
        direction: 'ltr',
        graphemes: row(0, 3),
      });
      paintFails = false;
      h.editable.update(state('xyz'));
      expect(h.editable.isReady).toBe(true);
      expect(h.editable.error).toBeUndefined();
      expect(h.editable.caretAtPoint(h.point(8, 10))).toBe(1);
    }
  );

  it('uses new measurements after the viewport width changes', async () => {
    const h = await mount(
      {direction: 'ltr', graphemes: [...row(0, 2), ...row(2, 2, 20)]},
      16,
      60
    );
    h.editable.update(state('abcd', {multiline: true}));
    await h.layout();
    expect(h.editable.scrollHeight).toBe(40);
    h.measurer.measure.mockReturnValue({
      direction: 'ltr',
      graphemes: row(0, 4),
    });
    h.root.setProperties({width: 40});
    await h.layout();
    expect(h.editable.scrollHeight).toBe(20);
    expect(h.editable.caretAtPoint(h.point(24, 10))).toBe(3);
  });

  it('releases owned graphics and measurement resources and remains inert after disposal', async () => {
    const h = await mount({direction: 'ltr', graphemes: row(0, 3)});
    h.editable.update(state('abc'));
    await h.layout();
    const resources = new Set<
      THREE.BufferGeometry | THREE.Material | THREE.Texture
    >();
    const glyphs = h.editable.content.getObjectByName('EditableTextGlyphs')!;
    glyphs.parent!.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        resources.add(material);
        const map = (material as THREE.MeshBasicMaterial).map;
        if (map) resources.add(map);
      }
    });
    const disposed = [...resources].map((resource) => {
      const event = vi.fn();
      resource.addEventListener('dispose', event);
      return event;
    });
    h.editable.dispose();
    expect(h.editable.content.parent).toBeNull();
    for (const event of disposed) expect(event).toHaveBeenCalledOnce();
    expect(h.measurer.dispose).toHaveBeenCalledOnce();
    h.editable.update(state('late'));
    expect(h.editable.isReady).toBe(false);
    expect(h.editable.caretAtPoint(new THREE.Vector3())).toBeUndefined();
  });
});

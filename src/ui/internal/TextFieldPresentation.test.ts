import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UICard} from '../components/UICard';
import {UITextInput} from '../components/UITextInput';
import {ui} from '../UI';
import {DomTextMeasurer} from './EditableTextLayout';
import {TextFieldPresentation} from './TextFieldPresentation';

const cleanups: Array<() => void> = [];
beforeEach(() => {
  // Only native measurement and canvas calls are replaced. The renderer and editor are real.
  vi.spyOn(DomTextMeasurer.prototype, 'measure').mockReturnValue({
    direction: 'ltr',
    graphemes: [
      {start: 0, end: 1, left: 0, right: 8, top: 0, bottom: 20},
      {start: 1, end: 2, left: 8, right: 16, top: 0, bottom: 20},
      {start: 2, end: 3, left: 0, right: 8, top: 20, bottom: 40},
    ],
  });
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
        fillText() {},
      } as unknown as CanvasRenderingContext2D;
    }
  );
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

async function mount() {
  const field = new UITextInput({
    ariaLabel: 'Message',
    multiline: true,
    value: 'abc',
  });
  new THREE.Scene().add(
    new UICard({size: {width: 1, height: 1}, children: [field]})
  );
  const shell = new Container({
    width: 300,
    height: 120,
    pixelSize: 0.001,
    flexDirection: 'column',
  });
  new THREE.Group().add(shell);
  const presentation = new TextFieldPresentation(field, shell, () => {});
  cleanups.push(() => {
    presentation.dispose();
    shell.dispose();
  });
  presentation.commit(ui.theme);
  await vi.waitFor(() => {
    shell.update(16);
    presentation.update();
    expect(field.ready).toBe(true);
  });
  const element = document.querySelector<HTMLTextAreaElement>(
    '[aria-label="Message"]'
  )!;
  return {field, presentation, element};
}

describe('text presentation integration', () => {
  it('uses actual measured rows for native keyboard navigation', async () => {
    const {field, element} = await mount();
    field.focus();
    field.setSelectionRange(1, 1);
    const down = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true,
    });
    element.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(field.selection).toMatchObject({start: 3, end: 3});
  });

  it('releases focus when suspended or hidden and can reconnect', async () => {
    const {field, presentation, element} = await mount();
    field.focus();
    presentation.setActive(false);
    presentation.update();
    expect(field.focused).toBe(false);
    expect(field.ready).toBe(false);
    expect(element.disabled).toBe(true);
    expect(field.value).toBe('abc');
    presentation.setActive(true);
    presentation.update();
    expect(field.ready).toBe(true);
    field.focus();
    field.visible = false;
    presentation.update();
    expect(field.focused).toBe(false);
  });

  it('does not let a late renderer load revive a disposed field', async () => {
    const before = document.body.childElementCount;
    const field = new UITextInput({ariaLabel: 'Disposed field'});
    const shell = new Container();
    const presentation = new TextFieldPresentation(field, shell, () => {});
    cleanups.push(() => shell.dispose());
    presentation.dispose();
    await vi.dynamicImportSettled();
    presentation.update();
    expect(field.ready).toBe(false);
    expect(document.querySelector('[aria-label="Disposed field"]')).toBeNull();
    expect(shell.children).toHaveLength(0);
    expect(document.body.childElementCount).toBe(before);
  });
});

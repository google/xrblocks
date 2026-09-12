import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {UICard} from '../components/UICard';
import {UITextInput} from '../components/UITextInput';
import {ui} from '../UI';
import {TextFieldPresentation} from './TextFieldPresentation';

const fake = vi.hoisted(() => ({
  ready: true,
  created: 0,
  navigate: vi.fn(),
}));

vi.mock('./EditableText', () => ({
  EditableText: class {
    constructor() {
      fake.created++;
    }
    get isReady() {
      return fake.ready;
    }
    offsetY = 0;
    scrollHeight = 0;
    scroll = {getViewportHeight: () => 100};
    update() {}
    afterLayout() {}
    dispose() {}
    caretAtPoint() {
      return 0;
    }
    scrollBy() {
      return false;
    }
    navigate(key: string, options: unknown) {
      return fake.navigate(key, options);
    }
  },
}));

const dispose: Array<() => void> = [];

async function mount(multiline: boolean) {
  const field = new UITextInput({
    ariaLabel: 'Message',
    multiline,
    value: 'hello',
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
  const presentation = new TextFieldPresentation(field, shell, vi.fn());
  presentation.commit(ui.theme);
  dispose.push(() => {
    presentation.dispose();
    shell.dispose();
  });
  await vi.waitFor(() => {
    shell.update(16);
    presentation.update(0.016);
    expect(field.ready).toBe(true);
  });
  const element = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >('[aria-label="Message"]')!;
  return {field, presentation, element};
}

beforeEach(() => {
  fake.ready = true;
  fake.created = 0;
  fake.navigate.mockReset();
});

afterEach(() => {
  for (const cleanup of dispose.splice(0)) cleanup();
});

describe('Text field presentation integration', () => {
  it('uses matching system-font and tab settings for native editing', async () => {
    const {element} = await mount(true);
    expect(element.style.fontFamily).toContain('system-ui');
    expect(element.style.fontWeight).toBe('400');
    expect(element.style.fontKerning).toBe('normal');
    expect(element.style.tabSize).toBe('4');
    expect(element.dir).toBe('auto');
  });

  it('leaves pending-layout navigation to the native editor and consumes actual moves', async () => {
    const {field, presentation, element} = await mount(true);
    field.focus();
    fake.ready = false;
    presentation.update();
    const pending = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true,
    });
    element.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(false);
    fake.ready = true;
    fake.navigate.mockReturnValue({start: 2, end: 2, direction: 'none'});
    presentation.update();
    const ready = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true,
    });
    element.dispatchEvent(ready);
    expect(ready.defaultPrevented).toBe(true);
    expect(field.selection).toMatchObject({start: 2, end: 2});
  });

  it('does not advertise vertical scrolling on single-line fields', async () => {
    const {field} = await mount(false);
    expect(getSemanticControl(field)?.scroll).toBeUndefined();
  });

  it('blurs suspended roots and restores readiness when they reconnect', async () => {
    const {field, presentation, element} = await mount(true);
    field.focus();
    presentation.setActive(false);
    presentation.update();
    expect(field.focused).toBe(false);
    expect(field.ready).toBe(false);
    expect(element.disabled).toBe(true);
    presentation.setActive(true);
    presentation.update();
    expect(field.ready).toBe(true);
    field.focus();
    expect(field.focused).toBe(true);
    field.visible = false;
    presentation.update();
    expect(field.focused).toBe(false);
  });

  it('does not construct a late renderer after disposal', async () => {
    const field = new UITextInput({ariaLabel: 'Message'});
    const shell = new Container();
    const presentation = new TextFieldPresentation(field, shell, vi.fn());
    presentation.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.created).toBe(0);
    expect(field.ready).toBe(false);
    expect(document.querySelector('[aria-label="Message"]')).toBeNull();
    shell.dispose();
  });
});

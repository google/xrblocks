import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorControls} from './SimulatorControls';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorNavMesh} from './internal/navmesh/SimulatorNavMesh';
import {Keycodes} from '../utils/Keycodes';

function createControls() {
  return new SimulatorControls(
    {} as SimulatorControllerState,
    {} as SimulatorHands,
    new SimulatorNavMesh(),
    vi.fn(),
    {} as SimulatorInterface
  );
}

describe('SimulatorControls input', () => {
  const connectedControls: SimulatorControls[] = [];

  afterEach(() => {
    for (const controls of connectedControls) {
      controls.disconnect();
    }
    connectedControls.length = 0;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('prevents browser wheel defaults only when the active mode handles them', () => {
    const controls = createControls();
    const canvas = document.createElement('canvas');
    controls.renderer = {domElement: canvas} as never;
    vi.spyOn(controls.simulatorModeControls, 'onWheel')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    connectedControls.push(controls);
    controls.connect();

    const handled = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });
    canvas.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);

    const rejected = new WheelEvent('wheel', {
      deltaY: -100,
      cancelable: true,
    });
    canvas.dispatchEvent(rejected);
    expect(rejected.defaultPrevented).toBe(false);
  });

  it('cancels pointer interactions and clears keys on disable, blur, and cancel', () => {
    const controls = createControls();
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    controls.renderer = {
      domElement: {
        setPointerCapture,
        releasePointerCapture,
        hasPointerCapture,
      },
    } as never;
    vi.spyOn(
      controls.simulatorModeControls,
      'onPointerDown'
    ).mockImplementation(() => {});
    const pointerUp = vi
      .spyOn(controls.simulatorModeControls, 'onPointerUp')
      .mockImplementation(() => {});

    controls.onPointerDown(pointerEvent('pointerdown', 1));
    controls.downKeys.add(Keycodes.W_CODE);
    controls.onBlur();
    expect(controls.pointerDown).toBe(false);
    expect(controls.downKeys.size).toBe(0);
    expect(pointerUp).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    controls.onPointerDown(pointerEvent('pointerdown', 2));
    controls.onPointerCancel(pointerEvent('pointercancel', 2));
    expect(controls.pointerDown).toBe(false);
    expect(pointerUp).toHaveBeenCalledTimes(2);

    controls.onPointerDown(pointerEvent('pointerdown', 3));
    controls.downKeys.add(Keycodes.W_CODE);
    controls.setEnabled(false);
    expect(controls.pointerDown).toBe(false);
    expect(controls.downKeys.size).toBe(0);
    expect(pointerUp).toHaveBeenCalledTimes(3);
  });

  describe('text entry', () => {
    let controls: SimulatorControls;

    beforeEach(() => {
      controls = createControls();
      controls.renderer = {
        domElement: document.createElement('canvas'),
      } as never;
      vi.spyOn(controls.simulatorModeControls, 'onKeyDown').mockImplementation(
        () => {}
      );
      connectedControls.push(controls);
      controls.connect();
    });

    it.each(['input', 'textarea', 'select'])(
      'leaves %s keys to the field without activating simulator shortcuts',
      (tag) => {
        const field = document.createElement(tag);
        const onFieldKey = vi.fn();
        field.addEventListener('keydown', onFieldKey);
        document.body.appendChild(field);
        field.focus();

        const event = keyDown(field);

        expect(controls.downKeys.size).toBe(0);
        expect(controls.simulatorModeControls.onKeyDown).not.toHaveBeenCalled();
        expect(onFieldKey).toHaveBeenCalledOnce();
        expect(event.defaultPrevented).toBe(false);
      }
    );

    it('ignores keys from descendants of an editable region', () => {
      const editor = document.createElement('div');
      editor.contentEditable = 'true';
      editor.tabIndex = 0;
      // jsdom does not implement inherited isContentEditable state.
      Object.defineProperty(editor, 'isContentEditable', {value: true});
      const text = document.createElement('span');
      editor.appendChild(text);
      document.body.appendChild(editor);
      editor.focus();

      keyDown(text);

      expect(controls.downKeys.size).toBe(0);
      expect(controls.simulatorModeControls.onKeyDown).not.toHaveBeenCalled();
    });

    it('recognizes a text field inside an open shadow root', () => {
      const host = document.createElement('div');
      const field = document.createElement('input');
      host.attachShadow({mode: 'open'}).appendChild(field);
      document.body.appendChild(host);
      field.focus();
      expect(document.activeElement).toBe(host);

      keyDown(field);

      expect(controls.downKeys.size).toBe(0);
      expect(controls.simulatorModeControls.onKeyDown).not.toHaveBeenCalled();
    });

    it('respects text focus even when a key is dispatched on the document', () => {
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();

      keyDown(document, {code: Keycodes.DIGIT_1});

      expect(controls.downKeys.size).toBe(0);
      expect(controls.simulatorModeControls.onKeyDown).not.toHaveBeenCalled();
    });

    it('stops held movement on text focus and resumes only with a new navigation key', () => {
      keyDown(document);
      expect(controls.downKeys.has(Keycodes.W_CODE)).toBe(true);
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();
      expect(controls.downKeys.size).toBe(0);

      keyDown(field, {repeat: true});
      field.blur();
      expect(controls.downKeys.size).toBe(0);
      keyDown(document);
      expect(controls.downKeys.has(Keycodes.W_CODE)).toBe(true);
      document.dispatchEvent(
        new KeyboardEvent('keyup', {code: Keycodes.W_CODE})
      );
      expect(controls.downKeys.size).toBe(0);
    });

    it('still clears a held key when its release happens over a text field', () => {
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();
      controls.downKeys.add(Keycodes.W_CODE);

      field.dispatchEvent(
        new KeyboardEvent('keyup', {code: Keycodes.W_CODE, bubbles: true})
      );

      expect(controls.downKeys.size).toBe(0);
    });

    it('ignores composing keys and clears any previously held movement', () => {
      controls.downKeys.add(Keycodes.W_CODE);

      keyDown(document, {isComposing: true});

      expect(controls.downKeys.size).toBe(0);
      expect(controls.simulatorModeControls.onKeyDown).not.toHaveBeenCalled();
    });

    it('removes keyboard and text-focus listeners when disconnected', () => {
      controls.disconnect();
      controls.downKeys.add(Keycodes.W_CODE);
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();
      keyDown(document, {code: Keycodes.A_CODE});

      expect([...controls.downKeys]).toEqual([Keycodes.W_CODE]);
      expect(controls.simulatorModeControls.onKeyDown).not.toHaveBeenCalled();
    });
  });
});

function keyDown(target: EventTarget, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    code: Keycodes.W_CODE,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function pointerEvent(type: string, pointerId: number): PointerEvent {
  return Object.assign(new MouseEvent(type), {pointerId}) as PointerEvent;
}

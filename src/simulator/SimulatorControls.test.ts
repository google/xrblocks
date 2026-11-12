import {afterEach, describe, expect, it} from 'vitest';
import {ScriptsManager} from '../core/components/ScriptsManager';
import {Interaction} from '../interaction/Interaction';
import {Keycodes} from '../utils/Keycodes';
import {SimulatorControls} from './SimulatorControls';
import {controlFixture} from './SimulatorControls.test-fixture';

describe('SimulatorControls input ownership', () => {
  const fixtures: (ReturnType<typeof controlFixture> & {
    controls: SimulatorControls;
    captures: Set<number>;
  })[] = [];
  function setup() {
    const f = controlFixture();
    const captures = new Set<number>();
    f.canvas.setPointerCapture = (id) => {
      captures.add(id);
    };
    f.canvas.hasPointerCapture = (id) => captures.has(id);
    f.canvas.releasePointerCapture = (id) => {
      captures.delete(id);
    };
    const controls = new SimulatorControls(
      f.state,
      f.hands,
      f.navMesh,
      () => {},
      f.ui
    );
    controls.init({
      ...f,
      renderer: {domElement: f.canvas} as never,
      interaction: new Interaction({
        callbacks: new ScriptsManager(async () => {}),
      }),
    });
    const fixture = {...f, controls, captures};
    fixtures.push(fixture);
    return fixture;
  }
  afterEach(() => {
    for (const f of fixtures.splice(0)) {
      f.controls.dispose();
      f.dispose();
    }
  });

  it('stops navigation on text focus and resumes on a new key', () => {
    const {controls, camera} = setup();
    document.dispatchEvent(key());
    controls.update();
    const moved = camera.position.clone();
    expect(moved.z).toBeLessThan(0);
    const host = document.createElement('div');
    const field = document.createElement('input');
    host.attachShadow({mode: 'open'}).append(field);
    document.body.append(host);
    try {
      field.focus();
      const typing = key();
      field.dispatchEvent(typing);
      controls.update();
      expect(camera.position).toEqual(moved);
      expect(typing.defaultPrevented).toBe(false);
      field.blur();
      document.dispatchEvent(key({isComposing: true}));
      controls.update();
      expect(camera.position).toEqual(moved);
      document.dispatchEvent(key());
      controls.update();
      expect(camera.position.z).toBeLessThan(moved.z);
      document.dispatchEvent(
        new KeyboardEvent('keyup', {code: Keycodes.W_CODE})
      );
      const released = camera.position.clone();
      controls.update();
      expect(camera.position).toEqual(released);
    } finally {
      host.remove();
    }
  });

  it.each(['blur', 'disable', 'disconnect', 'pointercancel'] as const)(
    'releases selection and pointer capture on %s',
    (reason) => {
      const {controls, input, canvas, captures, camera} = setup();
      document.dispatchEvent(key());
      canvas.dispatchEvent(
        Object.assign(new MouseEvent('pointerdown', {buttons: 1}), {
          pointerId: 7,
        })
      );
      expect(input.mouseController.userData.selected).toBe(true);
      expect(captures.has(7)).toBe(true);
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else if (reason === 'disable') controls.enabled = false;
      else if (reason === 'disconnect') controls.disconnect();
      else
        canvas.dispatchEvent(
          Object.assign(new MouseEvent('pointercancel'), {pointerId: 7})
        );
      expect(input.mouseController.userData.selected).toBe(false);
      expect(captures.size).toBe(0);
      if (reason !== 'pointercancel') {
        const stopped = camera.position.clone();
        controls.update();
        expect(camera.position).toEqual(stopped);
      }
      if (reason === 'disconnect') {
        document.dispatchEvent(key());
        canvas.dispatchEvent(new MouseEvent('pointerdown', {buttons: 1}));
        expect(controls.downKeys.size).toBe(0);
        expect(input.mouseController.userData.selected).toBe(false);
      }
    }
  );
});

function key(init: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', {
    code: Keycodes.W_CODE,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
}

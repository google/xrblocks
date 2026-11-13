import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {Options} from '../core/Options';
import {XRSystems} from '../core/components/XRSystems';
import {Input} from '../input/Input';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorOptions} from './SimulatorOptions';
import {SimulatorNavMesh} from './internal/navmesh/SimulatorNavMesh';
import {SimulatorControllerMode} from './controlModes/SimulatorControllerMode';
import {SimulatorUserMode} from './controlModes/SimulatorUserMode';
import {SimulatorPointerLockMode} from './controlModes/SimulatorPointerLockMode';
import {afterEach, describe, expect, it} from 'vitest';
import {ScriptsManager} from '../core/components/ScriptsManager';
import {Interaction} from '../interaction/Interaction';
import {Keycodes} from '../utils/Keycodes';
import {SimulatorControls} from './SimulatorControls';

/** Real input and controls; only the native XR spaces come from a boundary. */
function createControlsState() {
  const camera = new THREE.PerspectiveCamera(60, 1);
  camera.position.set(0, 1.5, 0);
  camera.updateMatrixWorld();
  const spaces = Array.from({length: 4}, () => new WebXRController());
  const renderer = {
    xr: {getController: (index: number) => spaces[index].getTargetRaySpace()},
  } as unknown as THREE.WebGLRenderer;
  const options = new Options();
  options.controllers.visualization = false;
  options.controllers.visualizeRays = false;
  options.hands.enabled = false;
  const input = new Input();
  input.init({systemsGroup: new XRSystems(), options, renderer});
  input.mouseController.init({camera});
  const state = new SimulatorControllerState();
  const hands = new SimulatorHands(state, new THREE.Scene());
  hands.input = input;
  const ui = new SimulatorInterface();
  const timer = new THREE.Timer();
  const now = performance.now();
  timer.update(now);
  timer.update(now + 100);
  const canvas = document.createElement('canvas');
  const simulatorOptions = new SimulatorOptions();
  return {
    camera,
    input,
    state,
    hands,
    ui,
    timer,
    canvas,
    simulatorOptions,
    navMesh: new SimulatorNavMesh(),
    dispose() {
      input.dispose();
      ui.dispose();
      timer.dispose();
      canvas.remove();
    },
  };
}

/** jsdom does not supply relative pointer movement. */
function drag(buttons: number) {
  const event = new MouseEvent('pointermove', {buttons});
  Object.defineProperties(event, {
    movementX: {value: 20},
    movementY: {value: 10},
  });
  return event;
}

describe('SimulatorControls input ownership', () => {
  const contexts: (ReturnType<typeof createControlsState> & {
    controls: SimulatorControls;
    captures: Set<number>;
  })[] = [];
  function setup() {
    const f = createControlsState();
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
    const context = {...f, controls, captures};
    contexts.push(context);
    return context;
  }
  afterEach(() => {
    for (const f of contexts.splice(0)) {
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

describe('SimulatorControllerMode', () => {
  const contexts: ReturnType<typeof createControlsState>[] = [];
  function setup() {
    const f = createControlsState();
    contexts.push(f);
    f.state.currentControllerIndex = 0;
    const keys = new Set<Keycodes>();
    const mode = new SimulatorControllerMode(
      f.state,
      keys,
      f.hands,
      f.navMesh,
      () => {},
      () => {}
    );
    mode.init(f);
    return {...f, mode, keys};
  }
  afterEach(() => {
    for (const f of contexts.splice(0)) f.dispose();
  });

  it('moves the active hand or camera according to input ownership', () => {
    const {mode, keys, state, camera, input, simulatorOptions} = setup();
    const hand = state.localControllerPositions[0];
    const otherHand = state.localControllerPositions[1].clone();
    const start = hand.clone();
    keys.add(Keycodes.W_CODE);
    mode.update();
    expect(hand.z).toBeLessThan(start.z);
    expect(state.localControllerPositions[1]).toEqual(otherHand);
    expect(camera.position.z).toBe(0);
    expect(input.controllers[0].position.z).toBeCloseTo(hand.z);
    keys.add(Keycodes.LEFT_SHIFT_CODE);
    const handBeforeCameraMove = hand.clone();
    mode.update();
    expect(camera.position.z).toBeLessThan(0);
    expect(hand).toEqual(handBeforeCameraMove);
    simulatorOptions.modeToggle.enabled = true;
    simulatorOptions.modeToggle.toggleKey = Keycodes.LEFT_SHIFT_CODE;
    const cameraBeforeToggle = camera.position.clone();
    mode.update();
    expect(camera.position).toEqual(cameraBeforeToggle);
    expect(hand.z).toBeLessThan(handBeforeCameraMove.z);
  });

  it('rotates the hand with left drag and the camera with right drag', () => {
    const {mode, state, camera} = setup();
    const cameraStart = camera.quaternion.clone();
    const handStart = state.localControllerOrientations[0].clone();
    mode.onPointerMove(drag(1));
    expect(camera.quaternion.equals(cameraStart)).toBe(true);
    const rotatedHand = state.localControllerOrientations[0].clone();
    expect(rotatedHand.equals(handStart)).toBe(false);
    mode.onPointerMove(drag(2));
    expect(camera.quaternion.equals(cameraStart)).toBe(false);
    expect(state.localControllerOrientations[0].equals(rotatedHand)).toBe(true);
  });
});

it('selects along the clicked ray without a preceding pointer move', () => {
  const f = createControlsState();
  const mode = new SimulatorUserMode(
    f.state,
    new Set(),
    f.hands,
    f.navMesh,
    () => {},
    () => {}
  );
  mode.init(f);
  mode.onModeActivated();
  try {
    const mouse = f.input.mouseController;
    let directionAtPress: number | undefined;
    mouse.addEventListener('selectstart', () => {
      directionAtPress = mouse.raycaster.ray.direction.x;
    });
    mode.onPointerDown(
      new MouseEvent('pointerdown', {
        buttons: 1,
        clientX: window.innerWidth * 0.75,
        clientY: window.innerHeight / 2,
      })
    );
    expect(directionAtPress).toBeGreaterThan(0);
    expect(mouse.userData.selected).toBe(true);
    expect(mouse.position).toEqual(f.camera.position);
    mode.onPointerUp();
    expect(mouse.userData.selected).toBe(false);
  } finally {
    mode.onModeDeactivated();
    f.dispose();
  }
});

it('owns selection and follows the camera while pointer lock is active', () => {
  const f = createControlsState();
  let locked: Element | null = null;
  const changeLock = (element: Element | null) => {
    locked = element;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    'pointerLockElement'
  );
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => locked,
  });
  f.canvas.requestPointerLock = async () => {
    changeLock(f.canvas);
  };
  const exitDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'exitPointerLock'
  );
  document.exitPointerLock = () => {
    changeLock(null);
  };
  const mode = new SimulatorPointerLockMode(
    f.state,
    new Set(),
    f.hands,
    f.navMesh,
    () => {},
    () => {}
  );
  mode.init({...f, domElement: f.canvas});
  mode.onModeActivated();
  try {
    const controller = mode.pointerLockController;
    expect(controller.userData.connected).toBe(true);
    const unlockedRotation = f.camera.quaternion.clone();
    mode.onPointerMove(drag(0));
    expect(f.camera.quaternion.equals(unlockedRotation)).toBe(true);
    mode.onPointerDown(new MouseEvent('pointerdown', {buttons: 1}));
    expect(locked).toBe(f.canvas);
    expect(controller.userData.selected).toBe(false);
    mode.onPointerMove(drag(0));
    expect(f.camera.quaternion.equals(unlockedRotation)).toBe(false);
    controller.update();
    expect(controller.position).toEqual(f.camera.position);
    expect(controller.quaternion.equals(f.camera.quaternion)).toBe(true);
    const selections: string[] = [];
    controller.addEventListener('selectstart', () => {
      selections.push('start');
    });
    controller.addEventListener('selectend', () => {
      selections.push('end');
    });
    mode.onPointerDown(new MouseEvent('pointerdown', {buttons: 1}));
    expect(controller.userData.selected).toBe(true);
    mode.onPointerUp();
    expect(controller.userData.selected).toBe(false);
    expect(selections).toEqual(['start', 'end']);
    mode.onModeDeactivated();
    expect(locked).toBeNull();
    expect(controller.userData.connected).toBe(false);
    expect(f.input.activeControllers.children).not.toContain(controller);
  } finally {
    mode.onModeDeactivated();
    if (descriptor)
      Object.defineProperty(document, 'pointerLockElement', descriptor);
    else Reflect.deleteProperty(document, 'pointerLockElement');
    if (exitDescriptor)
      Object.defineProperty(document, 'exitPointerLock', exitDescriptor);
    else Reflect.deleteProperty(document, 'exitPointerLock');
    f.dispose();
  }
});

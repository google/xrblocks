import * as THREE from 'three';

import {Options} from '../core/Options';
import {rendererBoundary} from '../core/Renderer.test-fixture';
import {XRSystems} from '../core/components/XRSystems';
import {Input} from '../input/Input';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorOptions} from './SimulatorOptions';
import {SimulatorNavMesh} from './internal/navmesh/SimulatorNavMesh';

/** Real input and controls; only the native XR spaces come from a boundary. */
export function controlFixture() {
  const camera = new THREE.PerspectiveCamera(60, 1);
  camera.position.set(0, 1.5, 0);
  camera.updateMatrixWorld();
  const {renderer} = rendererBoundary();
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
  timer.update(0);
  timer.update(100);
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
export function drag(buttons: number) {
  const event = new MouseEvent('pointermove', {buttons});
  Object.defineProperties(event, {
    movementX: {value: 20},
    movementY: {value: 10},
  });
  return event;
}

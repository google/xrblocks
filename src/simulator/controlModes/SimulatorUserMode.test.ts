import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {Input} from '../../input/Input';
import {MouseController} from '../../input/MouseController';
import {ModelViewer} from '../../ui/interaction/ModelViewer';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands';
import {SimulatorNavMesh} from '../scene/SimulatorNavMesh';
import {SimulatorUserMode} from './SimulatorUserMode';

describe('SimulatorUserMode wheel scaling', () => {
  let canvas: HTMLCanvasElement;
  let input: Input;
  let mode: SimulatorUserMode;
  let mouseController: MouseController;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    mouseController = {
      updateMousePositionFromEvent: vi.fn(),
      userData: {connected: true},
    } as unknown as MouseController;
    input = {
      gamepadController: {init: vi.fn()},
      intersectionsForController: new Map([[mouseController, []]]),
      mouseController,
      updateController: vi.fn(),
    } as unknown as Input;
    mode = new SimulatorUserMode(
      {} as SimulatorControllerState,
      new Set(),
      {} as SimulatorHands,
      new SimulatorNavMesh(),
      vi.fn(),
      vi.fn()
    );
    mode.init({
      camera: new THREE.Camera(),
      input,
      timer: new THREE.Timer(),
      domElement: canvas,
    });
  });

  function pointAt(object: THREE.Object3D) {
    input.intersectionsForController.set(mouseController, [
      {object} as THREE.Intersection,
    ]);
  }

  it('uniformly scales the ModelViewer under the mouse pointer', () => {
    const modelViewer = new ModelViewer({});
    const modelMesh = new THREE.Mesh();
    modelViewer.add(modelMesh);
    modelViewer.scale.set(1, 2, 3);
    pointAt(modelMesh);
    const event = new WheelEvent('wheel', {deltaY: -100});

    expect(mode.onWheel(event)).toBe(true);

    const scaleFactor = Math.exp(0.1);
    expect(modelViewer.scale.x).toBeCloseTo(scaleFactor);
    expect(modelViewer.scale.y).toBeCloseTo(2 * scaleFactor);
    expect(modelViewer.scale.z).toBeCloseTo(3 * scaleFactor);
    expect(mouseController.updateMousePositionFromEvent).toHaveBeenCalledWith(
      event
    );
    expect(input.updateController).toHaveBeenCalledWith(mouseController);
  });

  it('scales down when scrolling in the opposite direction', () => {
    const modelViewer = new ModelViewer({});
    pointAt(modelViewer);

    expect(mode.onWheel(new WheelEvent('wheel', {deltaY: 100}))).toBe(true);

    expect(modelViewer.scale.x).toBeCloseTo(Math.exp(-0.1));
    expect(modelViewer.scale.y).toBeCloseTo(Math.exp(-0.1));
    expect(modelViewer.scale.z).toBeCloseTo(Math.exp(-0.1));
  });

  it('does not handle wheel input when the targeted ModelViewer is not scalable', () => {
    const modelViewer = new ModelViewer({});
    modelViewer.scalable = false;
    pointAt(modelViewer);

    expect(mode.onWheel(new WheelEvent('wheel', {deltaY: -100}))).toBe(false);
    expect(modelViewer.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('does not scale a ModelViewer behind a closer non-ModelViewer object', () => {
    const foreground = new THREE.Mesh();
    const modelViewer = new ModelViewer({});
    input.intersectionsForController.set(mouseController, [
      {object: foreground} as THREE.Intersection,
      {object: modelViewer} as THREE.Intersection,
    ]);

    expect(mode.onWheel(new WheelEvent('wheel', {deltaY: -100}))).toBe(false);
    expect(modelViewer.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('normalizes line-based wheel deltas', () => {
    const modelViewer = new ModelViewer({});
    pointAt(modelViewer);

    mode.onWheel(
      new WheelEvent('wheel', {
        deltaY: -3,
        deltaMode: WheelEvent.DOM_DELTA_LINE,
      })
    );

    expect(modelViewer.scale.x).toBeCloseTo(Math.exp(0.048));
  });

  it('normalizes page-based wheel deltas using the canvas height', () => {
    const modelViewer = new ModelViewer({});
    pointAt(modelViewer);
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 600,
    });

    mode.onWheel(
      new WheelEvent('wheel', {
        deltaY: -1,
        deltaMode: WheelEvent.DOM_DELTA_PAGE,
      })
    );

    expect(modelViewer.scale.x).toBeCloseTo(Math.exp(0.6));
  });
});

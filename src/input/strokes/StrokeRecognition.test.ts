import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {Options} from '../../core/Options';
import {User} from '../../core/User';
import {XRSystems} from '../../core/components/XRSystems';
import {Hands} from '../Hands';
import {Input} from '../Input';
import {StrokeRecognizer} from './StrokeRecognition';
import {StrokeRecognitionOptions} from './StrokeRecognitionOptions';

const inputs: Input[] = [];
afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose();
  vi.restoreAllMocks();
});

function recording() {
  const spaces = Array.from({length: 4}, () => new WebXRController());
  const options = new Options().enableHands();
  options.controllers.visualization = false;
  options.controllers.visualizeRays = false;
  options.hands.visualization = false;
  const input = new Input();
  inputs.push(input);
  input.init({
    systemsGroup: new XRSystems(),
    options,
    renderer: {
      xr: {
        getController: (i: number) => spaces[i].getTargetRaySpace(),
        getHand: (i: number) => spaces[i].getHandSpace(),
      },
    } as unknown as THREE.WebGLRenderer,
  });
  // Connection order differs from handedness order.
  for (const [slot, handedness] of ['right', 'left'].entries()) {
    spaces[slot].connect({
      handedness,
      targetRayMode: 'tracked-pointer',
      hand: new Map([['index-finger-tip', {jointName: 'index-finger-tip'}]]),
    } as unknown as XRInputSource);
    spaces[slot].getHandSpace().visible = true;
  }
  const user = new User();
  user.input = input;
  user.hands = new Hands(input.hands);
  const recorder = new StrokeRecognizer();
  recorder.init({
    user,
    scene: new THREE.Scene(),
    camera: new THREE.Camera(),
    options: new StrokeRecognitionOptions({startDelay: 0.1, endDelay: 0.1}),
  });
  const now = vi.spyOn(Date, 'now');
  recorder.activate();
  return {
    recorder,
    spaces,
    input,
    frame(time: number, slot: number | null) {
      now.mockReturnValue(time);
      input.controllers.forEach((controller, i) => {
        controller.userData.selected = i === slot;
      });
      recorder.update();
    },
  };
}

describe('StrokeRecognizer', () => {
  it('recognizes a tracked triangle after the hand reconnects in a different slot', () => {
    const {recorder, spaces, frame} = recording();
    spaces[0].disconnect({} as XRInputSource);
    spaces[2].connect({
      handedness: 'right',
      targetRayMode: 'tracked-pointer',
      hand: new Map([['index-finger-tip', {jointName: 'index-finger-tip'}]]),
    } as unknown as XRInputSource);
    const hand = spaces[2].getHandSpace();
    hand.visible = true;
    const tip = hand.joints['index-finger-tip']!;
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(1, 2, -3),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, 0.3, -0.5)),
      new THREE.Vector3(1, 1, 1)
    );
    const vertices = [
      new THREE.Vector3(-0.2, 0, 0),
      new THREE.Vector3(0, 0.4, 0),
      new THREE.Vector3(0.2, 0, 0),
      new THREE.Vector3(-0.2, 0, 0),
    ];
    const results: string[] = [];
    recorder.addEventListener('unistrokeend', ({detail}) => {
      results.push(detail.result?.recognizedShape ?? 'Unknown');
    });
    frame(1000, 2);
    for (let i = 0; i <= 60; i++) {
      const edge = Math.min(Math.floor(i / 20), 2);
      const point = new THREE.Vector3()
        .lerpVectors(vertices[edge], vertices[edge + 1], (i - edge * 20) / 20)
        .applyMatrix4(transform);
      tip.matrix.makeTranslation(point);
      tip.matrixWorldNeedsUpdate = true;
      frame(1200 + i * 10, 2);
    }
    frame(2100, null);
    frame(2200, null);
    expect(results).toEqual(['Triangle']);
  });

  it('discards a cancelled stroke and starts again with the other hand', () => {
    const {recorder, frame, spaces} = recording();
    const points: THREE.Vector3[] = [];
    const results: unknown[] = [];
    recorder.addEventListener('unistrokeupdate', ({detail}) =>
      points.push(detail.point!.clone())
    );
    recorder.addEventListener('unistrokeend', ({detail}) =>
      results.push(detail.result)
    );
    frame(1000, 0);
    frame(1200, 0);
    recorder.deactivate();
    frame(1400, null);
    recorder.activate();
    frame(1600, null);
    expect(results).toEqual([]);

    const tip = spaces[1].getHandSpace().joints['index-finger-tip']!;
    tip.matrix.makeTranslation(-1, 2, -3);
    tip.matrixWorldNeedsUpdate = true;
    frame(1800, 1);
    points.length = 0;
    frame(1850, 1);
    expect(points).toEqual([]);
    frame(2100, 1);
    frame(2400, null);
    expect(points).toEqual([new THREE.Vector3(-1, 2, -3)]);
    expect(results).toEqual([undefined]);
  });

  it('allows a start listener to cancel without a point or completion event', () => {
    const {recorder, frame} = recording();
    const events: string[] = [];
    recorder.addEventListener('unistrokestart', () => {
      recorder.deactivate();
      recorder.activate();
    });
    recorder.addEventListener('unistrokeupdate', () => events.push('point'));
    recorder.addEventListener('unistrokeend', () => events.push('end'));
    frame(1000, 0);
    frame(1300, null);
    expect(events).toEqual([]);
  });
});

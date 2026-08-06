import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {Options} from '../core/Options';
import {XRSystems} from '../core/components/XRSystems';
import {Input} from './Input';
import {Controller} from './Controller';

function updateInput(input: Input) {
  input.sampleSources();
}

describe('Input head gestures', () => {
  it('creates head gestures without enabling controllers', () => {
    const input = new Input();
    const options = new Options().enableHeadGestures();
    options.controllers.enabled = false;
    const systemsGroup = new XRSystems();

    input.init({
      systemsGroup,
      options,
      renderer: {} as THREE.WebGLRenderer,
    });

    expect(input.controllers).toHaveLength(0);
    expect(input.headGestures).toBeDefined();
    expect(systemsGroup.children).toContain(input.headGestures);
  });
});

describe('Input direct touch', () => {
  it('reports the contact point, selection, and wrist without scanning the scene', () => {
    const input = new Input();
    const controller = new THREE.Object3D() as Controller;
    controller.userData.selected = true;
    const indexTip = new THREE.Object3D();
    const wrist = new THREE.Object3D();
    input.controllers = [controller];
    input.hands = [
      {
        joints: {'index-finger-tip': indexTip, wrist},
      } as unknown as THREE.XRHandSpace,
    ];
    input.controllersEnabled = false;

    updateInput(input);

    const frame = input.getFrame();

    expect(frame.directTouches).toHaveLength(1);
    expect(frame.directTouches[0]).toMatchObject({
      controller,
      handIndex: 0,
      hand: wrist,
      selected: true,
    });
    expect(frame.directTouches[0].point.toArray()).toEqual([0, 0, 0]);
    expect(frame.directTouches[0]).not.toHaveProperty('intersections');
  });
});

describe('Input events', () => {
  it('reports disconnection and stops forwarding controller events after dispose', () => {
    const input = new Input();
    const mockController = new THREE.Object3D() as unknown as Controller;
    mockController.userData = {connected: true, selected: true};

    const selectEndSpy = vi.fn();
    input.controllers.push(mockController);
    input.bindListener('selectend', selectEndSpy);

    input.defaultOnDisconnected({
      type: 'disconnected',
      target: mockController,
    });

    expect(mockController.userData.selected).toBe(false);
    expect(selectEndSpy).toHaveBeenCalledTimes(1);
    expect(selectEndSpy.mock.calls[0][0]).toMatchObject({
      type: 'selectend',
      target: mockController,
    });

    input.dispose();

    mockController.dispatchEvent({
      type: 'selectend',
      target: mockController,
    });
    expect(selectEndSpy).toHaveBeenCalledOnce();
  });
});

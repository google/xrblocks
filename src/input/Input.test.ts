import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {describe, expect, it, vi} from 'vitest';

import {Options} from '../core/Options';
import {ScriptsManager} from '../core/components/ScriptsManager';
import {XRSystems} from '../core/components/XRSystems';
import {Interaction} from '../interaction/Interaction';
import {Reticle} from '../interaction/reticle/Reticle';
import {UIButton} from '../ui/components/UIButton';
import {Input} from './Input';
import {Controller} from './Controller';

function updateInput(input: Input) {
  input.sampleSources();
}

function trackedHand() {
  const hand = new WebXRController().getHandSpace();
  const indexTip = Object.assign(new THREE.Group(), {jointRadius: 0.01});
  const wrist = Object.assign(new THREE.Group(), {jointRadius: 0.01});
  hand.joints['index-finger-tip'] = indexTip;
  hand.joints.wrist = wrist;
  hand.add(indexTip, wrist);
  hand.visible = true;
  return {hand, indexTip, wrist};
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
    const {hand, wrist} = trackedHand();
    input.controllers = [controller];
    input.hands = [hand];
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
    input.dispose();
  });

  it.each(['hand', 'index tip'])(
    'ignores retained poses when the %s is untracked and resumes when it returns',
    (lost) => {
      const input = new Input();
      const controller = new THREE.Object3D() as Controller;
      const {hand, indexTip} = trackedHand();
      input.controllers = [controller];
      input.hands = [hand];
      const lostSpace = lost === 'hand' ? hand : indexTip;
      updateInput(input);
      expect(input.getFrame().directTouches).toHaveLength(1);
      lostSpace.visible = false;
      updateInput(input);
      expect(input.getFrame().directTouches).toHaveLength(0);
      lostSpace.visible = true;
      updateInput(input);
      expect(input.getFrame().directTouches).toHaveLength(1);
      input.dispose();
    }
  );

  it.each(['hand', 'index tip'])(
    'restores controller targeting after %s tracking is lost over a touchable button',
    async (lost) => {
      const input = new Input();
      const controller = new THREE.Object3D() as Controller;
      controller.userData = {id: 0, connected: true, selected: false};
      controller.inputSource = {targetRayMode: 'tracked-pointer'};
      const reticle = new Reticle();
      controller.reticle = reticle;
      const {hand, indexTip} = trackedHand();
      indexTip.position.set(2, 0, -1);
      input.controllers = [controller];
      input.hands = [hand];
      const callbacks = new ScriptsManager(async () => {});
      const interaction = new Interaction({
        callbacks,
        scene: new THREE.Scene(),
      });
      const clicked = vi.fn();
      const button = new UIButton({label: 'Keyboard', onClick: clicked});
      const surface = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.1),
        new THREE.MeshBasicMaterial()
      );
      surface.position.z = -1;
      await callbacks.initScript(button);
      const unregister = interaction.registerHitSurface(surface, button);
      const sample = () => {
        input.sampleSources();
        interaction.update(input.getFrame());
      };
      try {
        sample();
        expect(interaction.getResolvedRay(controller)?.target).toBe(button);
        expect(reticle.visible).toBe(true);
        indexTip.position.x = 0;
        sample();
        expect(interaction.getResolvedRay(controller)).toBeUndefined();
        expect(reticle.visible).toBe(false);
        const lostSpace = lost === 'hand' ? hand : indexTip;
        lostSpace.visible = false;
        sample();
        expect(controller.userData.connected).toBe(true);
        expect(controller.visible).toBe(true);
        expect(interaction.getResolvedRay(controller)?.target).toBe(button);
        expect(reticle.visible).toBe(true);
        expect(clicked).not.toHaveBeenCalled();

        controller.userData.selected = true;
        sample();
        controller.userData.selected = false;
        sample();
        expect(clicked).toHaveBeenCalledTimes(1);
      } finally {
        interaction.clear();
        unregister();
        button.dispose();
        surface.geometry.dispose();
        surface.material.dispose();
        reticle.dispose();
        input.dispose();
      }
    }
  );
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

describe('Input PinchFilter mobile and hand tracking compatibility', () => {
  it('does not filter native select events when targetRayMode is screen', () => {
    const input = new Input();
    const mockController = new THREE.Object3D() as unknown as Controller;
    mockController.userData = {connected: true};
    mockController.gamepad = {
      buttons: [{value: 0, pressed: true}],
    } as unknown as Gamepad;
    mockController.inputSource = {
      targetRayMode: 'screen',
    } as unknown as XRInputSource;

    const selectStartSpy = vi.fn();
    input.controllers.push(mockController);
    input.bindListener('selectstart', selectStartSpy);

    mockController.dispatchEvent({type: 'selectstart', target: mockController});
    expect(selectStartSpy).toHaveBeenCalledTimes(1);
  });

  it('filters native select events on hand tracking when button value is around 0.7', () => {
    const input = new Input();
    const mockController = new THREE.Object3D() as unknown as Controller;
    mockController.userData = {connected: true};
    mockController.gamepad = {
      buttons: [{value: 0.7, pressed: true}],
    } as unknown as Gamepad;
    mockController.inputSource = {
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;

    const selectStartSpy = vi.fn();
    input.controllers.push(mockController);
    input.bindListener('selectstart', selectStartSpy);

    mockController.dispatchEvent({type: 'selectstart', target: mockController});
    expect(selectStartSpy).not.toHaveBeenCalled();
  });
});

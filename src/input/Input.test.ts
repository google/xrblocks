import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {describe, expect, it, vi} from 'vitest';

import {Options} from '../core/Options';
import type {User} from '../core/User';
import {ScriptsManager} from '../core/components/ScriptsManager';
import {XRSystems} from '../core/components/XRSystems';
import {Interaction} from '../interaction/Interaction';
import {Reticle} from '../interaction/reticle/Reticle';
import {UIButton} from '../ui/components/UIButton';
import {SimulatorPointerLockController} from '../simulator/SimulatorPointerLockController';
import {SimulatorControllerState} from '../simulator/SimulatorControllerState';
import {SimulatorHands} from '../simulator/SimulatorHands';
import {Input} from './Input';
import {Controller} from './Controller';
import {Handedness, Hands} from './Hands';
import {WebXRHandPoseEstimator} from './gestures/poseEstimators/WebXRHandPoseEstimator';

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
  it.each(['tracked-pointer', 'screen'] as const)(
    'keeps %s selection working when enabled hands have no granted tracking data',
    async (targetRayMode) => {
      const input = new Input();
      const spaces = Array.from({length: 4}, () => new WebXRController());
      const options = new Options().enableHands();
      options.controllers.visualization = false;
      options.controllers.visualizeRays = false;
      options.hands.visualization = false;
      const renderer = {
        xr: {
          getController: (index: number) => spaces[index].getTargetRaySpace(),
          getHand: (index: number) => spaces[index].getHandSpace(),
        },
      } as unknown as THREE.WebGLRenderer;
      input.init({systemsGroup: new XRSystems(), options, renderer});
      const controller = input.controllers[0];
      controller.userData.connected = true;
      controller.inputSource = {targetRayMode};
      const hands = new Hands(input.hands);
      expect(hands.getIndexTip()).toBeUndefined();
      expect(hands.getWrist()).toBeUndefined();
      expect(
        hands.toPositionQuaternionArray().every((value) => value === 0)
      ).toBe(true);

      const callbacks = new ScriptsManager(async () => {});
      const interaction = new Interaction({
        callbacks,
        scene: new THREE.Scene(),
      });
      const clicked = vi.fn();
      const button = new UIButton({label: 'Send', onClick: clicked});
      const surface = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.1),
        new THREE.MeshBasicMaterial()
      );
      surface.position.z = -1;
      await callbacks.initScript(button);
      const unregister = interaction.registerHitSurface(surface, button);
      const sample = () => {
        input.sampleSources();
        expect(input.getFrame().directTouches).toHaveLength(0);
        interaction.update(input.getFrame());
      };
      try {
        sample();
        expect(interaction.getResolvedRay(controller)?.target).toBe(button);
        controller.dispatchEvent({type: 'selectstart', target: controller});
        sample();
        controller.dispatchEvent({type: 'selectend', target: controller});
        sample();
        expect(clicked).toHaveBeenCalledOnce();
      } finally {
        interaction.clear();
        unregister();
        button.dispose();
        surface.geometry.dispose();
        surface.material.dispose();
        input.dispose();
      }
    }
  );

  it('reserves controller slots for transient pointers when hands are enabled', () => {
    const input = new Input();
    const spaces = Array.from({length: 4}, () => new WebXRController());
    const getController = vi.fn((index: number) =>
      spaces[index].getTargetRaySpace()
    );
    const getControllerGrip = vi.fn((index: number) =>
      spaces[index].getGripSpace()
    );
    const getHand = vi.fn((index: number) => spaces[index].getHandSpace());
    const options = new Options().enableHands();
    options.controllers.visualization = true;
    options.controllers.visualizeRays = false;
    options.hands.visualization = false;
    const renderer = {
      xr: {
        getController,
        getControllerGrip,
        getHand,
      },
    } as unknown as THREE.WebGLRenderer;
    input.init({systemsGroup: new XRSystems(), options, renderer});

    const leftController = input.controllers[0];
    leftController.dispatchEvent({
      type: 'connected',
      data: {handedness: 'left'} as XRInputSource,
    });
    const transientPointer = input.controllers[2];
    const source = {
      handedness: 'none',
      targetRayMode: 'transient-pointer',
    } as XRInputSource;
    const selectedTargets: Controller[] = [];
    const selectStart = vi.fn((event: {target: Controller}) =>
      selectedTargets.push(event.target)
    );
    input.bindSelectStart(selectStart);

    transientPointer.dispatchEvent({type: 'connected', data: source});
    transientPointer.dispatchEvent({type: 'selectstart', data: source});

    expect(getController).toHaveBeenCalledTimes(4);
    expect(getControllerGrip).toHaveBeenCalledTimes(4);
    expect(getHand).toHaveBeenCalledTimes(4);
    expect(input.controllers.slice(0, 4)).toHaveLength(4);
    expect(input.controllers.map(({userData}) => userData.id)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(selectStart).toHaveBeenCalledOnce();
    expect(selectedTargets).toEqual([transientPointer]);
    expect(input.leftController).toBe(leftController);
    expect(input.rightController).toBeUndefined();

    const pointerLockController = new SimulatorPointerLockController();
    input.enableController(pointerLockController);
    const ids = input.controllers.map(({userData}) => userData.id);
    expect(pointerLockController.userData.id).toBe(7);
    expect(new Set(ids).size).toBe(ids.length);
    input.dispose();
  });

  it.each(['left', 'right'] as const)(
    'keeps the %s controller alias when another same-handed source disconnects',
    (handedness) => {
      const input = new Input();
      const first = new THREE.Object3D() as Controller;
      const second = new THREE.Object3D() as Controller;
      first.userData = {connected: false, selected: false};
      second.userData = {connected: false, selected: false};
      const firstSource = {handedness} as XRInputSource;
      const secondSource = {handedness} as XRInputSource;
      const getAlias = () =>
        handedness === 'left' ? input.leftController : input.rightController;
      input.controllers.push(first, second);

      input.defaultOnConnected({
        type: 'connected',
        target: first,
        data: firstSource,
      });
      input.defaultOnConnected({
        type: 'connected',
        target: second,
        data: secondSource,
      });
      input.defaultOnDisconnected({
        type: 'disconnected',
        target: second,
        data: secondSource,
      });

      expect(getAlias()).toBe(first);

      input.defaultOnDisconnected({
        type: 'disconnected',
        target: first,
        data: firstSource,
      });
      expect(getAlias()).toBeUndefined();
      input.dispose();
    }
  );

  it('keeps hand joints and direct touch available when a hand uses slot two', () => {
    const input = new Input();
    const spaces = Array.from({length: 4}, () => new WebXRController());
    const options = new Options().enableHands();
    options.controllers.visualization = false;
    options.controllers.visualizeRays = false;
    options.hands.visualization = false;
    const renderer = {
      xr: {
        getController: (index: number) => spaces[index].getTargetRaySpace(),
        getHand: (index: number) => spaces[index].getHandSpace(),
      },
    } as unknown as THREE.WebGLRenderer;
    input.init({systemsGroup: new XRSystems(), options, renderer});

    const controller = input.controllers[2];
    const hand = spaces[2].getHandSpace();
    const indexTip = Object.assign(new THREE.Group(), {jointRadius: 0.01});
    const wrist = Object.assign(new THREE.Group(), {jointRadius: 0.01});
    hand.joints['index-finger-tip'] = indexTip;
    hand.joints.wrist = wrist;
    hand.add(indexTip, wrist);
    hand.visible = true;
    const source = {
      hand: new Map(),
      handedness: 'left',
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;
    controller.dispatchEvent({type: 'connected', data: source});

    updateInput(input);

    expect(input.hands[0]).toBe(hand);
    expect(new Hands(input.hands).getIndexTip(Handedness.LEFT)).toBe(indexTip);
    expect(input.getFrame().directTouches).toMatchObject([
      {controller, handIndex: 0, hand: wrist},
    ]);
    input.dispose();
  });

  it.each([
    {handedness: 'right', slot: 0, handIndex: 1, reconnectSlot: 3},
    {handedness: 'left', slot: 1, handIndex: 0, reconnectSlot: 2},
  ] as const)(
    'maps a lone $handedness hand from slot $slot and remaps it after reconnect',
    ({handedness, slot, handIndex, reconnectSlot}) => {
      const input = new Input();
      const spaces = Array.from({length: 4}, () => new WebXRController());
      const options = new Options().enableHands();
      options.controllers.visualization = false;
      options.controllers.visualizeRays = false;
      options.hands.visualization = false;
      const renderer = {
        xr: {
          getController: (index: number) => spaces[index].getTargetRaySpace(),
          getHand: (index: number) => spaces[index].getHandSpace(),
        },
      } as unknown as THREE.WebGLRenderer;
      input.init({systemsGroup: new XRSystems(), options, renderer});

      expect(input.hands).toHaveLength(2);
      const placeholders = [...input.hands];
      expect(placeholders.every(Boolean)).toBe(true);
      expect(input.hands[0]).not.toBe(spaces[0].getHandSpace());
      expect(input.hands[1]).not.toBe(spaces[1].getHandSpace());

      const source = {
        hand: new Map(),
        handedness,
        targetRayMode: 'tracked-pointer',
      } as unknown as XRInputSource;
      const controller = input.controllers[slot];
      controller.dispatchEvent({type: 'connected', data: source});

      const otherSlot = slot === 0 ? 1 : 0;
      input.controllers[otherSlot].dispatchEvent({
        type: 'connected',
        data: {handedness, targetRayMode: 'tracked-pointer'},
      });

      expect(input.hands[handIndex]).toBe(spaces[slot].getHandSpace());
      expect(input.hands[1 - handIndex]).toBe(placeholders[1 - handIndex]);

      controller.dispatchEvent({type: 'disconnected', data: source});
      expect(input.hands[handIndex]).toBe(placeholders[handIndex]);
      expect(input.hands).toHaveLength(2);

      const reconnectSource = {...source, hand: new Map()};
      input.controllers[reconnectSlot].dispatchEvent({
        type: 'connected',
        data: reconnectSource,
      });
      expect(input.hands[handIndex]).toBe(spaces[reconnectSlot].getHandSpace());
      expect(input.hands[1 - handIndex]).toBe(placeholders[1 - handIndex]);
      input.dispose();
    }
  );

  it('clears an old handedness alias when a controller slot is reused', () => {
    const input = new Input();
    const spaces = Array.from({length: 4}, () => new WebXRController());
    const options = new Options().enableHands();
    options.controllers.visualization = false;
    options.controllers.visualizeRays = false;
    options.hands.visualization = false;
    const renderer = {
      xr: {
        getController: (index: number) => spaces[index].getTargetRaySpace(),
        getHand: (index: number) => spaces[index].getHandSpace(),
      },
    } as unknown as THREE.WebGLRenderer;
    input.init({systemsGroup: new XRSystems(), options, renderer});

    const controller = input.controllers[0];
    const hand = spaces[0].getHandSpace();
    controller.dispatchEvent({
      type: 'connected',
      data: {
        hand: new Map(),
        handedness: 'left',
      } as unknown as XRInputSource,
    });
    expect(input.hands[0]).toBe(hand);

    controller.dispatchEvent({
      type: 'connected',
      data: {
        hand: new Map(),
        handedness: 'right',
      } as unknown as XRInputSource,
    });

    expect(input.hands[0]).not.toBe(hand);
    expect(input.hands[1]).toBe(hand);
    input.dispose();
  });

  it('clears the old controller alias when a source changes handedness', () => {
    const input = new Input();
    const controller = new THREE.Object3D() as Controller;
    controller.userData = {connected: false, selected: false};
    input.controllers.push(controller);

    input.defaultOnConnected({
      type: 'connected',
      target: controller,
      data: {handedness: 'left'},
    });
    expect(input.leftController).toBe(controller);

    input.defaultOnConnected({
      type: 'connected',
      target: controller,
      data: {handedness: 'right'},
    });
    expect(input.leftController).toBeUndefined();
    expect(input.rightController).toBe(controller);

    input.defaultOnConnected({
      type: 'connected',
      target: controller,
      data: {handedness: 'none'},
    });
    expect(input.leftController).toBeUndefined();
    expect(input.rightController).toBeUndefined();
    input.dispose();
  });

  it('lets the simulator show and hide hands after XR sources disconnect', () => {
    const input = new Input();
    const spaces = Array.from({length: 4}, () => new WebXRController());
    const options = new Options().enableHands();
    options.controllers.visualization = false;
    options.controllers.visualizeRays = false;
    options.hands.visualization = false;
    const renderer = {
      xr: {
        getController: (index: number) => spaces[index].getTargetRaySpace(),
        getHand: (index: number) => spaces[index].getHandSpace(),
      },
    } as unknown as THREE.WebGLRenderer;
    input.init({systemsGroup: new XRSystems(), options, renderer});
    const source = {
      hand: new Map(),
      handedness: 'right',
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;
    input.controllers[0].dispatchEvent({type: 'connected', data: source});
    input.controllers[0].dispatchEvent({type: 'disconnected', data: source});

    const simulatorHands = new SimulatorHands(
      new SimulatorControllerState(),
      new THREE.Scene()
    );
    simulatorHands.input = input;
    simulatorHands.leftHandBones = Array.from(
      {length: 25},
      () => new THREE.Group()
    );
    simulatorHands.rightHandBones = Array.from(
      {length: 25},
      () => new THREE.Group()
    );
    const userHands = new Hands(input.hands);
    const poseEstimator = new WebXRHandPoseEstimator({
      hands: userHands,
    } as User);

    expect(input.hands).toHaveLength(2);
    expect(input.hands[0]).toBeDefined();
    expect(input.hands[1]).toBeDefined();
    simulatorHands.showHands();
    simulatorHands.syncHandJoints();
    expect(input.hands.map((hand) => Object.keys(hand.joints).length)).toEqual([
      25, 25,
    ]);
    input.sampleSources();
    expect(input.getFrame().directTouches).toMatchObject([
      {controller: input.controllers[0], handIndex: 0},
      {controller: input.controllers[1], handIndex: 1},
    ]);
    expect(userHands.getIndexTip(Handedness.LEFT)).toBeDefined();
    expect(userHands.getIndexTip(Handedness.RIGHT)).toBeDefined();
    expect(poseEstimator.getHandContext(Handedness.LEFT)).not.toBeNull();
    expect(poseEstimator.getHandContext(Handedness.RIGHT)).not.toBeNull();
    expect(input.hands.every((hand) => hand.visible)).toBe(true);
    simulatorHands.hideHands();
    input.sampleSources();
    expect(input.getFrame().directTouches).toHaveLength(0);
    expect(userHands.getIndexTip(Handedness.LEFT)).toBeUndefined();
    expect(userHands.getIndexTip(Handedness.RIGHT)).toBeUndefined();
    expect(userHands.isValid(Handedness.LEFT)).toBe(false);
    expect(userHands.isValid(Handedness.RIGHT)).toBe(false);
    expect(
      userHands.toPositionQuaternionArray().every((value) => value === 0)
    ).toBe(true);
    expect(poseEstimator.getHandContext(Handedness.LEFT)).toBeNull();
    expect(poseEstimator.getHandContext(Handedness.RIGHT)).toBeNull();
    expect(input.hands.every((hand) => !hand.visible)).toBe(true);

    simulatorHands.dispose();
    input.dispose();
  });

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

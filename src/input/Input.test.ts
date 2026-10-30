import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {describe, expect, it, vi} from 'vitest';

import {Options} from '../core/Options';
import type {User} from '../core/User';
import {Script, type SelectEndEvent} from '../core/Script';
import {ScriptsManager} from '../core/components/ScriptsManager';
import {XRSystems} from '../core/components/XRSystems';
import {Interaction} from '../interaction/Interaction';
import {Reticle} from '../interaction/reticle/Reticle';
import {UIButton} from '../ui/components/UIButton';
import {SimulatorPointerLockController} from '../simulator/SimulatorPointerLockController';
import {SimulatorControllerState} from '../simulator/SimulatorControllerState';
import {SimulatorHands} from '../simulator/SimulatorHands';
import {UISlider} from '../ui/components/UISlider';
import {UICard} from '../ui/components/UICard';
import type {ManipulationEvent} from '../interaction/manipulation/ManipulationTypes';
import {Input} from './Input';
import {Controller} from './Controller';
import {Handedness, Hands} from './Hands';
import {WebXRHandPoseEstimator} from './gestures/poseEstimators/WebXRHandPoseEstimator';

function updateInput(input: Input) {
  input.sampleSources();
}

function createInitializedInput() {
  const input = new Input();
  const spaces: WebXRController[] = [];
  const options = new Options();
  options.controllers.visualization = false;
  options.controllers.visualizeRays = false;
  input.init({
    systemsGroup: new XRSystems(),
    options,
    renderer: {
      xr: {
        getController: (index: number) => {
          spaces[index] ??= new WebXRController();
          return spaces[index].getTargetRaySpace();
        },
      },
    } as unknown as THREE.WebGLRenderer,
  });
  return {input, controller: input.controllers[0]};
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

describe('Input addon controller ownership', () => {
  it('protects built-in slots and allocates monotonically increasing addon IDs', () => {
    const {input} = createInitializedInput();
    const builtins = [...input.controllers];
    for (const source of builtins) {
      input.enableController(source);
      input.removeController(source);
    }
    expect(input.controllers).toEqual(builtins);
    const first = new THREE.Object3D() as Controller;
    const second = new THREE.Object3D() as Controller;
    input.enableController(first);
    input.enableController(second);
    const firstId = first.userData.id;
    const secondId = second.userData.id;
    input.removeController(first);
    const third = new THREE.Object3D() as Controller;
    input.enableController(third);
    expect(third.userData.id).toBeGreaterThan(secondId);
    expect(input.get(firstId)).toBeUndefined();
    for (const source of input.controllers)
      expect(input.get(source.userData.id)).toBe(source);
    expect(
      new Set(input.controllers.map((source) => source.userData.id)).size
    ).toBe(input.controllers.length);
    input.enableController(first);
    expect(first.userData.id).toBeGreaterThan(third.userData.id);
    const unmanaged = new THREE.Object3D() as Controller;
    input.controllers.push(unmanaged);
    input.enableController(unmanaged);
    input.removeController(unmanaged);
    expect(input.controllers).toContain(unmanaged);
    input.dispose();
  });

  it.each(['absent', 'silent', 'disconnected', 'both'] as const)(
    'emits terminal events exactly once with a %s disconnect hook and clears aliases by identity',
    (hook) => {
      const {input} = createInitializedInput();
      const source = new THREE.Object3D() as Controller;
      source.userData = {connected: true, selected: true};
      const data = {handedness: 'right'} as XRInputSource;
      const disconnect = vi.fn(() => {
        input.removeController(source); // A hook may reenter removal.
        if (hook === 'both')
          source.dispatchEvent({type: 'selectend', target: source, data});
        if (hook === 'both' || hook === 'disconnected')
          source.dispatchEvent({type: 'disconnected', target: source, data});
      });
      if (hook !== 'absent') Object.assign(source, {disconnect});
      input.enableController(source);
      input.leftController = source;
      const other = input.controllers[0];
      input.rightController = other;
      const end = vi.fn();
      const disconnected = vi.fn();
      const nativeEnd = vi.fn();
      const nativeDisconnected = vi.fn();
      input.bindSelectEnd(end);
      input.bindListener('disconnected', disconnected);
      source.addEventListener('selectend', nativeEnd);
      source.addEventListener('disconnected', nativeDisconnected);
      input.removeController(source);
      input.removeController(source);
      expect(end).toHaveBeenCalledOnce();
      expect(disconnected).toHaveBeenCalledOnce();
      expect(nativeEnd).toHaveBeenCalledOnce();
      expect(nativeDisconnected).toHaveBeenCalledOnce();
      expect(disconnect).toHaveBeenCalledTimes(hook === 'absent' ? 0 : 1);
      expect(input.leftController).toBeUndefined();
      expect(input.rightController).toBe(other);
      expect(source.userData).toMatchObject({
        connected: false,
        selected: false,
      });
      input.dispose();
    }
  );

  it.each(['native select', 'disconnect grace'] as const)(
    'removes native listeners and pending %s state before re-registration',
    (pending) => {
      const {input} = createInitializedInput();
      const source = new THREE.Object3D() as Controller;
      const added = vi.spyOn(source, 'addEventListener');
      input.enableController(source);
      const installed = [...added.mock.calls];
      const data = {targetRayMode: 'transient-pointer'} as XRInputSource;
      source.dispatchEvent({type: 'connected', target: source, data});
      source.dispatchEvent({type: 'selectstart', target: source, data});
      source.dispatchEvent({type: 'select', target: source, data});
      if (pending === 'disconnect grace') {
        source.dispatchEvent({type: 'selectend', target: source, data});
        source.dispatchEvent({type: 'disconnected', target: source, data});
      }
      input.removeController(source);
      for (const [type, listener] of installed)
        expect(source.hasEventListener(type, listener)).toBe(false);
      input.enableController(source);
      expect(
        input.getFrame().raySources.some((ray) => ray.controller === source)
      ).toBe(false);
      source.userData.connected = true;
      source.userData.selected = true;
      // No new native select: a stale completion must not produce a grace frame.
      source.dispatchEvent({type: 'disconnected', target: source, data});
      input.sampleSources();
      expect(
        input.getFrame().raySources.some((ray) => ray.controller === source)
      ).toBe(false);
      input.dispose();
    }
  );

  it('cancels a held slider and grab as source-lost, exits hover and releases manipulation on the next frame', async () => {
    class Slider extends UISlider {
      ends: SelectEndEvent[] = [];
      exits = 0;
      onObjectSelectEnd(event: SelectEndEvent) {
        this.ends.push(event);
        event.stopPropagation();
      }
      onHoverExit() {
        this.exits++;
      }
    }
    class Grab extends Script {
      ends: SelectEndEvent[] = [];
      phases: ManipulationEvent[] = [];
      exits = 0;
      onObjectSelectEnd(event: SelectEndEvent) {
        this.ends.push(event);
      }
      onObjectManipulate(event: ManipulationEvent) {
        this.phases.push(event);
      }
      onHoverExit() {
        this.exits++;
      }
    }
    const {input} = createInitializedInput();
    const callbacks = new ScriptsManager(async () => {});
    const scene = new THREE.Scene();
    const interaction = new Interaction({
      callbacks,
      scene,
      camera: new THREE.PerspectiveCamera(),
    });
    const onChange = vi.fn();
    const slider = new Slider({
      ariaLabel: 'Held slider',
      min: 0,
      max: 100,
      value: 20,
      onChange,
    });
    const card = new UICard({
      size: {width: 1, height: 0.4},
      children: [slider],
    });
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.2),
      new THREE.MeshBasicMaterial()
    );
    surface.position.set(-1, 0, -1);
    const grab = new Grab();
    grab.xb = {manipulation: true};
    grab.position.set(1, 0, -1);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial()
    );
    grab.add(box);
    scene.add(card, surface, grab);
    await callbacks.initScript(card);
    await callbacks.initScript(slider);
    await callbacks.initScript(grab);
    const unregister = interaction.registerHitSurface(surface, slider);
    const sources = [-1, 1].map((x) => {
      const source = new THREE.Object3D() as Controller;
      source.position.x = x;
      source.userData.connected = true;
      const disconnect = vi.fn(() =>
        source.dispatchEvent({type: 'disconnected', target: source})
      );
      Object.assign(source, {disconnect});
      input.enableController(source);
      return {source, disconnect};
    });
    const step = () => {
      scene.updateMatrixWorld(true);
      input.sampleSources();
      interaction.update(input.getFrame(), 1 / 60);
    };
    try {
      step();
      for (const {source} of sources)
        source.dispatchEvent({type: 'selectstart', target: source});
      step();
      expect(slider.value).toBeCloseTo(50);
      expect(interaction.isSelectingAt(slider)).toBe(true);
      expect(interaction.isManipulating(grab)).toBe(true);
      sources[1].source.position.x += 0.1;
      step();
      expect(grab.position.x).toBeGreaterThan(1);
      for (const {source} of sources) {
        input.removeController(source);
        input.removeController(source);
      }
      step();
      step();
      expect(slider.ends).toHaveLength(1);
      expect(grab.ends).toHaveLength(1);
      for (const target of [slider, grab]) {
        expect(target.ends[0]).toMatchObject({
          completed: false,
          reason: 'source-lost',
        });
        expect(target.exits).toBe(1);
        expect(interaction.isSelectingAt(target)).toBe(false);
        expect(interaction.isHovered(target)).toBe(false);
      }
      expect(slider.value).toBe(20);
      expect(onChange).not.toHaveBeenCalled();
      expect(interaction.isManipulating(grab)).toBe(false);
      expect(
        grab.phases.filter((event) => event.phase === 'cancel')
      ).toHaveLength(1);
      for (const {source, disconnect} of sources) {
        expect(disconnect).toHaveBeenCalledOnce();
        expect(interaction.getSourceSnapshot(source)).toBeUndefined();
      }
    } finally {
      interaction.clear();
      input.dispose();
      unregister();
      slider.dispose();
      card.dispose();
      grab.dispose();
      surface.geometry.dispose();
      surface.material.dispose();
      box.geometry.dispose();
      box.material.dispose();
    }
  });

  it('configures late reticles and unregisters sources, event forwarding and owned resources', () => {
    const input = new Input();
    input.options = new Options();
    const configure = vi.fn();
    input.setReticleConfigurer(configure);
    const selected = vi.fn();
    input.bindSelectStart(selected);
    const controller = new THREE.Object3D() as Controller;
    controller.userData.connected = true;
    input.enableController(controller);
    input.enableController(controller);
    const reticle = controller.reticle!;
    expect(configure).toHaveBeenCalledWith(reticle);
    expect(reticle.parent).toBe(input.reticles);
    expect(
      input.controllers.filter((value) => value === controller)
    ).toHaveLength(1);
    expect(
      input.getFrame().raySources.map((source) => source.controller)
    ).toContain(controller);
    controller.dispatchEvent({type: 'selectstart', target: controller});
    expect(selected).toHaveBeenCalledOnce();
    const dispose = vi.spyOn(reticle, 'dispose');
    input.removeController(controller);
    controller.dispatchEvent({type: 'selectstart', target: controller});
    expect(selected).toHaveBeenCalledOnce();
    expect(input.controllers).not.toContain(controller);
    expect(input.getFrame().raySources).toHaveLength(0);
    expect(controller.parent).toBeNull();
    expect(controller.reticle).toBeUndefined();
    expect(reticle.parent).toBeNull();
    input.removeController(controller);
    input.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('preserves borrowed reticle resources and respects disabled reticles', () => {
    const input = new Input();
    input.options = new Options();
    input.options.reticles.enabled = false;
    const plain = new THREE.Object3D() as Controller;
    input.enableController(plain);
    expect(plain.reticle).toBeUndefined();
    const borrowed = new THREE.Object3D() as Controller;
    const reticle = new Reticle();
    borrowed.reticle = reticle;
    const dispose = vi.spyOn(reticle, 'dispose');
    input.enableController(borrowed);
    input.removeController(borrowed);
    expect(borrowed.reticle).toBe(reticle);
    expect(reticle.parent).toBeNull();
    input.dispose();
    expect(dispose).not.toHaveBeenCalled();
    reticle.dispose();
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

  it('restores both simulator hands after XR sources disconnect from odd slots', () => {
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
    const placeholders = [...input.hands];
    const rightSource = {
      hand: new Map(),
      handedness: 'right',
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;
    const leftSource = {
      hand: new Map(),
      handedness: 'left',
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;
    const leftController = input.controllers[1];
    const rightController = input.controllers[3];
    rightController.dispatchEvent({type: 'connected', data: rightSource});
    leftController.dispatchEvent({type: 'connected', data: leftSource});
    expect(input.hands[0]).toBe(spaces[1].getHandSpace());
    expect(input.hands[1]).toBe(spaces[3].getHandSpace());
    leftController.dispatchEvent({type: 'disconnected', data: leftSource});
    rightController.dispatchEvent({type: 'disconnected', data: rightSource});
    expect(input.hands[0]).toBe(placeholders[0]);
    expect(input.hands[1]).toBe(placeholders[1]);

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
    input.sampleSources();
    expect(input.getFrame().directTouches).toMatchObject([
      {controller: input.controllers[0], handIndex: 0},
      {controller: input.controllers[1], handIndex: 1},
    ]);
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

describe('Input transient-pointer disconnects', () => {
  it('keeps the grace frame through reads until the second source sample', () => {
    const {input, controller} = createInitializedInput();
    controller.userData = {connected: true, selected: true};
    controller.inputSource = {targetRayMode: 'transient-pointer'};
    controller.gamepad = {
      buttons: [{value: 1, pressed: true}],
    } as unknown as Gamepad;
    controller.dispatchEvent({type: 'select', target: controller});
    controller.dispatchEvent({
      type: 'disconnected',
      target: controller,
      data: controller.inputSource,
    });

    // Debug/event code can read input before Core samples the next frame.
    expect(input.getFrame().raySources).toHaveLength(1);
    input.sampleSources();
    expect(input.getFrame().raySources).toMatchObject([
      {
        controller,
        sourceType: 'controller-ray',
        selected: false,
        released: true,
      },
    ]);
    input.sampleSources();
    expect(input.getFrame().raySources).toHaveLength(0);
    input.dispose();
  });

  it('does not complete a cancelled transient pointer when selectend precedes disconnect', () => {
    const input = new Input();
    const controller = new THREE.Object3D() as Controller;
    controller.userData = {connected: true, selected: true};
    controller.inputSource = {targetRayMode: 'transient-pointer'};
    input.controllers.push(controller);

    input.defaultOnSelectEnd({type: 'selectend', target: controller});
    input.defaultOnDisconnected({
      type: 'disconnected',
      target: controller,
      data: controller.inputSource,
    });

    expect(input.getFrame().raySources).toHaveLength(0);
  });

  it('keeps capturing native select after its public listener is unbound', () => {
    const {input, controller} = createInitializedInput();
    controller.userData = {connected: true, selected: true};
    controller.inputSource = {targetRayMode: 'transient-pointer'};
    controller.gamepad = {
      buttons: [{value: 1, pressed: true}],
    } as unknown as Gamepad;
    const selectListener = vi.fn();
    input.bindSelect(selectListener);
    input.unbindListener('select', selectListener);

    controller.dispatchEvent({type: 'select', target: controller});
    controller.dispatchEvent({type: 'selectend', target: controller});
    controller.dispatchEvent({
      type: 'disconnected',
      target: controller,
      data: controller.inputSource,
    });

    expect(input.getFrame().raySources).toMatchObject([
      {controller, selected: false, released: true},
    ]);
    input.dispose();
  });

  it('keeps a grace frame when native select then selectend precede disconnect', () => {
    const {input, controller} = createInitializedInput();
    controller.userData = {connected: true, selected: true};
    controller.inputSource = {targetRayMode: 'transient-pointer'};
    controller.gamepad = {
      buttons: [{value: 1, pressed: true}],
    } as unknown as Gamepad;

    // A native completion and release can both arrive before disconnection.
    controller.dispatchEvent({type: 'select', target: controller});
    controller.dispatchEvent({type: 'selectend', target: controller});
    controller.dispatchEvent({
      type: 'disconnected',
      target: controller,
      data: controller.inputSource,
    });

    expect(input.getFrame().raySources).toMatchObject([
      {controller, selected: false, released: true},
    ]);
    input.dispose();
  });

  it('does not retain a disconnected normal controller', () => {
    const input = new Input();
    const controller = new THREE.Object3D() as Controller;
    controller.userData = {connected: true, selected: true};
    controller.inputSource = {targetRayMode: 'tracked-pointer'};
    input.controllers.push(controller);

    input.defaultOnDisconnected({
      type: 'disconnected',
      target: controller,
      data: controller.inputSource,
    });

    expect(input.getFrame().raySources).toHaveLength(0);
  });

  it('does not retain an unselected transient pointer', () => {
    const input = new Input();
    const controller = new THREE.Object3D() as Controller;
    controller.userData = {connected: true, selected: false};
    controller.inputSource = {targetRayMode: 'transient-pointer'};
    input.controllers.push(controller);

    input.defaultOnDisconnected({
      type: 'disconnected',
      target: controller,
      data: controller.inputSource,
    });

    expect(input.getFrame().raySources).toHaveLength(0);
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

  it('forwards native select events for a controller with a partial trigger press', () => {
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
    expect(selectStartSpy).toHaveBeenCalledOnce();
  });

  it('filters native select events and synthesizes selection only for hand pinch sources', () => {
    const input = new Input();
    const mockController = new THREE.Object3D() as unknown as Controller;
    mockController.userData = {connected: true};
    mockController.gamepad = {
      buttons: [{value: 0.7, pressed: true}],
    } as unknown as Gamepad;
    mockController.inputSource = {
      hand: {} as XRHand,
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;

    const selectStartSpy = vi.fn();
    const selectSpy = vi.fn();
    const selectEndSpy = vi.fn();
    input.controllers.push(mockController);
    input.bindSelectStart(selectStartSpy);
    input.bindSelect(selectSpy);
    input.bindSelectEnd(selectEndSpy);

    mockController.dispatchEvent({type: 'selectstart', target: mockController});
    input.sampleSources();
    expect(selectStartSpy).not.toHaveBeenCalled();

    mockController.gamepad.buttons[0].value = 1;
    input.sampleSources();
    expect(selectStartSpy).toHaveBeenCalledOnce();
    expect(selectStartSpy.mock.calls[0][0]).toMatchObject({isCustom: true});

    mockController.gamepad.buttons[0].value = 0;
    input.sampleSources();
    expect(selectSpy).toHaveBeenCalledOnce();
    expect(selectEndSpy).toHaveBeenCalledOnce();
  });

  it('applies the hand pinch workaround to generic-hand-select without XRHand', () => {
    const input = new Input();
    const mockController = new THREE.Object3D() as unknown as Controller;
    mockController.userData = {connected: true};
    mockController.gamepad = {
      buttons: [{value: 0.7, pressed: true}],
    } as unknown as Gamepad;
    mockController.inputSource = {
      profiles: ['generic-hand-select'],
      targetRayMode: 'tracked-pointer',
    } as unknown as XRInputSource;

    const selectStartSpy = vi.fn();
    const selectSpy = vi.fn();
    const selectEndSpy = vi.fn();
    input.controllers.push(mockController);
    input.bindSelectStart(selectStartSpy);
    input.bindSelect(selectSpy);
    input.bindSelectEnd(selectEndSpy);

    mockController.dispatchEvent({type: 'selectstart', target: mockController});
    input.sampleSources();
    expect(selectStartSpy).not.toHaveBeenCalled();

    mockController.gamepad.buttons[0].value = 1;
    input.sampleSources();
    expect(selectStartSpy).toHaveBeenCalledOnce();
    expect(selectStartSpy.mock.calls[0][0]).toMatchObject({isCustom: true});

    mockController.gamepad.buttons[0].value = 0;
    input.sampleSources();
    expect(selectSpy).toHaveBeenCalledOnce();
    expect(selectEndSpy).toHaveBeenCalledOnce();
  });

  it('does not filter transient-pointer sources with a hand profile', () => {
    const input = new Input();
    const mockController = new THREE.Object3D() as unknown as Controller;
    mockController.userData = {connected: true};
    mockController.gamepad = {
      buttons: [{value: 1, pressed: true}],
    } as unknown as Gamepad;
    mockController.inputSource = {
      profiles: ['generic-hand-select'],
      targetRayMode: 'transient-pointer',
    } as unknown as XRInputSource;

    const selectStartSpy = vi.fn();
    input.controllers.push(mockController);
    input.bindSelectStart(selectStartSpy);

    mockController.dispatchEvent({type: 'selectstart', target: mockController});
    input.sampleSources();

    expect(selectStartSpy).toHaveBeenCalledOnce();
    expect(selectStartSpy.mock.calls[0][0]).not.toMatchObject({
      isCustom: true,
    });
  });
});

import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {Options} from '../core/Options';
import {Script, type SelectEndEvent} from '../core/Script';
import {ScriptsManager} from '../core/components/ScriptsManager';
import {XRSystems} from '../core/components/XRSystems';
import {Interaction} from '../interaction/Interaction';
import {Reticle} from '../interaction/reticle/Reticle';
import {UIButton} from '../ui/components/UIButton';
import {UISlider} from '../ui/components/UISlider';
import {UICard} from '../ui/components/UICard';
import type {ManipulationEvent} from '../interaction/manipulation/ManipulationTypes';
import {Input} from './Input';
import {Controller} from './Controller';
import {Handedness, Hands} from './Hands';

const inputs: Input[] = [];
afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose();
  vi.restoreAllMocks();
});

function createInitializedInput(hands = false) {
  const input = new Input();
  inputs.push(input);
  const spaces = Array.from({length: 4}, () => new WebXRController());
  const options = new Options();
  if (hands) options.enableHands();
  options.hands.visualization = false;
  options.controllers.visualization = false;
  options.controllers.visualizeRays = false;
  input.init({
    systemsGroup: new XRSystems(),
    options,
    renderer: {
      xr: {
        getController: (index: number) => {
          return spaces[index].getTargetRaySpace();
        },
        getHand: (index: number) => spaces[index].getHandSpace(),
      },
    } as unknown as THREE.WebGLRenderer,
  });
  return {input, controller: input.controllers[0], spaces};
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

describe('Input controller ownership', () => {
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
      const disconnect = () =>
        source.dispatchEvent({type: 'disconnected', target: source});
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
      for (const {source} of sources) {
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
    inputs.push(input);
    input.options = new Options();
    const configure = (reticle: Reticle) => reticle.setColor(0x123456);
    input.setReticleConfigurer(configure);
    const selected = vi.fn();
    input.bindSelectStart(selected);
    const controller = new THREE.Object3D() as Controller;
    controller.userData.connected = true;
    input.enableController(controller);
    input.enableController(controller);
    const reticle = controller.reticle!;
    expect(reticle.getColor().getHex()).toBe(0x123456);
    expect(reticle.parent).toBe(input.reticles);
    expect(
      input.controllers.filter((value) => value === controller)
    ).toHaveLength(1);
    expect(
      input.getFrame().raySources.map((source) => source.controller)
    ).toContain(controller);
    controller.dispatchEvent({type: 'selectstart', target: controller});
    expect(selected).toHaveBeenCalledOnce();
    let released = false;
    reticle.material.addEventListener('dispose', () => {
      released = true;
    });
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
    expect(released).toBe(true);
  });

  it('preserves borrowed reticle resources and respects disabled reticles', () => {
    const input = new Input();
    inputs.push(input);
    input.options = new Options();
    input.options.reticles.enabled = false;
    const plain = new THREE.Object3D() as Controller;
    input.enableController(plain);
    expect(plain.reticle).toBeUndefined();
    const borrowed = new THREE.Object3D() as Controller;
    const reticle = new Reticle();
    borrowed.reticle = reticle;
    let released = false;
    reticle.material.addEventListener('dispose', () => {
      released = true;
    });
    input.enableController(borrowed);
    input.removeController(borrowed);
    expect(borrowed.reticle).toBe(reticle);
    expect(reticle.parent).toBeNull();
    input.dispose();
    expect(released).toBe(false);
    reticle.dispose();
  });
});

describe('Input direct touch', () => {
  it.each(['tracked-pointer', 'screen'] as const)(
    'keeps %s selection working when enabled hands have no granted tracking data',
    async (targetRayMode) => {
      const {input} = createInitializedInput(true);
      const controller = input.controllers[0];
      controller.userData.connected = true;
      controller.inputSource = {targetRayMode};
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

  it('uses handedness after a tracked hand reconnects and a slot changes sides', () => {
    const {input, spaces} = createInitializedInput(true);
    const source = {
      handedness: 'right',
      targetRayMode: 'tracked-pointer',
      hand: new Map([
        ['index-finger-tip', {jointName: 'index-finger-tip'}],
        ['wrist', {jointName: 'wrist'}],
      ]),
    } as unknown as XRInputSource;
    spaces[0].connect(source);
    spaces[0].disconnect(source);
    spaces[2].connect({...source, handedness: 'left'});
    const hand = spaces[2].getHandSpace();
    hand.visible = true;
    const tip = hand.joints['index-finger-tip']!;
    tip.visible = true;
    tip.matrix.makeTranslation(-1, 2, -3);
    tip.matrixWorldNeedsUpdate = true;
    input.sampleSources();
    const hands = new Hands(input.hands);
    expect(hands.getIndexTip(Handedness.RIGHT)).toBeUndefined();
    expect(
      hands.getIndexTip(Handedness.LEFT)?.getWorldPosition(new THREE.Vector3())
    ).toEqual(new THREE.Vector3(-1, 2, -3));
    expect(input.leftController).toBe(input.controllers[2]);
    expect(input.rightController).toBeUndefined();
    expect(input.getFrame().directTouches[0].point).toEqual(
      new THREE.Vector3(-1, 2, -3)
    );
  });

  it.each(['hand', 'index tip'])(
    'restores controller targeting after %s tracking is lost over a touchable button',
    async (lost) => {
      const input = new Input();
      inputs.push(input);
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

describe('Input selection sources', () => {
  it.each(['screen', 'tracked-pointer', 'transient-pointer'] as const)(
    'accepts native selection from a %s source',
    (targetRayMode) => {
      const {input, controller} = createInitializedInput();
      controller.dispatchEvent({
        type: 'connected',
        target: controller,
        data: {targetRayMode, handedness: 'none'} as XRInputSource,
      });
      controller.dispatchEvent({type: 'selectstart', target: controller});
      input.sampleSources();
      expect(
        input
          .getFrame()
          .raySources.find((source) => source.controller === controller)
          ?.selected
      ).toBe(true);
      controller.dispatchEvent({type: 'selectend', target: controller});
      input.sampleSources();
      expect(
        input
          .getFrame()
          .raySources.find((source) => source.controller === controller)
          ?.selected
      ).toBe(false);
    }
  );

  it('starts and ends hand selection from the pinch strength', () => {
    const {input, controller} = createInitializedInput();
    controller.dispatchEvent({
      type: 'connected',
      target: controller,
      data: {
        targetRayMode: 'tracked-pointer',
        handedness: 'right',
        hand: new Map(),
      } as unknown as XRInputSource,
    });
    const button = {value: 0.7, pressed: true};
    controller.gamepad = {buttons: [button]} as unknown as Gamepad;
    controller.dispatchEvent({type: 'selectstart', target: controller});
    input.sampleSources();
    expect(
      input
        .getFrame()
        .raySources.find((source) => source.controller === controller)?.selected
    ).toBe(false);
    button.value = 1;
    input.sampleSources();
    expect(controller.userData.selected).toBe(true);
    button.value = 0;
    input.sampleSources();
    expect(
      input
        .getFrame()
        .raySources.find((source) => source.controller === controller)?.selected
    ).toBe(false);
  });

  it('keeps a pending click on its original target when an XR slot is reused', async () => {
    const {input, controller, spaces} = createInitializedInput();
    const source = {
      targetRayMode: 'transient-pointer',
      handedness: 'none',
    } as XRInputSource;
    spaces[0].connect(source);
    const clicks: string[] = [];
    const callbacks = new ScriptsManager(async () => {});
    const interaction = new Interaction({callbacks, scene: new THREE.Scene()});
    const buttons = ['original', 'next'].map(
      (label) =>
        new UIButton({
          label,
          onClick: () => {
            clicks.push(label);
          },
        })
    );
    const surfaces = buttons.map((button, i) => {
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial()
      );
      surface.position.set(i * 2, 0, -1);
      interaction.registerHitSurface(surface, button);
      return surface;
    });
    const step = () => {
      input.sampleSources();
      interaction.update(input.getFrame());
    };
    try {
      await Promise.all(buttons.map((button) => callbacks.initScript(button)));
      step();
      controller.dispatchEvent({type: 'selectstart', target: controller});
      step();
      controller.dispatchEvent({type: 'select', target: controller});
      spaces[0].disconnect(source);
      controller.matrix.makeTranslation(2, 0, 0);
      controller.matrixWorldNeedsUpdate = true;
      spaces[0].connect(source);
      controller.visible = true;
      controller.dispatchEvent({type: 'selectstart', target: controller});
      step();
      expect(clicks).toEqual(['original']);
      step();
      expect(interaction.isSelectingAt(buttons[1])).toBe(true);
      controller.dispatchEvent({type: 'selectend', target: controller});
      step();
      expect(clicks).toEqual(['original', 'next']);
    } finally {
      interaction.clear();
      for (const button of buttons) button.dispose();
      for (const surface of surfaces) {
        surface.geometry.dispose();
        surface.material.dispose();
      }
    }
  });

  it.each([false, true])(
    'only completes a disconnected transient pointer after native select (complete: %s)',
    async (complete) => {
      const {input, controller, spaces} = createInitializedInput();
      const source = {
        targetRayMode: 'transient-pointer',
        handedness: 'none',
      } as XRInputSource;
      spaces[0].connect(source);
      const callbacks = new ScriptsManager(async () => {});
      const interaction = new Interaction({
        callbacks,
        scene: new THREE.Scene(),
      });
      const clicked = vi.fn();
      const button = new UIButton({label: 'Send', onClick: clicked});
      await callbacks.initScript(button);
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial()
      );
      surface.position.z = -1;
      interaction.registerHitSurface(surface, button);
      const step = () => {
        input.sampleSources();
        interaction.update(input.getFrame());
      };
      try {
        step();
        controller.dispatchEvent({type: 'selectstart', target: controller});
        step();
        expect(interaction.isSelectingAt(button)).toBe(true);
        if (complete)
          controller.dispatchEvent({type: 'select', target: controller});
        controller.dispatchEvent({type: 'selectend', target: controller});
        spaces[0].disconnect(source);
        step();
        step();
        expect(clicked).toHaveBeenCalledTimes(complete ? 1 : 0);
        expect(interaction.isSelectingAt(button)).toBe(false);
      } finally {
        interaction.clear();
        button.dispose();
        surface.geometry.dispose();
        surface.material.dispose();
      }
    }
  );
});

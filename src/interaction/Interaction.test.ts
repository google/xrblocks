import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {
  type LongSelectEvent,
  type ObjectTouchStartEvent,
  Script,
  type SelectEndEvent,
  type SelectEvent,
} from '../core/Script';
import {ScriptsManager} from '../core/components/ScriptsManager';
import type {Controller} from '../input/Controller';
import {UIButton} from '../ui/components/UIButton';
import {UICard} from '../ui/components/UICard';
import {UISlider} from '../ui/components/UISlider';
import {Interaction} from './Interaction';
import type {InteractionFrameInput, RaySourceInput} from './InteractionTypes';

async function activateScripts(
  manager: ScriptsManager,
  ...scripts: Script[]
): Promise<void> {
  await Promise.all(scripts.map((script) => manager.initScript(script)));
}

class RecordingButton extends UIButton {
  starts: SelectEvent[] = [];
  ends: SelectEndEvent[] = [];
  longSelects: LongSelectEvent[] = [];
  touchStarts: ObjectTouchStartEvent[] = [];

  override onObjectSelectStart(event: SelectEvent): true {
    this.starts.push(event);
    return true;
  }

  override onObjectSelectEnd(event: SelectEndEvent): true {
    this.ends.push(event);
    return true;
  }

  override onObjectLongSelect(event: LongSelectEvent): true {
    this.longSelects.push(event);
    return true;
  }

  override onObjectTouchStart(event: ObjectTouchStartEvent): true {
    this.touchStarts.push(event);
    return true;
  }
}

const EMPTY_FRAME: InteractionFrameInput = {
  raySources: [],
  directTouches: [],
};

describe('Interaction public behavior', () => {
  let callbacks: ScriptsManager;
  let interaction: Interaction;

  beforeEach(() => {
    callbacks = new ScriptsManager(async () => {});
    interaction = new Interaction({callbacks});
  });

  it('keeps one semantic capture inside a manipulable card and cancels invalid releases', async () => {
    const clicked = vi.fn();
    const card = new UICard({
      size: {width: 0.5, height: 0.3},
      manipulation: true,
    });
    const button = new RecordingButton({label: 'Save', onClick: clicked});
    card.add(button);
    new THREE.Scene().add(card);
    await activateScripts(callbacks, card, button);
    const primary = controller(0);
    const unrelated = controller(1);

    updateRays(interaction, [
      ray(primary, false, hit(button)),
      ray(unrelated, false),
    ]);
    updateRays(interaction, [
      ray(primary, true, hit(button)),
      ray(unrelated, false),
    ]);
    updateRays(interaction, [
      ray(primary, true, hit(button)),
      ray(unrelated, true),
    ]);
    updateRays(interaction, [
      ray(primary, true, hit(button)),
      ray(unrelated, false),
    ]);
    expect(interaction.isSelectingAt(button)).toBe(true);

    updateRays(interaction, [ray(primary, false)]);
    expect(clicked).not.toHaveBeenCalled();
    expect(button.ends.at(-1)).toMatchObject({
      completed: false,
      reason: 'released-outside',
    });
    updateRays(interaction, [ray(primary, true, hit(button))]);
    interaction.update(EMPTY_FRAME);
    expect(button.ends.at(-1)).toMatchObject({
      completed: false,
      reason: 'source-lost',
    });
    expect(clicked).not.toHaveBeenCalled();

    updateRays(interaction, [ray(primary, false, hit(button))]);
    updateRays(interaction, [ray(primary, true, hit(button))]);
    updateRays(interaction, [ray(primary, false, hit(button))]);
    expect(clicked).toHaveBeenCalledOnce();
    expect(button.ends.at(-1)?.completed).toBe(true);
  });

  it('owns raycast policy and includes registered detached surfaces', () => {
    const scene = new THREE.Scene();
    const publicSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    publicSurface.position.z = -2;
    scene.add(publicSurface);
    scene.updateMatrixWorld(true);

    interaction = new Interaction({
      callbacks,
      scene,
      raycastMode: 'select',
    });
    const logical = new RecordingButton({label: 'Detached'});
    const physical = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    physical.position.z = -1;
    interaction.registerHitSurface(physical, logical);
    const source = controller(0);

    updateRays(interaction, [ray(source, false)]);
    expect(interaction.getResolvedRay(source)).toBeUndefined();

    updateRays(interaction, [ray(source, true)]);
    expect(interaction.getResolvedRay(source)?.surface).toBe(logical);

    updateRays(interaction, [ray(source, false)]);
    expect(interaction.getResolvedRay(source)?.surface).toBe(logical);

    updateRays(interaction, [ray(source, false)]);
    expect(interaction.getResolvedRay(source)).toBeUndefined();

    updateRays(interaction, [ray(source, false, undefined, 'gaze')]);
    expect(interaction.getResolvedRay(source)?.surface).toBe(logical);
  });

  it('dispatches touch first, honors prevention, suspends the ray, and activates once on contact', async () => {
    const clicked = vi.fn();
    const button = new RecordingButton({label: 'Touch', onClick: clicked});
    button.onObjectTouchStart = (event) => {
      event.preventDefault();
      button.touchStarts.push(event);
      return true;
    };
    const physical = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const unregister = interaction.registerHitSurface(physical, button);
    await activateScripts(callbacks, button);
    const hand = controller(0);
    const touch = {
      controller: hand,
      handIndex: 0,
      hand: new THREE.Object3D(),
      point: new THREE.Vector3(),
      selected: false,
    };

    interaction.update({
      raySources: [ray(hand, true, hit(button))],
      directTouches: [touch],
    });
    expect(button.touchStarts).toHaveLength(1);
    expect(button.starts).toHaveLength(0);
    expect(interaction.getResolvedRay(hand)).toBeUndefined();

    interaction.update({
      raySources: [ray(hand, true, hit(button))],
      directTouches: [{...touch, point: new THREE.Vector3(2, 0, 0)}],
    });
    interaction.update({
      raySources: [ray(hand, false, hit(button))],
      directTouches: [],
    });
    expect(clicked).not.toHaveBeenCalled();

    unregister();
    const acceptedClick = vi.fn();
    const accepted = new RecordingButton({
      label: 'Accepted touch',
      onClick: acceptedClick,
    });
    const acceptedPhysical = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    interaction.registerHitSurface(acceptedPhysical, accepted);
    await activateScripts(callbacks, button, accepted);
    interaction.update({
      raySources: [ray(hand, false)],
      directTouches: [touch],
    });
    expect(acceptedClick).toHaveBeenCalledOnce();
    expect(accepted.ends.at(-1)).toMatchObject({
      completed: true,
      reason: 'released',
    });
    interaction.update({
      raySources: [ray(hand, false)],
      directTouches: [{...touch, point: new THREE.Vector3(2, 0, 0)}],
    });
    expect(acceptedClick).toHaveBeenCalledOnce();
    expect(accepted.ends.at(-1)?.source.type).toBe('direct-touch');
  });

  it('jumps and streams a slider, commits once, and restores on cancellation', async () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const slider = new UISlider({ariaLabel: 'Volume', onInput, onChange});
    await activateScripts(callbacks, slider);
    const source = controller(0);
    const second = controller(1);

    updateRays(interaction, [ray(source, false, hit(slider, 1, 0.25))]);
    updateRays(interaction, [ray(source, true, hit(slider, 1, 0.75))]);
    updateRays(interaction, [
      ray(source, true, hit(slider, 1, 0.75)),
      ray(second, true, hit(slider, 1, 0.1)),
    ]);
    updateRays(interaction, [
      ray(source, true, hit(slider, 1, 1)),
      ray(second, false, hit(slider, 1, 0.1)),
    ]);
    updateRays(interaction, [ray(source, false, hit(slider, 1, 1))]);

    expect(slider.value).toBe(1);
    expect(onInput.mock.calls.map(([value]) => value)).toEqual([0.75, 1]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);

    updateRays(interaction, [ray(source, true, hit(slider, 1, 0.5))]);
    expect(slider.value).toBe(0.5);
    slider.disabled = true;
    updateRays(interaction, [ray(source, true, hit(slider, 1, 0.5))]);
    expect(slider.value).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('limits gaze to buttons and makes long-select suppress normal click', async () => {
    const gazeClick = vi.fn();
    const gazeButton = new RecordingButton({
      label: 'Gaze',
      onClick: gazeClick,
    });
    const gaze = controller(2);
    updateRays(interaction, [ray(gaze, false, hit(gazeButton), 'gaze')], 0);
    updateRays(interaction, [ray(gaze, false, hit(gazeButton), 'gaze')], 2);
    expect(gazeClick).toHaveBeenCalledOnce();
    updateRays(interaction, [ray(gaze, false, hit(gazeButton), 'gaze')], 2);
    expect(gazeClick).toHaveBeenCalledOnce();

    const longClick = vi.fn();
    const longButton = new RecordingButton({
      label: 'Hold',
      onClick: longClick,
    });
    await activateScripts(callbacks, gazeButton, longButton);
    const pointer = controller(0);
    updateRays(interaction, [ray(pointer, false, hit(longButton))]);
    updateRays(interaction, [ray(pointer, true, hit(longButton))], 0);
    updateRays(interaction, [ray(pointer, true, hit(longButton))], 0.8);
    updateRays(interaction, [ray(pointer, false, hit(longButton))]);

    expect(longButton.longSelects).toHaveLength(1);
    expect(longClick).not.toHaveBeenCalled();
  });

  it('translates from an edge and scales without corner matching', async () => {
    const scene = new THREE.Scene();
    const card = new UICard({
      size: {width: 0.5, height: 0.3},
      manipulation: true,
      edge: true,
    });
    scene.add(card);
    const edge = new THREE.Object3D();
    const surface = new THREE.Object3D();
    edge.xb = {manipulationHandle: {action: 'translate'}};
    interaction.registerHitSurface(edge, card);
    interaction.registerHitSurface(surface, card);
    await activateScripts(callbacks, card);
    const first = controller(0);
    const second = controller(1);

    updateRays(interaction, [ray(first, false, hit(surface))]);
    updateRays(interaction, [ray(first, true, hit(surface))]);
    expect(interaction.isManipulating(card)).toBe(false);
    updateRays(interaction, [ray(first, false, hit(surface))]);

    updateRays(interaction, [ray(first, true, hit(edge, 1, 0.1, 0.1))]);
    updateRays(interaction, [
      ray(
        first,
        true,
        hit(edge, 1, 0.1, 0.1),
        'controller-ray',
        new THREE.Vector3(1, 0, 0)
      ),
    ]);
    expect(card.position.x).not.toBe(0);

    updateRays(interaction, [
      ray(first, true, hit(edge, 1, 0.1, 0.1)),
      ray(second, true, hit(edge, 1, 0.1, 0.1)),
    ]);
    updateRays(interaction, [
      ray(first, true, hit(edge, 1, 0.1, 0.1)),
      ray(
        second,
        true,
        hit(edge, 1, 0.1, 0.1),
        'controller-ray',
        new THREE.Vector3(2, 0, 0)
      ),
    ]);
    expect(card.scale.x).not.toBe(1);
  });
});

function controller(id: number): Controller {
  const value = new THREE.Object3D() as Controller;
  value.userData = {id, connected: true, selected: false};
  return value;
}

function hit(
  object: THREE.Object3D,
  distance = 1,
  u = 0.5,
  v = 0.5
): THREE.Intersection {
  return {
    distance,
    object,
    point: new THREE.Vector3(0, 0, -distance),
    uv: new THREE.Vector2(u, v),
  };
}

function ray(
  source: Controller,
  selected: boolean,
  intersection?: THREE.Intersection,
  sourceType: RaySourceInput['sourceType'] = 'controller-ray',
  position = new THREE.Vector3()
): RaySourceInput {
  source.userData.selected = selected;
  return {
    controller: source,
    sourceType,
    selected,
    ray: new THREE.Ray(position, new THREE.Vector3(0, 0, -1)),
    ...(intersection ? {intersections: [intersection]} : {}),
    position,
    orientation: new THREE.Quaternion(),
  };
}

function updateRays(
  interaction: Interaction,
  raySources: RaySourceInput[],
  delta = 0
): void {
  interaction.update({raySources, directTouches: []}, delta);
}

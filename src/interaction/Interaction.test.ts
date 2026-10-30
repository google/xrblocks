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
import {Input} from '../input/Input';
import {UIButton} from '../ui/components/UIButton';
import {UICard} from '../ui/components/UICard';
import {UISlider} from '../ui/components/UISlider';
import {UIToggle} from '../ui/components/UIToggle';
import {Interaction} from './Interaction';
import type {InteractionFrameInput, RaySourceInput} from './InteractionTypes';
import type {
  ManipulationEvent,
  ManipulationOptions,
  TranslateOptions,
} from './manipulation/ManipulationTypes';

async function activateScripts(
  manager: ScriptsManager,
  ...scripts: Script[]
): Promise<void> {
  await Promise.all(scripts.map((script) => manager.initScript(script)));
}

class RecordingButton extends UIButton {
  starts: SelectEvent[] = [];
  selecting: SelectEvent[] = [];
  ends: SelectEndEvent[] = [];
  longSelects: LongSelectEvent[] = [];
  touchStarts: ObjectTouchStartEvent[] = [];

  override onObjectSelectStart(event: SelectEvent): void {
    this.starts.push(event);
    event.stopPropagation();
  }

  override onObjectSelectEnd(event: SelectEndEvent): void {
    this.ends.push(event);
    event.stopPropagation();
  }

  override onSelecting(event: SelectEvent): void {
    this.selecting.push(event);
  }

  override onObjectLongSelect(event: LongSelectEvent): void {
    this.longSelects.push(event);
    event.stopPropagation();
  }

  override onObjectTouchStart(event: ObjectTouchStartEvent): void {
    this.touchStarts.push(event);
    event.stopPropagation();
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

  it.each(['controller-ray', 'hand-ray', 'mouse'] as const)(
    'preserves %s for explicit zoom while wheel scaling reports simulator',
    async (sourceType) => {
      const events: ManipulationEvent[] = [];
      class Card extends UICard {
        onObjectManipulate(event: ManipulationEvent) {
          events.push(event);
        }
      }
      const card = new Card({size: {width: 1, height: 1}, manipulation: true});
      new THREE.Scene().add(card);
      await activateScripts(callbacks, card);
      const source = controller(7);
      source.inputSource = {handedness: 'left'};
      interaction.queueScaleIntent(source, 1.5);
      updateRays(interaction, [ray(source, false, hit(card), sourceType)]);
      expect(events.map((event) => event.phase)).toEqual([
        'start',
        'update',
        'end',
      ]);
      for (const event of events) {
        expect(event.source).toMatchObject({
          type: sourceType,
          handedness: 'left',
          controller: source,
        });
        expect(event.sources).toEqual([event.source]);
      }
      events.length = 0;
      interaction.queueWheelIntent(source, -100);
      updateRays(interaction, [ray(source, false, hit(card), sourceType)]);
      expect(events.map((event) => event.source.type)).toEqual([
        'simulator',
        'simulator',
        'simulator',
      ]);
      expect(interaction.getSourceSnapshot(source)?.source.type).toBe(
        sourceType
      );
      interaction.clear();
      card.dispose();
    }
  );

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

  it('dispatches selectionend on the controller when UI stops global propagation', async () => {
    const globalEnds = vi.fn();
    class GlobalListener extends Script {
      override onSelectEnd(event: SelectEndEvent): void {
        globalEnds(event);
      }
    }
    const button = new UIButton({label: 'Save'});
    await activateScripts(callbacks, button, new GlobalListener());
    const source = controller(0);
    const ends: Array<{completed: boolean; reason: string}> = [];
    source.addEventListener('selectionend', ({completed, reason}) =>
      ends.push({completed, reason})
    );

    updateRays(interaction, [ray(source, false, hit(button))]);
    updateRays(interaction, [ray(source, true, hit(button))]);
    updateRays(interaction, [ray(source, false, hit(button))]);
    updateRays(interaction, [ray(source, true, hit(button))]);
    updateRays(interaction, [ray(source, false)]);
    updateRays(interaction, [ray(source, true, hit(button))]);
    interaction.update(EMPTY_FRAME);

    expect(globalEnds).not.toHaveBeenCalled();
    expect(ends).toEqual([
      {completed: true, reason: 'released'},
      {completed: false, reason: 'released-outside'},
      {completed: false, reason: 'source-lost'},
    ]);
  });

  it('ends a normal controller selection as source-lost when it disappears', async () => {
    const button = new RecordingButton({label: 'Normal controller'});
    await activateScripts(callbacks, button);
    const source = controller(0);
    source.inputSource = {targetRayMode: 'tracked-pointer'};
    const input = new Input();
    input.controllers.push(source);

    const initialFrame = input.getFrame();
    initialFrame.raySources[0].intersections = [hit(button)];
    interaction.update(initialFrame);
    input.defaultOnSelectStart({type: 'selectstart', target: source});
    const selectedFrame = input.getFrame();
    selectedFrame.raySources[0].intersections = [hit(button)];
    interaction.update(selectedFrame);
    input.defaultOnDisconnected({
      type: 'disconnected',
      target: source,
      data: source.inputSource,
    });
    interaction.update(input.getFrame());

    expect(button.ends.at(-1)).toMatchObject({
      completed: false,
      reason: 'source-lost',
    });
  });

  it('completes a transient-pointer button click on its disconnect grace frame', async () => {
    const clicked = vi.fn();
    const button = new RecordingButton({
      label: 'Transient pointer',
      onClick: clicked,
    });
    await activateScripts(callbacks, button);
    const source = controller(0);
    source.inputSource = {targetRayMode: 'transient-pointer'};
    const input = new Input();
    input.controllers.push(source);

    const initialFrame = input.getFrame();
    initialFrame.raySources[0].intersections = [hit(button)];
    interaction.update(initialFrame);
    input.defaultOnSelectStart({type: 'selectstart', target: source});
    const selectedFrame = input.getFrame();
    selectedFrame.raySources[0].intersections = [hit(button)];
    interaction.update(selectedFrame);

    input.bindSelect(vi.fn());
    source.dispatchEvent({type: 'select', target: source});
    input.defaultOnDisconnected({
      type: 'disconnected',
      target: source,
      data: source.inputSource,
    });
    input.sampleSources();
    const graceFrame = input.getFrame();
    expect(graceFrame.raySources[0].selected).toBe(false);
    graceFrame.raySources[0].intersections = [hit(button)];
    interaction.update(graceFrame);

    expect(clicked).toHaveBeenCalledOnce();
    expect(button.ends.at(-1)).toMatchObject({
      completed: true,
      reason: 'released',
    });

    input.sampleSources();
    interaction.update(input.getFrame());
    expect(button.ends).toHaveLength(1);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('ends a cancelled transient-pointer selection as source-lost', async () => {
    const clicked = vi.fn();
    const button = new RecordingButton({
      label: 'Cancelled pinch',
      onClick: clicked,
    });
    await activateScripts(callbacks, button);
    const source = controller(0);
    source.inputSource = {targetRayMode: 'transient-pointer'};
    const input = new Input();
    input.controllers.push(source);

    const initialFrame = input.getFrame();
    initialFrame.raySources[0].intersections = [hit(button)];
    interaction.update(initialFrame);
    input.defaultOnSelectStart({type: 'selectstart', target: source});
    const selectedFrame = input.getFrame();
    selectedFrame.raySources[0].intersections = [hit(button)];
    interaction.update(selectedFrame);

    input.defaultOnSelectEnd({type: 'selectend', target: source});
    input.defaultOnDisconnected({
      type: 'disconnected',
      target: source,
      data: source.inputSource,
    });
    interaction.update(input.getFrame());

    expect(clicked).not.toHaveBeenCalled();
    expect(button.ends.at(-1)).toMatchObject({
      completed: false,
      reason: 'source-lost',
    });
  });

  it('uses the disconnected pose and target before a reused slot starts a new pinch', async () => {
    const clickedA = vi.fn();
    const clickedB = vi.fn();
    const buttonA = new RecordingButton({label: 'A', onClick: clickedA});
    const buttonB = new RecordingButton({label: 'B', onClick: clickedB});
    await activateScripts(callbacks, buttonA, buttonB);
    const source = controller(0);
    source.inputSource = {targetRayMode: 'transient-pointer'};
    source.userData.lastIntersection = hit(buttonA);
    const input = new Input();
    input.controllers.push(source);

    interaction.update(input.getFrame());
    input.defaultOnSelectStart({type: 'selectstart', target: source});
    interaction.update(input.getFrame());

    input.bindSelect(vi.fn());
    source.dispatchEvent({type: 'select', target: source});
    input.defaultOnDisconnected({
      type: 'disconnected',
      target: source,
      data: source.inputSource,
    });
    source.position.set(2, 0, 0);
    source.userData.lastIntersection = hit(buttonB);
    input.defaultOnConnected({
      type: 'connected',
      target: source,
      data: {targetRayMode: 'transient-pointer'},
    });
    input.defaultOnSelectStart({type: 'selectstart', target: source});

    input.sampleSources();
    const graceFrame = input.getFrame();
    expect(graceFrame.raySources[0]).toMatchObject({
      selected: false,
      position: {x: 0, y: 0, z: 0},
      intersections: [{object: buttonA}],
    });
    interaction.update(graceFrame);

    expect(clickedA).toHaveBeenCalledOnce();
    expect(buttonA.ends).toHaveLength(1);
    expect(clickedB).not.toHaveBeenCalled();
    expect(buttonB.starts).toHaveLength(0);

    input.sampleSources();
    const nextFrame = input.getFrame();
    expect(nextFrame.raySources[0]).toMatchObject({
      selected: true,
      position: {x: 2, y: 0, z: 0},
      intersections: [{object: buttonB}],
    });
    interaction.update(nextFrame);

    expect(buttonB.starts).toHaveLength(1);
    expect(buttonB.ends).toHaveLength(0);
    expect(clickedA).toHaveBeenCalledOnce();
    expect(clickedB).not.toHaveBeenCalled();
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

  it('keeps selection active for the full direct-touch contact', async () => {
    const clicked = vi.fn();
    const button = new RecordingButton({label: 'Touch', onClick: clicked});
    button.onObjectTouchStart = (event) => {
      event.preventDefault();
      button.touchStarts.push(event);
      event.stopPropagation();
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
    expect(accepted.touchStarts).toHaveLength(1);
    expect(accepted.starts).toHaveLength(1);
    expect(accepted.ends).toHaveLength(0);
    expect(acceptedClick).not.toHaveBeenCalled();
    expect(interaction.isSelectingAt(accepted)).toBe(true);
    expect(accepted.selecting).toHaveLength(1);
    expect(accepted.selecting[0].source.type).toBe('direct-touch');

    interaction.update({
      raySources: [ray(hand, false)],
      directTouches: [touch],
    });
    expect(accepted.selecting).toHaveLength(2);
    expect(accepted.ends).toHaveLength(0);

    interaction.update({
      raySources: [ray(hand, false)],
      directTouches: [{...touch, point: new THREE.Vector3(2, 0, 0)}],
    });
    expect(acceptedClick).toHaveBeenCalledOnce();
    expect(accepted.ends.at(-1)).toMatchObject({
      completed: true,
      reason: 'released',
      source: {type: 'direct-touch'},
    });
    expect(interaction.isSelectingAt(accepted)).toBe(false);
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

  it('toggles once per completed press without global selection callbacks', async () => {
    const globalCalls = vi.fn();
    class GlobalListener extends Script {
      override onSelectStart(): void {
        globalCalls('start');
      }
      override onSelect(): void {
        globalCalls('select');
      }
      override onSelectEnd(): void {
        globalCalls('end');
      }
    }
    const ancestorCalls = vi.fn();
    class RecordingCard extends UICard {
      override onObjectSelectStart(): void {
        ancestorCalls('start');
      }
      override onObjectSelectEnd(): void {
        ancestorCalls('end');
      }
    }
    const onChange = vi.fn();
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi', onChange});
    const card = new RecordingCard({
      size: {width: 0.5, height: 0.3},
      children: [toggle],
    });
    await activateScripts(callbacks, card, toggle, new GlobalListener());
    const source = controller(0);

    updateRays(interaction, [ray(source, false, hit(toggle))]);
    updateRays(interaction, [ray(source, true, hit(toggle))]);
    updateRays(interaction, [ray(source, true, hit(toggle))]);
    expect(toggle.checked).toBe(false);
    updateRays(interaction, [ray(source, false, hit(toggle))]);
    expect(toggle.checked).toBe(true);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);

    updateRays(interaction, [ray(source, true, hit(toggle))]);
    updateRays(interaction, [ray(source, false, hit(toggle))]);
    expect(toggle.checked).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    expect(globalCalls).not.toHaveBeenCalled();
    expect(ancestorCalls).not.toHaveBeenCalled();
  });

  it('leaves a toggle unchanged when released outside or disabled', async () => {
    const onChange = vi.fn();
    const toggle = new UIToggle({ariaLabel: 'Wi-Fi', onChange});
    await activateScripts(callbacks, toggle);
    const source = controller(0);
    const ends: Array<{completed: boolean; reason: string}> = [];
    source.addEventListener('selectionend', ({completed, reason}) =>
      ends.push({completed, reason})
    );

    updateRays(interaction, [ray(source, false, hit(toggle))]);
    updateRays(interaction, [ray(source, true, hit(toggle))]);
    updateRays(interaction, [ray(source, false)]);
    expect(ends.at(-1)).toEqual({completed: false, reason: 'released-outside'});

    toggle.disabled = true;
    updateRays(interaction, [ray(source, true, hit(toggle))]);
    updateRays(interaction, [ray(source, false, hit(toggle))]);

    toggle.disabled = false;
    updateRays(interaction, [ray(source, true, hit(toggle))]);
    toggle.disabled = true;
    updateRays(interaction, [ray(source, true, hit(toggle))]);
    expect(ends.at(-1)).toEqual({completed: false, reason: 'disabled'});
    toggle.disabled = false;
    updateRays(interaction, [ray(source, false, hit(toggle))]);
    expect(toggle.checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();

    updateRays(interaction, [ray(source, true, hit(toggle))]);
    updateRays(interaction, [ray(source, false, hit(toggle))]);
    expect(toggle.checked).toBe(true);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('toggles from a completed gaze dwell like a button', async () => {
    const onChange = vi.fn();
    const toggle = new UIToggle({ariaLabel: 'Captions', onChange});
    await activateScripts(callbacks, toggle);
    const gaze = controller(2);

    updateRays(interaction, [ray(gaze, false, hit(toggle), 'gaze')], 0);
    updateRays(interaction, [ray(gaze, false, hit(toggle), 'gaze')], 2);

    expect(toggle.checked).toBe(true);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
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

  it('resizes a card from a corner handle and reports resize events', async () => {
    const scene = new THREE.Scene();
    const events: ManipulationEvent[] = [];
    class RecordingCard extends UICard {
      override onObjectManipulate(event: ManipulationEvent): void {
        events.push(event);
      }
    }
    const card = new RecordingCard({
      size: {width: 0.4, height: 0.2},
      manipulation: true,
      edge: true,
    });
    scene.add(card);
    const corner = new THREE.Object3D();
    corner.xb = {manipulationHandle: {action: 'resize'}};
    interaction.registerHitSurface(corner, card);
    await activateScripts(callbacks, card);
    const source = controller(0);
    const grab = (x: number, y: number) => ({
      distance: 1,
      object: corner,
      point: new THREE.Vector3(x, y, 0),
    });
    const aim = (selected: boolean, x: number, y: number) => ({
      ...ray(source, selected, grab(x, y), 'controller-ray'),
      ray: new THREE.Ray(
        new THREE.Vector3(x, y, 1),
        new THREE.Vector3(0, 0, -1)
      ),
    });

    updateRays(interaction, [aim(false, 0.2, 0.1)]);
    updateRays(interaction, [aim(true, 0.2, 0.1)]);
    expect(interaction.isManipulating(card)).toBe(true);
    updateRays(interaction, [aim(true, 0.25, 0.12)]);

    expect(card.size.width).toBeCloseTo(0.5);
    expect(card.size.height).toBeCloseTo(0.24);
    expect(card.position.toArray()).toEqual([0, 0, 0]);
    const update = events.findLast((event) => event.phase === 'update');
    expect(update?.action).toBe('resize');
    expect(update?.action === 'resize' && update.width).toBeCloseTo(0.5);

    updateRays(interaction, [aim(false, 0.25, 0.12)]);
    expect(interaction.isManipulating(card)).toBe(false);
    expect(events.at(-1)?.phase).toBe('end');
  });

  it('resizes a card from a corner pinched by a tracked hand', async () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      manipulation: true,
      edge: true,
    });
    new THREE.Scene().add(card);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1));
    edge.xb = {manipulationHandle: {action: 'translate'}};
    const corner = new THREE.Object3D();
    corner.xb = {manipulationHandle: {action: 'resize'}};
    interaction.registerHitSurface(edge, card, {
      touchTarget: (point) => (point.x > 0.15 ? corner : undefined),
    });
    interaction.registerHitSurface(corner, card);
    await activateScripts(callbacks, card);
    const hand = controller(0);
    const touch = (selected: boolean, x: number, y: number) => ({
      controller: hand,
      handIndex: 0,
      hand: new THREE.Object3D(),
      point: new THREE.Vector3(x, y, 0),
      selected,
    });

    interaction.update({
      raySources: [],
      directTouches: [touch(false, 0.2, 0.1)],
    });
    interaction.update({
      raySources: [],
      directTouches: [touch(true, 0.2, 0.1)],
    });
    expect(interaction.isManipulating(card)).toBe(true);
    interaction.update({
      raySources: [],
      directTouches: [touch(true, 0.25, 0.12)],
    });

    expect(card.size.width).toBeCloseTo(0.5);
    expect(card.size.height).toBeCloseTo(0.24);
    expect(card.position.toArray()).toEqual([0, 0, 0]);
  });

  it('ignores corner handles when resize is disabled', async () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      manipulation: {actions: {translate: true}},
      edge: true,
    });
    new THREE.Scene().add(card);
    const corner = new THREE.Object3D();
    corner.xb = {manipulationHandle: {action: 'resize'}};
    interaction.registerHitSurface(corner, card);
    await activateScripts(callbacks, card);
    const source = controller(0);

    updateRays(interaction, [ray(source, false, hit(corner))]);
    updateRays(interaction, [ray(source, true, hit(corner))]);
    expect(interaction.isManipulating(card)).toBe(false);
  });

  it('enables corner resize and distance scaling for default card manipulation', () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      manipulation: true,
    });
    expect(card.manipulation).toMatchObject({
      actions: {
        translate: {faceCamera: true, scaleWithDistance: true},
        resize: true,
      },
    });
    card.manipulation = {actions: {translate: {mode: 'spherical'}, resize: {}}};
    const translate = (card.manipulation as ManipulationOptions).actions
      ?.translate as TranslateOptions;
    // An app's own translate options get no Android XR move defaults.
    expect(translate).toEqual({faceCamera: true, mode: 'spherical'});
  });

  it('accepts an edge that only resizes', () => {
    const card = new UICard({
      size: {width: 0.4, height: 0.2},
      manipulation: {actions: {resize: true}},
      edge: true,
    });
    expect(card.edge).toBeTruthy();
    expect(
      () =>
        new UICard({
          size: {width: 0.4, height: 0.2},
          manipulation: {actions: {scale: true}},
          edge: true,
        })
    ).toThrow('UICard edge requires Translate or Resize manipulation.');
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

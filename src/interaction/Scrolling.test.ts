import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';
import {ScriptsManager} from '../core/components/ScriptsManager';
import type {Controller} from '../input/Controller';
import {UIButton} from '../ui/components/UIButton';
import {UICard} from '../ui/components/UICard';
import {UIScrollView} from '../ui/components/UIScrollView';
import {getUIPresentationObject} from '../ui/UIElement';
import {createUIBackend} from '../ui/internal/UIKitBackend';
import {ui} from '../ui/UI';
import {Interaction} from './Interaction';

async function setup() {
  const click = vi.fn();
  const buttons = Array.from(
    {length: 3},
    (_, i) =>
      new UIButton({
        label: `Item ${i}`,
        style: {height: 80, flexShrink: 0},
        onClick: click,
      })
  );
  const view = new UIScrollView({
    style: {width: 200, height: 100, flexShrink: 0},
    children: buttons,
  });
  const card = new UICard({
    size: {width: 0.6, height: 0.6},
    style: {padding: 0},
    manipulation: true,
    children: [view],
  });
  const scene = new THREE.Scene();
  scene.add(card);
  const callbacks = new ScriptsManager(async () => {});
  await Promise.all(
    [card, view, ...buttons].map((script) => callbacks.initScript(script))
  );
  const interaction = new Interaction({
    callbacks,
    scene,
    camera: new THREE.PerspectiveCamera(),
  });
  const backend = createUIBackend();
  const mount = backend.createMount(card);
  mount.object.userData.xrblocksPrivate = true;
  scene.add(mount.object);
  const mappings = mount.commit(ui.theme, {width: 800, height: 600}, 0)!;
  for (const mapping of mappings)
    interaction.registerHitSurface(
      mapping.physical,
      mapping.logical,
      mapping.options
    );
  await vi.waitFor(() => {
    mount.update(0.016);
    expect(view.ready).toBe(true);
  });
  const source = new THREE.Object3D() as Controller;
  source.userData = {id: 0, connected: true, selected: false};
  const point = getUIPresentationObject(buttons[0])!.getWorldPosition(
    new THREE.Vector3()
  );
  const frame = (position: THREE.Vector3, selected: boolean) => {
    interaction.update(
      {
        raySources: [
          {
            controller: source,
            sourceType: 'mouse',
            ray: new THREE.Ray(
              position.clone().add(new THREE.Vector3(0, 0, 1)),
              new THREE.Vector3(0, 0, -1)
            ),
            selected,
          },
        ],
        directTouches: [],
      },
      0.016
    );
  };
  const touch = (position: THREE.Vector3) => {
    interaction.update(
      {
        raySources: [],
        directTouches: [
          {controller: source, handIndex: 0, point: position, selected: false},
        ],
      },
      0.016
    );
  };
  return {
    click,
    buttons,
    view,
    card,
    interaction,
    source,
    point,
    frame,
    touch,
    dispose() {
      interaction.clear();
      mount.dispose();
      backend.dispose();
    },
  };
}

describe('Scrolling through the shared interaction pipeline', () => {
  it('keeps taps clickable but cancels a button once its parent owns a drag', async () => {
    const s = await setup();
    s.frame(s.point, false);
    s.frame(s.point, true);
    s.frame(s.point, false);
    expect(s.click).toHaveBeenCalledOnce();
    s.click.mockClear();
    s.frame(s.point, true);
    const moved = s.point.clone().add(new THREE.Vector3(0, 0.03, 0));
    s.frame(moved, true);
    expect(s.view.scrollTop).toBeGreaterThan(0);
    expect(s.interaction.isSelectingAt(s.view)).toBe(true);
    expect(s.interaction.isSelectingAt(s.buttons[0])).toBe(false);
    s.frame(moved, false);
    expect(s.click).not.toHaveBeenCalled();
    s.dispose();
  });

  it('contains wheel gestures at UI boundaries rather than scaling the card', async () => {
    const s = await setup();
    const scale = s.card.scale.clone();
    s.frame(s.point, false);
    s.interaction.queueWheelIntent(s.source, 1000);
    s.frame(s.point, false);
    expect(s.view.scrollTop).toBe(s.view.maxScrollTop);
    s.interaction.queueWheelIntent(s.source, 1000);
    s.frame(s.point, false);
    expect(s.card.scale.equals(scale)).toBe(true);
    const background = new THREE.Vector3(0.25, 0, 0);
    s.interaction.queueWheelIntent(s.source, -100);
    s.frame(background, false);
    expect(s.card.scale.x).toBeGreaterThan(scale.x);
    s.dispose();
  });

  it('keeps direct scrolling captured while content moves beneath the finger', async () => {
    const s = await setup();
    s.touch(s.point);
    s.touch(s.point.clone().add(new THREE.Vector3(0, 0.015, 0)));
    const firstOffset = s.view.scrollTop;
    expect(firstOffset).toBeGreaterThan(0);
    s.touch(s.point.clone().add(new THREE.Vector3(0, 0.03, 0)));
    expect(s.view.scrollTop).toBeGreaterThan(firstOffset);
    s.touch(s.point.clone().add(new THREE.Vector3(0, 0.03, 1)));
    expect(s.click).not.toHaveBeenCalled();
    expect(s.interaction.isSelectingAt(s.view)).toBe(false);
    s.dispose();
  });

  it('jumps on the scrollbar track and drags the thumb in the scroll direction', async () => {
    const s = await setup();
    const physical = getUIPresentationObject(s.view)!;
    const track = physical.localToWorld(new THREE.Vector3(0.48, -0.35, 0));
    s.frame(track, false);
    s.frame(track, true);
    expect(s.view.scrollTop).toBe(s.view.maxScrollTop);
    const above = track.clone().add(new THREE.Vector3(0, 0.02, 0));
    s.frame(above, true);
    expect(s.view.scrollTop).toBeLessThan(s.view.maxScrollTop);
    expect(s.view.scrollTop).toBeGreaterThan(0);
    s.frame(above, false);
    expect(s.click).not.toHaveBeenCalled();
    s.dispose();
  });

  it('releases an interrupted gesture without a click or a stuck exclusive owner', async () => {
    const s = await setup();
    s.frame(s.point, false);
    s.frame(s.point, true);
    s.frame(s.point.clone().add(new THREE.Vector3(0, 0.02, 0)), true);
    expect(s.interaction.isSelectingAt(s.view)).toBe(true);
    s.interaction.update({raySources: [], directTouches: []});
    expect(s.interaction.isSelectingAt(s.view)).toBe(false);
    expect(s.click).not.toHaveBeenCalled();
    s.view.scrollTo(0);
    s.frame(s.point, false);
    s.frame(s.point, true);
    s.frame(s.point, false);
    expect(s.click).toHaveBeenCalledOnce();
    s.dispose();
  });
});

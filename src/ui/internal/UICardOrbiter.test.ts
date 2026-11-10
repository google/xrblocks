import type {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {ScriptsManager} from '../../core/components/ScriptsManager';
import type {Controller} from '../../input/Controller';
import {Interaction} from '../../interaction/Interaction';
import {getSemanticControl} from '../../interaction/SemanticControl';
import {ui} from '../UI';
import {UIButton} from '../components/UIButton';
import {
  UICard,
  setUICardResizing,
  type UICardOptions,
} from '../components/UICard';
import {UIIcon} from '../components/UIIcon';
import {UIPanel} from '../components/UIPanel';
import type {UIElement} from '../UIElement';
import type {UIHitMapping, UIPresentationState} from './UIBackend';
import {UICardEdge} from './UICardEdge';
import {createUIBackend} from './UIKitBackend';

const VIEWPORT = {width: 800, height: 600};

function mountCard(options: UICardOptions) {
  const card = new UICard({size: {width: 0.4, height: 0.2}, ...options});
  const backend = createUIBackend();
  const mount = backend.createMount(card);
  let mappings: readonly UIHitMapping[] = mount.commit(ui.theme, VIEWPORT, 0)!;
  const commit = () => {
    mappings = mount.commit(ui.theme, VIEWPORT, 0) ?? mappings;
  };
  const named = (name: string) =>
    mappings.find((mapping) => mapping.logical.name === name);
  const physical = (name: string) =>
    named(name)!.physical as Container & {
      size: {peek(): [number, number] | undefined};
    };
  const center = (name: string) => {
    mount.object.updateMatrixWorld(true);
    return physical(name).getWorldPosition(new THREE.Vector3());
  };
  const layout = async () => {
    await vi.waitFor(() => {
      commit();
      mount.update(0);
      expect(physical('UICardOrbiter').size.peek()?.[0]).toBeGreaterThan(0);
    });
  };
  const present = (
    state: (element: UIElement) => Partial<UIPresentationState>
  ) =>
    mount.present((element) => ({
      hovered: false,
      active: false,
      disabled: false,
      ...state(element),
    }));
  const dispose = () => {
    mount.dispose();
    backend.dispose();
  };
  return {
    card,
    mount,
    mappings: () => mappings,
    commit,
    named,
    physical,
    center,
    layout,
    present,
    dispose,
  };
}

function fill(node: Container): unknown {
  const panel = node as unknown as {fillColorSignal?: {value: unknown}};
  return panel.fillColorSignal
    ? panel.fillColorSignal.value
    : node.properties.peek().backgroundColor;
}

describe('UICard orbiter', () => {
  it('is off by default', () => {
    const view = mountCard({});
    expect(view.card.orbiter).toBe(false);
    expect(view.named('UICardOrbiter')).toBeUndefined();
    view.dispose();
  });

  it('validates its options', () => {
    expect(() => new UICard({orbiter: {icon: ''}})).toThrow();
    expect(
      () =>
        new UICard({
          orbiter: {onClose: 'close' as unknown as () => void},
        })
    ).toThrow();
    const card = new UICard({orbiter: {icon: 'public'}});
    expect(card.orbiter).toEqual({icon: 'public'});
    card.orbiter = false;
    expect(card.orbiter).toBe(false);
  });

  it('centers a constant-size pill 19 mm above the card top', async () => {
    const view = mountCard({orbiter: {icon: 'public'}});
    await view.layout();

    expect(view.physical('UICardOrbiter').size.peek()).toEqual([265, 86]);
    const pill = view.center('UICardOrbiter');
    expect(pill.x).toBeCloseTo(0, 4);
    expect(pill.y - 0.043).toBeCloseTo(0.1 + 0.019, 4);
    expect(pill.z).toBeCloseTo(0, 4);

    const icon = view.named('UICardOrbiterIcon')!;
    expect(icon.logical).toBeInstanceOf(UIIcon);
    expect((icon.logical as UIIcon).icon).toBe('public');
    // jsdom icon placeholders are not square, so check the requested size.
    const iconSize = (name: string) => {
      const {width, height} = view.physical(name).properties.peek();
      return [width, height];
    };
    expect(iconSize('UICardOrbiterIcon')).toEqual([56, 56]);
    const minimize = view.named('UICardOrbiterMinimize')!.logical as UIButton;
    const close = view.named('UICardOrbiterClose')!.logical as UIButton;
    expect(minimize.ariaLabel).toBe('Minimize');
    expect(close.ariaLabel).toBe('Close');
    for (const [name, x] of [
      ['UICardOrbiterIcon', -0.089],
      ['UICardOrbiterMinimize', 0],
      ['UICardOrbiterClose', 0.089],
    ] as const) {
      expect(view.center(name).x).toBeCloseTo(x, 4);
      expect(view.center(name).y).toBeCloseTo(pill.y, 4);
    }
    expect(view.physical('UICardOrbiterMinimize').size.peek()).toEqual([
      67, 67,
    ]);
    const [barWidth, barHeight] = view
      .physical('UICardOrbiterMinimizeBar')
      .size.peek()!;
    expect(barWidth).toBe(23);
    expect(barHeight).toBeCloseTo(2.6, 4);
    expect(view.center('UICardOrbiterMinimizeBar').y).toBeCloseTo(
      pill.y - 0.011,
      4
    );
    expect(iconSize('UICardOrbiterCloseIcon')).toEqual([17, 17]);
    expect(
      (view.named('UICardOrbiterCloseIcon')!.logical as UIIcon).weight
    ).toBe(700);

    view.card.size = {width: 0.6, height: 0.3};
    await vi.waitFor(() => {
      view.commit();
      view.mount.update(0);
      expect(view.center('UICardOrbiter').y - 0.043).toBeCloseTo(0.169, 4);
    });
    expect(view.physical('UICardOrbiter').size.peek()).toEqual([265, 86]);
    expect(view.center('UICardOrbiter').x).toBeCloseTo(0, 4);

    view.dispose();
  });

  it('keeps the minimize and close positions without an icon', async () => {
    const view = mountCard({orbiter: true});
    await view.layout();
    expect(view.named('UICardOrbiterIcon')).toBeUndefined();
    expect(view.center('UICardOrbiterMinimize').x).toBeCloseTo(0, 4);
    expect(view.center('UICardOrbiterClose').x).toBeCloseTo(0.089, 4);
    view.dispose();
  });

  it('hides the card on close by default and calls custom handlers instead', () => {
    const closing = mountCard({orbiter: true});
    getSemanticControl(
      closing.named('UICardOrbiterClose')!.logical
    )!.activate();
    expect(closing.card.visible).toBe(false);
    expect(closing.card.minimized).toBe(false);
    closing.dispose();

    const onMinimize = vi.fn();
    const onClose = vi.fn();
    const view = mountCard({orbiter: {onMinimize, onClose}});
    getSemanticControl(
      view.named('UICardOrbiterMinimize')!.logical
    )!.activate();
    getSemanticControl(view.named('UICardOrbiterClose')!.logical)!.activate();
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(view.card.visible).toBe(true);
    view.dispose();
  });

  it('shows a disc while a button is hovered and lightens it when pressed', () => {
    const view = mountCard({orbiter: true});
    const close = view.named('UICardOrbiterClose')!.logical;
    const disc = () => fill(view.physical('UICardOrbiterClose'));
    expect(fill(view.physical('UICardOrbiter'))).toBe('#101216');
    expect(disc()).toBe('transparent');

    view.present((element) => ({hovered: element === close}));
    expect(disc()).toBe('#202626');
    view.present((element) => ({
      hovered: element === close,
      active: element === close,
    }));
    expect(disc()).toBe('rgb(40, 42, 46)');
    view.present(() => ({}));
    expect(disc()).toBe('transparent');
    view.dispose();
  });

  it('fades out while the card resizes and back in after release', () => {
    const view = mountCard({manipulation: true, edge: true, orbiter: true});
    const pill = view.named('UICardOrbiter')!.logical;
    const alpha = () => pill.style.opacity ?? 1;
    const step = (seconds: number) => {
      view.mount.update(seconds);
      view.commit();
    };

    step(0.1);
    expect(alpha()).toBe(1);

    setUICardResizing(view.card, true);
    step(0.11);
    // Ease-out over 220 ms: half the time removes three quarters.
    expect(alpha()).toBeCloseTo(0.25, 5);
    step(0.11);
    expect(alpha()).toBe(0);
    expect(pill.visible).toBe(false);
    expect(view.physical('UICardOrbiter').visible).toBe(false);

    setUICardResizing(view.card, false);
    step(0.3);
    expect(alpha()).toBe(0);
    step(0.0875);
    // Ease-in over 175 ms: half the time restores a quarter.
    expect(alpha()).toBeCloseTo(0.25, 5);
    expect(pill.visible).toBe(true);
    step(0.0875);
    expect(alpha()).toBeCloseTo(1, 5);

    view.dispose();
  });
});

describe('UICard orbiter minimize', () => {
  const content = () => {
    const panel = new UIPanel({
      style: {width: 100, height: 40, backgroundColor: '#ffffff'},
    });
    panel.name = 'Content';
    return panel;
  };

  it('collapses the card to its pill and restores it from the button', async () => {
    const child = content();
    const view = mountCard({
      manipulation: true,
      edge: true,
      orbiter: true,
      children: [child],
    });
    await view.layout();
    const pillBefore = view.center('UICardOrbiter');
    const cardNode = view.mappings().find((m) => m.logical === view.card)!
      .physical as Container;
    const childNode = view
      .mappings()
      .find((m) => m.logical === child)!.physical;
    const button = () =>
      view.named('UICardOrbiterMinimize')!.logical as UIButton;
    const hasEdge = () =>
      view.mappings().some((m) => m.physical.name === 'UICardEdge');
    expect(view.card.minimized).toBe(false);
    expect(hasEdge()).toBe(true);

    const before = view.mappings();
    getSemanticControl(button())!.activate();
    expect(view.card.minimized).toBe(true);
    expect(view.card.visible).toBe(true);
    view.commit();
    view.mount.update(0);
    expect(view.mappings()).not.toBe(before);
    expect(hasEdge()).toBe(false);
    expect(cardNode.properties.peek().visibility).toBe('hidden');
    expect(cardNode.xb?.pointerEvents).toBe('none');
    expect(childNode.visible).toBe(false);
    const pill = view.physical('UICardOrbiter');
    expect(pill.visible).toBe(true);
    expect(pill.properties.peek().visibility).toBe('visible');
    expect(pill.xb?.pointerEvents).toBe('auto');
    expect(view.center('UICardOrbiter').distanceTo(pillBefore)).toBeCloseTo(
      0,
      6
    );
    expect(button().ariaLabel).toBe('Restore');
    const restoreIcon = view.named('UICardOrbiterRestoreIcon')!;
    expect((restoreIcon.logical as UIIcon).icon).toBe('open_in_full');
    expect(restoreIcon.logical.style.display).toBe('flex');
    expect(view.named('UICardOrbiterMinimizeBar')!.logical.style.display).toBe(
      'none'
    );
    expect(view.center('UICardOrbiterMinimize').x).toBeCloseTo(0, 4);

    getSemanticControl(button())!.activate();
    expect(view.card.minimized).toBe(false);
    view.commit();
    expect(hasEdge()).toBe(true);
    expect(cardNode.properties.peek().visibility).not.toBe('hidden');
    expect(cardNode.xb?.pointerEvents).toBe('auto');
    expect(childNode.visible).toBe(true);
    expect(button().ariaLabel).toBe('Minimize');
    expect(view.named('UICardOrbiterRestoreIcon')!.logical.style.display).toBe(
      'none'
    );
    view.dispose();
  });

  it('restores from the pill body only while minimized', () => {
    const view = mountCard({orbiter: true});
    const body = getSemanticControl(view.named('UICardOrbiter')!.logical)!;
    expect(body.isDisabled()).toBe(true);
    view.card.minimized = true;
    expect(body.isDisabled()).toBe(false);
    body.activate();
    expect(view.card.minimized).toBe(false);
    view.dispose();
  });

  it('removes the pill and its hit areas when the orbiter is turned off', () => {
    const view = mountCard({orbiter: true});
    const pill = view.physical('UICardOrbiter');
    expect(pill.parent).not.toBeNull();

    view.card.orbiter = false;
    view.commit();

    expect(pill.parent).toBeNull();
    expect(
      view
        .mappings()
        .some(({logical}) => logical.name.startsWith('UICardOrbiter'))
    ).toBe(false);
    view.dispose();
  });

  it('removes the pill with the card when the mount is disposed', () => {
    const view = mountCard({orbiter: true});
    const pill = view.physical('UICardOrbiter');

    view.dispose();

    expect(pill.parent).toBeNull();
  });

  it('disposes the edge while minimized and makes a new one on restore', () => {
    const view = mountCard({orbiter: true, edge: true, manipulation: true});
    const edgeOf = () => {
      const edge = view.mount.object.getObjectByName('UICardEdge');
      return edge instanceof UICardEdge ? edge : undefined;
    };
    const edge = edgeOf()!;
    const disposed = vi.fn();
    edge.material.addEventListener('dispose', disposed);

    view.card.minimized = true;
    view.commit();
    expect(edgeOf()).toBeUndefined();
    expect(disposed).toHaveBeenCalledOnce();

    view.card.minimized = false;
    view.commit();
    expect(edgeOf()).toBeInstanceOf(UICardEdge);
    expect(edgeOf()).not.toBe(edge);
    view.dispose();
  });

  it('lets apps minimize and restore programmatically', () => {
    expect(() => {
      new UICard().minimized = true;
    }).toThrow('UICard minimized requires an orbiter.');
    const card = new UICard({orbiter: true});
    card.minimized = true;
    expect(card.minimized).toBe(true);
    card.minimized = false;
    expect(card.minimized).toBe(false);
    card.minimized = true;
    card.orbiter = false;
    expect(card.minimized).toBe(false);
  });

  it('calls onMinimize instead of collapsing and keeps close unchanged', () => {
    const onMinimize = vi.fn();
    const view = mountCard({orbiter: {onMinimize}});
    getSemanticControl(
      view.named('UICardOrbiterMinimize')!.logical
    )!.activate();
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(view.card.minimized).toBe(false);

    view.card.minimized = true;
    getSemanticControl(view.named('UICardOrbiterClose')!.logical)!.activate();
    expect(view.card.visible).toBe(false);
    view.dispose();
  });

  it('routes rays on a minimized card only to its pill, which is not a drag handle', async () => {
    const child = content();
    const view = mountCard({
      manipulation: true,
      orbiter: true,
      children: [child],
    });
    await view.layout();
    new THREE.Scene().add(view.card);
    const callbacks = new ScriptsManager(async () => {});
    await callbacks.initScript(view.card);
    const interaction = new Interaction({callbacks});
    let unregister: Array<() => void> = [];
    const register = () => {
      for (const release of unregister) release();
      unregister = view
        .mappings()
        .map((m) =>
          interaction.registerHitSurface(m.physical, m.logical, m.options)
        );
    };
    register();
    const source = new THREE.Object3D() as Controller;
    source.userData = {id: 0, connected: true, selected: false};
    const aim = (
      target: THREE.Object3D,
      selected: boolean,
      point: THREE.Vector3
    ) => {
      source.userData.selected = selected;
      const position = point.clone().setZ(1);
      interaction.update(
        {
          raySources: [
            {
              controller: source,
              sourceType: 'controller-ray',
              selected,
              ray: new THREE.Ray(position, new THREE.Vector3(0, 0, -1)),
              intersections: [{distance: 1, object: target, point}],
              position,
              orientation: new THREE.Quaternion(),
            },
          ],
          directTouches: [],
        },
        0
      );
    };
    const cardNode = view
      .mappings()
      .find((m) => m.logical === view.card)!.physical;
    const pill = view.physical('UICardOrbiter');
    const pillLogical = view.named('UICardOrbiter')!.logical;
    const onPill = view
      .center('UICardOrbiter')
      .add(new THREE.Vector3(0, 0.03, 0));
    const onCard = new THREE.Vector3(0, -0.08, 0);
    const onChild = view.center('Content');
    const childNode = view
      .mappings()
      .find((m) => m.logical === child)!.physical;

    // The pill body never drags the card.
    aim(pill, false, onPill);
    expect(interaction.isPointingAt(pillLogical)).toBe(true);
    aim(pill, true, onPill);
    aim(pill, true, onPill.clone().setX(0.05));
    expect(interaction.isManipulating(view.card)).toBe(false);
    aim(pill, false, onPill.clone().setX(0.05));
    expect(view.card.position.x).toBe(0);
    expect(view.card.minimized).toBe(false);
    aim(cardNode, false, onCard);
    expect(interaction.isPointingAt(view.card)).toBe(true);
    aim(childNode, false, onChild);
    expect(interaction.isPointingAt(child)).toBe(true);

    view.card.minimized = true;
    view.commit();
    register();
    aim(cardNode, false, onCard);
    expect(interaction.isPointingAt(view.card)).toBe(false);
    aim(childNode, false, onChild);
    expect(interaction.isPointingAt(child)).toBe(false);

    aim(pill, false, onPill);
    aim(pill, true, onPill);
    expect(interaction.isManipulating(view.card)).toBe(false);
    aim(pill, false, onPill);
    expect(view.card.minimized).toBe(false);
    view.dispose();
  });
});

/** Real scene raycasts against a mounted card's registered hit surfaces. */
async function raycastView(view: ReturnType<typeof mountCard>) {
  await view.layout();
  const scene = new THREE.Scene();
  scene.add(view.card);
  const callbacks = new ScriptsManager(async () => {});
  await callbacks.initScript(view.card);
  const interaction = new Interaction({callbacks, scene});
  let unregister: Array<() => void> = [];
  const register = () => {
    for (const release of unregister) release();
    unregister = view
      .mappings()
      .map((m) =>
        interaction.registerHitSurface(m.physical, m.logical, m.options)
      );
  };
  register();
  const source = new THREE.Object3D() as Controller;
  source.userData = {id: 0, connected: true, selected: false};
  const aim = (point: THREE.Vector3, selected = false) => {
    source.userData.selected = selected;
    const position = point.clone().setZ(1);
    view.mount.object.updateMatrixWorld(true);
    interaction.update(
      {
        raySources: [
          {
            controller: source,
            sourceType: 'controller-ray',
            selected,
            ray: new THREE.Ray(position, new THREE.Vector3(0, 0, -1)),
            position,
            orientation: new THREE.Quaternion(),
          },
        ],
        directTouches: [],
      },
      0
    );
    return interaction.getResolvedRay(source);
  };
  const click = (point: THREE.Vector3) => {
    aim(point);
    aim(point, true);
    aim(point);
  };
  return {interaction, register, aim, click};
}

describe('UICard orbiter app icon', () => {
  it('validates onIcon', () => {
    expect(
      () =>
        new UICard({
          orbiter: {icon: 'public', onIcon: 'menu' as unknown as () => void},
        })
    ).toThrow();
    expect(() => new UICard({orbiter: {onIcon: () => {}}})).toThrow(
      'UICard orbiter onIcon requires an icon.'
    );
    const onIcon = () => {};
    expect(new UICard({orbiter: {icon: 'public', onIcon}}).orbiter).toEqual({
      icon: 'public',
      onIcon,
    });
  });

  it('stays decorative without onIcon', async () => {
    const view = mountCard({orbiter: {icon: 'public'}});
    expect(view.named('UICardOrbiterIconButton')).toBeUndefined();
    const icon = view.named('UICardOrbiterIcon')!.logical;
    expect(getSemanticControl(icon)).toBeUndefined();
    // Hovering or pressing anything on the pill draws no disc behind the icon.
    const fills = () => {
      const result: unknown[] = [];
      for (let node = icon.parent; node && node.name !== 'UICardOrbiter'; ) {
        const mapping = view.mappings().find((m) => m.logical === node);
        if (mapping) result.push(fill(mapping.physical as Container));
        node = node.parent;
      }
      return result;
    };
    const idle = fills();
    view.present(() => ({hovered: true, active: true}));
    expect(fills()).toEqual(idle);

    // A ray on the icon reaches the pill body, which restores while minimized.
    const {aim, click, register} = await raycastView(view);
    const pill = view.named('UICardOrbiter')!.logical;
    const onIcon = view.center('UICardOrbiterIcon');
    expect(aim(onIcon)?.surface).toBe(pill);
    view.card.minimized = true;
    view.commit();
    register();
    click(onIcon);
    expect(view.card.minimized).toBe(false);
    view.dispose();
  });

  it('shows an instant 64 mm disc and calls onIcon when given one', async () => {
    const onIcon = vi.fn();
    const view = mountCard({orbiter: {icon: 'public', onIcon}});
    await view.layout();
    const button = view.named('UICardOrbiterIconButton')!;
    expect(button.logical).toBeInstanceOf(UIButton);
    expect(view.physical('UICardOrbiterIconButton').size.peek()).toEqual([
      64, 64,
    ]);
    expect(view.center('UICardOrbiterIconButton').x).toBeCloseTo(-0.089, 4);
    expect(view.center('UICardOrbiterIcon').x).toBeCloseTo(-0.089, 4);

    const disc = () => fill(view.physical('UICardOrbiterIconButton'));
    expect(disc()).toBe('transparent');
    view.present((element) => ({hovered: element === button.logical}));
    expect(disc()).toBe('#1e2223');
    view.present((element) => ({
      hovered: element === button.logical,
      active: element === button.logical,
    }));
    expect(disc()).toBe('rgb(38, 41, 42)');
    view.present(() => ({}));
    expect(disc()).toBe('transparent');

    const {aim, click, register} = await raycastView(view);
    const onIconPoint = view.center('UICardOrbiterIcon');
    expect(aim(onIconPoint)?.target).toBe(button.logical);
    click(onIconPoint);
    expect(onIcon).toHaveBeenCalledOnce();
    expect(view.card.minimized).toBe(false);

    // While minimized, the icon keeps its action rather than restoring.
    view.card.minimized = true;
    view.commit();
    register();
    click(onIconPoint);
    expect(onIcon).toHaveBeenCalledTimes(2);
    expect(view.card.minimized).toBe(true);
    view.dispose();
  });
});

describe('UICard orbiter over the edge band', () => {
  it('blocks edge band hits behind the pill', async () => {
    const view = mountCard({
      manipulation: true,
      edge: true,
      orbiter: {icon: 'public'},
    });
    const {aim} = await raycastView(view);
    const pill = view.named('UICardOrbiter')!.logical;
    const minimize = view.named('UICardOrbiterMinimize')!.logical;
    // The card top is at 0.1 m and its 87 mm band reaches 0.187 m; the pill
    // starts 19 mm above the card.
    const overBand = 0.13;
    const onMinimize = aim(new THREE.Vector3(0, overBand, 0));
    expect(onMinimize?.target).toBe(minimize);
    expect(onMinimize?.hitObject.name).not.toBe('UICardEdge');
    // Beside the close disc, inside the pill's rounded end.
    expect(aim(new THREE.Vector3(0.127, 0.14, 0))?.surface).toBe(pill);
    // Beside the pill, the band still takes the hit.
    const beside = aim(new THREE.Vector3(0.14, overBand, 0));
    expect(beside?.surface).toBe(view.card);
    expect(beside?.hitObject.name).toBe('UICardEdge');
    view.dispose();
  });
});

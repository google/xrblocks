import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  setResolvedUICardSize,
  setUICardContentMeasurer,
  type UICardAnchorX,
  type UICardAnchorY,
  UICard,
  type UISize,
} from '../../../ui/components/UICard';
import type {
  InteractionSourceState,
  SelectionCapture,
} from '../../InteractionTypes';
import {MANIPULATION_EASE_SECONDS} from '../ManipulationMath';
import type {ResizeOptions} from '../ManipulationTypes';
import type {ManipulationDriverSession, ResizeBaseline} from './DriverTypes';
import {ResizeDriver} from './ResizeDriver';

interface SessionOptions {
  size?: UISize;
  resize?: ResizeOptions;
  anchorX?: UICardAnchorX;
  anchorY?: UICardAnchorY;
  grab?: THREE.Vector3;
  owner?: THREE.Object3D;
}

function createSession({
  size = {width: 0.4, height: 0.2},
  resize = {},
  anchorX,
  anchorY,
  grab = new THREE.Vector3(0.2, 0.1, 0),
  owner,
}: SessionOptions = {}): ManipulationDriverSession & {card: UICard} {
  const card = new UICard({size, anchorX, anchorY});
  card.position.set(0, 1, -1);
  new THREE.Scene().add(card);
  card.updateWorldMatrix(true, false);
  const point = card.localToWorld(grab.clone());
  return {
    card,
    owner: owner ?? card,
    config: {resize},
    primary: {
      capture: {point} as unknown as SelectionCapture,
      snapshot: rayAt(point),
    },
  };
}

function measureContent(
  card: UICard,
  height: (width: number) => number | undefined,
  minWidth?: number
): void {
  setUICardContentMeasurer(card, {height, minWidth: () => minWidth});
}

function rayAt(point: THREE.Vector3): InteractionSourceState {
  const origin = point.clone().setZ(0);
  return {
    sourceType: 'controller-ray',
    selected: true,
    position: origin.clone(),
    orientation: new THREE.Quaternion(),
    ray: new THREE.Ray(origin, new THREE.Vector3(0, 0, -1)),
  } as unknown as InteractionSourceState;
}

function drag(
  session: ManipulationDriverSession,
  dx: number,
  dy: number
): void {
  const point = session.primary.capture.point.clone().add({x: dx, y: dy, z: 0});
  session.primary.snapshot = rayAt(point);
}

function timer(delta: number): THREE.Timer & {frame: number} {
  const value = {
    frame: 0,
    getDelta: () => delta,
    getElapsed: () => value.frame,
  };
  return value as unknown as THREE.Timer & {frame: number};
}

describe('ResizeDriver', () => {
  it('grows around the center by default', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0.02);

    const proposal = driver.propose(session, baseline)!;
    proposal.apply();

    expect(session.card.size.width).toBeCloseTo(0.5);
    expect(session.card.size.height).toBeCloseTo(0.24);
    expect(session.card.position.toArray()).toEqual([0, 1, -1]);
  });

  it('keeps the opposite corner fixed when configured', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {anchor: 'opposite'},
      grab: new THREE.Vector3(-0.2, -0.1, 0),
    });
    const baseline = driver.capture(session)!;
    drag(session, -0.1, -0.05);

    driver.propose(session, baseline)!.apply();

    expect(session.card.size.width).toBeCloseTo(0.5);
    expect(session.card.size.height).toBeCloseTo(0.25);
    expect(session.card.position.x).toBeCloseTo(-0.05);
    expect(session.card.position.y).toBeCloseTo(1 - 0.025);
    const topRight = new THREE.Vector3(0.25, 0.125, 0).add(
      session.card.position
    );
    expect(topRight.x).toBeCloseTo(0.2);
    expect(topRight.y).toBeCloseTo(1.1);
  });

  it('keeps the requested fixed point for non-center card anchors', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      anchorX: 'left',
      anchorY: 'top',
      grab: new THREE.Vector3(0.4, -0.2, 0),
    });
    const baseline = driver.capture(session)!;
    drag(session, 0.05, -0.05);

    driver.propose(session, baseline)!.apply();

    expect(session.card.size.width).toBeCloseTo(0.5);
    expect(session.card.size.height).toBeCloseTo(0.3);
    // The center stays at (0.2, -0.1) relative to the original origin.
    expect(session.card.position.x).toBeCloseTo(-0.05);
    expect(session.card.position.y).toBeCloseTo(1 + 0.05);
  });

  it('clamps to the configured limits and never snaps below the start size', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {minSize: {width: 0.3}, maxSize: {width: 0.45, height: 0.22}},
    });
    const baseline = driver.capture(session)!;

    drag(session, 1, 1);
    let proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.45);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.22);

    drag(session, -1, -1);
    proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.3);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.1);

    const small = createSession({size: {width: 0.05, height: 0.05}});
    const smallBaseline = driver.capture(small)!;
    drag(small, 0, 0);
    proposal = driver.propose(small, smallBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.05);
  });

  it('lets the dragged edge overshoot a limit by a capped share of the extra drag', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {
        overshoot: true,
        minSize: {width: 0.3},
        maxSize: {width: 0.45, height: 0.22},
      },
    });
    const baseline = driver.capture(session)!;
    const size = () => {
      const proposal = driver.propose(session, baseline)!;
      if (proposal.action !== 'resize' || proposal.height === 'auto') {
        throw new Error('expected a sized resize proposal');
      }
      return [proposal.width, proposal.height];
    };

    // Growing around the center, the size is 0.5 m past the limit, so the
    // dragged edge moves 4.5% of its 0.025 m extra travel.
    drag(session, 0.05, 0);
    let [width, height] = size();
    expect(width).toBeCloseTo(0.45 + 2 * 0.045 * 0.025, 6);
    expect(height).toBeCloseTo(0.2);

    // Each edge stops 21 mm past the limit, and each axis clamps on its own.
    drag(session, 1, -1);
    [width, height] = size();
    expect(width).toBeCloseTo(0.45 + 2 * 0.021, 6);
    expect(height).toBeCloseTo(0.1 - 2 * 0.021, 6);

    drag(session, -0.08, 0);
    [width] = size();
    expect(width).toBeCloseTo(0.3 - 2 * 0.045 * 0.03, 6);

    const opposite = createSession({
      resize: {overshoot: true, anchor: 'opposite', maxSize: {width: 0.45}},
    });
    const oppositeBaseline = driver.capture(opposite)!;
    drag(opposite, 0.1, 0);
    let proposal = driver.propose(opposite, oppositeBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(
      0.45 + 0.045 * 0.05,
      6
    );
    drag(opposite, 1, 0);
    proposal = driver.propose(opposite, oppositeBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(
      0.45 + 0.021,
      6
    );
  });

  it('keeps content floors and locked aspect ratios hard with overshoot', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {overshoot: true}});
    measureContent(session.card, () => 0.15, 0.3);
    const baseline = driver.capture(session)!;
    drag(session, -1, -1);
    let proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.3);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.15);

    const locked = createSession({
      resize: {
        overshoot: true,
        preserveAspectRatio: true,
        maxSize: {width: 0.45},
      },
    });
    const lockedBaseline = driver.capture(locked)!;
    drag(locked, 0.1, 0.05);
    proposal = driver.propose(locked, lockedBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.45);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.225);
  });

  it('snaps an overshoot back to the limit on release', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {
        overshoot: true,
        anchor: 'opposite',
        maxSize: {width: 0.45},
      },
      grab: new THREE.Vector3(0.2, 0.1, 0),
    });
    const baseline = driver.capture(session)!;
    drag(session, 1, -1);
    const proposal = driver.propose(session, baseline)!;
    proposal.apply();
    expect(session.card.size.width).toBeCloseTo(0.471);
    expect(session.card.size.height).toBeCloseTo(0.079);

    const released = driver.release(session, baseline, proposal);
    expect(released).not.toBe(proposal);
    released.apply();
    expect(session.card.size.width).toBeCloseTo(0.45);
    expect(session.card.size.height).toBeCloseTo(0.1);
    // The bottom-left corner stays where it was.
    expect(session.card.position.x).toBeCloseTo(0.025);
    expect(session.card.position.y).toBeCloseTo(1 - 0.05);

    drag(session, 0.01, 0);
    const within = driver.propose(session, baseline)!;
    expect(driver.release(session, baseline, within)).toBe(within);
    const plain = createSession({resize: {maxSize: {width: 0.45}}});
    const plainBaseline = driver.capture(plain)!;
    const plainProposal = driver.propose(plain, plainBaseline)!;
    expect(driver.release(plain, plainBaseline, plainProposal)).toBe(
      plainProposal
    );
  });

  it('snaps an automatic-size card back to its starting size on release', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      size: {width: 'auto', height: 'auto'},
      resize: {overshoot: true, maxSize: {width: 0.4}},
    });
    setResolvedUICardSize(session.card, {width: 0.4, height: 0.2});
    const baseline = driver.capture(session)!;
    drag(session, 1, 0);
    const proposal = driver.propose(session, baseline)!;
    proposal.apply();
    expect(session.card.size.width).toBeCloseTo(0.4 + 2 * 0.021, 6);

    const released = driver.release(session, baseline, proposal);
    released.apply();
    expect(released.action === 'resize' && released.width).toBeCloseTo(0.4, 6);
    expect(session.card.size.width).toBeCloseTo(0.4, 6);
    expect(session.card.size.height).toBeCloseTo(0.2, 6);
    expect(session.card.position.toArray()).toEqual([0, 1, -1]);
  });

  it('snaps an eased overshoot back to the limit on release', () => {
    const clock = timer(1 / 60);
    const driver = new ResizeDriver(clock);
    const session = createSession({
      resize: {overshoot: true, smoothing: true, maxSize: {width: 0.45}},
    });
    const baseline = driver.capture(session)!;
    drag(session, 1, 0);
    let proposal = driver.propose(session, baseline)!;
    for (let i = 0; i < 90; i++) {
      clock.frame++;
      proposal = driver.propose(session, baseline)!;
    }
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(
      0.45 + 2 * 0.021,
      4
    );
    const released = driver.release(session, baseline, proposal);
    expect(released.action === 'resize' && released.width).toBeCloseTo(0.45);
  });

  it('fixes the laid-out height of an automatic-height card', () => {
    const driver = new ResizeDriver();
    const session = createSession({size: {width: 0.4, height: 'auto'}});
    setResolvedUICardSize(session.card, {width: 0.4, height: 0.2});
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0.02);

    driver.propose(session, baseline)!.apply();

    expect(session.card.size.width).toBeCloseTo(0.5);
    expect(session.card.size.height).toBeCloseTo(0.24);
    expect(session.card.position.toArray()).toEqual([0, 1, -1]);
  });

  it('never shrinks below the content height unless a minimum height is set', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    // Content wraps to more lines as the card gets narrower.
    measureContent(session.card, (width) => 0.06 / width);
    const baseline = driver.capture(session)!;

    drag(session, 0, -0.1);
    let proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.15);

    drag(session, -0.1, 0);
    proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.2);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.3);

    const scrolling = createSession({resize: {minSize: {height: 0.1}}});
    measureContent(scrolling.card, () => 0.18);
    const scrollingBaseline = driver.capture(scrolling)!;
    drag(scrolling, 0, -0.1);
    proposal = driver.propose(scrolling, scrollingBaseline)!;
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.1);
  });

  it('never gets narrower than its content unless a minimum width is set', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    measureContent(session.card, () => undefined, 0.3);
    const baseline = driver.capture(session)!;
    drag(session, -1, 0);
    let proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.3);

    const explicit = createSession({resize: {minSize: {width: 0.15}}});
    measureContent(explicit.card, () => undefined, 0.3);
    const explicitBaseline = driver.capture(explicit)!;
    drag(explicit, -1, 0);
    proposal = driver.propose(explicit, explicitBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.15);

    const capped = createSession({resize: {maxSize: {width: 0.35}}});
    measureContent(capped.card, () => undefined, 0.5);
    const cappedBaseline = driver.capture(capped)!;
    drag(capped, -1, 0);
    proposal = driver.propose(capped, cappedBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.35);
  });

  it('never overshoots below a content width under the default minimum', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {overshoot: true}});
    measureContent(session.card, () => undefined, 0.08);
    const baseline = driver.capture(session)!;
    drag(session, -1, 0);
    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.08, 6);
  });

  it('refits the content height when a width overshoot snaps back', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {overshoot: true, maxSize: {width: 0.45}},
    });
    // Content wraps to more lines as the card gets narrower.
    measureContent(session.card, (width) => 0.06 / width);
    const baseline = driver.capture(session)!;
    drag(session, 1, -1);
    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(
      0.06 / (0.45 + 2 * 0.021),
      6
    );

    const released = driver.release(session, baseline, proposal);
    expect(released.action === 'resize' && released.width).toBeCloseTo(0.45, 6);
    expect(released.action === 'resize' && released.height).toBeCloseTo(
      0.06 / 0.45,
      6
    );
  });

  it('measures the content again only when the width changes', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    let measurements = 0;
    measureContent(session.card, () => {
      measurements++;
      return 0.1;
    });
    const baseline = driver.capture(session)!;
    drag(session, 0, 0.01);
    driver.propose(session, baseline);
    drag(session, 0, 0.02);
    driver.propose(session, baseline);
    expect(measurements).toBe(1);
    drag(session, 0.01, 0.02);
    driver.propose(session, baseline);
    expect(measurements).toBe(2);
  });

  it('lets maxSize cap the content height', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {maxSize: {height: 0.25}}});
    measureContent(session.card, () => 0.4);
    const baseline = driver.capture(session)!;
    drag(session, 0, 0);
    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.25);
  });

  it('keeps a locked aspect ratio when maxSize stops the content floor', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {preserveAspectRatio: true, maxSize: {width: 0.45}},
    });
    measureContent(session.card, () => 0.3);
    const baseline = driver.capture(session)!;
    drag(session, 0, 0);
    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.45);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.225);
  });

  it('keeps the aspect ratio when locked, following the larger change', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {preserveAspectRatio: true}});
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0);
    let proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.5);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.25);

    const limited = createSession({
      resize: {preserveAspectRatio: true, maxSize: {width: 0.45}},
    });
    const limitedBaseline = driver.capture(limited)!;
    drag(limited, 0.05, 0.05);
    proposal = driver.propose(limited, limitedBaseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.45);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.225);
  });

  it('widens a locked card to keep its content floor', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {preserveAspectRatio: true}});
    measureContent(session.card, () => 0.3);
    const baseline = driver.capture(session)!;
    drag(session, -0.05, -0.05);
    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.3);
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.6);
  });

  it('clamps a locked card at the wrapping content crossover instead of expanding when dragged inward', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {preserveAspectRatio: true}});
    // At width 0.3m, wrapped content needs 0.15m height (matching the 2:1 ratio).
    measureContent(session.card, (width) => 0.045 / width);
    const baseline = driver.capture(session)!;
    drag(session, -0.1, -0.05);
    const first = driver.propose(session, baseline)!;
    expect(first.action === 'resize' && first.width).toBeCloseTo(0.3, 3);
    expect(first.action === 'resize' && first.height).toBeCloseTo(0.15, 3);

    drag(session, -0.14, -0.07);
    const fartherInward = driver.propose(session, baseline)!;
    expect(
      fartherInward.action === 'resize' && fartherInward.width
    ).toBeCloseTo(0.3, 3);
    expect(
      fartherInward.action === 'resize' && fartherInward.height
    ).toBeCloseTo(0.15, 3);
  });

  it('keeps an automatic height when a corner is pressed without dragging', () => {
    const driver = new ResizeDriver();
    const session = createSession({size: {width: 0.4, height: 'auto'}});
    setResolvedUICardSize(session.card, {width: 0.4, height: 0.2});
    measureContent(session.card, () => 0.20001);
    const baseline = driver.capture(session)!;
    const proposal = driver.propose(session, baseline)!;
    proposal.apply();
    expect(proposal.action === 'resize' && proposal.height).toBe('auto');
    expect(session.card.size.height).toBe('auto');
  });

  it('only changes the width of an automatic-height card before layout', () => {
    const driver = new ResizeDriver();
    const session = createSession({size: {width: 0.4, height: 'auto'}});
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0.3);

    driver.propose(session, baseline)!.apply();

    expect(session.card.size.width).toBeCloseTo(0.5);
    expect(session.card.size.height).toBe('auto');
    expect(session.card.position.y).toBe(1);
  });

  it('measures drags in the card plane of a scaled, rotated card', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    session.card.scale.setScalar(2);
    session.card.rotation.z = Math.PI / 2;
    session.card.updateWorldMatrix(true, false);
    const point = session.card.localToWorld(new THREE.Vector3(0.2, 0.1, 0));
    (session.primary.capture as {point: THREE.Vector3}).point = point;
    session.primary.snapshot = rayAt(point);
    const baseline = driver.capture(session)!;

    // Local +x now points along world +y, at twice the scale.
    drag(session, 0, 0.1);
    const proposal = driver.propose(session, baseline)!;

    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(0.5);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(0.2);
  });

  it('rejects non-card owners and invalid options', () => {
    const driver = new ResizeDriver();
    expect(
      driver.capture(createSession({owner: new THREE.Object3D()}))
    ).toBeUndefined();
    expect(
      driver.capture(
        createSession({resize: {anchor: 'corner' as unknown as 'center'}})
      )
    ).toBeUndefined();
    expect(
      driver.capture(
        createSession({
          resize: {minSize: {width: 0.5}, maxSize: {width: 0.2}},
        })
      )
    ).toBeUndefined();
    expect(
      driver.capture(createSession({resize: {minSize: {height: NaN}}}))
    ).toBeUndefined();
  });

  it('keeps the dragged corner when a phase restarts after a large resize', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {anchor: 'opposite'}});
    let baseline = driver.capture(session)!;
    drag(session, 0.6, 0);
    driver.propose(session, baseline)!.apply();
    session.card.updateWorldMatrix(true, false);

    // Re-capture as ManipulationManager does after two-source scale ends.
    baseline = driver.capture(session)!;
    expect(baseline.corner.x).toBe(1);
    drag(session, 0.7, 0);
    driver.propose(session, baseline)!.apply();

    expect(session.card.size.width).toBeCloseTo(1.1);

    // Even if the pointer crosses to the other side of the card center during
    // two-source scale, restarting the resize phase keeps the initial corner.
    drag(session, -0.3, -0.2);
    baseline = driver.capture(session)!;
    expect(baseline.corner.x).toBe(1);
    expect(baseline.corner.y).toBe(1);
  });

  it('holds the last proposal when the ray misses the card plane', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    const baseline = driver.capture(session) as ResizeBaseline;
    session.primary.snapshot.ray!.direction.set(0, 0, 1);
    expect(driver.propose(session, baseline)).toBeUndefined();
  });

  it('eases the size toward the pointer with smoothing, once per frame', () => {
    const clock = timer(1 / 60);
    const driver = new ResizeDriver(clock);
    const session = createSession({resize: {smoothing: true}});
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0.02);

    const alpha = 1 - Math.exp(-1 / 60 / MANIPULATION_EASE_SECONDS);
    let proposal = driver.propose(session, baseline)!;
    proposal.apply();
    expect(session.card.size.width).toBeCloseTo(0.4 + 0.1 * alpha);
    expect(session.card.size.height).toBeCloseTo(0.2 + 0.04 * alpha);
    // The center anchor stays put while the size eases.
    expect(session.card.position.toArray()).toEqual([0, 1, -1]);
    // A second proposal in the same frame does not step again.
    proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(
      0.4 + 0.1 * alpha
    );

    for (let i = 0; i < 90; i++) {
      clock.frame++;
      driver.propose(session, baseline);
    }
    driver.propose(session, baseline)!.apply();
    expect(session.card.size.width).toBeCloseTo(0.5, 4);
    expect(session.card.size.height).toBeCloseTo(0.24, 4);
  });

  it('returns a fresh position from each proposal', () => {
    const driver = new ResizeDriver();
    const session = createSession({
      resize: {anchor: 'opposite'},
      grab: new THREE.Vector3(-0.2, -0.1, 0),
    });
    const baseline = driver.capture(session)!;

    drag(session, -0.1, -0.05);
    const first = driver.propose(session, baseline)!;
    if (first.action !== 'resize') throw new Error('not resize');
    const firstPosition = first.position.clone();
    drag(session, 0.05, 0.02);
    const second = driver.propose(session, baseline)!;
    if (second.action !== 'resize') throw new Error('not resize');

    expect(second.position).not.toBe(first.position);
    expect(first.position.equals(firstPosition)).toBe(true);
    expect(second.position.equals(firstPosition)).toBe(false);
  });

  it('keeps a locked aspect ratio while easing', () => {
    const clock = timer(1 / 60);
    const driver = new ResizeDriver(clock);
    const session = createSession({
      resize: {smoothing: true, preserveAspectRatio: true},
    });
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0);
    for (let i = 0; i < 4; i++) {
      clock.frame++;
      const proposal = driver.propose(session, baseline)!;
      if (proposal.action !== 'resize' || proposal.height === 'auto') {
        throw new Error('expected a sized resize proposal');
      }
      expect(proposal.width / proposal.height).toBeCloseTo(2);
    }
  });

  it('resizes directly without smoothing and rejects invalid smoothing', () => {
    const driver = new ResizeDriver(timer(1 / 60));
    const session = createSession();
    const baseline = driver.capture(session)!;
    drag(session, 0.05, 0.02);
    driver.propose(session, baseline)!.apply();
    expect(session.card.size.width).toBeCloseTo(0.5);
    expect(
      driver.capture(
        createSession({resize: {smoothing: 0.25 as unknown as boolean}})
      )
    ).toBeUndefined();
  });

  it('caps at the default maximum size', () => {
    const driver = new ResizeDriver();
    const session = createSession();
    const baseline = driver.capture(session)!;
    drag(session, 100, 100);

    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(10);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(10);
  });

  it('lets an explicit maxSize override the default cap', () => {
    const driver = new ResizeDriver();
    const session = createSession({resize: {maxSize: {width: 20, height: 15}}});
    const baseline = driver.capture(session)!;
    drag(session, 100, 100);

    const proposal = driver.propose(session, baseline)!;
    expect(proposal.action === 'resize' && proposal.width).toBeCloseTo(20);
    expect(proposal.action === 'resize' && proposal.height).toBeCloseTo(15);
  });
});

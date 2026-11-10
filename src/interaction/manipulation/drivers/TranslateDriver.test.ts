import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  DEFAULT_FACE_CAMERA_SMOOTHING,
  faceCameraSlerpAlpha,
} from '../../../utils/FaceCameraMath';
import type {
  InteractionSourceState,
  SelectionCapture,
} from '../../InteractionTypes';
import type {ScaleOptions, TranslateOptions} from '../ManipulationTypes';
import type {ManipulationDriverSession, TranslateBaseline} from './DriverTypes';
import {TranslateDriver} from './TranslateDriver';

function createSession(
  translate: TranslateOptions,
  scale?: ScaleOptions
): ManipulationDriverSession {
  const owner = new THREE.Object3D();
  owner.position.set(0, 0, -1);
  new THREE.Scene().add(owner);
  owner.updateWorldMatrix(true, false);
  return {
    owner,
    config: {translate, scale},
    primary: {
      capture: {
        point: new THREE.Vector3(0, 0, -1),
      } as unknown as SelectionCapture,
      snapshot: {
        sourceType: 'direct-touch',
        selected: true,
        position: new THREE.Vector3(0, 0, -1),
        orientation: new THREE.Quaternion(),
      } as unknown as InteractionSourceState,
    },
  };
}

function createRaySession(
  translate: TranslateOptions,
  stickY: number
): ManipulationDriverSession {
  const session = createSession(translate);
  session.primary.snapshot = {
    sourceType: 'controller-ray',
    selected: true,
    position: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    ray: new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
    controller: {gamepad: {mapping: 'xr-standard', axes: [0, 0, 0, stickY]}},
  } as unknown as InteractionSourceState;
  return session;
}

function timer(delta: number): THREE.Timer & {frame: number} {
  const value = {
    frame: 0,
    getDelta: () => delta,
    getElapsed: () => value.frame,
  };
  return value as unknown as THREE.Timer & {frame: number};
}

describe('TranslateDriver', () => {
  it('pushes along the ray with thumbstick forward and pulls with back', () => {
    const driver = new TranslateDriver(undefined, timer(0.5));
    const push = createRaySession({pushPull: true}, -1);
    let baseline = driver.capture(push)!;
    driver.propose(push, baseline)!.apply();
    expect(push.owner.position.z).toBeCloseTo(-Math.exp(0.75));

    const pull = createRaySession({pushPull: {speed: 0.5}}, 1);
    baseline = driver.capture(pull)!;
    driver.propose(pull, baseline)!.apply();
    expect(pull.owner.position.z).toBeCloseTo(-Math.exp(-0.25));
  });

  it('steps push/pull once per frame and only for XR gamepads', () => {
    const clock = timer(0.5);
    const driver = new TranslateDriver(undefined, clock);
    const session = createRaySession({pushPull: true}, -1);
    const baseline = driver.capture(session)!;
    const first = driver.propose(session, baseline)!;
    const again = driver.propose(session, baseline)!;
    expect(
      again.action === 'translate' && first.action === 'translate'
        ? again.worldPosition.z - first.worldPosition.z
        : NaN
    ).toBeCloseTo(0);
    clock.frame++;
    driver.propose(session, baseline)!.apply();
    expect(session.owner.position.z).toBeCloseTo(-Math.exp(1.5));

    const desktop = createRaySession({pushPull: true}, -1);
    (desktop.primary.snapshot.controller.gamepad as {mapping: string}).mapping =
      'standard';
    const desktopBaseline = driver.capture(desktop)!;
    driver.propose(desktop, desktopBaseline)!.apply();
    expect(desktop.owner.position.z).toBeCloseTo(-1);
  });

  it('ignores thumbstick input inside the deadzone', () => {
    const driver = new TranslateDriver(undefined, timer(10));
    const idle = createRaySession({pushPull: true}, 0.1);
    const baseline = driver.capture(idle)!;
    driver.propose(idle, baseline)!.apply();
    expect(idle.owner.position.z).toBeCloseTo(-1);
  });

  it('stops pushing at the maximum distance from the viewer', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 2);
    const driver = new TranslateDriver(camera, timer(0.5));
    const session = createRaySession({pushPull: true, maxDistance: 4}, -1);
    const baseline = driver.capture(session)!;
    // One step would reach z = -2.12, 4.12 m from the viewer.
    driver.propose(session, baseline)!.apply();
    expect(session.owner.position.z).toBeCloseTo(-1);

    const pull = createRaySession({pushPull: true, maxDistance: 4}, 1);
    const pullBaseline = driver.capture(pull)!;
    driver.propose(pull, pullBaseline)!.apply();
    expect(pull.owner.position.z).toBeCloseTo(-Math.exp(-0.75));
  });

  it('keeps every move within the distance limits without snapping', () => {
    const driver = new TranslateDriver(new THREE.PerspectiveCamera());
    const session = createSession({minDistance: 0.75, maxDistance: 5});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.position.set(0, 0, -8);
    driver.propose(session, baseline)!.apply();
    expect(session.owner.position.z).toBeCloseTo(-5);

    session.primary.snapshot.position.set(0, 0, -0.2);
    driver.propose(session, baseline)!.apply();
    expect(session.owner.position.z).toBeCloseTo(-0.75);

    // An owner that starts too close can move, but not any closer.
    const near = createSession({minDistance: 2});
    const nearBaseline = driver.capture(near)!;
    near.primary.snapshot.position.set(0, 0, -1.5);
    driver.propose(near, nearBaseline)!.apply();
    expect(near.owner.position.z).toBeCloseTo(-1.5);
    near.primary.snapshot.position.set(0, 0, -0.5);
    driver.propose(near, nearBaseline)!.apply();
    expect(near.owner.position.z).toBeCloseTo(-1);
  });

  it('leaves ray depth alone without push/pull and rejects invalid options', () => {
    const driver = new TranslateDriver(undefined, timer(0.5));
    const session = createRaySession({pushPull: false}, -1);
    const baseline = driver.capture(session)!;
    driver.propose(session, baseline)!.apply();
    expect(session.owner.position.z).toBeCloseTo(-1);
    expect(
      driver.capture(createRaySession({pushPull: {speed: -1}}, 0))
    ).toBeUndefined();
    expect(
      driver.capture(createRaySession({minDistance: 2, maxDistance: 1}, 0))
    ).toBeUndefined();
  });

  it('scales with camera distance like Android XR panels', () => {
    const driver = new TranslateDriver(new THREE.PerspectiveCamera());
    const session = createSession({scaleWithDistance: true});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.position.set(0, 0, -2);
    const proposal = driver.propose(session, baseline)!;
    proposal.apply();

    expect(session.owner.position.z).toBeCloseTo(-2);
    // sizeDistance(d) = 0.875 + 0.5 * d, so 1.875 / 1.375.
    expect(session.owner.scale.x).toBeCloseTo(1.875 / 1.375);
    expect(proposal.action === 'translate' && proposal.scale.x).toBeCloseTo(
      1.875 / 1.375
    );

    const near = createSession({scaleWithDistance: true});
    const nearBaseline = driver.capture(near)!;
    near.primary.snapshot.position.set(0, 0, -1.5);
    driver.propose(near, nearBaseline)!.apply();
    expect(near.owner.scale.x).toBeCloseTo(1.625 / 1.375);
  });

  it('clamps distance scaling with the Scale action limits', () => {
    const driver = new TranslateDriver(new THREE.PerspectiveCamera());
    const session = createSession({scaleWithDistance: true}, {maxScale: 1.5});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.position.set(0, 0, -3);
    driver.propose(session, baseline)!.apply();

    expect(session.owner.scale.x).toBeCloseTo(1.5);
  });

  it('leaves scale alone when distance scaling is off', () => {
    const driver = new TranslateDriver(new THREE.PerspectiveCamera());
    const session = createSession({});
    const baseline = driver.capture(session)!;

    session.owner.scale.setScalar(3);
    session.primary.snapshot.position.set(0, 0, -2);
    driver.propose(session, baseline)!.apply();

    expect(session.owner.scale.x).toBe(3);
  });

  it('scales at 0.5 m per meter on both sides of 1.75 m', () => {
    const driver = new TranslateDriver(new THREE.PerspectiveCamera());
    const scaleAt = (distance: number) => {
      const session = createSession({scaleWithDistance: true});
      const baseline = driver.capture(session)!;
      session.primary.snapshot.position.set(0, 0, -distance);
      driver.propose(session, baseline)!.apply();
      return session.owner.scale.x;
    };

    // Owner starts at 1 m, where sizeDistance(1) = 1.375.
    expect(scaleAt(0.75)).toBeCloseTo(1.25 / 1.375);
    expect(scaleAt(3.75)).toBeCloseTo(2.75 / 1.375);
    // No slope change at 1.75 m.
    const below = scaleAt(1.75) - scaleAt(1.5);
    const above = scaleAt(2) - scaleAt(1.75);
    expect(above).toBeCloseTo(below);
  });

  it('holds the owner still for small pinch-onset twitches', () => {
    const clock = timer(1 / 60);
    const driver = new TranslateDriver(undefined, clock);
    const session = createRaySession({raySmoothing: true}, 0);
    const ray = session.primary.snapshot.ray!;
    const baseline = driver.capture(session)!;

    ray.origin.set(0.02, 0.01, 0);
    ray.direction.set(0, 0, -1).applyAxisAngle(Y_AXIS, degrees(1.2));
    for (let i = 0; i < 10; i++) {
      advance(clock, driver, session, baseline);
    }
    expect(session.owner.position.x).toBeCloseTo(0, 6);
    expect(session.owner.position.y).toBeCloseTo(0, 6);
    expect(session.owner.position.z).toBeCloseTo(-1, 6);
  });

  it('unlocks the ray smoothly past the deadzone and stays unlocked', () => {
    const driver = new TranslateDriver();
    const session = createRaySession({raySmoothing: true}, 0);
    const ray = session.primary.snapshot.ray!;
    const baseline = driver.capture(session)!;
    const xAt = (x: number) => {
      ray.origin.set(x, 0, 0);
      driver.propose(session, baseline)!.apply();
      return session.owner.position.x;
    };

    expect(xAt(0.03)).toBeCloseTo(0);
    // Just past the deadzone the owner barely moves, so it does not pop.
    expect(xAt(0.031)).toBeCloseTo(0.031 / 70, 6);
    expect(xAt(0.065)).toBeCloseTo(0.0325);
    expect(xAt(0.1)).toBeCloseTo(0.1);
    // The weight never drops, so returning near the start does not re-lock.
    expect(xAt(0.02)).toBeCloseTo(0.02);
  });

  it('smooths the ray independent of frame rate, once per frame', () => {
    const positionAt = (fps: number) => {
      const clock = timer(1 / fps);
      const driver = new TranslateDriver(undefined, clock);
      const session = createRaySession({raySmoothing: true}, 0);
      const ray = session.primary.snapshot.ray!;
      const baseline = driver.capture(session)!;
      ray.origin.set(0.5, 0, 0);
      ray.direction.set(0, 0, -1).applyAxisAngle(Y_AXIS, degrees(20));
      for (let i = 0; i < fps / 10; i++) {
        clock.frame++;
        driver.propose(session, baseline);
        driver.propose(session, baseline)!.apply();
      }
      return session.owner.position.clone();
    };

    const slow = positionAt(60);
    const fast = positionAt(120);
    expect(fast.x).toBeCloseTo(slow.x, 6);
    expect(fast.z).toBeCloseTo(slow.z, 6);
    // 100 ms with a 72 ms time constant closes about 75% of the gap.
    const closed = 1 - Math.exp(-0.1 / 0.072);
    const angle = degrees(20) * closed;
    expect(slow.x).toBeCloseTo(0.5 * closed - Math.sin(angle), 6);
    expect(slow.z).toBeCloseTo(-Math.cos(angle), 6);
  });

  it('follows the target ray without a timer', () => {
    const driver = new TranslateDriver();
    const session = createRaySession({raySmoothing: true}, 0);
    const baseline = driver.capture(session)!;
    session.primary.snapshot.ray!.origin.set(0.5, 0, 0);
    driver.propose(session, baseline)!.apply();
    expect(session.owner.position.x).toBeCloseTo(0.5);
  });

  it('responds faster to reversals than to continuing motion', () => {
    const fraction = (reverse: boolean) => {
      const clock = timer(1 / 60);
      const driver = new TranslateDriver(undefined, clock);
      const session = createRaySession({raySmoothing: true}, 0);
      const ray = session.primary.snapshot.ray!;
      const baseline = driver.capture(session)!;
      for (let i = 1; i <= 20; i++) {
        ray.origin.set(0.2 + 0.01 * i, 0, 0);
        advance(clock, driver, session, baseline);
      }
      const before = session.owner.position.x;
      const target = reverse ? before - 0.1 : before + 0.1;
      ray.origin.set(target, 0, 0);
      advance(clock, driver, session, baseline);
      return (session.owner.position.x - before) / (target - before);
    };

    const step = 1 / 60;
    expect(fraction(false)).toBeCloseTo(1 - Math.exp(-step / 0.072));
    expect(fraction(true)).toBeCloseTo(1 - Math.exp(-step / 0.018));
  });

  it('keeps the grab point on the owner while the ray orbits the viewer', () => {
    const driver = new TranslateDriver(new THREE.PerspectiveCamera());
    const session = createRaySession({faceCamera: true}, 0);
    session.owner.position.set(0, 0, -2);
    session.owner.updateWorldMatrix(true, false);
    const grab = new THREE.Vector3(0.5, 0, -2);
    (session.primary.capture as {point: THREE.Vector3}).point = grab;
    const ray = session.primary.snapshot.ray!;
    ray.direction.copy(grab).normalize();
    const baseline = driver.capture(session)!;

    const yaw = degrees(40);
    ray.direction.copy(grab).applyAxisAngle(Y_AXIS, yaw).normalize();
    const proposal = driver.propose(session, baseline)!;
    if (proposal.action !== 'translate') throw new Error('not translate');

    const expected = new THREE.Vector3(0, 0, -2).applyAxisAngle(Y_AXIS, yaw);
    expect(proposal.worldPosition.distanceTo(expected)).toBeCloseTo(0);
    const grabOffset = proposal.point.clone().sub(proposal.worldPosition);
    const expectedOffset = new THREE.Vector3(0.5, 0, 0).applyAxisAngle(
      Y_AXIS,
      yaw
    );
    expect(grabOffset.distanceTo(expectedOffset)).toBeCloseTo(0);
  });

  it('scales the grab offset with the owner when the depth changes', () => {
    const driver = new TranslateDriver(
      new THREE.PerspectiveCamera(),
      timer(0.5)
    );
    const session = createRaySession(
      {scaleWithDistance: true, pushPull: true},
      -1
    );
    const grab = new THREE.Vector3(0.2, 0, -1);
    (session.primary.capture as {point: THREE.Vector3}).point = grab;
    session.primary.snapshot.ray!.direction.copy(grab).normalize();
    const baseline = driver.capture(session)!;

    const proposal = driver.propose(session, baseline)!;
    proposal.apply();
    if (proposal.action !== 'translate') throw new Error('not translate');
    const factor = session.owner.scale.x;
    expect(factor).toBeGreaterThan(1.3);
    const grabOffset = proposal.point.clone().sub(proposal.worldPosition);
    expect(grabOffset.x).toBeCloseTo(0.2 * factor, 3);
    expect(grabOffset.y).toBeCloseTo(0);
    expect(grabOffset.z).toBeCloseTo(0, 3);
  });

  it('keeps rotation smoothing after dragging more than 0.5 m', () => {
    const driver = new TranslateDriver(
      new THREE.PerspectiveCamera(),
      timer(1 / 60)
    );
    const session = createSession({faceCamera: true});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.position.set(1, 0, -1);
    driver.propose(session, baseline)!.apply();

    // Facing the viewer from (1, 0, -1) is a 45 degree yaw.
    const alpha = faceCameraSlerpAlpha(DEFAULT_FACE_CAMERA_SMOOTHING, 1 / 60);
    expect(
      session.owner.quaternion.angleTo(new THREE.Quaternion())
    ).toBeCloseTo(alpha * degrees(45));
  });
});

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function degrees(value: number) {
  return THREE.MathUtils.degToRad(value);
}

function advance(
  clock: {frame: number},
  driver: TranslateDriver,
  session: ManipulationDriverSession,
  baseline: TranslateBaseline
) {
  clock.frame++;
  driver.propose(session, baseline)!.apply();
}

import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {
  InteractionSourceState,
  SelectionCapture,
} from '../../InteractionTypes';
import type {ScaleOptions, TranslateOptions} from '../ManipulationTypes';
import type {ManipulationDriverSession} from './DriverTypes';
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
    // 1.75 m of constant apparent size, then 0.5 m per meter.
    expect(session.owner.scale.x).toBeCloseTo(1.875);
    expect(proposal.action === 'translate' && proposal.scale.x).toBeCloseTo(
      1.875
    );

    const near = createSession({scaleWithDistance: true});
    const nearBaseline = driver.capture(near)!;
    near.primary.snapshot.position.set(0, 0, -1.5);
    driver.propose(near, nearBaseline)!.apply();
    expect(near.owner.scale.x).toBeCloseTo(1.5);
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
});

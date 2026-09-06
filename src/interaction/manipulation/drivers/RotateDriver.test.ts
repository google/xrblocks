import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {ManipulationDriverSession} from './DriverTypes';
import type {RotateOptions} from '../ManipulationTypes';
import type {
  InteractionSourceState,
  SelectionCapture,
} from '../../InteractionTypes';
import {RotateDriver} from './RotateDriver';

describe('RotateDriver', () => {
  function createSession(
    options: Partial<RotateOptions> = {},
    sourceType: 'controller' | 'mouse' = 'controller'
  ): ManipulationDriverSession {
    const owner = new THREE.Object3D();
    return {
      owner,
      config: {rotate: {sensitivity: 10, space: 'world', ...options}},
      primary: {
        capture: {} as unknown as SelectionCapture,
        snapshot: {
          sourceType,
          selected: true,
          position: new THREE.Vector3(),
          orientation: new THREE.Quaternion(),
        } as unknown as InteractionSourceState,
      },
    };
  }

  it('proposes zero angle when delta is zero', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'x', sensitivity: 10});
    const baseline = driver.capture(session)!;
    const proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBe(0);
  });

  it('ignores wrist-only rotation for Y-axis, keeping translation behavior unchanged', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'y', sensitivity: 2});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.5
    );
    let proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBe(0);

    session.primary.snapshot.position.x = 0.5;
    proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(1.0);
  });

  it('drives X-axis rotation using wrist orientation (positive and negative)', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'x', sensitivity: 1});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 4
    );
    let proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(Math.PI / 4);

    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 6
    );
    proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(-Math.PI / 6);
  });

  it('extracts target-axis twist correctly even when combined with orthogonal swing', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'x', sensitivity: 1});
    const baseline = driver.capture(session)!;

    const twist = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 4
    );
    const swing = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 3
    );

    session.primary.snapshot.orientation.copy(swing).multiply(twist);

    const proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(Math.PI / 4);
  });

  it('wraps twist angle to take the shortest path around 180 degrees', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'x', sensitivity: 1});
    const baseline = driver.capture(session)!;

    const angle179 = (179 * Math.PI) / 180;
    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      angle179
    );
    let proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(angle179);

    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI
    );
    proposal = driver.propose(session, baseline);
    expect(Math.abs(proposal?.angle ?? 0)).toBeCloseTo(Math.PI);

    const angle181 = (181 * Math.PI) / 180;
    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      angle181
    );
    proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(angle181 - 2 * Math.PI);
  });

  it('drives Z-axis rotation using wrist orientation', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'z', sensitivity: 1});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 3
    );
    const proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(Math.PI / 3);
  });

  it('ignores wrist-only rotation for arbitrary custom axes', () => {
    const driver = new RotateDriver();
    const axis = new THREE.Vector3(1, 1, 0).normalize();
    const session = createSession({axis, sensitivity: 2});
    const baseline = driver.capture(session)!;

    session.primary.snapshot.orientation.setFromAxisAngle(axis, 0.5);
    let proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBe(0);

    session.primary.snapshot.position.x = 0.5;
    proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(1.0);
  });

  it('correctly maps wrist orientation to a local-space rotated frame', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'x', space: 'local', sensitivity: 1});
    session.owner.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2
    );
    session.owner.updateMatrixWorld(true);

    const baseline = driver.capture(session)!;

    session.primary.snapshot.orientation.setFromAxisAngle(
      new THREE.Vector3(0, 0, -1),
      Math.PI / 5
    );
    const proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(Math.PI / 5);
  });

  it('preserves existing mouse behavior', () => {
    const driver = new RotateDriver();
    const session = createSession({axis: 'x', sensitivity: 2}, 'mouse');
    const baseline = driver.capture(session)!;

    session.primary.snapshot.orientation.setFromEuler(
      new THREE.Euler(0.5, 0.3, 0.1, 'YXZ')
    );
    const proposal = driver.propose(session, baseline);
    expect(proposal?.angle).toBeCloseTo(-0.3 * 2);
  });
});

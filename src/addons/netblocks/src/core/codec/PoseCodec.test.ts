import * as THREE from 'three';
import {expect, it} from 'vitest';
import {
  encodePose,
  decodePose,
  base64ToBytes,
  type PoseSnapshot,
} from './PoseCodec';

it('round-trips an asymmetric head and hand pose within wire precision', () => {
  const wrist = new THREE.Vector3(1.1, 1.7, -0.8);
  const joints = Array.from({length: 25}, (_, i) =>
    wrist.clone().add(new THREE.Vector3(i / 200, -i / 300, i / 400))
  );
  const pose: PoseSnapshot = {
    head: {
      position: new THREE.Vector3(2, 1.6, -3),
      quaternion: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.1, 0.3, -0.2)
      ),
    },
    hands: [
      {
        present: true,
        position: wrist,
        quaternion: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-0.3, 0.2, 0.1)
        ),
        joints,
      },
      {
        present: false,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      },
    ],
  };
  const decoded = decodePose(encodePose(pose));
  expect(decoded.head.position.distanceTo(pose.head.position)).toBeLessThan(
    0.001
  );
  expect(decoded.head.quaternion.angleTo(pose.head.quaternion)).toBeLessThan(
    0.001
  );
  expect(decoded.hands[0].position.distanceTo(wrist)).toBeLessThan(0.001);
  expect(
    decoded.hands[0].quaternion.angleTo(pose.hands[0].quaternion)
  ).toBeLessThan(0.001);
  for (const [index, joint] of joints.entries())
    expect(decoded.hands[0].joints![index].distanceTo(joint)).toBeLessThan(
      0.001
    );
  expect(decoded.hands[1].present).toBe(false);
});

it('rejects corrupt encoded input', () => {
  expect(() => base64ToBytes('!!')).toThrow();
  expect(() => decodePose(new Uint8Array([1]))).toThrow();
});

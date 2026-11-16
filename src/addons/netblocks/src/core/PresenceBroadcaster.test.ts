import {expect, it, vi} from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import * as THREE from 'three';
import {core} from 'xrblocks';
import {decodePose, base64ToBytes} from './codec/PoseCodec';
import type {NetMessage} from './codec/MessageCodec';
import {PresenceBroadcaster} from './presence/PresenceBroadcaster';

it('encodes the current world head pose and absent hands', () => {
  const originalCamera = core.camera;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1.2, 1.6, -3.4);
  camera.rotation.y = 0.4;
  camera.updateMatrixWorld(true);
  const sent: NetMessage[] = [];
  try {
    core.camera = camera;
    const broadcaster = new PresenceBroadcaster(
      (message) => sent.push(message),
      17
    );
    broadcaster.update(1000);
    const message = sent[0];
    expect(message.type).toBe('pose');
    if (message.type !== 'pose') throw new Error('Expected pose');
    const pose = decodePose(base64ToBytes(message.data))!;
    expect(pose.head.position.distanceTo(camera.position)).toBeLessThan(0.001);
    expect(pose.head.quaternion.angleTo(camera.quaternion)).toBeLessThan(0.001);
    expect(pose.hands.every((hand) => !hand.present)).toBe(true);
  } finally {
    core.camera = originalCamera;
  }
});

/**
 * PresenceBroadcaster: samples the local user's head + hand pose every
 * frame and broadcasts it on the configured cadence.
 *
 * It reads from `xb.core.camera` for the head and `xb.core.user.hands` for
 * the hands. Both are optional — if XR has not started, the broadcaster
 * skips silently. This makes it safe to attach in `init()` of any sample
 * before XR is available.
 *
 * The broadcaster never owns a transport; it just calls back into a
 * `send` function passed by NetSession.
 */
import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  bytesToBase64,
  encodePose,
  HandPose,
  PoseSnapshot,
} from '../codec/PoseCodec';
import {NetMessage} from '../codec/MessageCodec';
import {DEFAULT_PRESENCE_HZ} from '../constants/NetConstants';

/**
 * Standard WebXR hand joint names, in the canonical order. Inlined from
 * xrblocks/input/components/HandJointNames.js so this module has no internal
 * deep-import dependency on the host package layout.
 */
const HAND_JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

export type SendFn = (msg: NetMessage) => void;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class PresenceBroadcaster {
  hz: number;
  private _sendFn: SendFn;
  private _lastSendMs = 0;
  private _enabled = true;
  private _scratch: PoseSnapshot;

  constructor(sendFn: SendFn, hz: number = DEFAULT_PRESENCE_HZ) {
    this._sendFn = sendFn;
    this.hz = hz;
    this._scratch = {
      head: {position: new THREE.Vector3(), quaternion: new THREE.Quaternion()},
      hands: [makeHand(), makeHand()],
    };
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  /** Call once per frame from the NetSession's update loop. */
  update(nowMs: number): void {
    if (!this._enabled) return;
    const period = 1000 / this.hz;
    if (nowMs - this._lastSendMs < period) return;
    this._lastSendMs = nowMs;

    if (!this._fillSnapshot(this._scratch)) return;

    const bytes = encodePose(this._scratch);
    this._sendFn({
      type: 'pose',
      data: bytesToBase64(bytes),
      ts: nowMs,
    });
  }

  /** Build a snapshot from the current xb.core state. Returns false if no head pose. */
  private _fillSnapshot(out: PoseSnapshot): boolean {
    const camera = xb.core?.camera as THREE.Camera | undefined;
    if (!camera) return false;
    camera.matrixWorld.decompose(_v, _q, _s);
    out.head.position.copy(_v);
    out.head.quaternion.copy(_q);

    const user = xb.core?.user;
    const hands = user?.hands?.hands as THREE.XRHandSpace[] | undefined;
    for (let h = 0; h < 2; h++) {
      const dst = out.hands[h];
      const hand = hands ? hands[h] : undefined;
      const wrist = hand?.joints?.['wrist' as keyof typeof hand.joints];
      if (!hand || !wrist) {
        dst.present = false;
        continue;
      }
      dst.present = true;
      wrist.matrixWorld.decompose(_v, _q, _s);
      dst.position.copy(_v);
      dst.quaternion.copy(_q);

      if (!dst.joints || dst.joints.length !== HAND_JOINT_NAMES.length) {
        dst.joints = HAND_JOINT_NAMES.map(() => new THREE.Vector3());
      }
      const joints = dst.joints;
      for (let j = 0; j < HAND_JOINT_NAMES.length; j++) {
        const name = HAND_JOINT_NAMES[j] as keyof typeof hand.joints;
        const joint = hand.joints?.[name];
        if (joint) {
          joint.matrixWorld.decompose(_v, _q, _s);
          joints[j].copy(_v);
        } else {
          joints[j].copy(dst.position);
        }
      }
    }
    return true;
  }
}

function makeHand(): HandPose {
  return {
    present: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    joints: undefined,
  };
}

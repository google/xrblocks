import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {
  encodePose,
  decodePose,
  bytesToBase64,
  base64ToBytes,
  PoseSnapshot,
} from './PoseCodec';

function emptyHand() {
  return {
    present: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
}

function makeSnapshot(overrides: Partial<PoseSnapshot> = {}): PoseSnapshot {
  return {
    head: {
      position: new THREE.Vector3(1, 2, 3),
      quaternion: new THREE.Quaternion(0, 0, 0, 1),
    },
    hands: [emptyHand(), emptyHand()],
    ...overrides,
  };
}

describe('PoseCodec', () => {
  describe('encodePose / decodePose', () => {
    it('round-trips head pose with float32 precision', () => {
      const snap = makeSnapshot({
        head: {
          position: new THREE.Vector3(1.5, -2.25, 0.125),
          quaternion: new THREE.Quaternion(0.1, 0.2, 0.3, 0.927).normalize(),
        },
      });
      const decoded = decodePose(encodePose(snap));
      expect(decoded.head.position.x).toBeCloseTo(1.5, 5);
      expect(decoded.head.position.y).toBeCloseTo(-2.25, 5);
      expect(decoded.head.position.z).toBeCloseTo(0.125, 5);
      expect(decoded.head.quaternion.w).toBeCloseTo(snap.head.quaternion.w, 5);
    });

    it('produces a fixed 386-byte buffer regardless of hand presence', () => {
      const empty = encodePose(makeSnapshot());
      const full = encodePose(
        makeSnapshot({
          hands: [
            {
              present: true,
              position: new THREE.Vector3(0.1, 1.2, -0.3),
              quaternion: new THREE.Quaternion(0, 0, 0, 1),
              joints: Array.from(
                {length: 25},
                (_, i) => new THREE.Vector3(i * 0.001, 0, 0)
              ),
            },
            emptyHand(),
          ],
        })
      );
      expect(empty.byteLength).toBe(386);
      expect(full.byteLength).toBe(386);
    });

    it('preserves hand presence and position', () => {
      const snap = makeSnapshot({
        hands: [
          {
            present: true,
            position: new THREE.Vector3(0.5, 1.0, -0.25),
            quaternion: new THREE.Quaternion(0, 0, 0, 1),
          },
          emptyHand(),
        ],
      });
      const decoded = decodePose(encodePose(snap));
      expect(decoded.hands[0].present).toBe(true);
      expect(decoded.hands[1].present).toBe(false);
      expect(decoded.hands[0].position.x).toBeCloseTo(0.5, 5);
      expect(decoded.hands[0].position.y).toBeCloseTo(1.0, 5);
      expect(decoded.hands[0].position.z).toBeCloseTo(-0.25, 5);
    });

    it('round-trips hand joints within the ±0.25m quantization range', () => {
      // Joints are encoded relative to the wrist; pick offsets within ±0.25 m.
      const wrist = new THREE.Vector3(1, 1, 1);
      const joints = Array.from(
        {length: 25},
        (_, i) =>
          new THREE.Vector3(
            wrist.x + (i % 5) * 0.05 - 0.1,
            wrist.y - (i % 3) * 0.05 + 0.05,
            wrist.z + (i % 7) * 0.02 - 0.05
          )
      );
      const snap = makeSnapshot({
        hands: [
          {
            present: true,
            position: wrist,
            quaternion: new THREE.Quaternion(0, 0, 0, 1),
            joints,
          },
          emptyHand(),
        ],
      });
      const decoded = decodePose(encodePose(snap));
      expect(decoded.hands[0].joints).toBeDefined();
      expect(decoded.hands[0].joints).toHaveLength(25);
      for (let i = 0; i < 25; i++) {
        // Quantization is ±0.25m / 32767 ≈ 7.6 µm per step. 1mm is plenty.
        expect(decoded.hands[0].joints![i].x).toBeCloseTo(joints[i].x, 3);
        expect(decoded.hands[0].joints![i].y).toBeCloseTo(joints[i].y, 3);
        expect(decoded.hands[0].joints![i].z).toBeCloseTo(joints[i].z, 3);
      }
    });

    it('clamps joint offsets that exceed the quantization range', () => {
      const wrist = new THREE.Vector3();
      const joints = Array.from(
        {length: 25},
        () => new THREE.Vector3(10, 10, 10) // way outside ±0.25 m
      );
      const snap = makeSnapshot({
        hands: [
          {
            present: true,
            position: wrist,
            quaternion: new THREE.Quaternion(0, 0, 0, 1),
            joints,
          },
          emptyHand(),
        ],
      });
      const decoded = decodePose(encodePose(snap));
      // Anything outside the range is clamped to ±0.25m around the wrist.
      for (const j of decoded.hands[0].joints!) {
        expect(j.x).toBeCloseTo(0.25, 5);
        expect(j.y).toBeCloseTo(0.25, 5);
        expect(j.z).toBeCloseTo(0.25, 5);
      }
    });

    it('treats missing joints as zero offset from the wrist', () => {
      const wrist = new THREE.Vector3(2, 3, 4);
      const snap = makeSnapshot({
        hands: [
          {
            present: true,
            position: wrist,
            quaternion: new THREE.Quaternion(0, 0, 0, 1),
            // joints undefined
          },
          emptyHand(),
        ],
      });
      const decoded = decodePose(encodePose(snap));
      for (const j of decoded.hands[0].joints!) {
        expect(j.x).toBeCloseTo(wrist.x, 5);
        expect(j.y).toBeCloseTo(wrist.y, 5);
        expect(j.z).toBeCloseTo(wrist.z, 5);
      }
    });
  });

  describe('bytesToBase64 / base64ToBytes', () => {
    it('round-trips arbitrary byte sequences', () => {
      for (const len of [0, 1, 2, 3, 4, 5, 16, 17, 100, 386]) {
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = (i * 37) & 0xff;
        const decoded = base64ToBytes(bytesToBase64(bytes));
        expect(decoded).toEqual(bytes);
      }
    });

    it('produces base64 output without spaces or newlines', () => {
      const b64 = bytesToBase64(new Uint8Array([1, 2, 3, 4, 5]));
      expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('emits the right number of pad characters', () => {
      // 1 byte → 2 pad, 2 bytes → 1 pad, 3 bytes → 0 pad
      expect(bytesToBase64(new Uint8Array([1])).endsWith('==')).toBe(true);
      expect(
        bytesToBase64(new Uint8Array([1, 2])).endsWith('=') &&
          !bytesToBase64(new Uint8Array([1, 2])).endsWith('==')
      ).toBe(true);
      expect(bytesToBase64(new Uint8Array([1, 2, 3])).endsWith('=')).toBe(
        false
      );
    });

    it('throws on invalid characters in required positions', () => {
      // First two sextets are required for any output byte.
      expect(() => base64ToBytes('!!')).toThrow();
      expect(() => base64ToBytes('A!')).toThrow();
    });
  });
});

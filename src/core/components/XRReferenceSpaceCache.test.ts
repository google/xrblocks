import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {XRReferenceSpaceCache} from './XRReferenceSpaceCache';

if (typeof globalThis.XRRigidTransform === 'undefined') {
  (
    globalThis as unknown as {
      XRRigidTransform: new (
        pos: {x: number; y: number; z: number},
        orient: {x: number; y: number; z: number; w: number}
      ) => XRRigidTransform;
    }
  ).XRRigidTransform = class XRRigidTransform {
    position: DOMPointReadOnly;
    orientation: DOMPointReadOnly;
    matrix: Float32Array;
    inverse: XRRigidTransform;

    constructor(
      position: {x: number; y: number; z: number},
      orientation: {x: number; y: number; z: number; w: number}
    ) {
      this.position = {
        x: position.x,
        y: position.y,
        z: position.z,
        w: 1,
      } as DOMPointReadOnly;
      this.orientation = {
        x: orientation.x,
        y: orientation.y,
        z: orientation.z,
        w: orientation.w,
      } as DOMPointReadOnly;
      const mat = new THREE.Matrix4()
        .compose(
          new THREE.Vector3(position.x, position.y, position.z),
          new THREE.Quaternion(
            orientation.x,
            orientation.y,
            orientation.z,
            orientation.w
          ),
          new THREE.Vector3(1, 1, 1)
        )
        .toArray();
      this.matrix = new Float32Array(mat);
      this.inverse = this;
    }
  };
}

describe('XRReferenceSpaceCache', () => {
  it('caches reference spaces on session start', async () => {
    const cache = new XRReferenceSpaceCache();
    const mockSpace = {} as XRReferenceSpace;
    const requestReferenceSpace = vi
      .fn()
      .mockImplementation((type: string) =>
        type === 'local-floor' ? Promise.resolve(mockSpace) : Promise.reject()
      );
    const listeners: Record<string, () => void> = {};
    const mockSession = {
      requestReferenceSpace,
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = fn;
      },
      removeEventListener: vi.fn(),
    } as unknown as XRSession;

    cache.onXRSessionStart(mockSession);

    await new Promise((r) => setTimeout(r, 10));

    expect(cache.getCached('local-floor')).toBe(mockSpace);
    expect(cache.getCached('viewer')).toBeUndefined();

    // Trigger end event
    listeners['end']?.();
    expect(cache.getCached('local-floor')).toBeUndefined();
  });

  it('converts a pose between reference spaces using frame', () => {
    const cache = new XRReferenceSpaceCache();

    const spaceA = {} as XRSpace;
    const spaceB = {} as XRSpace;

    // Transform mapping spaceA to spaceB: shifted by (0, 1, 0)
    const relMatrix = new THREE.Matrix4().makeTranslation(0, 1, 0).toArray();
    const mockFrame = {
      getPose: vi.fn().mockImplementation((from, to) => {
        if (from === spaceA && to === spaceB) {
          return {
            transform: {
              matrix: new Float32Array(relMatrix),
            },
          };
        }
        return null;
      }),
    } as unknown as XRFrame;

    // Pose in spaceA: shifted by (2, 0, 0)
    const poseMatrix = new THREE.Matrix4().makeTranslation(2, 0, 0).toArray();
    const mockPose = {
      matrix: new Float32Array(poseMatrix),
    } as unknown as XRRigidTransform;

    const result = cache.convertPose(mockPose, spaceA, spaceB, mockFrame);

    expect(result).not.toBeNull();
    expect(result!.position.x).toBeCloseTo(2);
    expect(result!.position.y).toBeCloseTo(1);
    expect(result!.position.z).toBeCloseTo(0);
  });

  it('returns null if reference space is missing or unresolvable', () => {
    const cache = new XRReferenceSpaceCache();
    const mockFrame = {
      getPose: vi.fn(),
    } as unknown as XRFrame;
    const mockPose = {
      matrix: new Float32Array(new THREE.Matrix4().identity().toArray()),
    } as unknown as XRRigidTransform;

    // 'local' and 'viewer' are not cached yet
    const result = cache.convertPose(mockPose, 'local', 'viewer', mockFrame);
    expect(result).toBeNull();
  });
});

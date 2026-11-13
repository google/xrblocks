import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {XRReferenceSpaceCache} from './XRReferenceSpaceCache';

afterEach(() => vi.unstubAllGlobals());

it('converts a pose in the correct rotation/translation order and rejects missing spaces', () => {
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      constructor(
        public position: DOMPointReadOnly,
        public orientation: DOMPointReadOnly
      ) {}
    }
  );
  const cache = new XRReferenceSpaceCache();
  const from = {} as XRSpace;
  const to = {} as XRSpace;
  const relation = new THREE.Matrix4()
    .makeRotationY(Math.PI / 2)
    .setPosition(0, 1, 0);
  const frame = {
    getPose: (a: XRSpace, b: XRSpace) =>
      a === from && b === to ? {transform: {matrix: relation.elements}} : null,
  } as XRFrame;
  const pose = {
    matrix: new THREE.Matrix4().makeTranslation(2, 0, 0).elements,
  } as unknown as XRRigidTransform;
  const result = cache.convertPose(pose, from, to, frame)!;
  expect(result.position.x).toBeCloseTo(0);
  expect(result.position.y).toBeCloseTo(1);
  expect(result.position.z).toBeCloseTo(-2);
  expect(result.orientation.y).toBeCloseTo(Math.SQRT1_2);
  expect(result.orientation.w).toBeCloseTo(Math.SQRT1_2);
  expect(cache.convertPose(pose, 'local', 'viewer', frame)).toBeNull();
});

it('clears ended spaces and rejects old completions while a new session is active', async () => {
  const cache = new XRReferenceSpaceCache();
  const pending = Promise.withResolvers<XRReferenceSpace>();
  const old = Object.assign(new EventTarget(), {
    requestReferenceSpace: async (type: string) => {
      if (type === 'local') return pending.promise;
      if (type === 'local-floor') return {} as XRReferenceSpace;
      throw new Error('Unsupported reference space');
    },
  }) as unknown as XRSession;
  cache.onXRSessionStart(old);
  await vi.waitFor(() => expect(cache.getCached('local-floor')).toBeDefined());
  old.dispatchEvent(new Event('end'));
  expect(cache.getCached('local-floor')).toBeUndefined();
  const currentSpace = {} as XRReferenceSpace;
  const current = Object.assign(new EventTarget(), {
    requestReferenceSpace: async () => currentSpace,
  }) as unknown as XRSession;
  cache.onXRSessionStart(current);
  await vi.waitFor(() => expect(cache.getCached('local')).toBe(currentSpace));
  pending.resolve({} as XRReferenceSpace);
  await pending.promise;
  await Promise.resolve();
  expect(cache.getCached('local')).toBe(currentSpace);
  current.dispatchEvent(new Event('end'));
  expect(cache.getCached('local')).toBeUndefined();
});

import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {UIHitRegion} from './UIHitRegion';

const mounted: Container[] = [];
afterEach(() => {
  for (const node of mounted.splice(0).reverse()) node.dispose();
});

async function scene() {
  const mount = new THREE.Group();
  mount.position.set(0.3, 1.2, -2);
  mount.rotation.y = 0.4;
  mount.scale.setScalar(0.7);
  const viewport = new Container({
    width: 200,
    height: 100,
    pixelSize: 0.01,
    overflow: 'scroll',
    flexDirection: 'column',
  });
  mount.add(viewport);
  const children = Array.from(
    {length: 3},
    () => new Container({width: '100%', height: 100, flexShrink: 0})
  );
  viewport.add(...children);
  mounted.push(viewport, ...children);
  await vi.waitFor(() => {
    viewport.update(16);
    expect(viewport.maxScrollPosition.peek()[1]).toBe(200);
  });
  mount.updateMatrixWorld(true);
  return {
    viewport,
    children,
  };
}

describe('UIHitRegion', () => {
  it('excludes clipped touch points and zero-area edge bounds under transformed parents', async () => {
    const {viewport, children} = await scene();
    const regions = children.map((child) => new UIHitRegion(child));
    expect(
      regions[0].containsPoint(
        children[0].getWorldPosition(new THREE.Vector3())
      )
    ).toBe(true);
    expect(
      regions[2].containsPoint(
        children[2].getWorldPosition(new THREE.Vector3())
      )
    ).toBe(false);
    expect(regions[1].bounds(new THREE.Box3())).toBeNull();
    viewport.scrollPosition.value = [0, 50];
    viewport.update(16);
    expect(
      regions[0].bounds(new THREE.Box3())!.getSize(new THREE.Vector3()).y
    ).toBeCloseTo(0.35);
    children[0].updateWorldMatrix(true, false);
    const clipped = new THREE.Vector3(0, 0.4, 0).applyMatrix4(
      children[0].matrixWorld
    );
    expect(regions[0].containsPoint(clipped)).toBe(false);
    viewport.scrollPosition.value = [0, 100];
    viewport.update(16);
    expect(regions[0].bounds(new THREE.Box3())).toBeNull();
    expect(regions[1].bounds(new THREE.Box3())).not.toBeNull();
    expect(
      regions[1].containsPoint(
        children[1].getWorldPosition(new THREE.Vector3())
      )
    ).toBe(true);
  });
});

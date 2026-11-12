import * as THREE from 'three';
import {NodeFrame, WebGPURenderer, WGSLNodeBuilder} from 'three/webgpu';
import {Container} from '@pmndrs/uikit';
import {afterEach, expect, it, vi} from 'vitest';
import {setWebGPUUIHandler} from './PanelMaterialFactory';
import {UnifiedPanelLayer} from '../primitives/layers/UnifiedPanelLayer';
import {webgpuUIHandler} from './WebGPUUIMaterials';

afterEach(() => setWebGPUUIHandler(undefined));

it.each(['scroll', 'hidden'] as const)('clips transformed %s panels using the currently drawn material', async overflow => {
  setWebGPUUIHandler(webgpuUIHandler);
  const mount = new THREE.Group();
  mount.position.set(0.3, 1.2, -2);
  mount.rotation.set(0.2, 0.4, -0.1);
  mount.scale.set(0.7, 0.9, 1.1);
  const viewport = new Container({width: 200, height: 100, pixelSize: 0.01, overflow});
  const layer = new UnifiedPanelLayer({width: 300, height: 300, flexShrink: 0, fillColor: '#ffffff'});
  const other = new UnifiedPanelLayer({fillColor: '#ff0000'});
  const geometry = new THREE.PlaneGeometry();
  mount.add(viewport);
  viewport.add(layer);
  try {
    await vi.waitFor(() => { viewport.update(16); expect(viewport.size.peek()).toEqual([200, 100]); });
    mount.updateMatrixWorld(true);
    const builder = new WGSLNodeBuilder(new THREE.Mesh(geometry, layer.material), new WebGPURenderer());
    builder.scene = new THREE.Scene();
    builder.camera = new THREE.PerspectiveCamera();
    builder.build();
    const planes = builder.updateNodes.filter(node => node.name?.startsWith('xbPanelClip'));
    const frame = new NodeFrame();
    frame.material = layer.material;
    const update = () => { for (const plane of planes) plane.update(frame); };
    const inside = (x: number, y: number) => {
      const point = new THREE.Vector3(x, y, 0).applyMatrix4(mount.matrixWorld);
      return planes.every(({value}) => value.dot(new THREE.Vector4(point.x, point.y, point.z, 1)) >= 0);
    };
    update();
    expect(inside(0, 0)).toBe(true);
    for (const [x, y] of [[-1.1, 0], [1.1, 0], [0, -0.6], [0, 0.6]]) expect(inside(x, y)).toBe(false);
    mount.position.x += 3;
    viewport.scrollPosition.value = [0, 50];
    viewport.update(16);
    mount.updateMatrixWorld(true);
    update();
    expect(inside(0, 0)).toBe(true);
    expect(inside(1.1, 0)).toBe(false);
    frame.material = other.material;
    other.material.clippingPlanes = null;
    update();
    expect(inside(1000, 1000)).toBe(true);
    frame.material = layer.material;
    update();
    expect(inside(-1.1, 0)).toBe(false);
  } finally {
    geometry.dispose();
    other.dispose(); other.material.dispose();
    layer.dispose(); layer.material.dispose();
    viewport.dispose();
  }
});

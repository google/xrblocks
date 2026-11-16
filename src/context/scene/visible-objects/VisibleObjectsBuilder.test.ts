import * as THREE from 'three';
import {expect, it} from 'vitest';
import {SemanticIdRegistry} from '../../shared/SemanticIdRegistry';
import {buildSemanticTree} from '../semantic-tree/SemanticTreeBuilder';
import {createVisibleObjectsContext} from './VisibleObjectsBuilder';
it('keeps noninteractive geometry in visibility checks', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
  const target = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)),
    occluder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1));
  target.position.z = -2;
  target.userData.semantic = {name: 'Target'};
  occluder.position.z = -1;
  occluder.xb = {pointerEvents: 'none'};
  scene.add(target, occluder);
  const tree = buildSemanticTree({
      scene,
      registry: new SemanticIdRegistry(),
      capturedAt: 0,
    }),
    id = tree.objectNodeIds.get(target)!;
  expect(
    createVisibleObjectsContext({scene, camera, semanticTree: tree}).nodes[id]
      .view?.inLineOfSight
  ).toBe(false);
  occluder.position.x = 3;
  const next = buildSemanticTree({
    scene,
    registry: new SemanticIdRegistry(),
    capturedAt: 1,
  });
  expect(
    createVisibleObjectsContext({scene, camera, semanticTree: next}).nodes[
      next.objectNodeIds.get(target)!
    ].view?.inLineOfSight
  ).toBe(true);
  target.geometry.dispose();
  occluder.geometry.dispose();
});

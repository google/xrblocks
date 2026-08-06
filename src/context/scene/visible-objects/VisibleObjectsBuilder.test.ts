import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {SemanticTreeInternal} from '../semantic-tree/SemanticTreeBuilder';
import {createVisibleObjectsContext} from './VisibleObjectsBuilder';

describe('createVisibleObjectsContext', () => {
  it('keeps pointer-events-disabled objects in occlusion checks', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
    const target = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    const occluderRoot = new THREE.Group();
    const occluder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1));
    target.position.z = -2;
    occluder.position.z = -1;
    occluderRoot.xb = {pointerEvents: 'none'};
    occluderRoot.add(occluder);
    scene.add(target, occluderRoot);

    const semanticTree: SemanticTreeInternal = {
      tree: {
        snapshotId: 'test',
        capturedAt: 0,
        rootIds: ['target'],
        nodes: {
          target: {
            id: 'target',
            role: 'object',
            name: 'Target',
            visible: true,
            position: [0, 0, -2],
            children: [],
          },
        },
      },
      nodeObjects: new Map([['target', target]]),
      objectNodeIds: new WeakMap([[target, 'target']]),
    };

    const context = createVisibleObjectsContext({
      scene,
      camera,
      semanticTree,
    });

    expect(context.nodes.target.view?.inLineOfSight).toBe(false);
  });
});

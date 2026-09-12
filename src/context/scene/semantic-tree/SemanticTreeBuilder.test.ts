import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {registerUIPresentationObject} from '../../../ui/UIElement';
import {UICard} from '../../../ui/components/UICard';
import {UIPanel} from '../../../ui/components/UIPanel';
import {SemanticIdRegistry} from '../../shared/SemanticIdRegistry';
import {buildSemanticTree} from './SemanticTreeBuilder';

function findNode(
  tree: ReturnType<typeof buildSemanticTree>,
  name: string
): (typeof tree.tree.nodes)[string] | undefined {
  return Object.values(tree.tree.nodes).find((node) => node.name === name);
}

describe('buildSemanticTree', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports world positions and bounds under a transformed parent', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.name = 'Parent';
    parent.position.set(1, 2, 3);
    const child = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    child.name = 'Child';
    child.userData.semantic = {name: 'Child'};
    child.position.x = 2;
    parent.add(child);
    scene.add(parent);

    const tree = buildSemanticTree({
      scene,
      registry: new SemanticIdRegistry(),
      capturedAt: 0,
    });

    const node = findNode(tree, 'Child');
    expect(node?.position).toEqual([3, 2, 3]);
    expect(node?.bounds).toEqual({center: [3, 2, 3], size: [2, 2, 2]});
  });

  it('picks up transforms that changed since the previous snapshot', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.name = 'Parent';
    const child = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    child.name = 'Child';
    child.userData.semantic = {name: 'Child'};
    parent.add(child);
    scene.add(parent);
    const registry = new SemanticIdRegistry();

    buildSemanticTree({scene, registry, capturedAt: 0});
    parent.position.set(4, 5, 6);
    parent.scale.setScalar(2);
    child.position.x = 1;
    const tree = buildSemanticTree({scene, registry, capturedAt: 16});

    const node = findNode(tree, 'Child');
    expect(node?.position).toEqual([6, 5, 6]);
    expect(node?.bounds).toEqual({center: [6, 5, 6], size: [4, 4, 4]});
  });

  it('does not force a subtree refresh for each semantic node', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.name = 'Parent';
    const child = new THREE.Group();
    child.name = 'Child';
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    leaf.name = 'Leaf';
    leaf.userData.semantic = {name: 'Leaf'};
    child.add(leaf);
    parent.add(child);
    scene.add(parent);
    const parentUpdate = vi.spyOn(parent, 'updateMatrixWorld');
    const childUpdate = vi.spyOn(child, 'updateMatrixWorld');
    const leafUpdate = vi.spyOn(leaf, 'updateMatrixWorld');

    buildSemanticTree({
      scene,
      registry: new SemanticIdRegistry(),
      capturedAt: 0,
    });

    // Only counts forced updateMatrixWorld walks. Bounds still refresh
    // descendants through Box3.setFromObject.
    expect(parentUpdate).toHaveBeenCalledOnce();
    expect(childUpdate).toHaveBeenCalledOnce();
    expect(leafUpdate).toHaveBeenCalledOnce();
  });

  it('keeps a custom getWorldPosition override authoritative', () => {
    class PresentedObject extends THREE.Mesh {
      readonly presentation = new THREE.Object3D();

      override getWorldPosition(target: THREE.Vector3): THREE.Vector3 {
        return this.presentation.getWorldPosition(target);
      }
    }
    const scene = new THREE.Scene();
    const object = new PresentedObject(new THREE.BoxGeometry(1, 1, 1));
    object.name = 'Presented';
    object.userData.semantic = {name: 'Presented'};
    object.position.set(1, 1, 1);
    object.presentation.position.set(-3, 0, 5);
    scene.add(object, object.presentation);

    const tree = buildSemanticTree({
      scene,
      registry: new SemanticIdRegistry(),
      capturedAt: 0,
    });

    expect(findNode(tree, 'Presented')?.position).toEqual([-3, 0, 5]);
  });

  it('reports a UI element from its registered presentation object', () => {
    const scene = new THREE.Scene();
    const card = new UICard({size: {width: 0.6, height: 0.4}});
    const panel = new UIPanel();
    panel.name = 'PresentedPanel';
    card.add(panel);
    card.position.set(1, 1, 1);
    scene.add(card);

    // The UI backend renders elements under a private root that the semantic
    // walk prunes, so the element node is the only place this position shows up.
    const renderRoot = new THREE.Object3D();
    renderRoot.userData.xrblocksPrivate = true;
    renderRoot.position.set(-4, 0, 4);
    const presentation = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.01));
    presentation.position.set(1, 0.5, 1);
    renderRoot.add(presentation);
    scene.add(renderRoot);
    const unregister = registerUIPresentationObject(panel, presentation);

    try {
      const tree = buildSemanticTree({
        scene,
        registry: new SemanticIdRegistry(),
        capturedAt: 0,
      });

      scene.updateMatrixWorld(true);
      const logicalPosition = new THREE.Vector3().setFromMatrixPosition(
        panel.matrixWorld
      );
      expect(logicalPosition.toArray()).toEqual([1, 1, 1]);

      const node = findNode(tree, 'PresentedPanel');
      expect(node?.position).toEqual([-3, 0.5, 5]);
      expect(node?.bounds).toEqual({
        center: [-3, 0.5, 5],
        size: [0.4, 0.2, 0.01],
      });
      expect(
        Object.values(tree.tree.nodes).some(
          (candidate) => candidate.objectId === presentation.id
        )
      ).toBe(false);
    } finally {
      unregister();
    }
  });
});

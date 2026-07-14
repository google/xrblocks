import {describe, it, expect, beforeEach} from 'vitest';
import * as THREE from 'three';
import {DragManager, DragMode} from './DragManager';
import {View} from '../ui/core/View';
import {Panel} from '../ui/core/Panel';
import {Input} from '../input/Input';

describe('DragManager', () => {
  let dragManager: DragManager;
  let mockInput: Input;
  let mockCamera: THREE.Camera;
  let controller: THREE.Object3D;

  beforeEach(() => {
    dragManager = new DragManager();
    mockInput = {} as unknown as Input;
    mockCamera = new THREE.Camera();
    dragManager.init({input: mockInput, camera: mockCamera});

    controller = new THREE.Object3D();
    controller.position.set(0, 0, 0);
    controller.quaternion.identity();
    controller.scale.set(1, 1, 1);
  });

  it('allows dragging of parent panel when clicking on the panel background mesh', () => {
    const panel = new Panel({draggable: true});
    panel.position.set(0, 0, -2);

    // The panel's background mesh is panels own mesh child
    const intersectionMesh = panel.mesh;

    const intersection = {
      object: intersectionMesh,
      point: new THREE.Vector3(0, 0, -2),
      distance: 2,
    } as THREE.Intersection;

    const dragStarted = dragManager.beginDragging(intersection, controller);
    expect(dragStarted).toBe(true);
  });

  it('prevents dragging of parent panel when clicking on a View with draggingMode DO_NOT_DRAG', () => {
    const panel = new Panel({draggable: true});
    panel.position.set(0, 0, -2);

    const button = new View({draggingMode: DragMode.DO_NOT_DRAG});
    panel.add(button);

    // Simulate clicking on the button's mesh
    const buttonMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    button.add(buttonMesh);

    const intersection = {
      object: buttonMesh,
      point: new THREE.Vector3(0, 0, -2),
      distance: 2,
    } as THREE.Intersection;

    const dragStarted = dragManager.beginDragging(intersection, controller);
    expect(dragStarted).toBe(false);
  });

  it('allows dragging of parent panel when clicking on a child View without DO_NOT_DRAG', () => {
    const panel = new Panel({draggable: true});
    panel.position.set(0, 0, -2);

    const childView = new View(); // default draggingMode is undefined
    panel.add(childView);

    const childMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    childView.add(childMesh);

    const intersection = {
      object: childMesh,
      point: new THREE.Vector3(0, 0, -2),
      distance: 2,
    } as THREE.Intersection;

    const dragStarted = dragManager.beginDragging(intersection, controller);
    expect(dragStarted).toBe(true);
  });
});

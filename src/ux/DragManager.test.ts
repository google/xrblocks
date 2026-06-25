import {describe, it, expect, beforeEach} from 'vitest';
import * as THREE from 'three';
import {DragManager, Draggable, DragMode, HasDraggingMode} from './DragManager';
import {Panel} from '../ui/core/Panel';
import {Input} from '../input/Input';

describe('DragManager edge dragging', () => {
  let input: Input;
  let camera: THREE.Camera;
  let dragManager: DragManager;

  beforeEach(() => {
    input = new Input();
    camera = new THREE.Camera();
    dragManager = new DragManager();
    dragManager.init({input, camera});
  });

  it('allows dragging panel from edge, but prevents dragging from center or child views', () => {
    // A standard draggable panel uses useBorderlessShader=false and panelScale=1.3 by default
    const panel = new Panel({draggable: true});

    // 1. Dragging from the edge of the panel should succeed
    const edgeIntersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: panel.mesh,
      uv: new THREE.Vector2(0.02, 0.5), // on the left edge (outside margins)
    };
    const controller = new THREE.Object3D();

    let result = dragManager.beginDragging(edgeIntersection, controller);
    expect(result).toBe(true);
    dragManager.onSelectEnd();

    // 2. Dragging from the center of the panel background should fail
    const centerIntersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: panel.mesh,
      uv: new THREE.Vector2(0.5, 0.5), // center (inside [0.1154, 0.8846])
    };
    result = dragManager.beginDragging(centerIntersection, controller);
    expect(result).toBe(false);

    // 3. Dragging from a child view / button should fail
    const childMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1));
    panel.add(childMesh); // add as a child to the panel

    const childIntersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: childMesh,
      uv: new THREE.Vector2(0.5, 0.5),
    };
    result = dragManager.beginDragging(childIntersection, controller);
    expect(result).toBe(false);
  });

  it('allows dragging from anywhere on borderless draggable panels', () => {
    const borderlessPanel = new Panel({
      draggable: true,
      useBorderlessShader: true, // sets panelScale=1.0
    });

    const centerIntersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: borderlessPanel.mesh,
      uv: new THREE.Vector2(0.5, 0.5),
    };
    const controller = new THREE.Object3D();

    const result = dragManager.beginDragging(centerIntersection, controller);
    expect(result).toBe(true);
  });

  it('does not affect dragging on non-panel objects', () => {
    // Create a generic draggable object
    const genericDraggable = new THREE.Object3D() as Draggable;
    genericDraggable.draggable = true;
    (genericDraggable as unknown as HasDraggingMode).draggingMode =
      DragMode.TRANSLATING;

    const childMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    genericDraggable.add(childMesh);

    const intersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: childMesh,
    };
    const controller = new THREE.Object3D();

    const result = dragManager.beginDragging(intersection, controller);
    expect(result).toBe(true);
  });

  it('respects custom borderWidth values', () => {
    // Custom border width = 0.2m
    const panel = new Panel({draggable: true, borderWidth: 0.2});

    // layoutWidth = 1.024, layoutHeight = 0.720
    // meshWidth = 1.224, meshHeight = 0.920
    // UV margin in X: (0.2 / 2) / 1.224 ≈ 0.0817

    // uv.x = 0.06 is within the 0.0817 margin, so it should drag
    const edgeIntersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: panel.mesh,
      uv: new THREE.Vector2(0.06, 0.5),
    };
    const controller = new THREE.Object3D();

    let result = dragManager.beginDragging(edgeIntersection, controller);
    expect(result).toBe(true);
    dragManager.onSelectEnd();

    // uv.x = 0.10 is outside the 0.0817 margin, so it should fail to drag
    const innerIntersection: THREE.Intersection = {
      distance: 1,
      point: new THREE.Vector3(0, 0, 0),
      object: panel.mesh,
      uv: new THREE.Vector2(0.1, 0.5),
    };
    result = dragManager.beginDragging(innerIntersection, controller);
    expect(result).toBe(false);
  });
});

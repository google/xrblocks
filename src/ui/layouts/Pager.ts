import * as THREE from 'three';

import {SelectEvent} from '../../core/Script';
import {Input} from '../../input/Input';
import {clamp} from '../../utils/utils';
import {View} from '../core/View';
import {ViewOptions} from '../core/ViewOptions';

import {Page} from './Page';
import {PagerState} from './PagerState';

const vector3 = new THREE.Vector3();
const matrix4 = new THREE.Matrix4();

type MaybeDisposable = {
  dispose?: () => void
};

export type PagerOptions = ViewOptions&{
  state?: PagerState;
  enableRaycastOnChildren?: boolean;
  continuousScrolling?: boolean;
}

/**
 * A layout container that manages a collection of `Page` views and
 * allows the user to navigate between them, typically through swiping
 * gestures. It clips the content of its pages to create a sliding window
 * effect.
 */
export class Pager extends View {
  static dependencies = {renderer: THREE.WebGLRenderer, input: Input};

  localClippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.5),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.5),
  ];
  raycastMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({visible: false}));

  state: PagerState;
  clippingPlanes: THREE.Plane[] = [];
  private selecting = false;
  private selectStartPositionLocal = new THREE.Vector3();
  private selectStartPage = 0;
  private raycastPlane = new THREE.Plane();
  private selectingRay = new THREE.Ray();
  private selectingRayTarget = new THREE.Vector3();
  private selectingController!: THREE.Object3D;
  private enableRaycastOnChildren;
  private continuousScrolling;
  private input!: Input;

  constructor(options: PagerOptions = {}) {
    super(options);
    const {
      state = new PagerState({pages: 1}),
      enableRaycastOnChildren = true,
      continuousScrolling = true
    } = options;
    this.state = state;
    this.enableRaycastOnChildren = enableRaycastOnChildren;
    this.continuousScrolling = continuousScrolling;
    for (let i = 0; i < this.state.pages; i++) {
      this.add(new Page());
    }
    for (let i = 0; i < this.localClippingPlanes.length; i++) {
      this.clippingPlanes.push(this.localClippingPlanes[i].clone());
    }
  }

  init({renderer, input}: {renderer: THREE.WebGLRenderer, input: Input}) {
    renderer.localClippingEnabled = true;
    this.input = input;
  }

  updatePageCount() {
    this.remove(this.raycastMesh);
    for (let i = this.children.length; i < this.state.pages; i++) {
      this.add(new Page());
    }
    for (let i = this.state.pages; i < this.children.length;) {
      (this.children[i] as MaybeDisposable).dispose?.();
      this.remove(this.children[i]);
    }
    this.add(this.raycastMesh);
  }

  updatePagePositions() {
    const halfNumberOfPages = Math.floor(this.state.pages / 2);
    for (let i = 0; i < this.state.pages; i++) {
      const deltaFromCurrentPage =
          this.continuousScrolling && this.state.pages > 1 ?
          ((i - this.state.currentPage + halfNumberOfPages + this.state.pages) %
               this.state.pages -
           halfNumberOfPages) :
          i - this.state.currentPage;
      this.children[i].position.x = deltaFromCurrentPage * this.rangeX;
    }
  }

  resetClippingPlanesToLocalSpace() {
    for (let i = 0;
         i < this.localClippingPlanes.length && i < this.clippingPlanes.length;
         i++) {
      this.clippingPlanes[i].copy(this.localClippingPlanes[i]);
    }
  }

  updateClippingPlanes() {
    // Map the clipping planes back to world space.
    this.resetClippingPlanesToLocalSpace();
    this.updateWorldMatrix(/*updateParents=*/ true, /*updateChildren=*/ false);
    for (const plane of this.clippingPlanes) {
      plane.applyMatrix4(this.matrixWorld);
    }
    this.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material.clippingPlanes = this.clippingPlanes;
      }
    });
  }

  update() {
    this.updatePageCount();
    this.updatePagePositions();
    this.updateClippingPlanes();
  }

  updateLayout() {
    super.updateLayout();
    this.raycastMesh.scale.set(this.rangeX, this.rangeY, 1.0);
  }

  onObjectSelectStart(event: SelectEvent) {
    const controller = event.target;
    const intersections =
        this.input.intersectionsForController.get(controller)!;
    const intersectionIndex =
        intersections.findIndex(intersection => intersection.object == this);
    if (intersectionIndex == -1) return false;
    const intersection = intersections[intersectionIndex];
    this.selecting = true;
    this.selectingController = controller;
    this.updateMatrixWorld();
    this.selectStartPositionLocal.copy(intersection.point)
        .applyMatrix4(matrix4.copy(this.matrixWorld).invert());
    this.raycastPlane.normal.set(0, 0, 1.0);
    this.raycastPlane.constant = 0;
    this.raycastPlane.applyMatrix4(this.matrixWorld);
    this.selectStartPage = this.state.currentPage;
    return true;
  }

  protected computeSelectingDelta(
      selectingPosition: THREE.Vector3, startSelectPosition: THREE.Vector3) {
    return (selectingPosition.x - startSelectPosition.x) / this.rangeX;
  }

  onSelecting() {
    if (this.selecting) {
      // Raycast to the plane;
      this.selectingRay.origin.set(0.0, 0.0, 0.0);
      this.selectingRay.direction.set(0.0, 0.0, -1.0);
      this.selectingController.updateMatrixWorld();
      this.selectingRay.applyMatrix4(this.selectingController.matrixWorld);
      this.selectingRay.intersectPlane(
          this.raycastPlane, this.selectingRayTarget);
      this.updateMatrixWorld();
      this.selectingRayTarget.applyMatrix4(
          matrix4.copy(this.matrixWorld).invert());
      const deltaPage = this.computeSelectingDelta(
          this.selectingRayTarget, this.selectStartPositionLocal);
      this.state.currentPage =
          this.continuousScrolling && this.state.pages > 1 ?
          ((this.selectStartPage - deltaPage + this.state.pages) %
           this.state.pages) :
          clamp(this.selectStartPage - deltaPage, 0, this.state.pages - 1);
    }
  }

  onObjectSelectEnd(event: SelectEvent) {
    if (event.target == this.selectingController) {
      this.selecting = false;
    }
    return true;
  }

  /**
   * Raycast to the pager's raycastMesh so the user can scroll across pages.
   */
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const thisIntersections: THREE.Intersection[] = [];
    this.raycastMesh.raycast(raycaster, thisIntersections);
    thisIntersections.forEach(intersection => {
      intersection.object = this;
      intersects.push(intersection);
    });
    // Loop through children.
    if (this.enableRaycastOnChildren) {
      const childIntersections: THREE.Intersection[] = [];
      for (const child of this.children) {
        raycaster.intersectObject(child, true, childIntersections);
      }
      // Create if the intersection is on this page.
      this.updateMatrixWorld();
      matrix4.copy(this.matrixWorld).invert();
      for (const intersection of childIntersections) {
        const pointInLocalCoordinates =
            vector3.copy(intersection.point).applyMatrix4(matrix4);
        if (Math.abs(pointInLocalCoordinates.x) < 0.5) {
          intersects.push(intersection);
        }
      }
    }
    return false;
  }
}

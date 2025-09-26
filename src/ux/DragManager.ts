import * as THREE from 'three';

import {Script, SelectEvent} from '../core/Script';
import {Input} from '../input/Input';
import {MouseController} from '../input/MouseController';
import {UP} from '../utils/HelperConstants';

// Temporary variables.
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _vector3 = new THREE.Vector3();

export interface Draggable extends THREE.Object3D {
  draggable: boolean;
  // Whether to continuously face the camera as the user drags.
  // If unspecified, defaults to false.
  dragFacingCamera?: boolean;
}

export enum DragMode {
  TRANSLATING = 'TRANSLATING',
  ROTATING = 'ROTATING',
  SCALING = 'SCALING',
  DO_NOT_DRAG = 'DO_NOT_DRAG',
}

export interface HasDraggingMode {
  draggingMode: DragMode;
}

export class DragManager extends Script {
  static readonly dependencies = {input: Input, camera: THREE.Camera};
  static readonly IDLE = 'IDLE';
  static readonly TRANSLATING = DragMode.TRANSLATING;
  static readonly ROTATING = DragMode.ROTATING;
  static readonly SCALING = DragMode.SCALING;
  static readonly DO_NOT_DRAG = DragMode.DO_NOT_DRAG;
  private mode = DragManager.IDLE;
  private controller1?: THREE.Object3D;
  private controller2?: THREE.Object3D;
  private originalObjectPosition = new THREE.Vector3();
  private originalObjectRotation = new THREE.Quaternion();
  private originalObjectScale = new THREE.Vector3();
  private originalController1Position = new THREE.Vector3();
  private originalController1RotationInverse = new THREE.Quaternion();
  private originalController1MatrixInverse = new THREE.Matrix4();
  private originalScalingControllerDistance = 0.0;
  private originalScalingObjectScale = new THREE.Vector3();
  private intersection?: THREE.Intersection;
  private draggableObject?: Draggable;
  private input!: Input;
  private camera!: THREE.Camera;

  init({input, camera}: {input: Input, camera: THREE.Camera}) {
    this.input = input;
    this.camera = camera;
  }

  onSelectStart(event: SelectEvent) {
    const controller = event.target;
    const intersections = this.input.intersectionsForController.get(controller);
    if (intersections && intersections.length > 0) {
      this.beginDragging(intersections[0], controller);
    }
  }

  onSelectEnd() {
    this.mode = DragManager.IDLE;
    this.intersection = undefined;
    this.draggableObject = undefined;
  }

  update() {
    for (const controller of this.input.controllers) {
      this.updateDragging(controller);
    }
  }

  beginDragging(intersection: THREE.Intersection, controller: THREE.Object3D) {
    const [draggableObject, draggingMode] =
        this.findDraggableObjectAndDraggingMode(intersection.object);
    if (draggableObject == null || draggingMode == null ||
        draggingMode == DragManager.DO_NOT_DRAG) {
      return false;
    }
    if (this.mode != DragManager.IDLE) {
      // Already dragging, switch to scaling.
      return this.beginScaling(controller);
    }
    this.draggableObject = draggableObject;
    this.mode = draggingMode == DragManager.ROTATING ? DragManager.ROTATING :
                                                       DragManager.TRANSLATING;
    this.originalController1Position.copy(controller.position);
    this.originalController1MatrixInverse
        .compose(controller.position, controller.quaternion, controller.scale)
        .invert();
    this.originalController1RotationInverse.copy(controller.quaternion)
        .invert();
    this.intersection = intersection;
    this.controller1 = controller;
    this.originalObjectRotation.copy(draggableObject.quaternion);
    this.originalObjectPosition.copy(draggableObject.position);
    this.originalObjectScale.copy(draggableObject.scale);
    return true;
  }

  // Scaling is a two-handed gesture, based on the distance between the two
  // hands.
  beginScaling(controller: THREE.Object3D) {
    this.controller2 = controller;
    this.originalScalingControllerDistance =
        _vector3
            .subVectors(this.controller1!.position, this.controller2.position)
            .length();
    this.originalScalingObjectScale.copy(this.intersection!.object.scale);
    this.mode = DragManager.SCALING;
    return true;
  }

  updateDragging(controller: THREE.Object3D) {
    if (this.mode == DragManager.TRANSLATING) {
      return this.updateTranslating();
    } else if (this.mode == DragManager.ROTATING) {
      return this.updateRotating(controller);
    } else if (this.mode == DragManager.SCALING) {
      return this.updateScaling();
    }
    // Continue handle controller.
    return false;
  }

  updateTranslating() {
    const model = this.draggableObject!;
    model.position.copy(this.originalObjectPosition);
    model.quaternion.copy(this.originalObjectRotation);
    model.scale.copy(this.originalObjectScale)
    model.updateMatrix();
    this.controller1!.updateMatrix();
    model.matrix.premultiply(this.originalController1MatrixInverse)
        .premultiply(this.controller1!.matrix);
    model.position.setFromMatrixPosition(model.matrix);
    if (model.dragFacingCamera) {
      this.turnPanelToFaceTheCamera();
    }
    return true;
  }

  updateRotating(controller: THREE.Object3D) {
    if (controller != this.controller1) {
      return;
    }
    if (controller instanceof MouseController) {
      return this.updateRotatingFromMouseController(controller);
    }
    const model = this.draggableObject!;
    const deltaPosition = new THREE.Vector3().subVectors(
        controller.position, this.originalController1Position);
    deltaPosition.applyQuaternion(this.originalController1RotationInverse);
    const offsetRotation =
        _quaternion.setFromAxisAngle(UP, 10.0 * deltaPosition.x);
    model.quaternion.multiplyQuaternions(
        offsetRotation, this.originalObjectRotation);
    return true;
  }

  updateRotatingFromMouseController(controller: THREE.Object3D) {
    const model = this.draggableObject!;
    const deltaRotation = _quaternion.multiplyQuaternions(
        controller.quaternion, this.originalController1RotationInverse);
    const rotationYawAngle = _euler.setFromQuaternion(deltaRotation, 'YXZ');
    const offsetRotation =
        _quaternion.setFromAxisAngle(UP, -10.0 * rotationYawAngle.y);
    model.quaternion.multiplyQuaternions(
        offsetRotation, this.originalObjectRotation);
    return true;
  }

  updateScaling() {
    const newControllerDistance =
        _vector3
            .subVectors(this.controller1!.position, this.controller2!.position)
            .length();
    const distanceRatio =
        newControllerDistance / this.originalScalingControllerDistance;
    const model = this.draggableObject!;
    model.scale.copy(this.originalScalingObjectScale)
        .multiplyScalar(distanceRatio);
    return true;
  }

  turnPanelToFaceTheCamera() {
    const model = this.draggableObject!;
    _vector3.subVectors(model.position, this.camera.position);
    model.quaternion.setFromAxisAngle(
        UP, (3 * Math.PI / 2) - Math.atan2(_vector3.z, _vector3.x));
  }

  /**
   * Seach up the scene graph to find the first draggable object and the first
   * drag mode at or below the draggable object.
   * @param target - Child object to search.
   * @returns Array containing the first draggable object and the first drag
   *     mode.
   */
  private findDraggableObjectAndDraggingMode(
      target: THREE.Object3D|null|
      undefined): [Draggable|undefined, DragMode|undefined] {
    let currentTarget = target;
    let draggableObject: Draggable|undefined;
    let draggingMode: DragMode|undefined;
    while (currentTarget && !draggableObject) {
      draggableObject = (currentTarget as Partial<Draggable>).draggable ?
          (currentTarget as Draggable) :
          undefined;
      draggingMode = draggingMode ??
          (currentTarget as Partial<HasDraggingMode>).draggingMode;
      currentTarget = currentTarget.parent;
    }
    return [draggableObject, draggingMode];
  }
}

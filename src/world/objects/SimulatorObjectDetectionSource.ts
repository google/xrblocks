import * as THREE from 'three';

import type {
  SimulatorDetectedObjectInput,
  SimulatorObjectDetectionSource as ObjectDetectionSource,
} from './ObjectDetector';
import type {SimulatorObjects} from '../../simulator/scene/SimulatorObjects';
import {SimulatorScene} from '../../simulator/scene/SimulatorScene';

const samplePoints = Array.from({length: 9}, () => new THREE.Vector3());

/** Ground-truth object detection for the desktop simulator. */
export class SimulatorObjectDetectionSource implements ObjectDetectionSource {
  private frustum = new THREE.Frustum();
  private raycaster = new THREE.Raycaster();

  constructor(
    private camera: THREE.Camera,
    private scene: SimulatorScene,
    private objects: SimulatorObjects
  ) {}

  detect(): SimulatorDetectedObjectInput[] {
    this.camera.updateWorldMatrix(true, false);
    this.scene.updateWorldMatrix(true, true);
    const projectionView = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(projectionView);
    const cameraPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPosition);

    const results: SimulatorDetectedObjectInput[] = [];
    for (const record of this.objects.get()) {
      if (!record.definition.detectObject || !record.definition.label) continue;
      if (!record.object.visible) continue;
      const box = new THREE.Box3().setFromObject(record.object);
      if (box.isEmpty() || !this.frustum.intersectsBox(box)) continue;
      this.fillSamples(box);
      if (!this.isVisible(record.object, cameraPosition, samplePoints))
        continue;
      const boundingBox = this.projectBox();
      if (boundingBox.isEmpty()) continue;
      const boxCenter = box.getCenter(new THREE.Vector3());
      results.push({
        label: record.definition.label,
        position: this.findDetectionPoint(
          record.object,
          boundingBox,
          boxCenter,
          cameraPosition
        ),
        boundingBox,
        data: record.definition.data ?? {},
      });
    }
    return results;
  }

  private fillSamples(box: THREE.Box3) {
    box.getCenter(samplePoints[0]);
    let index = 1;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          samplePoints[index++].set(x, y, z);
        }
      }
    }
  }

  private isVisible(
    target: THREE.Object3D,
    cameraPosition: THREE.Vector3,
    points: THREE.Vector3[]
  ) {
    const roots = this.scene.environmentRoot
      ? [this.scene.environmentRoot]
      : [];
    let visibleSamples = 0;
    for (const point of points) {
      const direction = point.clone().sub(cameraPosition);
      const distance = direction.length();
      if (distance === 0) return true;
      this.raycaster.set(cameraPosition, direction.normalize());
      this.raycaster.far = distance + 0.001;
      const hit = this.raycaster.intersectObjects(roots, true)[0];
      if (!hit || this.isDescendantOf(hit.object, target)) {
        visibleSamples++;
        if (visibleSamples >= 2) return true;
      }
    }
    return false;
  }

  private isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D) {
    for (
      let current: THREE.Object3D | null = object;
      current;
      current = current.parent
    ) {
      if (current === ancestor) return true;
    }
    return false;
  }

  private projectBox() {
    const projected = new THREE.Box2();
    for (let i = 1; i < samplePoints.length; i++) {
      const point = samplePoints[i].clone().project(this.camera);
      projected.expandByPoint(
        new THREE.Vector2(
          THREE.MathUtils.clamp((point.x + 1) / 2, 0, 1),
          THREE.MathUtils.clamp((1 - point.y) / 2, 0, 1)
        )
      );
    }
    return projected;
  }

  private findDetectionPoint(
    target: THREE.Object3D,
    boundingBox: THREE.Box2,
    fallback: THREE.Vector3,
    cameraPosition: THREE.Vector3
  ) {
    const screenCenter = boundingBox.getCenter(new THREE.Vector2());
    const ndc = new THREE.Vector2(
      screenCenter.x * 2 - 1,
      1 - screenCenter.y * 2
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const centerHit = this.raycaster.intersectObject(target, true)[0];
    if (centerHit) return centerHit.point.clone();

    const meshCenters: THREE.Vector3[] = [];
    target.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      mesh.geometry.computeBoundingSphere();
      if (!mesh.geometry.boundingSphere) return;
      meshCenters.push(
        mesh.geometry.boundingSphere.center
          .clone()
          .applyMatrix4(mesh.matrixWorld)
      );
    });
    for (const meshCenter of meshCenters) {
      this.raycaster.set(
        cameraPosition,
        meshCenter.clone().sub(cameraPosition).normalize()
      );
      const hit = this.raycaster.intersectObject(target, true)[0];
      if (hit) return hit.point.clone();
    }
    return fallback;
  }
}

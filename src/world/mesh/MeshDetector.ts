import * as THREE from 'three';

import {Script} from '../../core/Script';
import {DetectedMesh} from './DetectedMesh';
import {MeshDetectionOptions} from './MeshDetectionOptions';
import {Physics} from '../../physics/Physics';

// Wrapper around WebXR Mesh Detection API
// https://immersive-web.github.io/real-world-meshing/
export class MeshDetector extends Script {
  static readonly dependencies = {
    options: MeshDetectionOptions,
    renderer: THREE.WebGLRenderer,
  };
  private _debugMaterial: THREE.Material | null = null;
  xrMeshToThreeMesh = new Map<XRMesh, DetectedMesh>();
  threeMeshToXrMesh = new Map<DetectedMesh, XRMesh>();
  private renderer!: THREE.WebGLRenderer;
  private physics?: Physics;

  override init({
    options,
    renderer,
  }: {
    options: MeshDetectionOptions;
    renderer: THREE.WebGLRenderer;
  }) {
    this.renderer = renderer;
    if (options.showDebugVisualizations) {
      this._debugMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        wireframe: true,
        side: THREE.DoubleSide,
      });
    }
  }

  override initPhysics(physics: Physics) {
    this.physics = physics;
    for (const [_, mesh] of this.xrMeshToThreeMesh.entries()) {
      mesh.initRapierPhysics(physics.RAPIER, physics.blendedWorld);
    }
  }

  updateMeshes(_timestamp: number, frame?: XRFrame) {
    const meshes = frame?.detectedMeshes;
    if (!meshes) return;

    // Delete old meshes
    for (const [xrMesh, threeMesh] of this.xrMeshToThreeMesh.entries()) {
      if (!meshes.has(xrMesh)) {
        this.xrMeshToThreeMesh.delete(xrMesh);
        this.threeMeshToXrMesh.delete(threeMesh);
        this.remove(threeMesh);
      }
    }

    // Add new meshes
    for (const xrMesh of meshes) {
      if (!this.xrMeshToThreeMesh.has(xrMesh)) {
        const threeMesh = this.createMesh(frame, xrMesh);
        this.xrMeshToThreeMesh.set(xrMesh, threeMesh);
        this.threeMeshToXrMesh.set(threeMesh, xrMesh);
        this.add(threeMesh);
        if (this.physics) {
          threeMesh.initRapierPhysics(
            this.physics.RAPIER,
            this.physics.blendedWorld
          );
        }
      } else {
        const threeMesh = this.xrMeshToThreeMesh.get(xrMesh)!;
        threeMesh.updateVertices(xrMesh);
        this.updateMeshPose(frame, xrMesh, threeMesh);
      }
    }
  }

  private createMesh(frame: XRFrame, xrMesh: XRMesh) {
    const material =
      this._debugMaterial || new THREE.MeshBasicMaterial({visible: false});
    const mesh = new DetectedMesh(xrMesh, material);
    this.updateMeshPose(frame, xrMesh, mesh);
    return mesh;
  }

  private updateMeshPose(frame: XRFrame, xrMesh: XRMesh, mesh: THREE.Mesh) {
    const pose = frame.getPose(
      xrMesh.meshSpace,
      this.renderer.xr.getReferenceSpace()!
    );
    if (pose) {
      mesh.position.copy(pose.transform.position);
      mesh.quaternion.copy(pose.transform.orientation);
    }
  }
}

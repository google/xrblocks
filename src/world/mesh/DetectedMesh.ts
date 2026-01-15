import * as THREE from 'three';
import type RAPIER_NS from 'rapier3d';

export class DetectedMesh extends THREE.Mesh {
  private RAPIER?: typeof RAPIER_NS;
  private rigidBody?: RAPIER_NS.RigidBody;
  private collider?: RAPIER_NS.Collider;
  private blendedWorld?: RAPIER_NS.World;
  private lastChangedTime = 0;

  constructor(xrMesh: XRMesh, material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(xrMesh.vertices);
    const indices = new Uint32Array(xrMesh.indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    super(geometry, material);
    this.lastChangedTime = xrMesh.lastChangedTime;
  }

  initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World) {
    this.RAPIER = RAPIER;
    this.blendedWorld = blendedWorld;
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(this.position.x, this.position.y, this.position.z)
      .setRotation(this.quaternion);
    this.rigidBody = blendedWorld.createRigidBody(desc);
    const vertices = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.getIndex()!.array as Uint32Array;
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    this.collider = blendedWorld.createCollider(colliderDesc, this.rigidBody);
  }

  updateVertices(mesh: XRMesh) {
    if (mesh.lastChangedTime === this.lastChangedTime) return;
    this.lastChangedTime = mesh.lastChangedTime;
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(mesh.vertices);
    const indices = new Uint32Array(mesh.indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    this.geometry.dispose();
    this.geometry = geometry;
    if (this.RAPIER && this.collider) {
      const RAPIER = this.RAPIER;
      this.blendedWorld!.removeCollider(this.collider, false);
      const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      this.collider = this.blendedWorld!.createCollider(
        colliderDesc,
        this.rigidBody
      );
    }
  }
}

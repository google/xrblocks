import * as THREE from 'three';
import type RAPIER_NS from 'rapier3d';

export class DetectedMesh extends THREE.Mesh {
  private RAPIER?: typeof RAPIER_NS;
  private rigidBody?: RAPIER_NS.RigidBody;
  private collider?: RAPIER_NS.Collider;
  private blendedWorld?: RAPIER_NS.World;
  private lastChangedTime = 0;
  semanticLabel?: string;

  // Expose rigidBody for pose updates
  get getRigidBody(): RAPIER_NS.RigidBody | undefined {
    return this.rigidBody;
  }

  constructor(mesh: XRMesh, material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(mesh.vertices, 3)
    );
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geometry.computeVertexNormals();
    super(geometry, material);
    this.lastChangedTime = mesh.lastChangedTime;
    this.semanticLabel = mesh.semanticLabel;
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

    // Update existing geometry attributes instead of creating new geometry
    const positionAttribute = this.geometry.attributes.position;
    const indexAttribute = this.geometry.getIndex();
    const newVertexCount = mesh.vertices.length / 3;
    const newIndexCount = mesh.indices.length;

    if (
      positionAttribute.count !== newVertexCount ||
      (indexAttribute && indexAttribute.count !== newIndexCount)
    ) {
      // Vertex or index count changed - recreate geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(mesh.vertices, 3)
      );
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geometry.computeVertexNormals();
      this.geometry.dispose();
      this.geometry = geometry;
    } else {
      // Same vertex count - update in place (more efficient)
      const positions = positionAttribute.array as Float32Array;
      if (positions.length === mesh.vertices.length) {
        positions.set(mesh.vertices);
        positionAttribute.needsUpdate = true;
      }

      if (indexAttribute) {
        const indices = indexAttribute.array as Uint32Array;
        if (indices.length === mesh.indices.length) {
          indices.set(mesh.indices);
          indexAttribute.needsUpdate = true;
        }
      }

      this.geometry.computeVertexNormals();
    }

    // Update collider
    if (this.RAPIER && this.collider) {
      const RAPIER = this.RAPIER;
      this.blendedWorld!.removeCollider(this.collider, false);
      const colliderDesc = RAPIER.ColliderDesc.trimesh(
        mesh.vertices,
        mesh.indices
      );
      this.collider = this.blendedWorld!.createCollider(
        colliderDesc,
        this.rigidBody
      );
    }
  }

  dispose() {
    if (this.blendedWorld && this.collider) {
      this.blendedWorld.removeCollider(this.collider, false);
      this.collider = undefined;
    }
    if (this.blendedWorld && this.rigidBody) {
      this.blendedWorld.removeRigidBody(this.rigidBody);
      this.rigidBody = undefined;
    }
    this.geometry.dispose();
  }
}

import * as THREE from 'three';

import {Script} from '../../core/Script';
import {DetectedMesh} from './DetectedMesh';
import {MeshDetectionOptions} from './MeshDetectionOptions';
import {Physics} from '../../physics/Physics';

const SEMANTIC_LABELS = ['floor', 'ceiling', 'wall'];
const SEMANTIC_COLORS = [0x00ff00, 0xffff00, 0x0000ff];

// Wrapper around WebXR Mesh Detection API
// https://immersive-web.github.io/real-world-meshing/
export class MeshDetector extends Script {
  static readonly dependencies = {
    options: MeshDetectionOptions,
    renderer: THREE.WebGLRenderer,
  };
  private debugMaterials = new Map<string, THREE.Material>();
  private fallbackDebugMaterial: THREE.Material | null = null;
  xrMeshToThreeMesh = new Map<XRMesh, DetectedMesh>();
  threeMeshToXrMesh = new Map<DetectedMesh, XRMesh>();
  private renderer!: THREE.WebGLRenderer;
  private physics?: Physics;
  private defaultMaterial = new THREE.MeshBasicMaterial({visible: false});
  private meshTimedata = new Map<
    XRMesh,
    {
      lastChangedTime: number;
      lastSeenTime: number;
    }
  >();

  // Optimization1: Mesh update throttling (similar to ARCore reflection cube map in /usr/local/google/home/adamren/Desktop/xrlabs/arlabs/xrblocks/samples/lighting)
  private readonly MESH_UPDATE_INTERVAL_MS = 1000; //0 -> 1000
  private lastMeshUpdateTime = 0;

  // Optimization2: Periodic cleanup of stale/distant meshes
  private readonly MESH_STALE_TIME_MS = 3000; //1000000000 -> 3000
  private readonly CLEANUP_INTERVAL_MS = this.MESH_STALE_TIME_MS + 1000;
  // Optimization3: Camera culling constants
  private readonly kMaxViewDistance = 3.0; //1000000000.0 -> 3.0
  private readonly kFOVCosThreshold = 0.25; //0.0 -> 0.25
  private lastCleanupTime = 0;

  // Profiling
  private frameCount = 0;

  override init({
    options,
    renderer,
  }: {
    options: MeshDetectionOptions;
    renderer: THREE.WebGLRenderer;
  }) {
    this.renderer = renderer;
    if (options.showDebugVisualizations) {
      this.fallbackDebugMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        wireframe: true,
        side: THREE.DoubleSide,
      });

      for (let i = 0; i < SEMANTIC_LABELS.length; i++) {
        this.debugMaterials.set(
          SEMANTIC_LABELS[i],
          new THREE.MeshBasicMaterial({
            color: SEMANTIC_COLORS[i],
            wireframe: true,
            side: THREE.DoubleSide,
          })
        );
      }
    }
  }

  override initPhysics(physics: Physics) {
    this.physics = physics;
    for (const [_, mesh] of this.xrMeshToThreeMesh.entries()) {
      mesh.initRapierPhysics(physics.RAPIER, physics.blendedWorld);
    }
  }

  updateMeshes(_timestamp: number, frame?: XRFrame) {
    this.frameCount++;

    // Profiling1: Time spent in accessing detectedMeshes
    const t0 = performance.now();
    const meshes = frame?.detectedMeshes;
    const _detectedMeshesTime = performance.now() - t0;
    // console.log(
    //   `[MeshDetector Frame ${this.frameCount}] ` +
    //   `detectedMeshes access: ${_detectedMeshesTime.toFixed(3)}ms, ` +
    //   `timestamp: ${_timestamp.toFixed(3)}, ` +
    //   `meshCount: ${meshes?.size || 0}`
    // );

    if (!meshes || !frame) return;

    // Optimization1: Mesh update throttling
    const now = performance.now();
    const timeSinceLastUpdate = now - this.lastMeshUpdateTime;
    if (timeSinceLastUpdate < this.MESH_UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastMeshUpdateTime = now;

    // Process meshes
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    if (!referenceSpace) return;
    const {position: cameraPosition, forward: cameraForward} =
      this.getCameraInfo(frame, referenceSpace);
    for (const xrMesh of meshes) {
      // Optimization2: Check if mesh is in view and get distance
      const isVisible = this.shouldShowMeshInViewWithDistance(
        xrMesh,
        cameraPosition,
        cameraForward,
        frame,
        referenceSpace
      );
      if (!isVisible) {
        continue;
      }
      // Create or update mesh
      const cachedChangedTime = this.meshTimedata.get(xrMesh)?.lastChangedTime;
      const currentChangedTime = xrMesh.lastChangedTime;
      const isNewMesh = cachedChangedTime === undefined;
      const isUpdated =
        cachedChangedTime !== undefined &&
        cachedChangedTime !== currentChangedTime;
      const isUnchanged =
        cachedChangedTime !== undefined &&
        cachedChangedTime === currentChangedTime;
      if (isNewMesh) {
        const threeMesh = this.createMesh(frame, xrMesh);
        this.xrMeshToThreeMesh.set(xrMesh, threeMesh);
        this.threeMeshToXrMesh.set(threeMesh, xrMesh);
        this.meshTimedata.set(xrMesh, {
          lastChangedTime: currentChangedTime,
          lastSeenTime: now,
        });
        this.add(threeMesh);
        if (this.physics) {
          threeMesh.initRapierPhysics(
            this.physics.RAPIER,
            this.physics.blendedWorld
          );
        }
      } else if (isUpdated) {
        const threeMesh = this.xrMeshToThreeMesh.get(xrMesh)!;
        threeMesh.updateVertices(xrMesh);
        // Update needed in case we have drift correction.
        this.updateMeshPose(frame, xrMesh, threeMesh);
        this.meshTimedata.set(xrMesh, {
          lastChangedTime: currentChangedTime,
          lastSeenTime: now,
        });
      } else if (isUnchanged) {
        this.meshTimedata.set(xrMesh, {
          lastChangedTime: currentChangedTime,
          lastSeenTime: now,
        });
      }
    }

    // Optimization3: Periodic cleanup of stale/distant meshes
    if (now - this.lastCleanupTime >= this.CLEANUP_INTERVAL_MS) {
      this.cleanupStaleMeshes(now);
      this.lastCleanupTime = now;
    }
  }

  private removeMesh(xrMesh: XRMesh, threeMesh: DetectedMesh) {
    this.xrMeshToThreeMesh.delete(xrMesh);
    this.threeMeshToXrMesh.delete(threeMesh);
    this.meshTimedata.delete(xrMesh);
    threeMesh.dispose();
    this.remove(threeMesh);
  }

  private cleanupStaleMeshes(now: number) {
    const meshesToRemove: XRMesh[] = [];
    for (const [xrMesh] of this.xrMeshToThreeMesh.entries()) {
      const cachedSeenTime = this.meshTimedata.get(xrMesh)?.lastSeenTime;
      const timeSinceLastSeen = now - (cachedSeenTime || 0);
      const isStale = timeSinceLastSeen >= this.MESH_STALE_TIME_MS;
      if (isStale) {
        meshesToRemove.push(xrMesh);
      }
    }
    for (const xrMesh of meshesToRemove) {
      const threeMesh = this.xrMeshToThreeMesh.get(xrMesh);
      if (threeMesh) {
        this.removeMesh(xrMesh, threeMesh);
      }
    }
  }

  private createMesh(frame: XRFrame, xrMesh: XRMesh) {
    const semanticLabel = xrMesh.semanticLabel;
    const material =
      (semanticLabel && this.debugMaterials.get(semanticLabel)) ||
      this.fallbackDebugMaterial ||
      this.defaultMaterial;
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

      // Update physics rigid body pose if it exists
      if (mesh instanceof DetectedMesh) {
        const rigidBody = mesh.getRigidBody;
        rigidBody?.setTranslation(mesh.position, false);
        rigidBody?.setRotation(mesh.quaternion, false);
      }
    }
  }

  private getCameraInfo(
    frame: XRFrame,
    referenceSpace: XRReferenceSpace
  ): {
    position: THREE.Vector3;
    forward: THREE.Vector3;
  } {
    const viewerPose = frame.getViewerPose(referenceSpace);
    const cameraPosition = new THREE.Vector3(0, 0, 0);
    let cameraForward = new THREE.Vector3(0, 0, -1);

    if (viewerPose && viewerPose.views && viewerPose.views.length > 0) {
      // Get camera position from first view's transform
      const viewTransform = viewerPose.views[0].transform;
      const viewMatrix = new THREE.Matrix4().fromArray(viewTransform.matrix);
      cameraPosition.setFromMatrixPosition(viewMatrix);

      // Extract forward vector from matrix (typically -Z axis)
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyMatrix4(viewMatrix);
      forward.sub(cameraPosition).normalize();
      cameraForward = forward;
    }

    return {position: cameraPosition, forward: cameraForward};
  }

  private computeMeshBoundingBox(xrMesh: XRMesh): THREE.Box3 | null {
    const vertices = xrMesh.vertices;
    if (vertices.length < 3) return null;
    return new THREE.Box3().setFromArray(vertices);
  }

  /** Six clip planes from the view-projection matrix (left, right, bottom, top, near, far). */
  private buildFrustumPlanes(
    viewMatrix: THREE.Matrix4,
    projectionMatrix: THREE.Matrix4
  ): THREE.Plane[] {
    const viewProjectionMatrix = new THREE.Matrix4();
    viewProjectionMatrix.multiplyMatrices(projectionMatrix, viewMatrix);
    const e = viewProjectionMatrix.elements;

    const planes: THREE.Plane[] = [
      new THREE.Plane().setComponents(
        e[3] + e[0],
        e[7] + e[4],
        e[11] + e[8],
        e[15] + e[12]
      ),
      new THREE.Plane().setComponents(
        e[3] - e[0],
        e[7] - e[4],
        e[11] - e[8],
        e[15] - e[12]
      ),
      new THREE.Plane().setComponents(
        e[3] + e[1],
        e[7] + e[5],
        e[11] + e[9],
        e[15] + e[13]
      ),
      new THREE.Plane().setComponents(
        e[3] - e[1],
        e[7] - e[5],
        e[11] - e[9],
        e[15] - e[13]
      ),
      new THREE.Plane().setComponents(
        e[3] + e[2],
        e[7] + e[6],
        e[11] + e[10],
        e[15] + e[14]
      ),
      new THREE.Plane().setComponents(
        e[3] - e[2],
        e[7] - e[6],
        e[11] - e[10],
        e[15] - e[14]
      ),
    ];

    for (const plane of planes) {
      if (plane.normal.length() > 0.0001) {
        plane.normalize();
      }
    }

    return planes;
  }

  // Check if AABB intersects the frustum (based on C++ IntersectsBox)
  private frustumIntersectsBox(
    planes: THREE.Plane[],
    box: THREE.Box3
  ): boolean {
    const boxMin = box.min;
    const boxMax = box.max;
    const axisVert = new THREE.Vector3();
    for (const plane of planes) {
      const n = plane.normal;
      axisVert.x = n.x < 0.0 ? boxMin.x : boxMax.x;
      axisVert.y = n.y < 0.0 ? boxMin.y : boxMax.y;
      axisVert.z = n.z < 0.0 ? boxMin.z : boxMax.z;
      if (plane.distanceToPoint(axisVert) < 0.0) {
        return false;
      }
    }
    return true;
  }

  // New method: Frustum culling
  private shouldShowMeshInViewWithFrustum(
    mesh: XRMesh,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace
  ): boolean {
    // Get mesh pose
    const meshPose = frame.getPose(mesh.meshSpace, referenceSpace);
    if (!meshPose) {
      return true; // If pose is unavailable, show by default
    }

    // Get viewer pose and the first view
    const viewerPose = frame.getViewerPose(referenceSpace);
    if (!viewerPose || !viewerPose.views || viewerPose.views.length === 0) {
      return true;
    }

    const view = viewerPose.views[0];
    if (!view.projectionMatrix) {
      return true; // If no projection matrix, fall back to default behavior
    }

    // Compute mesh bounding box in local space
    const localBoundingBox = this.computeMeshBoundingBox(mesh);
    if (!localBoundingBox) {
      return true; // If bounding box cannot be computed, show by default
    }

    const meshTransform = new THREE.Matrix4().fromArray(
      meshPose.transform.matrix
    );
    const meshPosition = new THREE.Vector3();
    const meshQuaternion = new THREE.Quaternion();
    const meshScale = new THREE.Vector3();
    meshTransform.decompose(meshPosition, meshQuaternion, meshScale);

    // Transform bounding box 8 corners to reference space
    const corners = [
      new THREE.Vector3(
        localBoundingBox.min.x,
        localBoundingBox.min.y,
        localBoundingBox.min.z
      ),
      new THREE.Vector3(
        localBoundingBox.max.x,
        localBoundingBox.min.y,
        localBoundingBox.min.z
      ),
      new THREE.Vector3(
        localBoundingBox.min.x,
        localBoundingBox.max.y,
        localBoundingBox.min.z
      ),
      new THREE.Vector3(
        localBoundingBox.max.x,
        localBoundingBox.max.y,
        localBoundingBox.min.z
      ),
      new THREE.Vector3(
        localBoundingBox.min.x,
        localBoundingBox.min.y,
        localBoundingBox.max.z
      ),
      new THREE.Vector3(
        localBoundingBox.max.x,
        localBoundingBox.min.y,
        localBoundingBox.max.z
      ),
      new THREE.Vector3(
        localBoundingBox.min.x,
        localBoundingBox.max.y,
        localBoundingBox.max.z
      ),
      new THREE.Vector3(
        localBoundingBox.max.x,
        localBoundingBox.max.y,
        localBoundingBox.max.z
      ),
    ];

    // Apply mesh transform (order: scale, then rotate, then translate)
    for (const corner of corners) {
      corner.multiply(meshScale);
      corner.applyQuaternion(meshQuaternion);
      corner.add(meshPosition);
    }

    const worldBox = new THREE.Box3().setFromPoints(corners);

    // Build view matrix (from view transform)
    const viewTransform = view.transform;
    const viewMatrix = new THREE.Matrix4()
      .fromArray(viewTransform.matrix)
      .invert();

    // Build projection matrix
    const projectionMatrix = new THREE.Matrix4().fromArray(
      view.projectionMatrix
    );

    // Build frustum planes
    const frustumPlanes = this.buildFrustumPlanes(viewMatrix, projectionMatrix);

    return this.frustumIntersectsBox(frustumPlanes, worldBox);
  }

  private shouldShowMeshInViewWithDistance(
    mesh: XRMesh,
    cameraPosition: THREE.Vector3,
    cameraForward: THREE.Vector3,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace
  ): boolean {
    // Distance check
    const meshPose = frame.getPose(mesh.meshSpace, referenceSpace);
    if (!meshPose) {
      return true;
    }
    const meshPosition = new THREE.Vector3();
    meshPosition.setFromMatrixPosition(
      new THREE.Matrix4().fromArray(meshPose.transform.matrix)
    );
    const dx = meshPosition.x - cameraPosition.x;
    const dy = meshPosition.y - cameraPosition.y;
    const dz = meshPosition.z - cameraPosition.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const distance = Math.sqrt(distanceSq);
    if (distance > this.kMaxViewDistance) {
      return false;
    }

    // FOV check
    if (distance > 0.001) {
      const invDistance = 1.0 / distance;
      const dotForward =
        dx * invDistance * cameraForward.x +
        dy * invDistance * cameraForward.y +
        dz * invDistance * cameraForward.z;

      if (dotForward < this.kFOVCosThreshold) {
        return false;
      }
    }

    return true;
  }
}

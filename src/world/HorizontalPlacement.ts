import * as THREE from 'three';
import {WaitFrame} from '../core/components/WaitFrame';
import {PlaneDetector} from './planes/PlaneDetector';
import {MeshDetector} from './mesh/MeshDetector';
import {DetectedPlane} from './planes/DetectedPlane';
import {durationToMs} from '../utils/TemporalPolyfill';

/**
 * Places an object onto a suitable horizontal plane in the environment.
 * It prioritizes planes in front of the user, prefers tables/elevated surfaces over floors,
 * and ensures the object does not intersect other existing objects or other planes in the scene.
 * If placement fails in the current frame, it continues retrying frame-by-frame until the timeout is reached.
 *
 * ### Algorithm Details:
 * 1. **Filter Horizontal Surfaces**: Fetches all planes and filters for horizontal surfaces, completely skipping
 *    any upside-down planes (whose normal y-component points downwards).
 * 2. **Obstacle Gathering**: Traverses the active Three.js scene to identify visible collidable meshes, including
 *    all other detected plane meshes (excluding the placement plane itself) and excluding user rigs/helpers.
 * 3. **User-Centric Grid Sampling**: For each horizontal plane, projects the user's position onto the plane, restricts
 *    the sampling range to a 3.0-meter radius bounding box centered around this projection, and grid-samples coordinates
 *    strictly within the plane's polygon boundaries.
 * 4. **Priority Scoring**: Assigns scores to sampled candidates, prioritizing elevated surfaces (tables over floors)
 *    located comfortably in front of the user (0.4m to 3.0m range, pointing in camera look direction).
 * 5. **Validation & Collision Check**: Evaluates candidates in descending score order, temporarily positioning and orienting
 *    the object upright on the plane normal facing the user. Validates placement against the bounds of collidable obstacles.
 * 6. **Frame Yielding & Retry**: If no candidates succeed in the current frame, yields to the next frame via `waitFrame`
 *    and repeats the process until a clean spot is found or the timeout is reached.
 *
 * @param objectToPlace - The Three.js Object3D to place.
 * @param camera - The current active camera (to evaluate user position and look direction).
 * @param scene - The active scene containing all collidable obstacles.
 * @param planes - The PlaneDetector instance providing detected real-world planes.
 * @param meshes - The MeshDetector instance providing environmental mesh obstacles.
 * @param waitFrame - The WaitFrame component to yield execution between frames.
 * @param timeout - Timeout duration as a Temporal.Duration or Temporal.DurationLike object (defaults to 500ms).
 * @param gridSteps - Number of steps along each axis for grid sampling candidate positions (defaults to 10).
 * @returns A promise resolving to true if successfully placed, false otherwise.
 */
export async function placeOnHorizontalSurface(
  objectToPlace: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene,
  planes: PlaneDetector | undefined,
  meshes: MeshDetector | undefined,
  waitFrame: WaitFrame,
  timer: THREE.Timer,
  timeout: Temporal.Duration | Temporal.DurationLike,
  gridSteps: number
): Promise<boolean> {
  const timeoutSeconds = durationToMs(timeout) / 1000;
  const startElapsed = timer.getElapsed();
  while (true) {
    // Check timeout at the start of each frame loop
    const elapsed = timer.getElapsed() - startElapsed;
    if (elapsed >= timeoutSeconds) {
      return false;
    }

    if (!planes) {
      await waitFrame.waitFrame();
      continue;
    }

    const allPlanes = planes.get();

    const horizontalPlanes = allPlanes.filter((plane) => {
      const orientation = (plane.orientation || '').toLowerCase();
      const label = (plane.label || '').toLowerCase();
      const planeNormal = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(plane.quaternion)
        .normalize();

      // Skip upside-down planes (e.g., ceilings or undersides of tables)
      if (planeNormal.y < 0) {
        return false;
      }

      return (
        orientation === 'horizontal' ||
        label === 'floor' ||
        label === 'table' ||
        label === 'desk' ||
        label === 'counter' ||
        label === 'horizontal'
      );
    });

    if (horizontalPlanes.length === 0) {
      await waitFrame.waitFrame();
      continue;
    }

    // Gather all visible collidable obstacles from the scene graph
    const collidableObjects: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (!child.visible) return;
      if (child === objectToPlace || isDescendantOf(child, objectToPlace))
        return;
      if (child === planes) return;
      if (meshes && isDescendantOf(child, meshes)) return;
      if (child === camera || child === scene) return;
      if (
        child.name &&
        (child.name.includes('controller') ||
          child.name.includes('reticle') ||
          child.name.includes('helper'))
      ) {
        return;
      }
      if ((child as THREE.Mesh).isMesh) {
        collidableObjects.push(child);
      }
    });

    // Generate and score candidate positions on all horizontal planes
    const candidates: {
      plane: DetectedPlane;
      point: THREE.Vector3;
      score: number;
    }[] = [];

    const cameraPos = camera.getWorldPosition(new THREE.Vector3());
    const cameraForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize();

    for (const plane of horizontalPlanes) {
      const polygon = getLocalPolygon(plane);
      if (polygon.length === 0) continue;

      // Convert camera pos to local plane coordinates to center our grid around the user
      const localCameraPos = plane.worldToLocal(cameraPos.clone());
      const localProjected = new THREE.Vector2(
        localCameraPos.x,
        localCameraPos.z
      );

      const polygonMinX = Math.min(...polygon.map((p) => p.x));
      const polygonMaxX = Math.max(...polygon.map((p) => p.x));
      const polygonMinY = Math.min(...polygon.map((p) => p.y));
      const polygonMaxY = Math.max(...polygon.map((p) => p.y));

      // Restrict search bounds to 3.0 meters radius around user's local projection
      const searchRadius = 3.0;
      const minX = Math.max(polygonMinX, localProjected.x - searchRadius);
      const maxX = Math.min(polygonMaxX, localProjected.x + searchRadius);
      const minY = Math.max(polygonMinY, localProjected.y - searchRadius);
      const maxY = Math.min(polygonMaxY, localProjected.y + searchRadius);

      // If restricted bounds are invalid, the plane is completely out of range
      if (minX >= maxX || minY >= maxY) {
        continue;
      }

      // Grid sampling within restricted bounding box
      const localPoints: THREE.Vector2[] = [];

      // Try user's local projection point first if it is inside the polygon
      if (isPointInPolygon(localProjected, polygon)) {
        localPoints.push(localProjected);
      }

      // Try plane center if it lies within our restricted search bounds
      const center = new THREE.Vector2(
        (polygonMinX + polygonMaxX) / 2,
        (polygonMinY + polygonMaxY) / 2
      );
      if (
        center.x >= minX &&
        center.x <= maxX &&
        center.y >= minY &&
        center.y <= maxY
      ) {
        if (isPointInPolygon(center, polygon)) {
          localPoints.push(center);
        }
      }

      for (let i = 0; i < gridSteps; i++) {
        const x = minX + (i / (gridSteps - 1)) * (maxX - minX);
        for (let j = 0; j < gridSteps; j++) {
          const z = minY + (j / (gridSteps - 1)) * (maxY - minY);
          const candidatePt = new THREE.Vector2(x, z);
          if (isPointInPolygon(candidatePt, polygon)) {
            localPoints.push(candidatePt);
          }
        }
      }

      for (const localPt of localPoints) {
        const localVec = new THREE.Vector3(localPt.x, 0, localPt.y);
        const worldPt = plane.localToWorld(localVec);

        // 1. Table vs Floor preference
        const label = (plane.label || '').toLowerCase();
        let semanticScore = 50;
        if (label === 'table' || label === 'desk' || label === 'counter') {
          semanticScore = 100;
        } else if (label === 'floor') {
          semanticScore = 0;
        }

        // 2. Height preferences (tables are elevated horizontal planes)
        const heightDiff = worldPt.y - cameraPos.y;
        let heightScore = worldPt.y * 20;
        if (heightDiff > 0) {
          heightScore -= heightDiff * 100; // penalize points above user camera height
        }

        // 3. User's look direction alignment (prioritize spots in front of user)
        const toPoint = worldPt.clone().sub(cameraPos);
        const distance = toPoint.length();

        // Hard Distance Cutoff: Skip candidates too close or too far
        if (distance < 0.4 || distance > 3.0) {
          continue;
        }

        const alignment = toPoint.normalize().dot(cameraForward);

        let alignmentScore = -1000; // heavy penalty for spots behind user
        if (alignment >= 0) {
          alignmentScore = alignment * 50;
        }

        // 4. Comfortable interaction distance penalty
        const distancePenalty = -Math.abs(distance - 1.5) * 10;

        const score =
          semanticScore + heightScore + alignmentScore + distancePenalty;

        candidates.push({
          plane,
          point: worldPt,
          score,
        });
      }
    }

    // Sort all candidates in descending order of their score
    candidates.sort((a, b) => b.score - a.score);

    let placed = false;
    const origPosition = objectToPlace.position.clone();
    const origQuaternion = objectToPlace.quaternion.clone();

    for (const cand of candidates) {
      // Verify timeout inside the validation loop to abort quickly if running slow
      if (timer.getElapsed() - startElapsed >= timeoutSeconds) {
        break;
      }

      // Temporarily place at origin to calculate bounding box offsets with rotation applied
      objectToPlace.position.set(0, 0, 0);

      // Orient the object upright on the plane normal and face the camera
      const planeNormal = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(cand.plane.quaternion)
        .normalize();
      const forwardVector = cameraPos.clone().sub(cand.point);
      forwardVector.projectOnPlane(planeNormal).normalize();
      const rightVector = new THREE.Vector3()
        .crossVectors(planeNormal, forwardVector)
        .normalize();

      const rotationMatrix = new THREE.Matrix4().makeBasis(
        rightVector,
        planeNormal,
        forwardVector
      );
      objectToPlace.quaternion.setFromRotationMatrix(rotationMatrix);
      objectToPlace.updateMatrixWorld(true);

      // Calculate bounding box at the origin to find bottom offset along world Y axis
      const tempBox = getObjectBoundingBox(objectToPlace);
      const bottomOffset = -tempBox.min.y;

      // Set final position, offsetting vertically so bottom of bbox aligns with horizontal plane
      objectToPlace.position.copy(cand.point);
      objectToPlace.position.y += bottomOffset;
      objectToPlace.updateMatrixWorld(true);

      // Calculate bounding box and verify intersections with scene obstacles
      const objectBox = getObjectBoundingBox(objectToPlace);

      // Shrink and shift collision box slightly to avoid grounding collisions with the table mesh
      const collisionBox = objectBox.clone();

      let collision = false;
      const obstacleBox = new THREE.Box3();
      for (const obstacle of collidableObjects) {
        if (obstacle === cand.plane) {
          continue;
        }
        obstacle.updateMatrixWorld(true);
        obstacleBox.setFromObject(obstacle);
        if (collisionBox.intersectsBox(obstacleBox)) {
          collision = true;
          break;
        }
      }

      if (!collision) {
        placed = true;
        break; // Successful placement!
      }
    }

    if (placed) {
      return true;
    }

    // Restore initial state if placement failed in the current frame
    objectToPlace.position.copy(origPosition);
    objectToPlace.quaternion.copy(origQuaternion);

    // Yield execution until the next frame starts
    await waitFrame.waitFrame();
  }
}

// --- Helper Functions ---

function getLocalPolygon(plane: DetectedPlane): THREE.Vector2[] {
  if (plane.simulatorPlane) {
    return plane.simulatorPlane.polygon;
  } else if (plane.xrPlane) {
    return plane.xrPlane.polygon.map((p) => new THREE.Vector2(p.x, p.z));
  }
  return [];
}

function isPointInPolygon(
  point: THREE.Vector2,
  polygon: THREE.Vector2[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isDescendantOf(
  child: THREE.Object3D,
  parent: THREE.Object3D
): boolean {
  let current = child.parent;
  while (current) {
    if (current === parent) return true;
    current = current.parent;
  }
  return false;
}

function getObjectBoundingBox(object: THREE.Object3D): THREE.Box3 {
  // If the object has a pre-calculated bounding box (e.g. ModelViewer), use it directly
  if ('bbox' in object) {
    const customBbox = (object as {bbox?: THREE.Box3}).bbox;
    if (customBbox && !customBbox.isEmpty()) {
      object.updateMatrixWorld(true);
      return customBbox.clone().applyMatrix4(object.matrixWorld);
    }
  }

  const box = new THREE.Box3();

  function traverse(node: THREE.Object3D) {
    if (!node.visible) return;

    // Ignore the model viewer's platform, rotation cylinder, and control bar meshes
    const name = node.constructor.name;
    if (
      name === 'ModelViewerPlatform' ||
      name === 'RotationRaycastMesh' ||
      node.name === 'Platform'
    ) {
      return;
    }

    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.geometry) {
        if (!mesh.geometry.boundingBox) {
          mesh.geometry.computeBoundingBox();
        }
        const tempBox = mesh.geometry.boundingBox!.clone();
        tempBox.applyMatrix4(mesh.matrixWorld);
        box.union(tempBox);
      }
    }

    for (const child of node.children) {
      traverse(child);
    }
  }

  object.updateMatrixWorld(true);
  traverse(object);
  return box;
}

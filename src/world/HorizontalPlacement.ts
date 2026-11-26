import * as THREE from 'three';
import {WaitFrame} from '../core/components/WaitFrame';
import {PlaneDetector} from './planes/PlaneDetector';
import {MeshDetector} from './mesh/MeshDetector';
import {DetectedPlane} from './planes/DetectedPlane';
import {durationToMs, type DurationLike} from '../utils/TemporalPolyfill';

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
 *    located comfortably in front of the user (0.75m to 3.0m range, pointing in camera look direction).
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
  timeout: DurationLike,
  gridSteps: number
): Promise<boolean> {
  const timeoutSeconds = durationToMs(timeout) / 1000;
  const startElapsed = timer.getElapsed();
  const filterNormalScratch = new THREE.Vector3();
  let lastAttemptElapsed: number | undefined;
  let lastEvaluatedPlanes: DetectedPlane[] | undefined;
  let lastPlaneChangedTimes: number[] | undefined;

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
      const planeNormal = filterNormalScratch
        .set(0, 1, 0)
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

    // Real-world AR planes update a few times per second; throttle unchanged
    // retry sweeps so blocked 30s placement timeouts do not consume CPU budget
    // on every 72/90 Hz XR frame.
    if (
      lastAttemptElapsed !== undefined &&
      elapsed > lastAttemptElapsed &&
      elapsed - lastAttemptElapsed < RETRY_INTERVAL_SECONDS - 1e-6 &&
      !havePlanesChanged(
        horizontalPlanes,
        lastEvaluatedPlanes,
        lastPlaneChangedTimes
      )
    ) {
      await waitFrame.waitFrame();
      continue;
    }
    lastAttemptElapsed = elapsed;
    lastEvaluatedPlanes = horizontalPlanes;
    lastPlaneChangedTimes = horizontalPlanes.map(
      (plane) =>
        plane.xrPlane?.lastChangedTime ??
        plane.simulatorPlane?.lastChangedTime ??
        0
    );

    // Gather all visible collidable obstacles from the scene graph
    const collidableObjects: THREE.Object3D[] = [];
    const collectObstacles = (child: THREE.Object3D): void => {
      if (!child.visible || child.userData.xrblocksPrivate === true) return;
      if (child === objectToPlace || isDescendantOf(child, objectToPlace))
        return;
      if (meshes && isDescendantOf(child, meshes)) return;
      if (child === camera) return;
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
      for (const descendant of child.children) collectObstacles(descendant);
    };
    collectObstacles(scene);

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
    const planeNormalScratch = new THREE.Vector3();
    const localCameraScratch = new THREE.Vector3();
    const worldPtScratch = new THREE.Vector3();
    const toPointScratch = new THREE.Vector3();

    for (const plane of horizontalPlanes) {
      const polygon = getLocalPolygon(plane);
      if (polygon.length === 0) continue;

      // Convert camera pos to local plane coordinates to center our grid around the user
      const localCameraPos = plane.worldToLocal(
        localCameraScratch.copy(cameraPos)
      );
      const localProjected = new THREE.Vector2(
        localCameraPos.x,
        localCameraPos.z
      );

      let polygonMinX = Infinity;
      let polygonMaxX = -Infinity;
      let polygonMinY = Infinity;
      let polygonMaxY = -Infinity;
      for (const p of polygon) {
        if (p.x < polygonMinX) polygonMinX = p.x;
        if (p.x > polygonMaxX) polygonMaxX = p.x;
        if (p.y < polygonMinY) polygonMinY = p.y;
        if (p.y > polygonMaxY) polygonMaxY = p.y;
      }

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

      // 1. Table vs Floor preference (constant per plane)
      const label = (plane.label || '').toLowerCase();
      let semanticScore = 50;
      if (label === 'table' || label === 'desk' || label === 'counter') {
        semanticScore = 100;
      } else if (label === 'floor') {
        semanticScore = 0;
      }

      for (const localPt of localPoints) {
        const worldPt = plane.localToWorld(
          worldPtScratch.set(localPt.x, 0, localPt.y)
        );

        // 2. Height preferences (tables are elevated horizontal planes)
        const heightDiff = worldPt.y - cameraPos.y;
        let heightScore = worldPt.y * 20;
        if (heightDiff > 0) {
          heightScore -= heightDiff * 100; // penalize points above user camera height
        }

        // 3. User's look direction alignment (prioritize spots in front of user)
        const toPoint = toPointScratch.copy(worldPt).sub(cameraPos);
        const distance = toPoint.length();

        // Hard Distance Cutoff: Skip candidates too close or too far
        if (distance < 0.75 || distance > 3.0) {
          continue;
        }

        const alignment = toPoint
          .multiplyScalar(1 / distance)
          .dot(cameraForward);

        let alignmentScore = -1000; // heavy penalty for spots behind user
        if (alignment >= 0) {
          alignmentScore = alignment * 50;
        }

        // 4. Comfortable interaction distance penalty (discourage < 1.1m so
        // camera alignment alone does not spawn models right in front of the face)
        const distancePenalty =
          distance < 1.1
            ? -(1.1 - distance) * 60 - Math.abs(distance - 1.5) * 10
            : -Math.abs(distance - 1.5) * 10;

        const score =
          semanticScore + heightScore + alignmentScore + distancePenalty;

        candidates.push({
          plane,
          point: worldPt.clone(),
          score,
        });
      }
    }

    if (candidates.length === 0) {
      await waitFrame.waitFrame();
      continue;
    }

    // Sort all candidates in descending order of their score
    candidates.sort((a, b) => b.score - a.score);

    let placed = false;
    const origPosition = objectToPlace.position.clone();
    const origQuaternion = objectToPlace.quaternion.clone();

    objectToPlace.parent?.updateWorldMatrix(true, false);
    const parentWorldMatrix =
      objectToPlace.parent?.matrixWorld ?? IDENTITY_MATRIX;
    const parentElements = parentWorldMatrix.elements;
    const localSubtreeBoxes = collectSubtreeLocalBoxes(objectToPlace);
    const hasAncestorObstacle = collidableObjects.some((obstacle) =>
      isDescendantOf(objectToPlace, obstacle)
    );

    // Scratch box reused while evaluating the first candidate. Obstacle bounds
    // only get cached once a candidate has been rejected, so the common
    // first-candidate success never pays for the cache. The cache lives inside
    // the frame loop so it is rebuilt after yielding, picking up obstacles that
    // moved in the meantime.
    const obstacleBox = new THREE.Box3();
    let obstacleBounds: Map<THREE.Object3D, THREE.Box3> | undefined;

    const forwardVector = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const localMatrixAtOrigin = new THREE.Matrix4();
    const rootWorldAtOrigin = new THREE.Matrix4();
    const nodeWorldMatrix = new THREE.Matrix4();
    const transformedNodeBox = new THREE.Box3();
    const tempBox = new THREE.Box3();
    const collisionBox = new THREE.Box3();
    const worldTranslationDelta = new THREE.Vector3();

    for (const cand of candidates) {
      // Verify timeout inside the validation loop to abort quickly if running slow
      if (timer.getElapsed() - startElapsed >= timeoutSeconds) {
        break;
      }

      if (localSubtreeBoxes.length === 0) {
        break;
      }

      // Orient the object upright on the plane normal and face the camera
      const planeNormal = planeNormalScratch
        .set(0, 1, 0)
        .applyQuaternion(cand.plane.quaternion)
        .normalize();
      forwardVector
        .copy(cameraPos)
        .sub(cand.point)
        .projectOnPlane(planeNormal)
        .normalize();
      rightVector.crossVectors(planeNormal, forwardVector).normalize();

      rotationMatrix.makeBasis(rightVector, planeNormal, forwardVector);
      objectToPlace.quaternion.setFromRotationMatrix(rotationMatrix);
      localMatrixAtOrigin.compose(
        ZERO_VECTOR,
        objectToPlace.quaternion,
        objectToPlace.scale
      );
      rootWorldAtOrigin.multiplyMatrices(
        parentWorldMatrix,
        localMatrixAtOrigin
      );

      // Compute world-space bounding box with objectToPlace at local origin (0, 0, 0)
      // directly from precollected subtree local boxes (zero subtree traversals or allocations).
      tempBox.makeEmpty();
      for (let i = 0; i < localSubtreeBoxes.length; i++) {
        const entry = localSubtreeBoxes[i];
        nodeWorldMatrix.multiplyMatrices(rootWorldAtOrigin, entry.relMatrix);
        transformedNodeBox.copy(entry.box).applyMatrix4(nodeWorldMatrix);
        tempBox.union(transformedNodeBox);
      }
      if (!hasFiniteBounds(tempBox)) continue;
      const bottomOffset = -tempBox.min.y;

      // Position objectToPlace so bottom of bbox aligns with the horizontal plane.
      const px = cand.point.x;
      const py = cand.point.y + bottomOffset;
      const pz = cand.point.z;
      objectToPlace.position.set(px, py, pz);
      if (hasAncestorObstacle) {
        objectToPlace.updateMatrixWorld(true);
      }

      // Pure translation in parent space shifts the world-space AABB by L_parent * pos.
      worldTranslationDelta.set(
        parentElements[0] * px +
          parentElements[4] * py +
          parentElements[8] * pz,
        parentElements[1] * px +
          parentElements[5] * py +
          parentElements[9] * pz,
        parentElements[2] * px +
          parentElements[6] * py +
          parentElements[10] * pz
      );
      collisionBox.copy(tempBox).translate(worldTranslationDelta);
      if (!hasFiniteBounds(collisionBox)) continue;

      let collision = false;
      for (const obstacle of collidableObjects) {
        if (obstacle === cand.plane) {
          continue;
        }
        let bounds = obstacleBounds?.get(obstacle);
        if (!bounds) {
          obstacle.updateMatrixWorld(true);
          bounds = obstacleBox.setFromObject(obstacle);
          // Ancestor bounds include the moving object, so they change from one
          // candidate to the next and must not be cached.
          if (obstacleBounds && !isDescendantOf(objectToPlace, obstacle)) {
            bounds = bounds.clone();
            obstacleBounds.set(obstacle, bounds);
          }
        }
        if (collisionBox.intersectsBox(bounds)) {
          collision = true;
          break;
        }
      }

      if (!collision) {
        objectToPlace.updateMatrixWorld(true);
        placed = true;
        break; // Successful placement!
      }

      // Start caching only once a candidate has been rejected, since more
      // candidates will now be tested against the same obstacles.
      obstacleBounds ??= new Map();
    }

    if (placed) {
      return true;
    }

    // Restore initial state if placement failed in the current frame
    objectToPlace.position.copy(origPosition);
    objectToPlace.quaternion.copy(origQuaternion);
    objectToPlace.updateMatrixWorld(true);

    // Yield execution until the next frame starts
    await waitFrame.waitFrame();
  }
}

// --- Helper Functions ---

const RETRY_INTERVAL_SECONDS = 0.25;
const IDENTITY_MATRIX = new THREE.Matrix4();
const ZERO_VECTOR = new THREE.Vector3();
const xrPlanePolygonCache = new WeakMap<
  XRPlane,
  {lastChangedTime: number; polygon: THREE.Vector2[]}
>();

interface SubtreeLocalBox {
  box: THREE.Box3;
  relMatrix: THREE.Matrix4;
}

function havePlanesChanged(
  current: DetectedPlane[],
  prevPlanes: DetectedPlane[] | undefined,
  prevChangedTimes: number[] | undefined
): boolean {
  if (
    !prevPlanes ||
    !prevChangedTimes ||
    current.length !== prevPlanes.length
  ) {
    return true;
  }
  for (let i = 0; i < current.length; i++) {
    if (
      current[i] !== prevPlanes[i] ||
      (current[i].xrPlane?.lastChangedTime ??
        current[i].simulatorPlane?.lastChangedTime ??
        0) !== prevChangedTimes[i]
    ) {
      return true;
    }
  }
  return false;
}

function getLocalPolygon(plane: DetectedPlane): THREE.Vector2[] {
  if (plane.simulatorPlane) {
    return plane.simulatorPlane.polygon;
  } else if (plane.xrPlane) {
    const xrPlane = plane.xrPlane;
    const cached = xrPlanePolygonCache.get(xrPlane);
    if (cached && cached.lastChangedTime === xrPlane.lastChangedTime) {
      return cached.polygon;
    }
    const polygon = xrPlane.polygon.map((p) => new THREE.Vector2(p.x, p.z));
    xrPlanePolygonCache.set(xrPlane, {
      lastChangedTime: xrPlane.lastChangedTime,
      polygon,
    });
    return polygon;
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

function collectSubtreeLocalBoxes(root: THREE.Object3D): SubtreeLocalBox[] {
  const entries: SubtreeLocalBox[] = [];

  function traverse(node: THREE.Object3D, relMatrix: THREE.Matrix4) {
    if (!node.visible || node.userData.xrblocksPrivate === true) return;

    const boundedObject = node as THREE.Object3D & {
      boundingBox?: THREE.Box3 | null;
      computeBoundingBox?: () => void;
    };
    if (boundedObject.boundingBox === null) {
      boundedObject.computeBoundingBox?.();
    }

    if (boundedObject.boundingBox?.isBox3) {
      if (!boundedObject.boundingBox.isEmpty()) {
        entries.push({
          box: boundedObject.boundingBox,
          relMatrix: relMatrix.clone(),
        });
      }
    } else {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) {
        if (!mesh.geometry.boundingBox) {
          mesh.geometry.computeBoundingBox();
        }
        if (mesh.geometry.boundingBox && !mesh.geometry.boundingBox.isEmpty()) {
          entries.push({
            box: mesh.geometry.boundingBox,
            relMatrix: relMatrix.clone(),
          });
        }
      }
    }

    for (const child of node.children) {
      if (child.matrixAutoUpdate) {
        child.updateMatrix();
      }
      const childRelMatrix = new THREE.Matrix4().multiplyMatrices(
        relMatrix,
        child.matrix
      );
      traverse(child, childRelMatrix);
    }
  }

  traverse(root, IDENTITY_MATRIX);
  return entries;
}

function hasFiniteBounds(box: THREE.Box3): boolean {
  return (
    !box.isEmpty() &&
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  );
}

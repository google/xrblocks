import * as THREE from 'three';
import {
  placeObjectAtIntersectionFacingTarget,
  type DetectedPlane,
} from 'xrblocks';

import type {SceneAssetDescription, SceneLayout} from './SceneTypes';
import {getProceduralBounds} from './ProceduralGeometry';
import {getLandscapeBounds} from './LandscapeGeometry';

const EPSILON = 1e-6;

function cross(a: THREE.Vector2, b: THREE.Vector2, p: THREE.Vector2) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function containsPoint(point: THREE.Vector2, polygon: THREE.Vector2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (
      Math.abs(cross(a, b, point)) <= EPSILON &&
      point.x >= Math.min(a.x, b.x) - EPSILON &&
      point.x <= Math.max(a.x, b.x) + EPSILON &&
      point.y >= Math.min(a.y, b.y) - EPSILON &&
      point.y <= Math.max(a.y, b.y) + EPSILON
    ) {
      return true;
    }
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function containsFootprint(bounds: THREE.Box3, polygon: THREE.Vector2[]) {
  const corners = [
    new THREE.Vector2(bounds.min.x, bounds.min.z),
    new THREE.Vector2(bounds.max.x, bounds.min.z),
    new THREE.Vector2(bounds.max.x, bounds.max.z),
    new THREE.Vector2(bounds.min.x, bounds.max.z),
  ];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (
      !containsPoint(a, polygon) ||
      !containsPoint(a.clone().lerp(b, 0.5), polygon)
    ) {
      return false;
    }
    for (let j = 0; j < polygon.length; j++) {
      const c = polygon[j];
      const d = polygon[(j + 1) % polygon.length];
      if (
        cross(a, b, c) * cross(a, b, d) < -EPSILON &&
        cross(c, d, a) * cross(c, d, b) < -EPSILON
      ) {
        return false;
      }
    }
  }
  return true;
}

function sceneBounds(
  layout: SceneLayout,
  objectBounds: ReadonlyMap<string, THREE.Box3>,
  sceneMatrix: THREE.Matrix4
) {
  const bounds = new THREE.Box3();
  for (const object of layout.objects) {
    const local = objectBounds.get(object.id);
    if (!local) throw new Error(`Missing placement bounds for "${object.id}".`);
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(object.position),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        object.rotation
      ),
      new THREE.Vector3().fromArray(object.scale)
    );
    transform.premultiply(sceneMatrix);
    bounds.union(local.clone().applyMatrix4(transform));
  }
  return bounds;
}

/**
 * Uses detected plane polygons and the SDK's surface-facing convention.
 * Unlike point placement, a composition must fit its entire footprint.
 * Candidate poses are detached, so an unsuccessful search never moves live objects.
 */
export function placeSceneOnSurface(
  scene: THREE.Object3D,
  layout: SceneLayout,
  assets: readonly SceneAssetDescription[],
  planes: readonly DetectedPlane[],
  camera: THREE.Camera
): boolean {
  if (layout.objects.length === 0) return false;
  scene.updateWorldMatrix(true, false);
  const worldScale = scene.getWorldScale(new THREE.Vector3());
  if (
    !worldScale
      .toArray()
      .every((value) => Number.isFinite(value) && value > 0) ||
    Math.abs(scene.matrixWorld.determinant()) < EPSILON
  ) {
    throw new Error(
      'Surface placement requires a finite, non-reflected scene transform.'
    );
  }
  const catalog = new Map(assets.map((asset) => [asset.id, asset]));
  const objectBounds = new Map<string, THREE.Box3>();
  for (const object of layout.objects) {
    if (object.parts !== undefined) {
      objectBounds.set(object.id, getProceduralBounds(object.parts));
    } else if (object.landscape !== undefined) {
      objectBounds.set(object.id, getLandscapeBounds(object.landscape));
    } else {
      const asset = catalog.get(object.asset);
      if (!asset) {
        throw new Error(`Unknown placement asset "${object.asset}".`);
      }
      objectBounds.set(
        object.id,
        new THREE.Box3(
          new THREE.Vector3(-asset.size[0] / 2, 0, -asset.size[2] / 2),
          new THREE.Vector3(asset.size[0] / 2, asset.size[1], asset.size[2] / 2)
        )
      );
    }
  }
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());
  let best: {score: number; matrix: THREE.Matrix4} | undefined;

  for (const plane of planes) {
    const label = (plane.label ?? '').toLowerCase();
    if (
      label === 'ceiling' ||
      (plane.orientation?.toLowerCase() !== 'horizontal' &&
        !['floor', 'table', 'desk', 'counter', 'horizontal'].includes(label))
    ) {
      continue;
    }
    plane.updateWorldMatrix(true, false);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(
      plane.matrixWorld
    );
    if (normal.y < 0.99 || Math.abs(plane.matrixWorld.determinant()) < EPSILON)
      continue;
    const polygon =
      plane.simulatorPlane?.polygon ??
      plane.xrPlane?.polygon.map(
        (point) => new THREE.Vector2(point.x, point.z)
      ) ??
      [];
    if (
      polygon.length < 3 ||
      polygon.some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
      )
    ) {
      continue;
    }
    const planeBounds = new THREE.Box2().setFromPoints(polygon);
    const inversePlane = plane.matrixWorld.clone().invert();
    const ahead = cameraPosition
      .clone()
      .addScaledVector(cameraForward, 2)
      .applyMatrix4(inversePlane);
    const candidates = [
      new THREE.Vector2(ahead.x, ahead.z),
      planeBounds.getCenter(new THREE.Vector2()),
    ];
    for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      for (const z of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        candidates.push(
          new THREE.Vector2(
            THREE.MathUtils.lerp(planeBounds.min.x, planeBounds.max.x, x),
            THREE.MathUtils.lerp(planeBounds.min.y, planeBounds.max.y, z)
          )
        );
      }
    }

    for (const candidate of candidates) {
      if (!containsPoint(candidate, polygon)) continue;
      const point = new THREE.Vector3(candidate.x, 0, candidate.y).applyMatrix4(
        plane.matrixWorld
      );
      const toPoint = point.clone().sub(cameraPosition);
      const distance = toPoint.length();
      const alignment = toPoint.clone().normalize().dot(cameraForward);
      if (
        distance < 0.4 ||
        distance > 6 ||
        alignment <= 0 ||
        toPoint.clone().projectOnPlane(normal).lengthSq() < EPSILON
      ) {
        continue;
      }
      const pose = new THREE.Object3D();
      pose.scale.copy(worldScale);
      placeObjectAtIntersectionFacingTarget(
        pose,
        {object: plane, point, distance, normal: new THREE.Vector3(0, 1, 0)},
        camera
      );
      pose.updateMatrixWorld(true);
      const bounds = sceneBounds(
        layout,
        objectBounds,
        inversePlane.clone().multiply(pose.matrixWorld)
      );
      const center = bounds.getCenter(new THREE.Vector3());
      const offset = new THREE.Vector3(
        candidate.x - center.x,
        -bounds.min.y,
        candidate.y - center.z
      );
      bounds.translate(offset);
      if (!containsFootprint(bounds, polygon)) continue;

      const worldOffset = offset
        .applyMatrix4(plane.matrixWorld)
        .sub(plane.getWorldPosition(new THREE.Vector3()));
      pose.position.add(worldOffset);
      pose.updateMatrixWorld(true);
      const score =
        alignment * 4 -
        Math.abs(distance - 2) +
        (['table', 'desk', 'counter'].includes(label) ? 0.25 : 0);
      if (!best || score > best.score)
        best = {score, matrix: pose.matrixWorld.clone()};
    }
  }
  if (!best) return false;

  const local = scene.parent
    ? scene.parent.matrixWorld.clone().invert().multiply(best.matrix)
    : best.matrix;
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  local.decompose(position, rotation, scale);
  const recomposed = new THREE.Matrix4().compose(position, rotation, scale);
  if (
    local.elements.some(
      (value, index) => Math.abs(value - recomposed.elements[index]) > EPSILON
    )
  ) {
    throw new Error(
      'Surface placement cannot preserve a sheared parent transform.'
    );
  }
  scene.position.copy(position);
  scene.quaternion.copy(rotation);
  scene.scale.copy(scale);
  scene.updateMatrix();
  scene.updateMatrixWorld(true);
  return true;
}

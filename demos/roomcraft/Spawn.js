import * as THREE from 'three';

const STANDING_RADIUS = 0.35;
const EDGE_MARGIN = STANDING_RADIUS + 0.1;
const FLOOR_CLEARANCE = 0.1;
const HEAD_CLEARANCE = 0.2;
const SPAWN_SAMPLE_SPACING_METERS = 0.5;
const MAX_SPAWN_GRID_STEPS = 40;
const PREFERRED_ENTRY_INSET_METERS = 1.2;

function samples(center, limit) {
  const steps = THREE.MathUtils.clamp(
    Math.ceil((limit * 2) / SPAWN_SAMPLE_SPACING_METERS),
    1,
    MAX_SPAWN_GRID_STEPS
  );
  const values = [center];
  for (let index = 0; index <= steps; index++) {
    values.push(-limit + ((limit * 2) / steps) * index);
  }
  return values;
}

/**
 * Finds a floor point inside an axis-aligned ground, reserving standing room
 * through head height. Bounds and dimensions must use the same metre frame.
 * Returns null when the bounded search finds no clear candidate.
 */
export function findClearSpawn(size, obstacles, eyeHeight) {
  if (
    !Array.isArray(size) ||
    size.length !== 2 ||
    ![size[0], size[1]].every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isFinite(eyeHeight) ||
    eyeHeight <= 0
  ) {
    throw new Error(
      'Spawn dimensions and eye height must be positive and finite.'
    );
  }
  if (!Array.isArray(obstacles)) {
    throw new Error('Spawn obstacles must be an array of bounds.');
  }
  const occupied = Array.from(obstacles).filter((box) => {
    if (!(box instanceof THREE.Box3)) {
      throw new Error('Each spawn obstacle must be a Box3.');
    }
    const coordinates = [...box.min.toArray(), ...box.max.toArray()];
    const empty = box.isEmpty();
    if (
      coordinates.some(Number.isNaN) ||
      (!empty && !coordinates.every(Number.isFinite))
    ) {
      throw new Error('Spawn obstacle bounds must be finite.');
    }
    return (
      !empty &&
      box.max.y > FLOOR_CLEARANCE &&
      box.min.y < eyeHeight + HEAD_CLEARANCE
    );
  });
  const xLimit = size[0] / 2 - EDGE_MARGIN;
  const zLimit = size[1] / 2 - EDGE_MARGIN;
  if (xLimit < 0 || zLimit < 0) return null;
  const preferredZ = THREE.MathUtils.clamp(
    size[1] / 2 - PREFERRED_ENTRY_INSET_METERS,
    -zLimit,
    zLimit
  );
  const clear = (x, z) =>
    !occupied.some(
      (box) =>
        x + STANDING_RADIUS >= box.min.x &&
        x - STANDING_RADIUS <= box.max.x &&
        z + STANDING_RADIUS >= box.min.z &&
        z - STANDING_RADIUS <= box.max.z
    );
  if (clear(0, preferredZ)) return new THREE.Vector3(0, 0, preferredZ);

  let best = null;
  let distance = Infinity;
  const zValues = samples(preferredZ, zLimit);
  for (const x of samples(0, xLimit)) {
    for (const z of zValues) {
      const candidateDistance = x * x + (z - preferredZ) ** 2;
      if (candidateDistance < distance && clear(x, z)) {
        best = new THREE.Vector3(x, 0, z);
        distance = candidateDistance;
      }
    }
  }
  return best;
}

/** Chooses a world-space floor point without changing the authored scene. */
export function getWorldSpawn(room, eyeHeight) {
  const layout = room.layout;
  if (!layout.environment) {
    throw new Error('There is no virtual environment to enter yet.');
  }
  room.updateWorldMatrix(true, false);
  const xAxis = new THREE.Vector3().setFromMatrixColumn(room.matrixWorld, 0);
  const zAxis = new THREE.Vector3().setFromMatrixColumn(room.matrixWorld, 2);
  const widthScale = xAxis.length();
  const depthScale = zAxis.length();
  if (
    !room.matrixWorld.elements.every(Number.isFinite) ||
    ![widthScale, depthScale].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    throw new Error('The virtual ground has an invalid transform.');
  }
  xAxis.divideScalar(widthScale);
  zAxis.divideScalar(depthScale);
  if (
    Math.abs(xAxis.y) > 1e-6 ||
    Math.abs(zAxis.y) > 1e-6 ||
    Math.abs(xAxis.dot(zAxis)) > 1e-6
  ) {
    throw new Error(
      'The virtual ground must be level and not sheared for entry.'
    );
  }
  const heading = Math.atan2(zAxis.x, zAxis.z);
  // Remove scene scale so the standing clearance remains measured in metres.
  const groundFrame = new THREE.Matrix4()
    .makeRotationY(heading)
    .setPosition(new THREE.Vector3().setFromMatrixPosition(room.matrixWorld));
  const inverse = groundFrame.clone().invert();
  const obstacles = layout.objects.map(({id}) =>
    room.getWorldBounds(id).clone().applyMatrix4(inverse)
  );
  const position = findClearSpawn(
    [
      layout.environment.size[0] * widthScale,
      layout.environment.size[1] * depthScale,
    ],
    obstacles,
    eyeHeight
  );
  if (!position) {
    throw new Error(
      'No clear entry position was found. Move or remove an object to leave a standing space near the front of the ground.'
    );
  }
  return {position: position.applyMatrix4(groundFrame), heading};
}

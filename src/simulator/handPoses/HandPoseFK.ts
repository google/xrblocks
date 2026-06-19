import * as THREE from 'three';

/**
 * SimulatorHandPoseRotations are authored as standardized biomechanical hand angles
 *
 * Long fingers:
 * - x: flexion toward the palm; negative x extends away from the palm.
 * - y: abduction away from the middle-finger axis; negative y adducts toward it.
 * - z: axial radial roll toward the thumb; negative z rolls away from the thumb.
 *
 * Middle finger:
 * - y: radial deviation toward index/thumb; negative y is ulnar deviation.
 *
 * Thumb:
 * - x: flexion across the palm; negative x extends/repositions.
 * - y: palmar abduction away from the palm; negative y adducts back.
 * - z: opposition/internal roll into the hand; negative z repositions away.
 */

import {HAND_JOINT_NAMES} from '../../input/components/HandJointNames';
import {Handedness, type JointName} from '../../input/Hands';
import type {
  SimulatorHandJointRotationArray,
  SimulatorHandPoseJoints,
  SimulatorHandPoseRotations,
} from './HandPoseJoints';
import {SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES} from './HandPoseJoints';
import {LEFT_HAND_NEUTRAL, RIGHT_HAND_NEUTRAL} from './NeutralHandPose';
import type {DeepReadonly} from '../../utils/Types';

const HAND_JOINT_PARENT: Partial<Record<JointName, JointName>> = {
  'thumb-metacarpal': 'wrist',
  'thumb-phalanx-proximal': 'thumb-metacarpal',
  'thumb-phalanx-distal': 'thumb-phalanx-proximal',
  'thumb-tip': 'thumb-phalanx-distal',
  'index-finger-metacarpal': 'wrist',
  'index-finger-phalanx-proximal': 'index-finger-metacarpal',
  'index-finger-phalanx-intermediate': 'index-finger-phalanx-proximal',
  'index-finger-phalanx-distal': 'index-finger-phalanx-intermediate',
  'index-finger-tip': 'index-finger-phalanx-distal',
  'middle-finger-metacarpal': 'wrist',
  'middle-finger-phalanx-proximal': 'middle-finger-metacarpal',
  'middle-finger-phalanx-intermediate': 'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-distal': 'middle-finger-phalanx-intermediate',
  'middle-finger-tip': 'middle-finger-phalanx-distal',
  'ring-finger-metacarpal': 'wrist',
  'ring-finger-phalanx-proximal': 'ring-finger-metacarpal',
  'ring-finger-phalanx-intermediate': 'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-distal': 'ring-finger-phalanx-intermediate',
  'ring-finger-tip': 'ring-finger-phalanx-distal',
  'pinky-finger-metacarpal': 'wrist',
  'pinky-finger-phalanx-proximal': 'pinky-finger-metacarpal',
  'pinky-finger-phalanx-intermediate': 'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-distal': 'pinky-finger-phalanx-intermediate',
  'pinky-finger-tip': 'pinky-finger-phalanx-distal',
};

type RestJoint = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  localOffset: THREE.Vector3;
  localRotation: THREE.Quaternion;
};

function createRestJoints(
  joints: typeof LEFT_HAND_NEUTRAL | typeof RIGHT_HAND_NEUTRAL
) {
  const restJoints = new Map<JointName, RestJoint>();
  HAND_JOINT_NAMES.forEach((jointName, index) => {
    const joint = joints[index];
    const position = new THREE.Vector3(joint.t[0], joint.t[1], joint.t[2]);
    const rotation = new THREE.Quaternion(
      joint.r[0],
      joint.r[1],
      joint.r[2],
      joint.r[3]
    );
    const parentName = HAND_JOINT_PARENT[jointName];

    if (!parentName) {
      restJoints.set(jointName, {
        position,
        rotation,
        localOffset: position.clone(),
        localRotation: rotation.clone(),
      });
      return;
    }

    const parentRestJoint = restJoints.get(parentName)!;
    const inverseParentRotation = parentRestJoint.rotation.clone().invert();
    const localOffset = position
      .clone()
      .sub(parentRestJoint.position)
      .applyQuaternion(inverseParentRotation);
    const localRotation = parentRestJoint.rotation
      .clone()
      .invert()
      .multiply(rotation);

    restJoints.set(jointName, {
      position,
      rotation,
      localOffset,
      localRotation,
    });
  });
  return restJoints;
}

const LEFT_REST_JOINTS = createRestJoints(LEFT_HAND_NEUTRAL);
const RIGHT_REST_JOINTS = createRestJoints(RIGHT_HAND_NEUTRAL);
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function applySimulatorHandPoseRotationConstraints(
  rotations: SimulatorHandPoseRotations
): SimulatorHandPoseRotations {
  const constrainedRotations: SimulatorHandPoseRotations = {};

  for (const [jointName, rotation] of Object.entries(rotations)) {
    const jointConstraints =
      SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES[
        jointName as keyof typeof SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES
      ];
    constrainedRotations[jointName as JointName] = rotation.map(
      (axisValue, axisIndex) => {
        const axisConstraints = jointConstraints?.[axisIndex];
        if (!axisConstraints) return axisValue;

        const [minDegrees, maxDegrees] = axisConstraints;
        return (
          clamp(axisValue * RAD_TO_DEG, minDegrees, maxDegrees) * DEG_TO_RAD
        );
      }
    ) as SimulatorHandJointRotationArray;
  }

  return constrainedRotations;
}

// conversion into the neutral hand pose standard
// TODO: could directly encode these into the actual quaternions
function getRawFKRotation(
  jointName: JointName,
  rotation: SimulatorHandPoseRotations[JointName] = [0, 0, 0]
): SimulatorHandJointRotationArray {
  const [x, y, z] = rotation;

  if (jointName === 'thumb-metacarpal') {
    return [y, x, -z];
  }

  if (jointName.startsWith('thumb-')) {
    return [-x, -y, -z];
  }

  if (
    jointName.startsWith('index-finger-') ||
    jointName.startsWith('middle-finger-')
  ) {
    return [-x, -y, z];
  }

  return [-x, y, z];
}

function getHandednessRotation(
  handedness: Handedness,
  rotation: SimulatorHandJointRotationArray
): SimulatorHandJointRotationArray {
  if (handedness !== Handedness.RIGHT) {
    return rotation;
  }
  return [rotation[0], -rotation[1], -rotation[2]];
}

function resolveHandPoseRotations(
  handedness: Handedness,
  restJoints: Map<JointName, RestJoint>,
  rotations: SimulatorHandPoseRotations,
  applyConstraints = false
): SimulatorHandPoseJoints {
  const finalPositions = new Map<JointName, THREE.Vector3>();
  const finalRotations = new Map<JointName, THREE.Quaternion>();
  const resolvedJoints: SimulatorHandPoseJoints = [];
  const resolvedRotations = applyConstraints
    ? applySimulatorHandPoseRotationConstraints(rotations)
    : rotations;

  for (const jointName of HAND_JOINT_NAMES) {
    const restJoint = restJoints.get(jointName)!;
    const rawRotation = getRawFKRotation(
      jointName,
      resolvedRotations[jointName]
    );
    const rotation = getHandednessRotation(handedness, rawRotation);
    const offsetRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ')
    );
    const parentName = HAND_JOINT_PARENT[jointName];

    if (!parentName) {
      const finalPosition = restJoint.position.clone();
      const finalRotation = restJoint.rotation.clone().multiply(offsetRotation);
      finalPositions.set(jointName, finalPosition);
      finalRotations.set(jointName, finalRotation);
      resolvedJoints.push({
        t: finalPosition.toArray(),
        r: finalRotation.toArray(),
        s: [1, 1, 1],
      });
      continue;
    }

    const parentPosition = finalPositions.get(parentName)!;
    const parentRotation = finalRotations.get(parentName)!;
    const finalPosition = restJoint.localOffset
      .clone()
      .applyQuaternion(parentRotation)
      .add(parentPosition);
    const finalRotation = parentRotation
      .clone()
      .multiply(restJoint.localRotation)
      .multiply(offsetRotation);
    finalPositions.set(jointName, finalPosition);
    finalRotations.set(jointName, finalRotation);
    resolvedJoints.push({
      t: finalPosition.toArray(),
      r: finalRotation.toArray(),
      s: [1, 1, 1],
    });
  }

  return resolvedJoints;
}

export function resolveSimulatorHandPoseRotations(
  handedness: Handedness,
  rotations: SimulatorHandPoseRotations,
  applyConstraints = false
) {
  return resolveHandPoseRotations(
    handedness,
    handedness === Handedness.LEFT ? LEFT_REST_JOINTS : RIGHT_REST_JOINTS,
    rotations,
    applyConstraints
  );
}

export function resolveSimulatorRotationsFromKeypoints(
  handedness: Handedness,
  joints: DeepReadonly<SimulatorHandPoseJoints>,
  applyConstraints = false
): SimulatorHandPoseRotations {
  const positions = new Map<JointName, THREE.Vector3>();
  HAND_JOINT_NAMES.forEach((name, index) => {
    const t = joints[index].t;
    positions.set(name, new THREE.Vector3(t[0], t[1], t[2]));
  });

  const restJoints =
    handedness === Handedness.LEFT ? LEFT_REST_JOINTS : RIGHT_REST_JOINTS;
  const computedRotations: SimulatorHandPoseRotations = {};
  const finalRotations = new Map<JointName, THREE.Quaternion>();

  function getPalmBasis(
    wristPos: THREE.Vector3,
    indexMcpPos: THREE.Vector3,
    middleMcpPos: THREE.Vector3
  ): THREE.Quaternion {
    const yAxis = new THREE.Vector3()
      .subVectors(middleMcpPos, wristPos)
      .normalize();
    const temp = new THREE.Vector3()
      .subVectors(indexMcpPos, wristPos)
      .normalize();

    if (yAxis.lengthSq() < 1e-8 || temp.lengthSq() < 1e-8) {
      return new THREE.Quaternion();
    }

    const zAxis = new THREE.Vector3().crossVectors(yAxis, temp);
    if (zAxis.lengthSq() < 1e-8) {
      return new THREE.Quaternion();
    }
    zAxis.normalize();

    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();

    const matrix = new THREE.Matrix4();
    matrix.makeBasis(xAxis, yAxis, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }

  const restWrist = restJoints.get('wrist')!;
  const restIndexMcp = restJoints.get('index-finger-metacarpal')!;
  const restMiddleMcp = restJoints.get('middle-finger-metacarpal')!;

  const Q_rest = getPalmBasis(
    restWrist.position,
    restIndexMcp.position,
    restMiddleMcp.position
  );
  const Q_actual = getPalmBasis(
    positions.get('wrist')!,
    positions.get('index-finger-metacarpal')!,
    positions.get('middle-finger-metacarpal')!
  );

  const offsetRotationWristBasis = Q_actual.clone().multiply(
    Q_rest.clone().invert()
  );
  const Q_wrist = offsetRotationWristBasis.clone().multiply(restWrist.rotation);
  finalRotations.set('wrist', Q_wrist);

  const offsetRotationWrist = restWrist.rotation
    .clone()
    .invert()
    .multiply(offsetRotationWristBasis)
    .multiply(restWrist.rotation);
  const eulerWrist = new THREE.Euler().setFromQuaternion(
    offsetRotationWrist,
    'XYZ'
  );
  const rawEulerWrist = getHandednessRotation(handedness, [
    eulerWrist.x,
    eulerWrist.y,
    eulerWrist.z,
  ]);
  computedRotations['wrist'] = getRawFKRotation('wrist', rawEulerWrist);

  // Pre-build child mapping for fast lookup (non-wrist, non-tip joints).
  const HAND_JOINT_CHILD: Partial<Record<JointName, JointName>> = {};
  for (const [child, parent] of Object.entries(HAND_JOINT_PARENT)) {
    if (parent !== 'wrist') {
      HAND_JOINT_CHILD[parent as JointName] = child as JointName;
    }
  }

  // Iterate remaining joints in hierarchical order.
  for (const jointName of HAND_JOINT_NAMES) {
    if (jointName === 'wrist' || jointName.endsWith('-tip')) {
      continue;
    }

    const parentName = HAND_JOINT_PARENT[jointName]!;
    const parentRotation = finalRotations.get(parentName)!;
    const restJoint = restJoints.get(jointName)!;
    const R_base = parentRotation.clone().multiply(restJoint.localRotation);

    // Get the child to define the bone direction.
    const childName = HAND_JOINT_CHILD[jointName];
    if (!childName) continue;

    const restChild = restJoints.get(childName)!;
    const v_rest = restChild.localOffset;
    const pos_joint = positions.get(jointName)!;
    const pos_child = positions.get(childName)!;
    const v_actual = pos_child.clone().sub(pos_joint);

    const v_target = v_actual.clone().applyQuaternion(R_base.clone().invert());
    const lenSq = v_actual.lengthSq();
    const offsetRotation = new THREE.Quaternion();
    if (lenSq > 1e-8) {
      offsetRotation.setFromUnitVectors(
        v_rest.clone().normalize(),
        v_target.clone().normalize()
      );
    }

    const euler = new THREE.Euler().setFromQuaternion(offsetRotation, 'XYZ');
    const rawEuler = getHandednessRotation(handedness, [
      euler.x,
      euler.y,
      euler.z,
    ]);
    const biomechanical = getRawFKRotation(jointName, rawEuler);

    const resolved = applyConstraints
      ? applySimulatorHandPoseRotationConstraints({[jointName]: biomechanical})
      : {[jointName]: biomechanical};

    const finalBiomechanical = resolved[jointName]!;
    computedRotations[jointName] = finalBiomechanical;

    // Save final orientation for children propagation.
    const rawRotation = getRawFKRotation(jointName, finalBiomechanical);
    const rotation = getHandednessRotation(handedness, rawRotation);
    const finalOffsetRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ')
    );
    finalRotations.set(jointName, R_base.clone().multiply(finalOffsetRotation));
  }

  return computedRotations;
}

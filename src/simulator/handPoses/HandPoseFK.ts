import * as THREE from 'three';

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

const HAND_JOINT_CHILD: Partial<Record<JointName, JointName>> = {};
for (const [child, parent] of Object.entries(HAND_JOINT_PARENT)) {
  if (parent !== 'wrist')
    HAND_JOINT_CHILD[parent as JointName] = child as JointName;
}

type RestJoint = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  localOffset: THREE.Vector3;
  localRotation: THREE.Quaternion;
  controlToBone: THREE.Quaternion;
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
        controlToBone: new THREE.Quaternion(),
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
      controlToBone: new THREE.Quaternion(),
      localOffset,
      localRotation,
    });
  });
  const wrist = restJoints.get('wrist')!.position;
  const middle = restJoints.get('middle-finger-phalanx-proximal')!.position;
  const index = restJoints.get('index-finger-phalanx-proximal')!.position;
  const pinky = restJoints.get('pinky-finger-phalanx-proximal')!.position;
  const forward = middle.clone().sub(wrist).normalize();
  const radial = index.clone().sub(pinky).normalize();
  const palmarNormal = new THREE.Vector3()
    .crossVectors(forward, radial)
    .normalize();
  if (joints === RIGHT_HAND_NEUTRAL) palmarNormal.negate();

  for (const [jointName, joint] of restJoints) {
    const childName = HAND_JOINT_CHILD[jointName];
    const boneInverse = joint.rotation.clone().normalize().invert();
    const direction = childName
      ? restJoints.get(childName)!.localOffset.clone().normalize()
      : (jointName === 'wrist'
          ? forward.clone()
          : joint.position
              .clone()
              .sub(restJoints.get(HAND_JOINT_PARENT[jointName]!)!.position)
        )
          .applyQuaternion(boneInverse)
          .normalize();
    const isThumb = jointName.startsWith('thumb-');
    const bendToward = (
      jointName === 'thumb-metacarpal'
        ? middle.clone().sub(joint.position)
        : isThumb
          ? new THREE.Vector3(0, -1, 0).applyQuaternion(
              joint.rotation.clone().normalize()
            )
          : palmarNormal.clone()
    ).applyQuaternion(boneInverse);
    const x = new THREE.Vector3()
      .crossVectors(direction, bendToward)
      .normalize();
    const z = direction.clone().negate();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    joint.controlToBone.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, y, z)
    );
  }
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

function getControlAngles(
  handedness: Handedness,
  jointName: JointName,
  rotation: SimulatorHandJointRotationArray
): SimulatorHandJointRotationArray {
  const mirror = handedness === Handedness.RIGHT ? -1 : 1;
  const spread =
    jointName.startsWith('ring-') || jointName.startsWith('pinky-') ? -1 : 1;
  const axial = jointName.startsWith('thumb-') ? -1 : 1;
  return [
    rotation[0],
    rotation[1] * mirror * spread,
    rotation[2] * mirror * axial,
  ];
}

function getOffsetRotation(
  handedness: Handedness,
  jointName: JointName,
  restJoint: RestJoint,
  rotation: SimulatorHandJointRotationArray = [0, 0, 0]
) {
  const [x, y, z] = getControlAngles(handedness, jointName, rotation);
  return restJoint.controlToBone
    .clone()
    .multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))
    )
    .multiply(restJoint.controlToBone.clone().invert());
}

function getControlRotation(
  handedness: Handedness,
  jointName: JointName,
  restJoint: RestJoint,
  offset: THREE.Quaternion
): SimulatorHandJointRotationArray {
  const rotation = restJoint.controlToBone
    .clone()
    .invert()
    .multiply(offset.clone().normalize())
    .multiply(restJoint.controlToBone);
  const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
  return getControlAngles(handedness, jointName, [euler.x, euler.y, euler.z]);
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
    const offsetRotation = getOffsetRotation(
      handedness,
      jointName,
      restJoint,
      resolvedRotations[jointName]
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
  computedRotations.wrist = getControlRotation(
    handedness,
    'wrist',
    restWrist,
    offsetRotationWrist
  );

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

    const biomechanical = getControlRotation(
      handedness,
      jointName,
      restJoint,
      offsetRotation
    );

    const resolved = applyConstraints
      ? applySimulatorHandPoseRotationConstraints({[jointName]: biomechanical})
      : {[jointName]: biomechanical};

    const finalBiomechanical = resolved[jointName]!;
    computedRotations[jointName] = finalBiomechanical;

    const finalOffsetRotation = getOffsetRotation(
      handedness,
      jointName,
      restJoint,
      finalBiomechanical
    );
    finalRotations.set(jointName, R_base.clone().multiply(finalOffsetRotation));
  }

  return computedRotations;
}

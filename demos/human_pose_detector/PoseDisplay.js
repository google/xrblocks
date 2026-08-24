import * as xb from 'xrblocks';
import * as THREE from 'three';

// The pose model reports all 33 landmarks even when it cannot see them, so a
// body that is only half in frame still comes back with legs, guessed from a
// prior and often pointing the wrong way. Drawing those is worse than drawing
// nothing, so joints the model is unsure about are skipped.
const MIN_JOINT_VISIBILITY = 0.5;

// The HUD card is head-locked 0.8 m away while the skeleton lands 2 m out, so
// the translucent card composites over the body it is describing. Joining the
// transparent pass lets the skeleton draw last and stay readable through the
// card, while sitting well under the reticle and overlay UI.
const SKELETON_RENDER_ORDER = 1000;

export class PoseDisplay extends xb.Script {
  static dependencies = {world: xb.World};

  init({world}) {
    this.world = world;
    this.initHudText();

    this.initJointMarkers();
    this.initConnections();

    if (this.world.humans) {
      this.world.humans.start(this);
    }

    console.log('PoseDisplay: human pose detector initialized.');
  }

  initHudText() {
    this.hudCard = new xb.UICard({
      size: {width: 0.46, height: 0.18},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'stretch',
      },
    });
    this.hudCard.name = 'PoseHUDCard';
    this.add(this.hudCard);
    this.hudCard.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0, 0.22, -0.8),
        smoothing: 1,
      }),
      new xb.FaceCamera({mode: 'spherical', smoothing: 1})
    );

    this.titleText = new xb.UIText({
      text: 'HUMAN POSE DETECTOR',
      style: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        width: '100%',
      },
    });

    this.statusText = new xb.UIText({
      text: 'Tracking Active...',
      style: {
        fontSize: 16,
        opacity: 0.72,
        textAlign: 'center',
        width: '100%',
      },
    });

    this.statusDetailsText = new xb.UIText({
      text: 'Waiting for body detection...',
      style: {
        fontSize: 14,
        opacity: 0.86,
        textAlign: 'center',
        width: '100%',
      },
    });

    this.hudCard.add(this.titleText, this.statusText, this.statusDetailsText);
  }

  initJointMarkers() {
    // Create a pool of red dot markers for all trackable body joints
    this.markerGeometry = new THREE.SphereGeometry(0.005, 16, 16);
    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      // Transparent only to share the card's pass; see SKELETON_RENDER_ORDER.
      transparent: true,
    });
    this.jointMarkers = new Map();

    const allJointNames = Object.values(xb.PoseJointName);

    allJointNames.forEach((jointName) => {
      // Create dot marker
      const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
      marker.visible = false;
      marker.renderOrder = SKELETON_RENDER_ORDER;
      this.add(marker);
      this.jointMarkers.set(jointName, marker);
    });
  }

  initConnections() {
    // Define connections between joints to build the skeleton
    this.connections = [
      // Head & Face
      [xb.PoseJointName.Head, xb.PoseJointName.Neck],
      [xb.PoseJointName.Neck, xb.PoseJointName.Nose],
      [xb.PoseJointName.Nose, xb.PoseJointName.LeftEye],
      [xb.PoseJointName.LeftEye, xb.PoseJointName.LeftEar],
      [xb.PoseJointName.Nose, xb.PoseJointName.RightEye],
      [xb.PoseJointName.RightEye, xb.PoseJointName.RightEar],

      // Torso
      [xb.PoseJointName.Neck, xb.PoseJointName.Chest],
      [xb.PoseJointName.Chest, xb.PoseJointName.Spine],
      [xb.PoseJointName.Spine, xb.PoseJointName.Hips],

      // Shoulders
      [xb.PoseJointName.Chest, xb.PoseJointName.LeftShoulder],
      [xb.PoseJointName.Chest, xb.PoseJointName.RightShoulder],

      // Arms
      [xb.PoseJointName.LeftShoulder, xb.PoseJointName.LeftElbow],
      [xb.PoseJointName.LeftElbow, xb.PoseJointName.LeftWrist],
      [xb.PoseJointName.RightShoulder, xb.PoseJointName.RightElbow],
      [xb.PoseJointName.RightElbow, xb.PoseJointName.RightWrist],

      // Hips to legs
      [xb.PoseJointName.Hips, xb.PoseJointName.LeftHip],
      [xb.PoseJointName.Hips, xb.PoseJointName.RightHip],

      // Legs
      [xb.PoseJointName.LeftHip, xb.PoseJointName.LeftKnee],
      [xb.PoseJointName.LeftKnee, xb.PoseJointName.LeftAnkle],
      [xb.PoseJointName.LeftAnkle, xb.PoseJointName.LeftFoot],

      [xb.PoseJointName.RightHip, xb.PoseJointName.RightKnee],
      [xb.PoseJointName.RightKnee, xb.PoseJointName.RightAnkle],
      [xb.PoseJointName.RightAnkle, xb.PoseJointName.RightFoot],
    ];

    // Create a pool of connector meshes (thin holographic cyan cylinders)
    this.connectorGeometry = new THREE.CylinderGeometry(0.003, 0.003, 1, 8);
    this.connectorMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8,
    });
    this.connectorMeshes = [];

    this.connections.forEach(([jointA, jointB]) => {
      const mesh = new THREE.Mesh(
        this.connectorGeometry,
        this.connectorMaterial
      );
      mesh.visible = false;
      mesh.renderOrder = SKELETON_RENDER_ORDER;
      this.add(mesh);
      this.connectorMeshes.push({jointA, jointB, mesh});
    });
  }

  update() {
    if (this.world.humans) {
      this.displayPoses(this.world.humans.poses);
    }
  }

  displayPoses(poses) {
    if (!poses || poses.length === 0) {
      this.statusText.text = 'Searching for user...';
      this.statusDetailsText.text =
        'Stand in view of the camera.\nEnsure full body is visible.';
      if (this.jointMarkers) {
        this.jointMarkers.forEach((marker) => {
          marker.visible = false;
        });
      }
      if (this.connectorMeshes) {
        this.connectorMeshes.forEach(({mesh}) => {
          mesh.visible = false;
        });
      }
      return;
    }

    const firstPose = poses[0];
    this.statusText.text = 'Tracking Active';

    const tracked = this.updateJointMarkers(firstPose);
    this.updateConnectorMeshes();

    this.statusDetailsText.text =
      tracked < this.jointMarkers.size
        ? `Tracking ${tracked} of ${this.jointMarkers.size} joints.\nStep back to bring your whole body into frame.`
        : 'Full body skeleton tracked successfully.';
  }

  updateJointMarkers(firstPose) {
    if (!this.jointMarkers) return 0;

    let tracked = 0;
    this.jointMarkers.forEach((marker, jointName) => {
      const pos = firstPose.getJointPosition(jointName, {
        minVisibility: MIN_JOINT_VISIBILITY,
      });
      if (pos) {
        tracked++;
        // Convert target position to local space first
        const targetLocalPos = pos.clone();
        this.worldToLocal(targetLocalPos);

        if (!marker.visible) {
          // Snap directly on first detection to prevent flying in from origin
          marker.position.copy(targetLocalPos);
          marker.visible = true;
        } else {
          // Smoothly interpolate (lerp) the position to eliminate high-frequency jitter
          marker.position.lerp(targetLocalPos, 0.45);
        }
      } else {
        marker.visible = false;
      }
    });

    return tracked;
  }

  updateConnectorMeshes() {
    if (!this.connectorMeshes || !this.jointMarkers) return;

    const upVector = new THREE.Vector3(0, 1, 0);
    const tempDirection = new THREE.Vector3();

    this.connectorMeshes.forEach(({jointA, jointB, mesh}) => {
      const markerA = this.jointMarkers.get(jointA);
      const markerB = this.jointMarkers.get(jointB);

      if (markerA && markerB && markerA.visible && markerB.visible) {
        const posA = markerA.position;
        const posB = markerB.position;

        // Position the cylinder at the midpoint between the two joints
        mesh.position.copy(posA).add(posB).multiplyScalar(0.5);

        // Rotate and scale the cylinder to connect them
        tempDirection.copy(posB).sub(posA);
        const distance = tempDirection.length();

        if (distance > 0.0001) {
          tempDirection.normalize();
          mesh.quaternion.setFromUnitVectors(upVector, tempDirection);
          mesh.scale.set(1.0, distance, 1.0);
          mesh.visible = true;
        } else {
          mesh.visible = false;
        }
      } else {
        mesh.visible = false;
      }
    });
  }

  dispose() {
    if (this.world.humans) {
      this.world.humans.stop(this);
    }
    if (this.markerGeometry) {
      this.markerGeometry.dispose();
    }
    if (this.markerMaterial) {
      this.markerMaterial.dispose();
    }
    if (this.connectorGeometry) {
      this.connectorGeometry.dispose();
    }
    if (this.connectorMaterial) {
      this.connectorMaterial.dispose();
    }
    super.dispose();
  }
}

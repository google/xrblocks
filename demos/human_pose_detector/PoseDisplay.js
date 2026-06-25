import * as xb from 'xrblocks';
import * as THREE from 'three';
import {UICore, UIText, UIPanel} from 'uiblocks';

export class PoseDisplay extends xb.Script {
  static dependencies = {camera: THREE.Camera, world: xb.World};

  init({camera, world}) {
    this.camera = camera;
    this.world = world;
    this.uiCore = new UICore(this);

    this.initHudText();

    this.initJointMarkers();
    this.initConnections();

    if (this.world.humans) {
      this.world.humans.start(this);
    }

    console.log('PoseDisplay: human pose detector initialized.');
  }

  initHudText() {
    // Define the premium glassmorphic display card
    this.hudCard = this.uiCore.createCard({
      name: 'PoseHUDCard',
      sizeX: 0.46,
      sizeY: 0.18,
      position: new THREE.Vector3(0, 0, -1.0),
    });

    const hudPanel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(15, 18, 25, 0.85)', // Sleek dark glassmorphic backdrop
      innerShadowColor: 'rgba(100, 180, 255, 0.15)', // Blue glow
      innerShadowBlur: 80,
      strokeWidth: 3,
      strokeColor: {
        gradientType: 'linear',
        rotation: 45,
        stops: [
          {position: 0, color: '#4796e3'}, // Vibrant blue
          {position: 1, color: '#9b5de5'}, // Vibrant purple
        ],
      },
      cornerRadius: 24,
      padding: 20,
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'stretch',
    });

    // Header with a vibrant pose icon and title
    this.titleText = new UIText('HUMAN POSE DETECTOR', {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#00f0ff', // Glowing cyan
      textAlign: 'center',
      width: '100%',
    });

    // Subtitle / Status
    this.statusText = new UIText('Tracking Active...', {
      fontSize: 16,
      color: '#a0aec0',
      textAlign: 'center',
      width: '100%',
      paddingBottom: 8,
    });

    // Separator line
    const separator = new UIPanel({
      width: '100%',
      height: 2,
      fillColor: 'rgba(255, 255, 255, 0.15)',
      marginBottom: 8,
    });

    // Status Details Text
    this.statusDetailsText = new UIText('Waiting for body detection...', {
      fontSize: 14,
      fontWeight: 'normal',
      color: '#e2e8f0',
      textAlign: 'center',
      width: '100%',
    });

    hudPanel.add(this.titleText);
    hudPanel.add(this.statusText);
    hudPanel.add(separator);
    hudPanel.add(this.statusDetailsText);

    this.hudCard.add(hudPanel);
  }

  initJointMarkers() {
    // Create a pool of red dot markers for all trackable body joints
    this.markerGeometry = new THREE.SphereGeometry(0.005, 16, 16);
    this.markerMaterial = new THREE.MeshBasicMaterial({color: 0xff0000});
    this.jointMarkers = new Map();

    const allJointNames = Object.values(xb.PoseJointName);

    allJointNames.forEach((jointName) => {
      // Create dot marker
      const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
      marker.visible = false;
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
      this.add(mesh);
      this.connectorMeshes.push({jointA, jointB, mesh});
    });
  }

  update() {
    // Align HUD card in front of camera, positioned near the top of the view
    if (this.hudCard && this.camera) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);

      // Position the HUD card forward and offset upwards to act as a top visor, flat in view
      this.hudCard.position
        .copy(position)
        .addScaledVector(forward, 0.8)
        .addScaledVector(up, 0.22);

      this.hudCard.quaternion.copy(quaternion);
    }

    if (this.world.humans) {
      this.displayPoses(this.world.humans.poses);
    }
  }

  displayPoses(poses) {
    if (!poses || poses.length === 0) {
      this.statusText.setText('Searching for user...');
      this.statusDetailsText.setText(
        'Stand in view of the camera.\nEnsure full body is visible.'
      );
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
    this.statusText.setText('Tracking Active');

    this.updateJointMarkers(firstPose);
    this.updateConnectorMeshes();

    this.statusDetailsText.setText('Full body skeleton tracked successfully.');
  }

  updateJointMarkers(firstPose) {
    if (!this.jointMarkers) return;

    this.jointMarkers.forEach((marker, jointName) => {
      const pos = firstPose.getJointPosition(jointName);
      if (pos) {
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

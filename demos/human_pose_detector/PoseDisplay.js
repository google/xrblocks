import * as xb from 'xrblocks';
import * as THREE from 'three';
import {UICore, UIText, UIPanel} from 'uiblocks';
import {Text} from 'troika-three-text';

export class PoseDisplay extends xb.Script {
  static dependencies = {camera: THREE.Camera, world: xb.World};

  init({camera, world}) {
    this.camera = camera;
    this.world = world;
    this.uiCore = new UICore(this);
    this.detecting = false;

    this.initHudText();

    // Create a pool of red dot markers and text labels for all trackable body joints
    this.markerGeometry = new THREE.SphereGeometry(0.005, 16, 16);
    this.markerMaterial = new THREE.MeshBasicMaterial({color: 0xff0000});
    this.jointMarkers = new Map();
    this.jointLabels = new Map();

    const allJointNames = [
      'nose',
      'leftEye',
      'rightEye',
      'leftEar',
      'rightEar',
      'leftShoulder',
      'rightShoulder',
      'leftElbow',
      'rightElbow',
      'leftWrist',
      'rightWrist',
      'leftHip',
      'rightHip',
      'leftKnee',
      'rightKnee',
      'leftAnkle',
      'rightAnkle',
      'leftFoot',
      'rightFoot',
      'hips',
      'spine',
      'chest',
      'neck',
      'head',
    ];

    allJointNames.forEach((jointName) => {
      // Create dot marker
      const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
      marker.visible = false;
      this.add(marker);
      this.jointMarkers.set(jointName, marker);

      // Create text label
      const label = new Text();
      const displayName = jointName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase());
      label.text = displayName;
      label.fontSize = 0.008; // 8mm font size
      label.color = 0xffffff;
      label.anchorX = 'left';
      label.anchorY = 'middle';
      label.visible = false;
      this.add(label);
      this.jointLabels.set(jointName, label);
      label.sync();
    });

    console.log('PoseDisplay: human pose detector initialized.');
  }

  initHudText() {
    // Define the premium glassmorphic display card
    this.hudCard = this.uiCore.createCard({
      name: 'PoseHUDCard',
      sizeX: 0.6,
      sizeY: 0.35,
      position: new THREE.Vector3(0, 0, -1.0),
    });

    const hudPanel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(15, 18, 25, 0.85)', // Sleek dark glassmorphic backdrop
      innerShadowColor: 'rgba(100, 180, 255, 0.15)', // Blue glow
      innerShadowBlur: 80,
      strokeWidth: 4,
      strokeColor: {
        gradientType: 'linear',
        rotation: 45,
        stops: [
          {position: 0, color: '#4796e3'}, // Vibrant blue
          {position: 1, color: '#9b5de5'}, // Vibrant purple
        ],
      },
      cornerRadius: 40,
      padding: 40,
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
    });

    // Header with a vibrant pose icon and title
    this.titleText = new UIText('🧘 HUMAN POSE DETECTOR', {
      fontSize: 36,
      fontWeight: 'bold',
      color: '#00f0ff', // Glowing cyan
      textAlign: 'center',
      width: '100%',
    });

    // Subtitle / Status
    this.statusText = new UIText('Tracking Active...', {
      fontSize: 24,
      color: '#a0aec0',
      textAlign: 'center',
      width: '100%',
      paddingBottom: 15,
    });

    // Separator line
    const separator = new UIPanel({
      width: '100%',
      height: 2,
      fillColor: 'rgba(255, 255, 255, 0.15)',
      marginBottom: 15,
    });

    // Coordinates Text
    this.coordsText = new UIText('Waiting for body detection...', {
      fontSize: 22,
      fontWeight: 'normal',
      color: '#e2e8f0',
      textAlign: 'left',
      width: '100%',
    });

    hudPanel.add(this.titleText);
    hudPanel.add(this.statusText);
    hudPanel.add(separator);
    hudPanel.add(this.coordsText);

    this.hudCard.add(hudPanel);
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

    // Continuously query human detector backend
    if (this.world.humans && !this.detecting) {
      this.detecting = true;
      this.world.humans
        .runDetection()
        .then((poses) => {
          this.detecting = false;
          this.displayPoses(poses);
        })
        .catch((err) => {
          this.detecting = false;
          const errMsg = err.message || String(err);
          this.statusText.setText('Detection Error');
          this.coordsText.setText('[Exception]:\n' + errMsg);
          console.error('Pose detection failed:', err);
        });
    }
  }

  displayPoses(poses) {
    const debugStr =
      (this.world.humans && this.world.humans.lastDebugString) ||
      'No Diagnostics Available';

    if (!poses || poses.length === 0) {
      this.statusText.setText('Status: ' + debugStr);
      this.coordsText.setText(
        'Stand in view of the camera.\nEnsure full body is visible.\n\n[Diagnostics]:\n' +
          debugStr
      );
      if (this.jointMarkers) {
        this.jointMarkers.forEach((marker) => {
          marker.visible = false;
        });
      }
      if (this.jointLabels) {
        this.jointLabels.forEach((label) => {
          label.visible = false;
        });
      }
      return;
    }

    const firstPose = poses[0];
    this.statusText.setText(
      `Tracking 1 Active User (Score: ${Math.round(firstPose.score * 100)}%)`
    );

    // Update all joint markers and labels in the 3D world
    if (this.jointMarkers && this.jointLabels) {
      this.jointMarkers.forEach((marker, jointName) => {
        const pos = firstPose.getJointPosition(jointName);
        const label = this.jointLabels.get(jointName);
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
            marker.position.lerp(targetLocalPos, 0.25);
          }

          // Position label slightly to the right of the smoothed marker relative to camera view
          const rightOffset = new THREE.Vector3(0.008, 0, 0).applyQuaternion(
            this.camera.quaternion
          );
          label.position.copy(marker.position).add(rightOffset);
          label.quaternion.copy(this.camera.quaternion);
          label.visible = true;
        } else {
          marker.visible = false;
          label.visible = false;
        }
      });
    }

    const joints = [
      'nose',
      'neck',
      'leftWrist',
      'rightWrist',
      'leftAnkle',
      'rightAnkle',
    ];
    let displayStr = `[Diagnostics]: ${debugStr}\n\nDetected Joints:\n`;

    // Only mention the joints that are currently detected in the HUD diagnostics
    joints.forEach((jointName) => {
      const pos = firstPose.getJointPosition(jointName);
      if (pos) {
        const displayName = jointName
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase());
        displayStr += `• ${displayName}\n`;
      }
    });

    this.coordsText.setText(displayStr.trim());
  }

  dispose() {
    if (this.markerGeometry) {
      this.markerGeometry.dispose();
    }
    if (this.markerMaterial) {
      this.markerMaterial.dispose();
    }
    if (this.jointLabels) {
      this.jointLabels.forEach((label) => {
        label.dispose();
      });
    }
    super.dispose();
  }
}

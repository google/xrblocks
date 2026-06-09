import * as xb from 'xrblocks';
import * as THREE from 'three';
import {UICore, UIText, UIPanel} from 'uiblocks';

export class PoseDisplay extends xb.Script {
  static dependencies = {camera: THREE.Camera, world: xb.World};

  init({camera, world}) {
    this.camera = camera;
    this.world = world;
    this.uiCore = new UICore(this);
    this.detecting = false;

    this.initHudText();

    // Create visible red dots for nose and neck positions
    this.markerGeometry = new THREE.SphereGeometry(0.005, 16, 16);
    this.markerMaterial = new THREE.MeshBasicMaterial({color: 0xff0000});

    this.noseMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    this.neckMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);

    this.noseMarker.visible = false;
    this.neckMarker.visible = false;

    this.add(this.noseMarker);
    this.add(this.neckMarker);

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
    // Align HUD card in front of camera
    if (this.hudCard && this.camera) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      this.hudCard.position.copy(position).addScaledVector(forward, 0.8);
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
      if (this.noseMarker) this.noseMarker.visible = false;
      if (this.neckMarker) this.neckMarker.visible = false;
      return;
    }

    const firstPose = poses[0];
    this.statusText.setText(
      `Tracking 1 Active User (Score: ${Math.round(firstPose.score * 100)}%)`
    );

    // Update nose marker position
    const nosePos = firstPose.getJointPosition('nose');
    if (nosePos) {
      this.noseMarker.position.copy(nosePos);
      this.worldToLocal(this.noseMarker.position);
      this.noseMarker.visible = true;
    } else {
      this.noseMarker.visible = false;
    }

    // Update neck marker position
    const neckPos = firstPose.getJointPosition('neck');
    if (neckPos) {
      this.neckMarker.position.copy(neckPos);
      this.worldToLocal(this.neckMarker.position);
      this.neckMarker.visible = true;
    } else {
      this.neckMarker.visible = false;
    }

    const joints = [
      'nose',
      'neck',
      'leftWrist',
      'rightWrist',
      'leftAnkle',
      'rightAnkle',
    ];
    let displayStr = `[Diagnostics]: ${debugStr}\n\n`;

    joints.forEach((jointName) => {
      const pos = firstPose.getJointPosition(jointName);
      const displayName = jointName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase());

      if (pos) {
        displayStr += `${displayName}:  X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}\n`;
      } else {
        displayStr += `${displayName}:  (Searching...)\n`;
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
    super.dispose();
  }
}

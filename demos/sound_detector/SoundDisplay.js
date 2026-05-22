import * as xb from 'xrblocks';
import * as THREE from 'three';
import {UICore, UIText, UIPanel} from 'uiblocks';

export class SoundDisplay extends xb.Script {
  static dependencies = {camera: THREE.Camera, world: xb.World};

  init({camera, world}) {
    this.camera = camera;
    this.world = world;

    this.uiCore = new UICore(this);

    this.lastClassification = '';

    this.initHudText();

    if (this.world.sounds) {
      this.world.sounds.addEventListener('soundDetected', (event) => {
        const result = event.audioClassifierResult;

        const bestCategory = this.getBestCategory(result);
        const bestScore = bestCategory ? bestCategory.score : -1;

        if (bestCategory) {
          this.lastClassification = `${bestCategory.categoryName} (${Math.round(bestScore * 100)}%)`;
        } else {
          this.lastClassification = 'Unknown Sound';
        }

        const debugStr = this.getDebugString(result);
        const baseText = this.lastClassification || 'Listening...';
        this.hudText.setText(debugStr ? `${baseText}\n${debugStr}` : baseText);
      });

      console.log('SoundDisplay: attached. Pinch to listen.');
    } else {
      this.hudText.setText('Sound Classifier not initialized');
    }
  }

  onSelectEnd(event) {
    if (this.world.sounds) {
      if (this.world.sounds.isListening) {
        this.world.sounds.stopListening();
        this.setStatusText('Stopped listening');
      } else {
        this.setStatusText('Listening...');
        this.world.sounds.startListening();
      }
    }
  }

  initHudText() {
    this.hudCard = this.uiCore.createCard({
      name: 'HUDCard',
      sizeX: 0.5,
      sizeY: 0.2,
      position: new THREE.Vector3(0, 0, -0.5),
    });

    const hudPanel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(5, 5, 5, 0.6)',
      innerShadowColor: 'rgba(150, 150, 150, 0.05)',
      innerShadowBlur: 96,
      strokeWidth: 4,
      strokeColor: {
        gradientType: 'linear',
        rotation: 90,
        stops: [
          {position: 0, color: 'rgba(255, 255, 255, 0.5)'},
          {position: 0.5, color: 'rgba(255, 255, 255, 0.25)'},
          {position: 1, color: 'rgba(255, 255, 255, 0.35)'},
        ],
      },
      cornerRadius: 50,
      padding: 50,
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    });

    this.hudText = new UIText('Pinch to start', {
      fontSize: 50, // 50mm = 0.05m
      fontWeight: 'bold',
      color: '#4796e3',
      textAlign: 'center',
      width: '100%',
    });

    hudPanel.add(this.hudText);
    this.hudCard.add(hudPanel);
  }

  setStatusText(text) {
    if (this.hudText) {
      this.hudText.setText(text);
    }
  }

  getBestCategory(result) {
    const items = result ? result.items : [];

    if (items && items.length > 0) {
      const firstItem = items[0];
      if (firstItem.classifications && firstItem.classifications.length > 0) {
        const firstClassification = firstItem.classifications[0];
        if (
          firstClassification.categories &&
          firstClassification.categories.length > 0
        ) {
          return firstClassification.categories[0];
        }
      }
    }
    return null;
  }

  getDebugString(result) {
    const debug = result ? result.debug : null;
    if (debug) {
      const {rms, bufferSize, sampleRate} = debug;
      return `Buffer Size: ${bufferSize} | Sample Rate: ${sampleRate} | RMS: ${rms.toFixed(4)}`;
    }
    return '';
  }

  update() {
    // Manually update the position and rotation to keep the card in front of camera
    if (this.hudCard && this.camera) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);

      // Get forward direction
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);

      // Position card 1.0m in front of camera.
      this.hudCard.position.copy(position).addScaledVector(forward, 1.0);
      this.hudCard.quaternion.copy(quaternion);
    }
  }
}

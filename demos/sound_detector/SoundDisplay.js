import * as xb from 'xrblocks';
import * as THREE from 'three';

export class SoundDisplay extends xb.Script {
  static dependencies = {world: xb.World};

  init({world}) {
    this.world = world;

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
        this.hudText.text = debugStr ? `${baseText}\n${debugStr}` : baseText;
      });

      console.log('SoundDisplay: attached. Pinch to listen.');
    } else {
      this.hudText.text = 'Sound Classifier not initialized';
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
    this.hudCard = new xb.UICard({
      size: {width: 0.5, height: 0.2},
      pointerEvents: 'none',
    });
    this.hudCard.name = 'HUDCard';
    this.add(this.hudCard);
    this.hudCard.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0, 0, -1.0),
        smoothing: 1,
      }),
      new xb.FaceCamera({mode: 'spherical', smoothing: 1})
    );

    const hudPanel = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(5, 5, 5, 0.6)',
        innerShadowColor: 'rgba(150, 150, 150, 0.05)',
        innerShadowBlur: 96,
        borderWidth: 4,
        borderColor: {
          gradientType: 'linear',
          rotation: 90,
          stops: [
            {position: 0, color: 'rgba(255, 255, 255, 0.5)'},
            {position: 0.5, color: 'rgba(255, 255, 255, 0.25)'},
            {position: 1, color: 'rgba(255, 255, 255, 0.35)'},
          ],
        },
        borderRadius: 50,
        padding: 50,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      },
    });

    this.hudText = new xb.UIText({
      text: 'Pinch to start',
      pointerEvents: 'none',
      style: {
        fontSize: 50,
        fontWeight: 'bold',
        color: '#4796e3',
        textAlign: 'center',
        width: '100%',
      },
    });

    hudPanel.add(this.hudText);
    this.hudCard.add(hudPanel);
  }

  setStatusText(text) {
    if (this.hudText) {
      this.hudText.text = text;
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
}

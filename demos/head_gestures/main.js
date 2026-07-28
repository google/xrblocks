import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import {UICore, UIPanel, UIText} from 'uiblocks';
import * as xb from 'xrblocks';

class HeadGestureDemo extends xb.Script {
  constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  init() {
    const card = this.uiCore.createCard({
      name: 'HeadGestureCard',
      sizeX: 0.72,
      sizeY: 0.32,
      position: new THREE.Vector3(0, 1.45, -1.1),
    });

    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: '#111827',
      strokeWidth: 3,
      strokeColor: '#60a5fa',
      cornerRadius: 28,
      padding: 28,
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 18,
    });
    card.add(panel);

    panel.add(
      new UIText('HEAD GESTURE', {
        width: '100%',
        fontSize: 24,
        fontWeight: 'bold',
        color: '#93c5fd',
        textAlign: 'center',
      })
    );

    this.gestureText = new UIText('Waiting…', {
      width: '100%',
      fontSize: 52,
      fontWeight: 'bold',
      color: '#ffffff',
      textAlign: 'center',
    });
    panel.add(this.gestureText);

    this.confidenceText = new UIText('Nod or shake your head', {
      width: '100%',
      fontSize: 18,
      color: '#9ca3af',
      textAlign: 'center',
    });
    panel.add(this.confidenceText);

    const headGestures = xb.input.headGestures;
    if (!headGestures) {
      this.gestureText.setText('Unavailable');
      this.confidenceText.setText('Call options.enableHeadGestures()');
      return;
    }

    this.onGesture = (event) => {
      const {name, confidence} = event.detail;
      this.gestureText.setText(name.toUpperCase());
      this.confidenceText.setText(
        `Detected · ${Math.round(confidence * 100)}% confidence`
      );
      window.clearTimeout(this.clearGestureTimeout);
      this.clearGestureTimeout = window.setTimeout(() => {
        this.gestureText.setText('Waiting…');
        this.confidenceText.setText('Nod or shake your head');
      }, 1000);
    };
    headGestures.addEventListener('gesture', this.onGesture);
  }

  dispose() {
    window.clearTimeout(this.clearGestureTimeout);
    if (this.onGesture) {
      xb.input.headGestures?.removeEventListener('gesture', this.onGesture);
    }
  }
}

const options = new xb.Options();
options.enableUI();
options.enableHeadGestures();
options.uikit.enable(uikit);
options.setAppTitle('Head Gestures');
options.setAppDescription('Nod or shake your head to update the UI.');
options.xrButton.showEnterSimulatorButton = true;

xb.add(new HeadGestureDemo());
xb.init(options);

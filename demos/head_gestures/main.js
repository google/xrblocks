import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

class HeadGestureDemo extends xb.Script {
  init() {
    const card = new xb.UICard({
      size: {width: 0.72, height: 0.32},
    });
    card.name = 'HeadGestureCard';
    card.position.set(0, 1.45, -1.1);
    this.add(card);

    const panel = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: '#111827',
        borderWidth: 3,
        borderColor: '#60a5fa',
        borderRadius: 28,
        padding: 28,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
      },
    });
    card.add(panel);

    panel.add(
      new xb.UIText({
        text: 'HEAD GESTURE',
        style: {
          width: '100%',
          fontSize: 24,
          fontWeight: 'bold',
          color: '#93c5fd',
          textAlign: 'center',
        },
      })
    );

    this.gestureText = new xb.UIText({
      text: 'Waiting…',
      style: {
        width: '100%',
        fontSize: 52,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
      },
    });
    panel.add(this.gestureText);

    this.confidenceText = new xb.UIText({
      text: 'Nod or shake your head',
      style: {
        width: '100%',
        fontSize: 18,
        color: '#9ca3af',
        textAlign: 'center',
      },
    });
    panel.add(this.confidenceText);

    const headGestures = xb.input.headGestures;
    if (!headGestures) {
      this.gestureText.text = 'Unavailable';
      this.confidenceText.text = 'Call options.enableHeadGestures()';
      return;
    }

    this.onGesture = (event) => {
      const {name, confidence} = event.detail;
      this.gestureText.text = name.toUpperCase();
      this.confidenceText.text = `Detected · ${Math.round(confidence * 100)}% confidence`;
      window.clearTimeout(this.clearGestureTimeout);
      this.clearGestureTimeout = window.setTimeout(() => {
        this.gestureText.text = 'Waiting…';
        this.confidenceText.text = 'Nod or shake your head';
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
options.enableHeadGestures();
options.setAppTitle('Head Gestures');
options.setAppDescription('Nod or shake your head to update the UI.');
options.xrButton.showEnterSimulatorButton = true;

xb.add(new HeadGestureDemo());
xb.init(options);

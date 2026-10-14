import * as xb from 'xrblocks';

class HeadGestureDemo extends xb.Script {
  init() {
    this.gestureText = new xb.UIText({
      text: 'Waiting for a head gesture',
      style: {
        width: '100%',
        flexGrow: 1,
        fontSize: 32,
        textAlign: 'center',
        verticalAlign: 'middle',
      },
    });

    const card = new xb.UICard({
      size: {width: 0.6, height: 0.2},
      children: [createExitXRButton(), this.gestureText],
    });
    card.position.set(0, 1.5, -1);
    this.add(card);

    this.headGestures = xb.input.headGestures;
    this.onGesture = (event) => {
      this.gestureText.text = event.detail.name;
    };
    this.headGestures?.addEventListener('gesture', this.onGesture);
  }

  dispose() {
    this.headGestures?.removeEventListener('gesture', this.onGesture);
  }
}

const options = new xb.Options();
options.enableHeadGestures();

xb.add(new HeadGestureDemo());
xb.init(options);

function createExitXRButton() {
  return new xb.UIButton({
    label: 'X',
    ariaLabel: 'Exit XR',
    pointerEvents: 'auto',
    style: {
      position: 'absolute',
      top: -48,
      left: 0,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(30, 30, 36, 0.92)',
      borderColor: 'rgba(255, 255, 255, 0.25)',
      borderWidth: 1.5,
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 'bold',
      justifyContent: 'center',
      alignItems: 'center',
    },
    onClick: async () => {
      const session = xb.core?.renderer?.xr?.getSession?.();
      if (!session) return;
      try {
        await session.end();
      } catch {
        // Ignore errors when ending the XR session.
      }
    },
  });
}

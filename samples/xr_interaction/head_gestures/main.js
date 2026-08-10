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
      children: [this.gestureText],
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

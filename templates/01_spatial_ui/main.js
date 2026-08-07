import * as xb from 'xrblocks';

class SpatialUiScene extends xb.Script {
  init() {
    const status = new xb.UIText({
      text: 'Choose an action.',
      style: {fontSize: 18, opacity: 0.75, textAlign: 'center'},
    });
    const image = new xb.UIImage({
      src: 'https://picsum.photos/id/1018/900/600',
      ariaLabel: 'Mountain lake landscape',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: 16,
      },
    });
    const imageFrame = new xb.UIPanel({
      style: {
        position: 'relative',
        width: '100%',
        height: 130,
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: '#000000',
      },
      children: [image],
    });
    const brightness = new xb.UIText({
      text: '100%',
      style: {fontSize: 18, fontWeight: 'bold'},
    });
    const slider = new xb.UISlider({
      ariaLabel: 'Image brightness',
      min: 40,
      max: 100,
      step: 10,
      value: 100,
      style: {width: '100%', height: 40},
      onInput: (value) => {
        image.style.opacity = value / 100;
        brightness.text = `${value}%`;
        status.text = `Image brightness: ${value}%.`;
      },
    });

    const card = new xb.UICard({
      size: {width: 0.62, height: 0.6},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 16, padding: 20},
      children: [
        new xb.UIText({
          text: 'Spatial UI',
          style: {fontSize: 34, fontWeight: 'bold', textAlign: 'center'},
        }),
        new xb.UIText({
          text: 'Use familiar flex layouts.',
          style: {fontSize: 18, lineHeight: 1.35, textAlign: 'center'},
        }),
        imageFrame,
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [
            new xb.UIText({
              text: 'Image brightness',
              style: {fontSize: 18},
            }),
            brightness,
          ],
        }),
        slider,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 12},
          children: [
            new xb.UIButton({
              label: 'Hello',
              icon: 'waving_hand',
              style: {flexGrow: 1},
              onClick: () => (status.text = 'Hello from your spatial UI.'),
            }),
            new xb.UIButton({
              label: 'Reset',
              icon: 'restart_alt',
              style: {flexGrow: 1},
              onClick: () => {
                slider.value = 100;
                image.style.opacity = 1;
                brightness.text = '100%';
                status.text = 'Choose an action.';
              },
            }),
          ],
        }),
        status,
      ],
    });
    card.position.set(0, 1.45, -1.1);
    this.add(card);
  }
}

xb.add(new SpatialUiScene());
xb.init(new xb.Options());

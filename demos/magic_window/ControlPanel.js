import * as xb from 'xrblocks';

export class ControlPanel extends xb.Script {
  constructor(magicWindow) {
    super();
    this.magicWindow = magicWindow;
    this.backdropValueText = null;
  }

  init() {
    const card = new xb.UICard({
      size: {width: 0.5, height: 0.24},
      manipulation: {actions: {translate: {faceCamera: true}}},
    });
    card.name = 'MagicWindowControlCard';
    card.position.set(0, 1.05, -1.0);
    this.add(card);

    const panel = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(15, 18, 25, 0.9)',
        borderWidth: 3,
        borderColor: {
          gradientType: 'linear',
          rotation: 45,
          stops: [
            {position: 0, color: '#4796e3'},
            {position: 1, color: '#9b5de5'},
          ],
        },
        borderRadius: 20,
        padding: 16,
        flexDirection: 'column',
        gap: 10,
        alignItems: 'stretch',
      },
    });
    panel.add(
      new xb.UIText({
        text: 'MAGIC WINDOW',
        style: {
          fontSize: 20,
          fontWeight: 'bold',
          color: '#00f0ff',
          textAlign: 'center',
          width: '100%',
        },
      })
    );

    const row = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
      },
    });
    row.add(this.makeBackdropButton());
    panel.add(row);
    card.add(panel);
  }

  makeBackdropButton() {
    const labelColumn = new xb.UIPanel({
      style: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 2,
      },
    });
    labelColumn.add(
      new xb.UIText({
        text: 'backdrop',
        style: {fontSize: 10, color: '#888888'},
      })
    );
    this.backdropValueText = new xb.UIText({
      text: this.magicWindow.backdropName,
      style: {fontSize: 14, color: '#ffffff', fontWeight: 'bold'},
    });
    labelColumn.add(this.backdropValueText);

    const button = new xb.UIButton({
      ariaLabel: 'Change backdrop',
      onClick: () => {
        this.magicWindow.cycleBackdrop();
        this.backdropValueText.text = this.magicWindow.backdropName;
        button.style.backgroundColor = '#4796e3';
        setTimeout(() => {
          button.style.backgroundColor = '#2a2a2a';
        }, 180);
      },
      style: {
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 16,
        borderRadius: 12,
        backgroundColor: '#2a2a2a',
        borderWidth: 1,
        borderColor: '#444444',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        ':hover': {backgroundColor: '#3a3a3a'},
        ':active': {backgroundColor: '#4796e3'},
      },
      children: [
        new xb.UIIcon({
          icon: 'image',
          ariaLabel: 'Backdrop image',
          style: {color: '#ffffff', width: 22, height: 22},
        }),
        labelColumn,
      ],
    });
    return button;
  }
}

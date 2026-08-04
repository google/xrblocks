import * as xb from 'xrblocks';

/** Renders a movable spatial UI card with two actions. */
export class UIManager extends xb.Script {
  constructor() {
    super();

    const question = new xb.UIText({
      text: 'Welcome to UI Playground! Is it your first time here?',
      style: {
        flexGrow: 1,
        fontSize: 28,
        color: '#ffffff',
        textAlign: 'center',
      },
    });

    const actions = new xb.UIPanel({
      style: {flexDirection: 'row', gap: 16},
      children: [
        new xb.UIButton({
          icon: 'check_circle',
          ariaLabel: 'Yes',
          onClick: () => this._onYes(),
          style: {flexGrow: 1, padding: 16, backgroundColor: '#0f9d58'},
        }),
        new xb.UIButton({
          icon: 'cancel',
          ariaLabel: 'No',
          onClick: () => this._onNo(),
          style: {flexGrow: 1, padding: 16, backgroundColor: '#d93025'},
        }),
      ],
    });

    const card = new xb.UICard({
      size: {width: 0.6, height: 0.35},
      manipulation: true,
      edge: {scale: true},
      style: {
        flexDirection: 'column',
        gap: 20,
        padding: 24,
        backgroundColor: '#2b2b2b',
        borderRadius: 24,
      },
      children: [question, actions],
    });
    card.position.set(0, 1.4, -1);
    this.add(card);
  }

  _onYes() {
    console.log('yes');
  }

  _onNo() {
    console.log('no');
  }
}

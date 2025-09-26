import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * Rending a draggable spatial UI panel with SDF font libraries, and icons
 * buttons using XR Blocks.
 */
export class UIManager extends xb.Script {
  constructor() {
    super();

    // Adds an interactive SpatialPanel as a container for UI elements.
    const panel = new xb.SpatialPanel({backgroundColor: '#2b2b2baa'});
    this.add(panel);

    const grid = panel.addGrid();
    // `weight` defines the perentage of a view's dimension to its parent.
    // Here, question occupies 70% of the height of the panel.
    const question = grid.addRow({weight: 0.7}).addText({
      text: 'Welcome to UI Playground! Is it your first time here?',
      fontColor: '#ffffff',
      fontSize: 0.08
    });
    this.question = question;

    // ctrlRow occupies 30% of the height of the panel.
    const ctrlRow = grid.addRow({weight: 0.3});

    // The `text` field defines the icon of the button from Material Icons in
    // https://fonts.google.com/icons
    const yesButton = ctrlRow.addCol({weight: 0.5})
                          .addIconButton({text: 'check_circle', fontSize: 0.5});

    // onTriggered defines unified behavior for `onSelected`, `onClicked`,
    // `onPinched`, `onTouched` for buttons.
    yesButton.onTriggered = (id) => {
      this._onYes();
    };

    const noButton = ctrlRow.addCol({weight: 0.5})
                         .addIconButton({text: 'cancel', fontSize: 0.5});

    noButton.onTriggered = (id) => {
      this._onNo();
    };
  }

  _onYes() {
    console.log('yes');
  }

  _onNo() {
    console.log('no');
  }
};

import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ManipulationBehavior, UICore, UIIcon, UIPanel, UIText} from 'uiblocks';

// Draggable spatial control panel for the magic window. Mirrors the uiblocks
// pattern used by the other demos: a card with a ManipulationBehavior so it can
// be grabbed and placed, plus deterministic renderOrder / depthTest on the
// nested labels and icon so the text isn't occluded by its own backplate.
export class ControlPanel extends xb.Script {
  constructor(magicWindow) {
    super();
    this.magicWindow = magicWindow;
    this.backdropValueText = null;
  }

  init() {
    this.uiCore = new UICore(this);
    const card = this.uiCore.createCard({
      name: 'MagicWindowControlCard',
      position: new THREE.Vector3(0, 1.05, -1.0),
      sizeX: 0.5,
      sizeY: 0.24,
    });
    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(15, 18, 25, 0.9)',
      strokeWidth: 3,
      strokeColor: {
        gradientType: 'linear',
        rotation: 45,
        stops: [
          {position: 0, color: '#4796e3'},
          {position: 1, color: '#9b5de5'},
        ],
      },
      cornerRadius: 20,
      padding: 16,
      flexDirection: 'column',
      gap: 10,
      alignItems: 'stretch',
      justifyContent: 'flex-start',
    });
    panel.add(
      new UIText('MAGIC WINDOW', {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#00f0ff',
        textAlign: 'center',
        width: '100%',
      })
    );

    const row = new UIPanel({
      width: '100%',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'center',
      alignItems: 'center',
    });
    row.add(this.makeBackdropButton());
    panel.add(row);

    card.add(panel);
    card.addBehavior(
      new ManipulationBehavior({draggable: true, faceCamera: true})
    );
  }

  // A tap-to-cycle button showing the active backdrop. Tapping advances the
  // window's backdrop and updates the label in place.
  makeBackdropButton() {
    const idle = '#2a2a2a';
    const hover = '#3a3a3a';
    const btn = new UIPanel({
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 16,
      paddingRight: 16,
      cornerRadius: 12,
      fillColor: idle,
      strokeWidth: 1,
      strokeColor: '#444444',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      renderOrder: 10,
      onHoverEnter: () => btn.setFillColor(hover),
      onHoverExit: () => btn.setFillColor(idle),
      onClick: () => {
        this.magicWindow.cycleBackdrop();
        this.backdropValueText.setText(this.magicWindow.backdropName);
        btn.setFillColor('#4796e3');
        setTimeout(() => btn.setFillColor(idle), 180);
      },
    });
    btn.add(
      new UIIcon('image', {
        color: 'white',
        width: 22,
        height: 22,
        renderOrder: 12,
      })
    );
    const labelCol = new UIPanel({
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 2,
    });
    labelCol.add(
      new UIText('backdrop', {
        fontSize: 10,
        color: '#888888',
        depthTest: false,
        renderOrder: 100,
      })
    );
    this.backdropValueText = new UIText(this.magicWindow.backdropName, {
      fontSize: 14,
      color: '#ffffff',
      fontWeight: 'bold',
      depthTest: false,
      renderOrder: 100,
    });
    labelCol.add(this.backdropValueText);
    btn.add(labelCol);
    return btn;
  }
}

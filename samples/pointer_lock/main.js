import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import {UICore, UIPanel, UIText, raycastSortFunction} from 'uiblocks';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  async init() {
    if (xb.core.input.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }

    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    this.createUI();

    document.addEventListener('pointerlockchange', this.updateStatus);
  }

  updateStatus = () => {
    const isLocked =
      document.pointerLockElement === xb.core.renderer.domElement;
    this.statusText.setText(
      `Pointer Status: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`
    );
    this.btnText.setText(isLocked ? 'Unlock Pointer' : 'Lock Pointer');
    this.buttonPanel.setFillColor(isLocked ? '#ca6673' : '#4796e3');
  };

  createUI() {
    const card = this.uiCore.createCard({
      name: 'StatusCard',
      sizeX: 1.2,
      sizeY: 0.8,
      position: new THREE.Vector3(0, 1.5, -1.5),
    });

    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(20, 20, 20, 0.8)',
      cornerRadius: 30,
      padding: 50,
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 50,
    });
    card.add(panel);

    this.statusText = new UIText('Pointer Status: UNLOCKED', {
      fontSize: 48,
      color: 'white',
    });
    panel.add(this.statusText);

    this.buttonPanel = new UIPanel({
      width: 360,
      height: 120,
      cornerRadius: 20,
      fillColor: '#4796e3',
      justifyContent: 'center',
      alignItems: 'center',
      onClick: () => {
        const canvas = xb.core.renderer.domElement;
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock();
        } else {
          document.exitPointerLock();
        }
      },
    });
    panel.add(this.buttonPanel);

    this.btnText = new UIText('Lock Pointer', {
      fontSize: 40,
      color: 'white',
    });
    this.buttonPanel.add(this.btnText);
  }

  dispose() {
    super.dispose();
    document.removeEventListener('pointerlockchange', this.updateStatus);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.enableUI();
  options.uikit.enable(uikit);
  options.setAppTitle('Pointer Lock Sample');

  // Configure simulator to start in Pointer Lock mode
  options.simulator.defaultMode = xb.SimulatorMode.POINTER_LOCK;

  xb.add(new MainScript());
  xb.init(options);
});

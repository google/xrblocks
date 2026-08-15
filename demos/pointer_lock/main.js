import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  async init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    this.createUI();

    document.addEventListener('pointerlockchange', this.updateStatus);
  }

  updateStatus = () => {
    const isLocked =
      document.pointerLockElement === xb.core.renderer.domElement;
    this.statusText.text = `Pointer Status: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`;
    this.button.label = isLocked ? 'Unlock Pointer' : 'Lock Pointer';
    this.button.style.backgroundColor = isLocked ? '#ca6673' : '#4796e3';
  };

  createUI() {
    const card = new xb.UICard({size: {width: 1.2, height: 0.8}});
    card.name = 'StatusCard';
    card.position.set(0, 1.5, -1.5);
    this.add(card);

    const panel = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
        padding: 50,
        borderRadius: 30,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 50,
      },
    });
    card.add(panel);

    this.statusText = new xb.UIText({
      text: 'Pointer Status: UNLOCKED',
      style: {fontSize: 48, color: 'white'},
    });
    panel.add(this.statusText);

    this.button = new xb.UIButton({
      label: 'Lock Pointer',
      onClick: () => {
        const canvas = xb.core.renderer.domElement;
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock();
        } else {
          document.exitPointerLock();
        }
      },
      style: {
        width: 360,
        height: 120,
        borderRadius: 20,
        backgroundColor: '#4796e3',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'white',
        fontSize: 40,
      },
    });
    panel.add(this.button);
  }

  dispose() {
    super.dispose();
    document.removeEventListener('pointerlockchange', this.updateStatus);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.setAppTitle('Pointer Lock Demo');

  // Configure simulator to start in Pointer Lock mode
  options.simulator.defaultMode = xb.SimulatorMode.POINTER_LOCK;

  xb.add(new MainScript());
  xb.init(options);
});

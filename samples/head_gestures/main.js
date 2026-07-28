import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

const options = new xb.Options();
options.enableHeadGestures();

class HeadGestureDemo extends xb.Script {
  init() {
    this.createHud();

    const headGestures = xb.input.headGestures;
    if (!headGestures) {
      this.status.textContent = 'Head gestures are unavailable';
      return;
    }

    this.onGesture = (event) => {
      const {name, confidence} = event.detail;
      this.status.textContent = `${name} (${confidence.toFixed(2)})`;
      this.status.dataset.active = 'true';
      window.clearTimeout(this.clearStatusTimeout);
      this.clearStatusTimeout = window.setTimeout(() => {
        this.status.textContent = 'Waiting…';
        this.status.dataset.active = 'false';
      }, 1000);
    };
    headGestures.addEventListener('gesture', this.onGesture);

    this.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
    const marker = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 2),
      new THREE.MeshStandardMaterial({color: 0x8ab4f8})
    );
    marker.position.set(0, 1.5, -2);
    this.add(marker);
  }

  createHud() {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      min-width: 230px;
      padding: 16px;
      border-radius: 14px;
      background: rgba(12, 16, 28, 0.86);
      color: white;
      font: 14px/1.45 system-ui, sans-serif;
      z-index: 9999;
    `;
    container.innerHTML = `
      <strong>Head gestures</strong>
      <p>Move the headset—or the simulator mouse—in one complete nod or shake.</p>
      <div data-status data-active="false">Waiting…</div>
    `;
    document.body.appendChild(container);
    this.hud = container;
    this.status = container.querySelector('[data-status]');
  }

  dispose() {
    if (this.onGesture) {
      xb.input.headGestures?.removeEventListener('gesture', this.onGesture);
    }
    window.clearTimeout(this.clearStatusTimeout);
    this.hud?.remove();
  }
}

xb.add(new HeadGestureDemo());
xb.init(options);

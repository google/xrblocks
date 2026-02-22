/**
 * Mudra Link sample for XR Blocks.
 *
 * Demonstrates neural input from the Mudra Band / Mudra Link device:
 * - Tap gesture → select (changes sphere color)
 * - Twist gesture → squeeze (resets sphere)
 * - Pressure → controls sphere scale
 *
 * Run the Mudra Companion app to connect a physical device, or use the
 * on-screen simulation buttons to test without hardware.
 *
 * @see https://mudra-studio.com
 */
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';
import * as THREE from 'three';
import {MudraLink} from 'xrblocks/addons/mudra/MudraLink.js';

// --- Options ---

const options = new xb.Options();
options.enableReticles();
options.enableMudraLink();

// Subscribe to gesture + pressure signals.
options.mudraLink.signals = ['gesture', 'pressure'];
options.mudraLink.debug = true;

// --- HUD ---

function createHud() {
  const style = document.createElement('style');
  style.textContent = `
    #mudra-hud {
      position: fixed;
      top: 12px;
      right: 12px;
      min-width: 240px;
      padding: 14px;
      border-radius: 12px;
      background: rgba(10, 12, 20, 0.85);
      color: #f4f4f4;
      font-family: 'Poppins', 'Inter', system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
      z-index: 9999;
    }
    #mudra-hud h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
      color: #77EAE9;
    }
    #mudra-hud .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.04);
      margin-bottom: 4px;
    }
    #mudra-hud .label {
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 11px;
      opacity: 0.7;
    }
    #mudra-hud .value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    #mudra-hud .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }
    #mudra-sim {
      position: fixed;
      bottom: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      z-index: 9999;
    }
    #mudra-sim button {
      padding: 8px 14px;
      border: 1px solid rgba(119, 234, 233, 0.3);
      border-radius: 8px;
      background: rgba(10, 12, 20, 0.85);
      color: #77EAE9;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    #mudra-sim button:hover {
      background: rgba(119, 234, 233, 0.15);
    }
    .mudra-badge {
      position: fixed;
      bottom: 12px;
      left: 12px;
      font-size: 11px;
      color: #94a3b8;
      opacity: 0.7;
      font-family: inherit;
      letter-spacing: 0.02em;
    }
  `;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'mudra-hud';
  hud.innerHTML = `
    <h2>Mudra Link</h2>
    <div class="row">
      <span class="label">Status</span>
      <span class="value" id="hud-status">
        <span class="status-dot" style="background:#eab308"></span>Connecting
      </span>
    </div>
    <div class="row">
      <span class="label">Gesture</span>
      <span class="value" id="hud-gesture">-</span>
    </div>
    <div class="row">
      <span class="label">Pressure</span>
      <span class="value" id="hud-pressure">0%</span>
    </div>
  `;
  document.body.appendChild(hud);

  // Simulation buttons for testing without device.
  const sim = document.createElement('div');
  sim.id = 'mudra-sim';
  sim.innerHTML = `
    <button data-gesture="tap">Tap</button>
    <button data-gesture="double_tap">Double Tap</button>
    <button data-gesture="twist">Twist</button>
  `;
  document.body.appendChild(sim);

  // Badge
  const badge = document.createElement('div');
  badge.className = 'mudra-badge';
  badge.textContent = 'Created with Mudra Studio';
  document.body.appendChild(badge);

  return {hud, sim};
}

// --- Main Script ---

const BASE_COLOR = 0x77eae9;
const BASE_SCALE = 0.2;

class MudraDemo extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    // Target sphere.
    const geometry = new THREE.SphereGeometry(BASE_SCALE, 32, 32);
    const material = new THREE.MeshPhongMaterial({
      color: BASE_COLOR,
      transparent: true,
      opacity: 0.9,
    });
    this.sphere = new THREE.Mesh(geometry, material);
    this.sphere.position.set(0, xb.user.height - 0.3, -xb.user.objectDistance);
    this.add(this.sphere);

    // Find the MudraLink script in the scene.
    this.mudra = null;
    xb.core.scene.traverse((obj) => {
      if (obj instanceof MudraLink) {
        this.mudra = obj;
      }
    });

    if (!this.mudra) {
      console.warn('[MudraDemo] MudraLink not found in scene.');
      return;
    }

    const {hud, sim} = createHud();
    this.hud = hud;

    // Gesture handler: tap changes color, twist resets.
    this.mudra.addEventListener('mudragesture', (e) => {
      const type = e.detail.type;
      document.getElementById('hud-gesture').textContent = type;
      clearTimeout(this._gestureTimeout);
      this._gestureTimeout = setTimeout(() => {
        document.getElementById('hud-gesture').textContent = '-';
      }, 800);

      if (type === 'tap' || type === 'double_tap') {
        this.sphere.material.color.set(Math.random() * 0xffffff);
        this.pulseScale(1.15);
      } else if (type === 'twist' || type === 'double_twist') {
        this.sphere.material.color.set(BASE_COLOR);
        this.sphere.scale.setScalar(1);
      }
    });

    // Pressure handler: scale the sphere.
    this.mudra.addEventListener('mudrapressure', (e) => {
      const norm = e.detail.normalized;
      document.getElementById('hud-pressure').textContent =
        `${Math.round(norm * 100)}%`;
      const s = 1 + norm * 1.5;
      this.sphere.scale.setScalar(s);
    });

    // Connection status.
    this.mudra.addEventListener('mudraconnection', (e) => {
      this.updateStatus(e.detail.status === 'connected');
    });

    // Simulation button clicks.
    sim.addEventListener('click', (e) => {
      const gesture = e.target.dataset?.gesture;
      if (gesture && this.mudra) {
        this.mudra.triggerGesture(gesture);
      }
    });
  }

  updateStatus(ready) {
    const el = document.getElementById('hud-status');
    if (!el) return;
    if (ready) {
      el.innerHTML =
        '<span class="status-dot" style="background:#22c55e"></span>Device Ready';
    } else {
      el.innerHTML =
        '<span class="status-dot" style="background:#eab308"></span>Connecting';
    }
  }

  pulseScale(target) {
    const sphere = this.sphere;
    const original = sphere.scale.x;
    sphere.scale.setScalar(target);
    const start = performance.now();
    const duration = 150;
    const animate = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      sphere.scale.setScalar(target + (original - target) * eased);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /**
   * Tap/click also changes color via standard XR Blocks select event.
   */
  onSelectEnd() {
    this.sphere.material.color.set(Math.random() * 0xffffff);
    this.pulseScale(1.1);
  }

  dispose() {
    if (this.hud?.parentElement) {
      this.hud.parentElement.removeChild(this.hud);
    }
  }
}

// --- Bootstrap ---

async function start() {
  options.setAppTitle('Mudra Link Demo');
  options.setAppDescription(
    'Neural input from Mudra Band / Mudra Link via Mudra Companion.'
  );

  const mudra = new MudraLink();
  xb.add(mudra);
  xb.add(new MudraDemo());

  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', () => {
  start();
});

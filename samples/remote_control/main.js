import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {RemoteControl} from 'xrblocks/addons/remote-control/index.js';

const RELAY_URL =
  new URLSearchParams(location.search).get('remoteControlUrl') ||
  'ws://127.0.0.1:8791';
const SESSION_ID =
  new URLSearchParams(location.search).get('remoteControlSession') || 'default';

const options = RemoteControl.configureOptions(new xb.Options());
options.setAppTitle('Remote Control Smoke Test');

class RemoteControlSmokeScene extends xb.Script {
  cube;
  label;
  nudgeCount = 0;

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x505050, 3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(1.5, 2.5, 1.5);
    this.add(keyLight);

    const material = new THREE.MeshStandardMaterial({
      color: 0x58d68d,
      roughness: 0.45,
      metalness: 0.05,
    });
    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      material
    );
    this.cube.name = 'Remote Control Smoke Cube';
    this.resetCube();
    this.add(this.cube);

    this.label = document.createElement('aside');
    this.label.id = 'remote-control-smoke-status';
    this.label.textContent = `Remote control relay: ${RELAY_URL}\nSession: ${SESSION_ID}`;
    Object.assign(this.label.style, {
      position: 'fixed',
      left: '16px',
      top: '16px',
      maxWidth: '420px',
      padding: '12px 14px',
      borderRadius: '8px',
      background: 'rgba(8, 10, 14, 0.84)',
      color: '#fff',
      font: "13px/1.45 'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif",
      zIndex: '20',
      whiteSpace: 'pre-wrap',
    });
    document.body.appendChild(this.label);
  }

  dispose() {
    this.label?.remove();
  }

  getCubeState() {
    return {
      name: this.cube?.name,
      position: this.cube ? this.cube.position.toArray() : null,
      rotation: this.cube
        ? [this.cube.rotation.x, this.cube.rotation.y, this.cube.rotation.z]
        : null,
      nudgeCount: this.nudgeCount,
    };
  }

  resetCube() {
    if (!this.cube) return this.getCubeState();
    this.cube.position.set(0, 1.35, -1.6);
    this.cube.rotation.set(0, 0, 0);
    this.nudgeCount = 0;
    this.updateStatus('resetCube');
    return this.getCubeState();
  }

  nudgeCube(args = {}) {
    if (!this.cube) return this.getCubeState();
    const dx = Number(args.dx ?? 0.12);
    const dy = Number(args.dy ?? 0);
    const dz = Number(args.dz ?? 0);
    this.cube.position.x += dx;
    this.cube.position.y += dy;
    this.cube.position.z += dz;
    this.cube.rotation.y += 0.25;
    this.nudgeCount += 1;
    this.updateStatus('nudgeCube');
    xb.core.stepFrame(0);
    return this.getCubeState();
  }

  updateStatus(action) {
    if (!this.label || !this.cube) return;
    const [x, y, z] = this.cube.position.toArray();
    this.label.textContent =
      `Remote control relay: ${RELAY_URL}\n` +
      `Session: ${SESSION_ID}\n` +
      `Last tool: ${action}\n` +
      `Cube position: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}\n` +
      `Nudges: ${this.nudgeCount}`;
  }
}

const smokeScene = new RemoteControlSmokeScene();
xb.add(smokeScene);

xb.add(
  new RemoteControl({
    url: RELAY_URL,
    sessionId: SESSION_ID,
    reconnect: true,
    embodiedOptions: {autoPause: true, realTime: true},
    tools: {
      getCubeState: async () => smokeScene.getCubeState(),
      resetCube: async () => smokeScene.resetCube(),
      nudgeCube: async (args) => smokeScene.nudgeCube(args),
    },
  })
);

await xb.init(options);

import * as THREE from 'three';
import * as xb from 'xrblocks';
import {EmbodiedControl} from 'xrblocks/addons/embodied-control/index.js';

const options = new xb.Options();
options.formFactor = 'desktop';
options.xrButton.enabled = false;
options.enableHands();
options.simulator.defaultMode = xb.SimulatorMode.POSE;
options.simulator.defaultHand = xb.Handedness.RIGHT;
options.setAppTitle('Embodied Control');

const embodied = new EmbodiedControl({
  autoPause: false,
  realTime: true,
});

const POSES = xb.SIMULATOR_HAND_POSE_ROTATIONS;

const ACTION_GROUPS = [
  {
    title: 'Locomotion',
    actions: [
      step('Forward', {locomotion: {move: [0, 0, -0.25]}}),
      step('Back', {locomotion: {move: [0, 0, 0.25]}}),
      step('Left', {locomotion: {move: [-0.25, 0, 0]}}),
      step('Right', {locomotion: {move: [0.25, 0, 0]}}),
      step('Rise', {locomotion: {move: [0, 0.2, 0]}}),
      step('Lower', {locomotion: {move: [0, -0.2, 0]}}),
      step('Turn Left', {locomotion: {rotate: [0, 20, 0]}}),
      step('Turn Right', {locomotion: {rotate: [0, -20, 0]}}),
      step('Look Up', {locomotion: {rotate: [12, 0, 0]}}),
      step('Look Down', {locomotion: {rotate: [-12, 0, 0]}}),
      {
        label: 'Teleport to Cube',
        isHighLevel: true,
        run: () => {
          const cube = xb.scene.getObjectByName(
            'Embodied Control Draggable Cube'
          );
          return embodied.teleportTo(cube, {distance: 1.2});
        },
      },
      {
        label: 'Look at Cube',
        isHighLevel: true,
        run: () => {
          const cube = xb.scene.getObjectByName(
            'Embodied Control Draggable Cube'
          );
          return embodied.lookAtTarget(cube, {velocity: 1.5});
        },
      },
    ],
  },
  {
    title: 'Left Hand',
    actions: handActions('leftHand'),
  },
  {
    title: 'Right Hand',
    actions: handActions('rightHand'),
  },
];

function step(label, control, durationMs = 250) {
  return {label, durationMs, control};
}

function handActions(hand) {
  const handIndex = hand === 'leftHand' ? 0 : 1;
  return [
    step('Reach Out', {[hand]: {move: [0, 0, -0.12]}}),
    step('Pull Back', {[hand]: {move: [0, 0, 0.12]}}),
    step('Move Up', {[hand]: {move: [0, 0.1, 0]}}),
    step('Move Down', {[hand]: {move: [0, -0.1, 0]}}),
    step('Move In', {[hand]: {move: [hand === 'leftHand' ? 0.1 : -0.1, 0, 0]}}),
    step('Move Out', {
      [hand]: {move: [hand === 'leftHand' ? -0.1 : 0.1, 0, 0]},
    }),
    step('Yaw In', {[hand]: {rotate: [0, hand === 'leftHand' ? -15 : 15, 0]}}),
    step('Yaw Out', {[hand]: {rotate: [0, hand === 'leftHand' ? 15 : -15, 0]}}),
    step('Relaxed', {[hand]: {rotations: POSES[xb.SimulatorHandPose.RELAXED]}}),
    step('Fist', {[hand]: {rotations: POSES[xb.SimulatorHandPose.FIST]}}),
    step('Pinch Start', {[hand]: {selectStart: true}}),
    step('Pinch End', {[hand]: {selectEnd: true}}),
    step('Point', {[hand]: {rotations: POSES[xb.SimulatorHandPose.POINTING]}}),
    step('Victory', {[hand]: {rotations: POSES[xb.SimulatorHandPose.VICTORY]}}),
    {
      label: 'Point to Cube',
      isHighLevel: true,
      run: () => {
        const cube = xb.scene.getObjectByName(
          'Embodied Control Draggable Cube'
        );
        return embodied.pointTo(handIndex, cube, {velocity: 1.5});
      },
    },
    {
      label: 'Reach to Cube',
      isHighLevel: true,
      run: () => {
        const cube = xb.scene.getObjectByName(
          'Embodied Control Draggable Cube'
        );
        return embodied.reachTo(handIndex, cube, {velocity: 0.5});
      },
    },
    {
      label: 'Click',
      isHighLevel: true,
      run: () => {
        return embodied.click(handIndex);
      },
    },
  ];
}

function createSidebar() {
  const style = document.createElement('style');
  style.textContent = `
    #embodied-sidebar {
      position: fixed;
      top: 12px;
      right: 12px;
      width: min(360px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow: auto;
      padding: 12px;
      border-radius: 10px;
      background: rgba(12, 14, 18, 0.88);
      color: #f7f7f7;
      font-family: 'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      z-index: 9999;
    }
    #embodied-sidebar h1 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0;
    }
    #embodied-sidebar label {
      display: grid;
      grid-template-columns: 1fr 86px;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: rgba(255, 255, 255, 0.82);
    }
    #embodied-sidebar input {
      width: 100%;
      min-height: 30px;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font: inherit;
      padding: 4px 6px;
    }
    #embodied-sidebar section {
      margin-top: 12px;
    }
    #embodied-sidebar h2 {
      margin: 0 0 6px;
      color: rgba(255, 255, 255, 0.68);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    #embodied-sidebar .buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    #embodied-sidebar button {
      min-height: 34px;
      padding: 7px 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font: inherit;
      text-transform: none;
    }
    #embodied-sidebar button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
    }
    #embodied-sidebar button:disabled {
      cursor: default;
      opacity: 0.45;
    }
  `;
  document.head.appendChild(style);

  const sidebar = document.createElement('aside');
  sidebar.id = 'embodied-sidebar';
  sidebar.innerHTML = `
    <h1>Embodied Control</h1>
    <label>
      Step duration
      <input data-duration type="number" min="16" max="3000" step="16" value="500" />
    </label>
  `;

  for (const group of ACTION_GROUPS) {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    const buttons = document.createElement('div');
    heading.textContent = group.title;
    buttons.className = 'buttons';

    for (const action of group.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        void runAction(action);
      });
      buttons.appendChild(button);
    }

    section.append(heading, buttons);
    sidebar.appendChild(section);
  }

  document.body.appendChild(sidebar);
  return sidebar;
}

class SampleScene extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x606060, 3.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(0.8, 2.4, 1.4);
    this.add(keyLight);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.36, 0.36),
      new THREE.MeshStandardMaterial({
        color: 0xffc857,
        roughness: 0.55,
        metalness: 0.08,
      })
    );
    cube.name = 'Embodied Control Draggable Cube';
    cube.position.set(0, 1.45, -1.05);
    cube.rotation.set(0.15, 0.45, 0);
    cube.draggable = true;
    cube.draggingMode = xb.DragMode.TRANSLATING;
    this.add(cube);

    const target = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.014, 12, 64),
      new THREE.MeshStandardMaterial({
        color: 0x69d2e7,
        emissive: 0x335577,
      })
    );
    target.position.set(0, 1.45, -1.08);
    this.add(target);
  }
}

let sidebar;
let durationInput;

function setBusy(busy) {
  sidebar.querySelectorAll('button').forEach((button) => {
    button.disabled = busy;
  });
}

async function runAction(action) {
  setBusy(true);
  try {
    if (action.isHighLevel) {
      await action.run();
    } else {
      const durationMs = Number(durationInput.value) || action.durationMs;
      await embodied.step({
        durationMs,
        control: action.control,
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    setBusy(false);
  }
}

function waitForSimulator() {
  return new Promise((resolve) => {
    const check = () => {
      if (xb.core.simulatorRunning) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

async function start() {
  sidebar = createSidebar();
  durationInput = sidebar.querySelector('[data-duration]');

  xb.add(new SampleScene());
  xb.add(new xb.DragManager());
  xb.add(embodied);
  await xb.init(options);
  await waitForSimulator();
  xb.core.simulator.controls.enabled = false;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  xb.core.pause();
  await embodied.step({
    durationMs: Number(durationInput.value),
    control: {
      leftHand: {visible: true},
      rightHand: {visible: true},
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void start();
});

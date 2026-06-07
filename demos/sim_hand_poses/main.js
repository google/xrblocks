// Provides optional 2D UIs for simulator on desktop.
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';
import * as THREE from 'three';

const AXES = [
  {axis: 'x', label: 'X', description: 'Flexion/extension'},
  {axis: 'y', label: 'Y', description: 'Abduction/adduction'},
  {axis: 'z', label: 'Z', description: 'Twist'},
];
const DEG_TO_RAD = Math.PI / 180;
const MIN_DEGREES = -180;
const MAX_DEGREES = 180;
const ROTATION_JOINT_NAMES = xb.HAND_JOINT_NAMES.filter(
  (jointName) => !jointName.endsWith('-tip')
);

const LOCAL_AUTHORING_PROMPT = `
Return only JSON for a hand pose.
Rotations are applied onto a flat neutral hand pose.
Rotations are applied through forward kinematics.
Format: {"joint-name":[x,y,z]} where x/y/z are euler angle radians.
For long fingers:
x: flexion/extension. Positive flexes toward palm, negative extends away.
y: abduction/adduction. Positive spreads away from the middle-finger axis, negative adducts toward it.
z: axial roll. Positive rolls toward thumb, negative rolls away from thumb.
For the middle finger, y is radial/ulnar deviation: positive moves toward index/thumb, negative toward ring/pinky.
For the thumb:
x: positive flexes across palm, negative extends/repositions.
y: positive abducts away from palm, negative adducts back toward palm.
z: positive rolls into opposition/internal rotation, negative repositions/external rotation away.
Include every non-tip WebXR joint listed below. Use [0,0,0] for neutral joints:
${ROTATION_JOINT_NAMES.join(', ')}
`;

const LOCAL_ROTATION_SCHEMA = {
  type: 'OBJECT',
  required: ROTATION_JOINT_NAMES,
  properties: Object.fromEntries(
    ROTATION_JOINT_NAMES.map((jointName) => [
      jointName,
      {
        type: 'ARRAY',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'NUMBER',
        },
      },
    ])
  ),
};

function clampDegrees(value) {
  return Math.min(MAX_DEGREES, Math.max(MIN_DEGREES, value));
}

function toFixedNumber(value) {
  return Number(value.toFixed(6));
}

function createZeroRotationJson() {
  const cleanRotations = {};
  for (const jointName of ROTATION_JOINT_NAMES) {
    cleanRotations[jointName] = [0, 0, 0];
  }
  return cleanRotations;
}

function cleanRotationsForJson(rotations) {
  const cleanRotations = {};
  for (const jointName of ROTATION_JOINT_NAMES) {
    const rotation = rotations[jointName] ?? [0, 0, 0];
    cleanRotations[jointName] = rotation.map(toFixedNumber);
  }
  return cleanRotations;
}

function copyRotations(target, source) {
  for (const jointName of ROTATION_JOINT_NAMES) {
    const rotation = source[jointName] ?? [0, 0, 0];
    target[jointName][0] = rotation[0];
    target[jointName][1] = rotation[1];
    target[jointName][2] = rotation[2];
  }
}

function cleanJointsForJson(joints) {
  return joints.map((joint) => ({
    t: joint.t.map(toFixedNumber),
    r: joint.r.map(toFixedNumber),
    s: (joint.s ?? [1, 1, 1]).map(toFixedNumber),
  }));
}

function formatJson(value) {
  return formatJsonValue(value);
}

function formatJsonValue(value, indentLevel = 0) {
  const indent = '  '.repeat(indentLevel);
  const childIndent = '  '.repeat(indentLevel + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    return [
      '[',
      value
        .map(
          (item) => `${childIndent}${formatJsonValue(item, indentLevel + 1)}`
        )
        .join(',\n'),
      `${indent}]`,
    ].join('\n');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return [
      '{',
      entries
        .map(
          ([key, item]) =>
            `${childIndent}${JSON.stringify(key)}: ${formatJsonValue(
              item,
              indentLevel + 1
            )}`
        )
        .join(',\n'),
      `${indent}}`,
    ].join('\n');
  }

  return JSON.stringify(value);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function formatJointName(jointName) {
  return jointName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createPromptBubble(onGenerate) {
  const bubble = document.createElement('form');
  bubble.className = 'manual-sim-hand-prompt-bubble';
  bubble.innerHTML = `
    <input
      class="manual-sim-hand-prompt"
      type="text"
      value=""
      aria-label="Gesture generation prompt"
    />
    <button class="manual-sim-hand-generate" type="submit">Generate</button>
    <span class="manual-sim-hand-status">Ready</span>
  `;
  document.body.append(bubble);

  const promptInput = bubble.querySelector('.manual-sim-hand-prompt');
  const generateButton = bubble.querySelector('.manual-sim-hand-generate');
  const status = bubble.querySelector('.manual-sim-hand-status');

  for (const eventName of ['keydown', 'keyup', 'keypress']) {
    promptInput.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  }

  bubble.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    generateButton.disabled = true;
    status.textContent = 'Generating...';
    try {
      await onGenerate(prompt);
      status.textContent = 'Applied';
    } catch (error) {
      console.error(error);
      status.textContent =
        error instanceof Error ? error.message : 'Generation failed';
    } finally {
      generateButton.disabled = false;
    }
  });
}

function createSlider(jointName, axisConfig, onRotationChange) {
  const row = document.createElement('label');
  row.className = 'manual-sim-hand-slider';

  const axis = document.createElement('span');
  axis.className = 'manual-sim-hand-axis';
  axis.textContent = axisConfig.label;
  axis.title = axisConfig.description;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(MIN_DEGREES);
  input.max = String(MAX_DEGREES);
  input.step = '1';
  input.value = '0';
  input.dataset.joint = jointName;
  input.dataset.axis = axisConfig.axis;

  const value = document.createElement('input');
  value.className = 'manual-sim-hand-value';
  value.type = 'number';
  value.min = String(MIN_DEGREES);
  value.max = String(MAX_DEGREES);
  value.step = '1';
  value.value = '0';
  value.dataset.joint = jointName;
  value.dataset.axis = axisConfig.axis;

  const setDegrees = (degrees) => {
    const clampedDegrees = clampDegrees(degrees);
    input.value = String(clampedDegrees);
    value.value = String(clampedDegrees);
    onRotationChange(jointName, axisConfig.axis, clampedDegrees * DEG_TO_RAD);
  };

  input.addEventListener('input', () => {
    setDegrees(Number(input.value));
  });

  value.addEventListener('input', () => {
    if (value.value === '') return;
    const degrees = Number(value.value);
    if (!Number.isFinite(degrees)) return;
    const clampedDegrees = clampDegrees(degrees);
    input.value = String(clampedDegrees);
    onRotationChange(jointName, axisConfig.axis, clampedDegrees * DEG_TO_RAD);
  });

  value.addEventListener('change', () => {
    const degrees = Number(value.value);
    setDegrees(Number.isFinite(degrees) ? degrees : 0);
  });

  row.append(axis, input, value);
  return row;
}

function createJointControl(jointName, onRotationChange) {
  const section = document.createElement('section');
  section.className = 'manual-sim-hand-joint';

  const title = document.createElement('h2');
  title.textContent = formatJointName(jointName);
  section.append(title);

  for (const axisConfig of AXES) {
    section.append(createSlider(jointName, axisConfig, onRotationChange));
  }

  return section;
}

function createJsonView(titleText) {
  const view = document.createElement('section');
  view.className = 'manual-sim-hand-json-view';

  const header = document.createElement('div');
  header.className = 'manual-sim-hand-json-header';

  const title = document.createElement('h2');
  title.textContent = titleText;

  const copyButton = document.createElement('button');
  copyButton.className = 'manual-sim-hand-copy';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy';

  const output = document.createElement('pre');
  output.className = 'manual-sim-hand-json';
  output.textContent = '{}';

  copyButton.addEventListener('click', async () => {
    await copyText(output.textContent);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => {
      copyButton.textContent = 'Copy';
    }, 900);
  });

  header.append(title, copyButton);
  view.append(header, output);

  return {
    element: view,
    setValue(value) {
      output.textContent = formatJson(value);
    },
  };
}

function createSidebar(onRotationChange, onReset, getJsonData) {
  const sidebar = document.createElement('aside');
  sidebar.className = 'manual-sim-hand-sidebar';

  const header = document.createElement('header');
  header.className = 'manual-sim-hand-header';

  const resetButton = document.createElement('button');
  resetButton.className = 'manual-sim-hand-reset';
  resetButton.type = 'button';
  resetButton.textContent = 'Reset';
  resetButton.addEventListener('click', onReset);

  header.append(resetButton);
  sidebar.append(header);

  const tabs = document.createElement('nav');
  tabs.className = 'manual-sim-hand-tabs';

  const panels = document.createElement('div');
  panels.className = 'manual-sim-hand-panels';

  const controls = document.createElement('div');
  controls.className = 'manual-sim-hand-controls manual-sim-hand-panel';
  controls.dataset.panel = 'controls';

  for (const jointName of ROTATION_JOINT_NAMES) {
    controls.append(createJointControl(jointName, onRotationChange));
  }

  const rawJsonView = createJsonView('Raw Joint Data');
  rawJsonView.element.classList.add('manual-sim-hand-panel');
  rawJsonView.element.dataset.panel = 'raw';

  const rotationsJsonView = createJsonView('Rotation Data');
  rotationsJsonView.element.classList.add('manual-sim-hand-panel');
  rotationsJsonView.element.dataset.panel = 'rotations';

  const panelEntries = [
    {id: 'controls', label: 'Controls', element: controls},
    {id: 'raw', label: 'Raw JSON', element: rawJsonView.element},
    {
      id: 'rotations',
      label: 'Rotations JSON',
      element: rotationsJsonView.element,
    },
  ];

  const selectPanel = (selectedId) => {
    for (const entry of panelEntries) {
      const isSelected = entry.id === selectedId;
      entry.button.setAttribute('aria-selected', String(isSelected));
      entry.element.hidden = !isSelected;
    }
  };

  for (const entry of panelEntries) {
    const button = document.createElement('button');
    button.className = 'manual-sim-hand-tab';
    button.type = 'button';
    button.textContent = entry.label;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => selectPanel(entry.id));
    entry.button = button;
    tabs.append(button);
    panels.append(entry.element);
  }

  sidebar.append(tabs, panels);
  document.body.append(sidebar);

  selectPanel('controls');

  const updateJsonViews = () => {
    const jsonData = getJsonData();
    rawJsonView.setValue(jsonData.raw);
    rotationsJsonView.setValue(jsonData.rotations);
  };
  updateJsonViews();

  return updateJsonViews;
}

class ManualSimHandScene extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xaaaaaa, 0x666666, 3));
  }
}

class DisplayedPoseSync extends xb.Script {
  constructor(syncDisplayedPose) {
    super();
    this._syncDisplayedPose = syncDisplayedPose;
  }

  update() {
    this._syncDisplayedPose();
  }
}

class GestureHUD extends xb.Script {
  init() {
    this._active = {
      left: new Map(),
      right: new Map(),
    };
    this._container = document.createElement('section');
    this._container.className = 'manual-sim-hand-gesture-panel';
    this._container.innerHTML = `
      <h2>Heuristic Gestures</h2>
      <div class="manual-sim-hand-gesture-row">
        <span>Left</span>
        <strong data-hand="left" data-active="false">None</strong>
      </div>
      <div class="manual-sim-hand-gesture-row">
        <span>Right</span>
        <strong data-hand="right" data-active="false">None</strong>
      </div>
    `;
    this._labels = {
      left: this._container.querySelector('[data-hand="left"]'),
      right: this._container.querySelector('[data-hand="right"]'),
    };

    document.body.append(this._container);

    const gestures = xb.core.gestureRecognition;
    if (!gestures) {
      console.warn(
        '[ManualSimHand] GestureRecognition is unavailable. ' +
          'Make sure options.enableGestures() is called before xb.init().'
      );
      return;
    }

    const update = (event) => {
      const {name, hand, confidence = 0} = event.detail;
      this._active[hand].set(name, confidence);
      this._refresh(hand);
    };
    const clear = (event) => {
      const {name, hand} = event.detail;
      this._active[hand].delete(name);
      this._refresh(hand);
    };

    this._onGestureStart = update;
    this._onGestureUpdate = update;
    this._onGestureEnd = clear;

    gestures.addEventListener('gesturestart', this._onGestureStart);
    gestures.addEventListener('gestureupdate', this._onGestureUpdate);
    gestures.addEventListener('gestureend', this._onGestureEnd);
  }

  _refresh(hand) {
    const label = this._labels[hand];
    const activeGestures = this._active[hand];
    if (!label || !activeGestures || activeGestures.size === 0) {
      if (label) {
        label.dataset.active = 'false';
        label.textContent = 'None';
      }
      return;
    }

    let topGesture = 'None';
    let topConfidence = 0;
    for (const [name, confidence] of activeGestures.entries()) {
      if (confidence >= topConfidence) {
        topGesture = name;
        topConfidence = confidence;
      }
    }

    label.dataset.active = 'true';
    label.textContent = `${topGesture} (${topConfidence.toFixed(2)})`;
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    if (gestures) {
      if (this._onGestureStart) {
        gestures.removeEventListener('gesturestart', this._onGestureStart);
      }
      if (this._onGestureUpdate) {
        gestures.removeEventListener('gestureupdate', this._onGestureUpdate);
      }
      if (this._onGestureEnd) {
        gestures.removeEventListener('gestureend', this._onGestureEnd);
      }
    }
    this._container?.remove();
  }
}

async function start() {
  const handRotations = createZeroRotationJson();
  const options = new xb.Options();
  options.enableReticles();
  options.enableHands();
  options.enableGestures();
  options.enableAI();
  options.setAppTitle('Simulator Hand Poses');
  options.gestures.provider = 'heuristics';
  options.gestures.setGestureEnabled('point', true);
  options.gestures.setGestureEnabled('spread', true);
  options.hands.visualization = true;
  options.hands.visualizeJoints = true;
  options.hands.visualizeMeshes = true;
  options.simulator.defaultMode = xb.SimulatorMode.POSE;

  xb.add(new ManualSimHandScene());
  xb.add(new GestureHUD());
  await xb.init(options);

  let updateJsonViews = () => {};

  const getActiveHandRotations = () => {
    const activeHandIndex =
      xb.core.simulator.controls.simulatorControllerState
        .currentControllerIndex;
    return activeHandIndex === 0
      ? xb.core.simulator.hands.leftHandCurrentRotations
      : xb.core.simulator.hands.rightHandCurrentRotations;
  };

  const getDisplayedJoints = (bones) =>
    bones.map((bone) => ({
      t: bone.position.toArray(),
      r: bone.quaternion.toArray(),
      s: bone.scale.toArray(),
    }));

  const applyHandRotations = () => {
    xb.core.simulator.hands.setLeftHandRotations(handRotations);
    xb.core.simulator.hands.setRightHandRotations(handRotations);
    updateJsonViews();
  };

  const syncControlsToRotations = (rotations = getActiveHandRotations()) => {
    for (const input of document.querySelectorAll(
      '.manual-sim-hand-slider input[type="range"]'
    )) {
      const axisIndex = ['x', 'y', 'z'].indexOf(input.dataset.axis);
      const degrees = Math.round(
        (rotations[input.dataset.joint]?.[axisIndex] ?? 0) / DEG_TO_RAD
      );
      input.value = String(degrees);
      input.nextElementSibling.value = String(degrees);
    }
  };

  updateJsonViews = createSidebar(
    (jointName, axis, value) => {
      copyRotations(handRotations, getActiveHandRotations());
      handRotations[jointName][['x', 'y', 'z'].indexOf(axis)] = value;
      applyHandRotations();
    },
    () => {
      for (const rotation of Object.values(handRotations)) {
        rotation.fill(0);
      }
      syncControlsToRotations(handRotations);
      applyHandRotations();
    },
    () => ({
      raw: {
        left: cleanJointsForJson(
          getDisplayedJoints(xb.core.simulator.hands.leftHandBones)
        ),
        right: cleanJointsForJson(
          getDisplayedJoints(xb.core.simulator.hands.rightHandBones)
        ),
      },
      rotations: cleanRotationsForJson(getActiveHandRotations()),
    })
  );

  const syncDisplayedPose = () => {
    syncControlsToRotations();
    updateJsonViews();
  };
  xb.add(new DisplayedPoseSync(syncDisplayedPose));

  createPromptBubble(async (description) => {
    xb.core.options.ai.gemini.config = {
      responseMimeType: 'application/json',
      responseSchema: LOCAL_ROTATION_SCHEMA,
      systemInstruction: [{text: LOCAL_AUTHORING_PROMPT}],
    };
    const response = await xb.core.ai.query({
      prompt: JSON.stringify({description}),
    });
    const generatedRotations = xb.parseSimulatorHandPoseRotations(
      JSON.parse(response.text)
    );
    for (const jointName of ROTATION_JOINT_NAMES) {
      const generatedRotation = generatedRotations[jointName];
      handRotations[jointName][0] = generatedRotation[0];
      handRotations[jointName][1] = generatedRotation[1];
      handRotations[jointName][2] = generatedRotation[2];
    }
    syncControlsToRotations(handRotations);
    applyHandRotations();
  });
}

document.addEventListener('DOMContentLoaded', start);

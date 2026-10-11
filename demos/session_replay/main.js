import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  SessionPlayer,
  SessionRecorder,
  downloadSessionRecording,
  getSessionRecordingDuration,
  parseSessionRecording,
} from 'xrblocks/addons/session-replay/index.js';

const options = new xb.Options();
options.enableHands();
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
options.setAppTitle('Session Replay');

// Add the player first so other scripts see replayed poses in the same frame.
const player = new SessionPlayer();
const recorder = new SessionRecorder();
let recording;

const COLORS = [0x4285f4, 0xea4335, 0xfbbc04, 0x34a853];

class ToggleCube extends xb.Script {
  constructor(x) {
    super();
    this.colorIndex = 0;
    this.material = new THREE.MeshStandardMaterial({color: COLORS[0]});
    this.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), this.material)
    );
    this.position.set(x, 1.4, -0.9);
  }

  setColor(index) {
    this.colorIndex = index;
    this.material.color.setHex(COLORS[index]);
  }

  onObjectSelectStart(event) {
    this.setColor((this.colorIndex + 1) % COLORS.length);
    event.stopPropagation();
  }

  update(time) {
    this.rotation.y = time * 0.0004;
  }
}

class SessionReplayPanel extends xb.Script {
  init() {
    this.status = new xb.UIText({
      text: 'Pinch the cubes while recording, then replay it.',
      style: {fontSize: 18, opacity: 0.75, textAlign: 'center'},
    });
    this.recordButton = new xb.UIButton({
      label: 'Record',
      icon: 'radio_button_checked',
      style: {flexGrow: 1},
      onClick: () => this.toggleRecording(),
    });
    this.replayButton = new xb.UIButton({
      label: 'Replay',
      icon: 'replay',
      style: {flexGrow: 1},
      onClick: () => this.replay(),
    });
    this.saveButton = new xb.UIButton({
      label: 'Save',
      icon: 'download',
      style: {flexGrow: 1},
      onClick: () => downloadSessionRecording(recording),
    });

    const card = new xb.UICard({
      size: {width: 0.62, height: 'auto'},
      style: {flexDirection: 'column', gap: 16, padding: 20},
      children: [
        new xb.UIText({
          text: 'Session Replay',
          style: {fontSize: 32, fontWeight: 'bold', textAlign: 'center'},
        }),
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 12},
          children: [this.recordButton, this.replayButton, this.saveButton],
        }),
        this.status,
      ],
    });
    card.position.set(0, 1.75, -1.1);
    this.add(card);
    this.add(new THREE.HemisphereLight(0xffffff, 0x606060, 3));
    this.addDesktopToolbar();
    this.render();
  }

  render() {
    const isRecording = recorder.isRecording;
    const canReplay =
      !isRecording && !player.isPlaying && !!recording?.frames.length;
    this.recordButton.label = isRecording ? 'Stop' : 'Record';
    this.recordButton.icon = isRecording ? 'stop' : 'radio_button_checked';
    // Replayed pinches can land on this panel, so lock it during playback.
    this.recordButton.disabled = player.isPlaying;
    this.replayButton.disabled = !canReplay;
    this.saveButton.disabled = isRecording || !recording;
    if (this.dom) {
      this.dom.record.textContent = this.recordButton.label;
      this.dom.record.disabled = this.recordButton.disabled;
      this.dom.replay.disabled = this.replayButton.disabled;
      this.dom.save.disabled = this.saveButton.disabled;
      this.dom.load.disabled = isRecording || player.isPlaying;
      this.dom.status.textContent = this.status.text;
    }
  }

  setStatus(text) {
    this.status.text = text;
    this.render();
  }

  toggleRecording() {
    if (recorder.isRecording) {
      this.setRecording(recorder.stop());
      return;
    }
    // Replay only drives input, so store the cube colors to restore later.
    recorder.start({state: cubes.map((cube) => cube.colorIndex)});
    this.setStatus('Recording...');
  }

  setRecording(next) {
    recording = next;
    const seconds = (getSessionRecordingDuration(recording) / 1000).toFixed(1);
    this.setStatus(
      `${recording.frames.length} frames, ${seconds}s from ${recording.source}.`
    );
  }

  async replay() {
    if (!xb.core.simulatorRunning) {
      this.setStatus(
        'Replay runs in the desktop simulator. Save this recording and load it there.'
      );
      return;
    }
    if (Array.isArray(recording.state)) {
      recording.state.forEach((index, i) => {
        if (COLORS[index] !== undefined) cubes[i]?.setColor(index);
      });
    }
    const finished = player.play(recording);
    this.setStatus('Replaying...');
    try {
      await finished;
      this.setStatus('Replay finished.');
    } catch (error) {
      this.setStatus(error.message);
    }
  }

  async load(file) {
    try {
      this.setRecording(parseSessionRecording(await file.text()));
    } catch (error) {
      this.setStatus(error.message);
    }
  }

  // Desktop mouse clicks don't press the 3D panel while driving the simulated
  // hands, so mirror its buttons in the page.
  addDesktopToolbar() {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:10;display:flex;gap:6px;align-items:center;font:13px sans-serif;';
    const status = document.createElement('span');
    status.style.cssText =
      'color:#fff;background:#0008;padding:6px 10px;border-radius:6px;';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) this.load(file);
    });
    const button = (label, onClick) => {
      const element = document.createElement('button');
      element.textContent = label;
      element.style.cssText = 'padding:6px 12px;';
      element.addEventListener('click', () => {
        // Keep focus off the button so Space pinches instead of clicking it.
        element.blur();
        onClick();
      });
      return element;
    };
    this.dom = {
      status,
      record: button('Record', () => this.toggleRecording()),
      replay: button('Replay', () => this.replay()),
      save: button('Save', () => downloadSessionRecording(recording)),
      load: button('Load', () => input.click()),
    };
    const {record, replay, save, load} = this.dom;
    bar.append(status, record, replay, save, load, input);
    document.body.append(bar);
  }
}

xb.add(player);
xb.add(recorder);
xb.add(new SessionReplayPanel());
const cubes = [-0.3, 0, 0.3].map((x) => new ToggleCube(x));
for (const cube of cubes) {
  xb.add(cube);
}
xb.init(options);

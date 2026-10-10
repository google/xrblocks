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
options.simulator.defaultMode = xb.SimulatorMode.POSE;
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
    this.position.set(x, 1.15, -0.9);
  }

  onObjectSelectStart(event) {
    this.colorIndex = (this.colorIndex + 1) % COLORS.length;
    this.material.color.setHex(COLORS[this.colorIndex]);
    event.stopPropagation();
  }

  update(time) {
    this.rotation.y = time * 0.0004;
  }
}

class SessionReplayPanel extends xb.Script {
  init() {
    this.status = new xb.UIText({
      text: 'Record yourself pinching the cubes, then replay it.',
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
      disabled: true,
      style: {flexGrow: 1},
      onClick: () => this.replay(),
    });
    this.saveButton = new xb.UIButton({
      label: 'Save',
      icon: 'download',
      disabled: true,
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
    card.position.set(0, 1.5, -0.95);
    this.add(card);
    this.add(new THREE.HemisphereLight(0xffffff, 0x606060, 3));
    this.addLoadButton();
  }

  toggleRecording() {
    if (recorder.isRecording) {
      this.setRecording(recorder.stop());
      return;
    }
    recorder.start();
    this.recordButton.label = 'Stop';
    this.recordButton.icon = 'stop';
    this.replayButton.disabled = true;
    this.saveButton.disabled = true;
    this.status.text = 'Recording...';
  }

  setRecording(next) {
    recording = next;
    const seconds = (getSessionRecordingDuration(recording) / 1000).toFixed(1);
    this.recordButton.label = 'Record';
    this.recordButton.icon = 'radio_button_checked';
    this.replayButton.disabled = recording.frames.length === 0;
    this.saveButton.disabled = false;
    this.status.text = `${recording.frames.length} frames, ${seconds}s from ${recording.source}.`;
  }

  async replay() {
    if (!xb.core.simulatorRunning) {
      this.status.text =
        'Replay runs in the desktop simulator. Save this recording and load it there.';
      return;
    }
    // Replayed pinches can land on this panel, so lock it during playback.
    this.recordButton.disabled = true;
    this.replayButton.disabled = true;
    this.status.text = 'Replaying...';
    try {
      await player.play(recording);
      this.status.text = 'Replay finished.';
    } catch (error) {
      this.status.text = error.message;
    } finally {
      this.recordButton.disabled = false;
      this.replayButton.disabled = false;
    }
  }

  addLoadButton() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        this.setRecording(parseSessionRecording(await file.text()));
      } catch (error) {
        this.status.text = error.message;
      }
    });
    const button = document.createElement('button');
    button.textContent = 'Load recording';
    button.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:10;padding:8px 12px;';
    button.addEventListener('click', () => input.click());
    document.body.append(input, button);
  }
}

xb.add(player);
xb.add(recorder);
xb.add(new SessionReplayPanel());
for (const x of [-0.3, 0, 0.3]) {
  xb.add(new ToggleCube(x));
}
xb.init(options);

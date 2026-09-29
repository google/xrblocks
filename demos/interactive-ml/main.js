import * as xb from 'xrblocks';
import {HandInput} from './build/HandInput.js';
import {
  HandTrainer,
  Predictor,
  SoundTrainer,
  YAMNET_FEATURE_ID,
} from 'xrblocks/addons/interactive-ml/index.js';

const state = {
  kind: 'hand-pose',
  hand: 'right',
  label: 'open',
};
const importInput = document.getElementById('import');
const projects = new Map();
const models = new Map();
let recording = null;
let recordingGeneration = 0;
let training = null;
let closed = false;
let recordingTimer = null;
let ui;
let lastPredictionPaint = -Infinity;
let statusText = 'Starting XR Blocks...';
let microphone;
let audioContext;
let audioNode;
let audioSource;
let audioWorker;
let audioBusy = false;
let audioGeneration = 0;
let microphoneStarting = false;
let audioRequestId = 0;
const audioRequests = new Map();
let audioChunks = [];
let audioSize = 0;
const readings = {
  left: 'No tracking',
  right: 'No tracking',
  sound: 'Microphone off',
};
const key = () => state.kind;
const message = (text) => {
  statusText = text;
  if (ui) ui.status.text = text;
};
const run = (fn) => async () => {
  try {
    await fn();
  } catch (error) {
    if (!closed) message(error.message);
  }
};
function busy() {
  return !!recording || !!training || audioBusy;
}
function ensureIdle() {
  if (busy()) throw new Error('Finish or cancel the current operation first.');
}
function trainer() {
  const id = key();
  if (!projects.has(id))
    projects.set(
      id,
      id === 'sound' ? new SoundTrainer(extractor) : new HandTrainer()
    );
  return projects.get(id);
}
function setLabel(button, label) {
  if (button.label !== label) button.label = label;
}
function refresh() {
  if (!ui) return;
  const counts = trainer().counts;
  ui.summary.text = `${counts[state.label] ?? 0} examples for this class / ${Object.keys(counts).length} classes`;
  setLabel(ui.hand, `Record: ${state.hand} hand`);
  ui.hand.disabled = state.kind === 'sound';
  ui.label.value = state.label;
  setLabel(ui.mic, audioContext ? 'Stop microphone' : 'Enable microphone');
  ui.mode.text = {
    'hand-pose': 'Hand poses',
    sound: 'Sounds',
  }[state.kind];
  for (const [kind, button] of Object.entries(ui.modeButtons))
    button.disabled = state.kind === kind;
  ui.handPredictions.style.display = state.kind === 'sound' ? 'none' : 'flex';
  ui.soundPrediction.style.display = state.kind === 'sound' ? 'flex' : 'none';
  ui.test.disabled = !models.has(key());
  ui.train.disabled = !!training || !!recording;
  ui.record.disabled = !!training || !!recording;
  ui.cancel.disabled = !training && !recording;
  ui.model.text = models.has(key())
    ? 'Model active / live predictions below'
    : 'Record examples, then Train & use';
}
function selectProject(kind = state.kind) {
  ensureIdle();
  state.kind = kind;
  const defaults = {'hand-pose': 'open', sound: 'clap'};
  state.label = defaults[kind];
  readings.left = readings.right = 'Waiting for hand data';
  refresh();
  renderPredictions();
  message(
    'Record several examples per class. Train & use updates the live model.'
  );
}
function activateModel(next) {
  const old = models.get(key());
  models.set(key(), next);
  old?.dispose();
  refresh();
}
function renderPredictions() {
  const now = performance.now();
  if (!ui || now - lastPredictionPaint < 200) return;
  lastPredictionPaint = now;
  ui.left.text = readings.left;
  ui.right.text = readings.right;
  ui.sound.text = readings.sound;
}
function clearRecording() {
  recording = null;
  if (recordingTimer !== null) clearInterval(recordingTimer);
  recordingTimer = null;
}
function recordingTick() {
  if (!recording) return;
  const now = performance.now();
  if (now < recording.start) {
    message(
      `Ready in ${Math.max(1, Math.ceil((recording.start - now) / 1000))}...`
    );
  } else if (recording.key === 'sound') {
    message(`Recording ${recording.label}...`);
    if (now > recording.end + 2000) {
      clearRecording();
      refresh();
      message('No audio received. Enable the microphone and try again.');
    }
  } else if (now >= recording.end) {
    void run(finishHandRecording)();
  } else {
    message(
      `Recording ${recording.hand}: ${Math.ceil((recording.end - now) / 1000)} s`
    );
  }
}
function record(test = false) {
  ensureIdle();
  if (test && !models.has(key()))
    throw new Error('Train or load a model first.');
  if (state.kind === 'sound' && !audioContext)
    throw new Error('Enable the microphone first.');
  if (!state.label.trim()) throw new Error('Enter a class name.');
  const now = performance.now();
  recording = {
    generation: ++recordingGeneration,
    test,
    hand: state.hand,
    label: state.label.trim(),
    key: key(),
    start: now + 2000,
    end: now + (state.kind === 'sound' ? 3000 : 3500),
    frames: [],
  };
  message('Ready in 2...');
  recordingTimer = setInterval(recordingTick, 100);
  refresh();
}
async function finishHandRecording() {
  const clip = recording;
  clearRecording();
  refresh();
  if (!clip.frames.length)
    throw new Error(
      'No tracked hand frames. Show the selected hand and try again.'
    );
  if (clip.test) {
    const result = models.get(clip.key).predictHand(clip.frames);
    message(
      `Fresh test: expected ${clip.label}; predicted ${result.label ?? 'unknown'} (${result.score.toFixed(2)}).`
    );
  } else {
    trainer().addExample(clip.label, clip.frames);
    refresh();
    message(
      `Added ${clip.label} from ${clip.hand}. You can add another take or class.`
    );
  }
}
async function train() {
  ensureIdle();
  const controller = new AbortController();
  training = controller;
  const source = trainer();
  refresh();
  message('Training...');
  try {
    const result = await source.train({
      signal: controller.signal,
      onProgress: (fraction) =>
        message(`Training ${Math.round(fraction * 100)}%`),
    });
    if (closed) {
      result.dispose();
      return;
    }
    activateModel(result);
    message('Model updated. Try either hand, or test a fresh clip.');
  } finally {
    training = null;
    refresh();
  }
}
function cancel() {
  ++recordingGeneration;
  clearRecording();
  training?.abort(new DOMException('Training cancelled', 'AbortError'));
  refresh();
  message('Cancelled. The current model is still active.');
}

function receiveHand(hand, frame) {
  if (!frame) {
    readings[hand] = 'No tracking';
  } else {
    if (
      recording?.hand === hand &&
      recording.key !== 'sound' &&
      frame.timeMs >= recording.start &&
      frame.timeMs <= recording.end
    )
      recording.frames.push(frame);
    const model = models.get(key());
    if (model && model.kind !== 'sound') {
      const result = model.predictHand([frame]);
      if (result)
        readings[hand] =
          `${result.label ?? 'unknown'}  ${Math.round(result.score * 20) * 5}%`;
    } else readings[hand] = 'Tracked / train a model';
  }
  renderPredictions();
}

function buildUI() {
  const text = (value, size = 20) =>
    new xb.UIText({
      text: value,
      pointerEvents: 'none',
      style: {fontSize: size, color: '#edf3ff'},
    });
  const button = (label, fn) =>
    new xb.UIButton({
      label,
      onClick: run(fn),
      style: {
        height: 58,
        flexGrow: 1,
        flexBasis: 0,
        fontSize: 20,
        backgroundColor: '#29384c',
        color: '#ffffff',
        borderRadius: 8,
        borderWidth: 0,
        ':hover': {backgroundColor: '#3c526f'},
      },
    });
  const surface = {
    flexDirection: 'column',
    gap: 16,
    padding: 24,
    backgroundColor: '#111c2c',
    borderRadius: 12,
    borderWidth: 0,
  };
  const row = (...children) =>
    new xb.UIPanel({
      style: {flexDirection: 'row', gap: 10, width: '100%'},
      children,
    });
  ui = {
    status: text(statusText),
    mode: text('Hand poses', 28),
    summary: text('No examples yet', 16),
    model: text('Record examples, then Train & use', 16),
    left: text('No tracking', 24),
    right: text('No tracking', 24),
    sound: text('Microphone off', 24),
  };
  ui.modeButtons = Object.fromEntries(
    [
      ['hand-pose', 'Poses'],
      ['sound', 'Sound'],
    ].map(([kind, label]) => [kind, button(label, () => selectProject(kind))])
  );
  ui.hand = button('Record: right hand', () => {
    ensureIdle();
    state.hand = state.hand === 'left' ? 'right' : 'left';
    refresh();
  });
  ui.label = new xb.UITextInput({
    ariaLabel: 'Class name',
    value: state.label,
    placeholder: 'Class name',
    maxLength: 80,
    onChange: (value) => {
      state.label = value;
      refresh();
    },
    style: {flexGrow: 2, flexBasis: 0, height: 58, fontSize: 24},
  });
  const nextClass = button('Next class', () => {
    ensureIdle();
    const labels =
      state.kind === 'sound'
        ? ['clap', 'background', 'whistle']
        : ['open', 'fist', 'pinch', 'neutral'];
    state.label = labels[(labels.indexOf(state.label) + 1) % labels.length];
    refresh();
  });
  ui.record = button('Record example', () => record());
  ui.train = button('Train & use', train);
  ui.test = button('Test clip', () => record(true));
  ui.cancel = button('Cancel', cancel);
  ui.mic = button('Enable microphone', async () => {
    if (audioContext) await stopMicrophone();
    else await enableMicrophone();
    refresh();
  });
  const files = new xb.UICard({
    size: {width: 0.72, height: 'auto'},
    appearance: 'none',
    style: surface,
    manipulation: true,
    children: [
      text('Settings', 28),
      row(...Object.values(ui.modeButtons)),
      row(ui.hand, ui.test),
      row(ui.mic),
      row(
        button('Save here', () => browserProject(true)),
        button('Restore', () => browserProject(false))
      ),
      row(
        button('Export project', () =>
          download(trainer().exportProject(), 'interactive-ml-project.json')
        ),
        button('Export TFLite', () => {
          const model = models.get(key());
          if (!model) throw new Error('Train a model first.');
          download(
            new Blob([model.exportTFLite()], {
              type: 'application/octet-stream',
            }),
            `interactive-ml-${model.kind}.tflite`
          );
          message(
            'TFLite file saved. Labels and feature details are included.'
          );
        })
      ),
      row(
        button('Import JSON', () => importInput.click()),
        button('Undo example', () => {
          ensureIdle();
          const examples = trainer().exportProject().examples;
          const last = examples.at(-1);
          if (last) trainer().removeExample(last.id);
          refresh();
          message('Last example removed. Train again to update the model.');
        })
      ),
      text(
        'File pickers work in the desktop browser. Save here also works in XR.',
        16
      ),
      button('Close settings', () => {
        files.visible = false;
      }),
    ],
  });
  files.position.set(0.95, 1.5, -1.5);
  files.visible = false;
  const tile = (label, value) =>
    new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        height: 108,
        padding: 16,
        gap: 8,
        backgroundColor: '#1e3047',
        borderRadius: 8,
      },
      children: [text(label, 16), value],
    });
  ui.handPredictions = row(
    tile('LEFT HAND', ui.left),
    tile('RIGHT HAND', ui.right)
  );
  ui.soundPrediction = tile('SOUND', ui.sound);
  ui.status.style.height = 56;
  ui.status.style.fontSize = 20;
  ui.record.style.backgroundColor = '#245ec0';
  const card = new xb.UICard({
    size: {width: 0.72, height: 0.68},
    appearance: 'none',
    style: surface,
    manipulation: true,
    children: [
      row(
        ui.mode,
        button('Settings', () => {
          files.visible = !files.visible;
        })
      ),
      row(ui.label, nextClass),
      ui.summary,
      row(ui.record, ui.train, ui.cancel),
      ui.status,
      ui.model,
      ui.handPredictions,
      ui.soundPrediction,
      text('One hand teaches both. Add examples, then train again.', 16),
    ],
  });
  card.position.set(0, 1.5, -1.5);
  xb.add(card);
  xb.add(files);
  refresh();
}

function audioCall(clip) {
  return new Promise((resolve, reject) => {
    const id = ++audioRequestId;
    audioRequests.set(id, {resolve, reject});
    audioWorker.postMessage({id, clip});
  });
}
const extractor = {
  featureId: YAMNET_FEATURE_ID,
  dimensions: 1024,
  extract: async (clip) => (await audioCall(clip)).features,
};
async function enableMicrophone() {
  if (audioContext || microphoneStarting) return;
  microphoneStarting = true;
  const generation = ++audioGeneration;
  try {
    message('Loading local sound model and requesting microphone...');
    // Request permission directly from the user gesture, before model loading.
    const media = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (generation !== audioGeneration || closed) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    microphone = media;
    audioContext = new AudioContext();
    await audioContext.resume();
    audioWorker = new Worker(new URL('./audio.worker.js', import.meta.url), {
      type: 'module',
    });
    audioWorker.onmessage = ({data}) => {
      const request = audioRequests.get(data.id);
      if (!request) return;
      audioRequests.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data);
    };
    audioWorker.onerror = () => {
      void stopMicrophone();
      message('Audio worker failed. Check model downloads and retry.');
    };
    const {backend} = await audioCall();
    if (generation !== audioGeneration || closed) return;
    message(`Sound ready (${backend}). Record one-second examples.`);
    const code = `class Capture extends AudioWorkletProcessor {
      constructor() { super(); this.buffer = new Float32Array(2048); this.offset = 0; }
      process(inputs) { const channel = inputs[0]?.[0]; if (channel) for (const sample of channel) {
        this.buffer[this.offset++] = sample;
        if (this.offset === this.buffer.length) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Float32Array(2048); this.offset = 0; }
      } return true; }
    } registerProcessor('interactive-ml-capture', Capture);`;
    const url = URL.createObjectURL(
      new Blob([code], {type: 'application/javascript'})
    );
    try {
      await audioContext.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (generation !== audioGeneration || closed) return;
    audioSource = audioContext.createMediaStreamSource(media);
    audioNode = new AudioWorkletNode(audioContext, 'interactive-ml-capture');
    audioNode.port.onmessage = ({data}) => {
      if (!audioContext || generation !== audioGeneration) return;
      audioChunks.push(data);
      audioSize += data.length;
      if (audioSize < audioContext.sampleRate) return;
      const samples = new Float32Array(audioSize);
      let offset = 0;
      for (const chunk of audioChunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      audioChunks = [];
      audioSize = 0;
      if (audioBusy) return; // Drop an entire window; never splice across a gap.
      audioBusy = true;
      void handleAudio(
        {samples, sampleRate: audioContext.sampleRate},
        generation
      )
        .catch((error) => {
          if (!closed && generation === audioGeneration) message(error.message);
        })
        .finally(() => {
          if (generation === audioGeneration) audioBusy = false;
        });
    };
    audioSource.connect(audioNode);
    // The processor's output is silent; connecting keeps capture scheduled.
    audioNode.connect(audioContext.destination);
    message('Microphone ready. Record background and sound examples.');
  } catch (error) {
    if (generation === audioGeneration) await stopMicrophone();
    throw error;
  } finally {
    microphoneStarting = false;
  }
}
async function handleAudio(clip, generation) {
  const now = performance.now();
  const record =
    recording?.key === 'sound' &&
    now - (clip.samples.length / clip.sampleRate) * 1000 >= recording.start
      ? recording
      : null;
  if (record) {
    clearRecording();
    refresh();
  }
  const model = models.get('sound');
  if (!record && !model) return;
  const features = await extractor.extract(clip);
  if (generation !== audioGeneration || closed) return;
  if (record && record.generation === recordingGeneration) {
    if (record.test) {
      const result = model.predictFeatures(features, YAMNET_FEATURE_ID);
      message(
        `Fresh sound test: expected ${record.label}; predicted ${result.label ?? 'unknown'}.`
      );
    } else {
      // Reuse the extraction rather than running YAMNet a second time.
      const soundTrainer = projects.get('sound');
      const saved = soundTrainer.exportProject();
      saved.examples.push({
        id: crypto.randomUUID(),
        label: record.label,
        features,
      });
      projects.set('sound', SoundTrainer.loadProject(saved, extractor));
      refresh();
      message(`Added sound example: ${record.label}.`);
    }
  }
  if (model && model === models.get('sound')) {
    const result = model.predictFeatures(features, YAMNET_FEATURE_ID);
    readings.sound = `${result.label ?? 'unknown'} (${result.score.toFixed(2)})`;
  }
}
async function stopMicrophone() {
  ++audioGeneration;
  if (recording?.key === 'sound') {
    clearRecording();
    refresh();
  }
  audioNode?.disconnect();
  audioNode?.port.close();
  audioSource?.disconnect();
  microphone?.getTracks().forEach((track) => track.stop());
  microphone = null;
  audioWorker?.terminate();
  audioWorker = null;
  for (const {reject} of audioRequests.values())
    reject(new Error('Microphone stopped.'));
  audioRequests.clear();
  audioChunks = [];
  audioSize = 0;
  audioBusy = false;
  const context = audioContext;
  audioContext = null;
  audioNode = null;
  audioSource = null;
  if (context && context.state !== 'closed') await context.close();
  readings.sound = 'Microphone off';
  refresh();
  renderPredictions();
}
function download(value, name) {
  const url = URL.createObjectURL(
    value instanceof Blob
      ? value
      : new Blob([JSON.stringify(value)], {type: 'application/json'})
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function browserProject(write) {
  ensureIdle();
  const projectKey = key();
  const value = write ? trainer().exportProject() : null;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('xrblocks-interactive-ml-demo', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', write ? 'readwrite' : 'readonly');
      const request = write
        ? tx.objectStore('projects').put(value, projectKey)
        : tx.objectStore('projects').get(projectKey);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (!write) {
      if (!result) throw new Error('No saved project for this input.');
      importValue(result);
    }
    message(
      write
        ? 'Training project saved in this browser.'
        : 'Training project restored. Train to activate a model.'
    );
  } finally {
    db.close();
  }
}
function importValue(value) {
  ensureIdle();
  if (value.format === 'xrblocks-interactive-ml') {
    const next = new Predictor(value);
    if (next.kind === 'sound' && next.featureId !== YAMNET_FEATURE_ID) {
      next.dispose();
      throw new Error('This demo uses YAMNet features.');
    }
    state.kind = next.kind;
    selectProject();
    activateModel(next);
    message('Model loaded and active.');
  } else {
    const next = value.kind
      ? HandTrainer.loadProject(value)
      : SoundTrainer.loadProject(value, extractor);
    state.kind = value.kind ?? 'sound';
    selectProject();
    projects.set(key(), next);
    refresh();
  }
}
importInput.onchange = run(async () => {
  const file = importInput.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024)
    throw new Error('Use a file smaller than 20 MB.');
  importValue(JSON.parse(await file.text()));
  importInput.value = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancel();
    void stopMicrophone();
  }
});
window.addEventListener(
  'pagehide',
  () => {
    closed = true;
    cancel();
    void stopMicrophone();
    for (const model of models.values()) model.dispose();
    void xb.core.dispose();
  },
  {once: true}
);
const options = new xb.Options();
options.enableHands();
options.enableReticles();
// Keep the simulator's normal hands, without the extra black joint markers.
options.hands.visualizeJoints = false;
options.simulator.defaultMode = xb.SimulatorMode.POSE;
options.setAppTitle('Interactive ML');
options.setAppDescription('Teach hand poses and sounds on this device.');
buildUI();
xb.add(
  new HandInput(receiveHand, (error) => {
    clearRecording();
    refresh();
    message(`Hand input error: ${error.message ?? error}`);
  })
);
try {
  await xb.init(options);
  message('Ready. Choose a class and record an example.');
} catch (error) {
  message(`Startup failed: ${error.message}`);
  const fallback = document.getElementById('startup-error');
  fallback.hidden = false;
  fallback.textContent = statusText;
}

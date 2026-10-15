import * as xb from 'xrblocks';
import {
  captureHand,
  HandTrainer,
  Predictor,
  SoundTrainer,
  YAMNET_FEATURE_ID,
} from 'xrblocks/addons/interactive-ml/index.js';

export class InteractiveMLDemo extends xb.Script {
  state = {
    kind: 'hand-pose',
    hand: 'right',
    label: 'open',
  };
  importInput = document.getElementById('import');
  projects = new Map();
  models = new Map();
  recording = null;
  training = null;
  closed = false;
  ui;
  lastPredictionPaint = -Infinity;
  statusText = 'Starting XR Blocks...';
  audio = null;
  readings = {
    left: 'No tracking',
    right: 'No tracking',
    sound: 'Microphone off',
  };
  message(text) {
    if (this.closed || this.statusText === text) return;
    this.statusText = text;
    if (this.ui) this.ui.status.text = text;
  }
  run = (fn) => async () => {
    try {
      await fn.call(this);
    } catch (error) {
      if (!this.closed) this.message(error.message);
    }
  };
  busy() {
    return !!this.recording || !!this.training || !!this.audio?.pending;
  }
  ensureIdle() {
    if (this.closed) throw new Error('Demo is closed.');
    if (this.busy())
      throw new Error('Finish or cancel the current operation first.');
  }
  trainer() {
    const id = this.state.kind;
    if (!this.projects.has(id))
      this.projects.set(
        id,
        id === 'sound' ? new SoundTrainer(this.extractor) : new HandTrainer()
      );
    return this.projects.get(id);
  }
  setLabel(button, label) {
    if (button.label !== label) button.label = label;
  }
  refresh() {
    if (this.closed || !this.ui) return;
    const counts = this.trainer().counts;
    this.ui.summary.text = `${counts[this.state.label] ?? 0} examples for this class / ${Object.keys(counts).length} classes`;
    this.setLabel(this.ui.hand, `Record: ${this.state.hand} hand`);
    this.ui.hand.disabled = this.state.kind === 'sound';
    this.ui.label.value = this.state.label;
    this.setLabel(
      this.ui.mic,
      this.audio ? 'Stop microphone' : 'Enable microphone'
    );
    this.ui.mode.text = {
      'hand-pose': 'Hand poses',
      sound: 'Sounds',
    }[this.state.kind];
    for (const [kind, button] of Object.entries(this.ui.modeButtons))
      button.disabled = this.state.kind === kind;
    this.ui.handPredictions.style.display =
      this.state.kind === 'sound' ? 'none' : 'flex';
    this.ui.soundPrediction.style.display =
      this.state.kind === 'sound' ? 'flex' : 'none';
    this.ui.test.disabled = !this.models.has(this.state.kind);
    this.ui.train.disabled = !!this.training || !!this.recording;
    this.ui.record.disabled = !!this.training || !!this.recording;
    this.ui.cancel.disabled = !this.training && !this.recording;
    this.ui.model.text = this.models.has(this.state.kind)
      ? 'Model active / live predictions below'
      : 'Record examples, then Train & use';
  }
  selectProject(kind = this.state.kind) {
    this.ensureIdle();
    this.state.kind = kind;
    const defaults = {'hand-pose': 'open', sound: 'clap'};
    this.state.label = defaults[kind];
    this.readings.left = this.readings.right = 'Waiting for hand data';
    this.refresh();
    this.renderPredictions();
    this.message(
      'Record several examples per class. Train & use updates the live model.'
    );
  }
  activateModel(next) {
    const old = this.models.get(this.state.kind);
    this.models.set(this.state.kind, next);
    old?.dispose();
    this.refresh();
  }
  renderPredictions() {
    const now = performance.now();
    if (this.closed || !this.ui || now - this.lastPredictionPaint < 200) return;
    this.lastPredictionPaint = now;
    this.ui.left.text = this.readings.left;
    this.ui.right.text = this.readings.right;
    this.ui.sound.text = this.readings.sound;
  }
  clearRecording() {
    this.recording = null;
  }
  recordingTick() {
    if (!this.recording || this.recording.processing) return;
    const now = performance.now();
    if (now < this.recording.start) {
      this.message(
        `Ready in ${Math.max(1, Math.ceil((this.recording.start - now) / 1000))}...`
      );
    } else if (this.recording.key === 'sound') {
      this.message(`Recording ${this.recording.label}...`);
      if (now > this.recording.end + 2000) {
        this.clearRecording();
        this.refresh();
        this.message('No audio received. Enable the microphone and try again.');
      }
    } else if (now >= this.recording.end) {
      void this.run(this.finishHandRecording)();
    } else {
      this.message(
        `Recording ${this.recording.hand}: ${Math.ceil((this.recording.end - now) / 1000)} s`
      );
    }
  }
  record(test = false) {
    this.ensureIdle();
    if (test && !this.models.has(this.state.kind))
      throw new Error('Train or load a model first.');
    if (this.state.kind === 'sound' && !this.audio?.ready)
      throw new Error('Enable the microphone first.');
    if (!this.state.label.trim()) throw new Error('Enter a class name.');
    const now = performance.now();
    this.recording = {
      test,
      hand: this.state.hand,
      label: this.state.label.trim(),
      key: this.state.kind,
      start: now + 2000,
      end: now + (this.state.kind === 'sound' ? 3000 : 3500),
      frames: [],
    };
    this.message('Ready in 2...');
    this.refresh();
  }
  async finishHandRecording() {
    const clip = this.recording;
    this.clearRecording();
    this.refresh();
    if (!clip.frames.length)
      throw new Error(
        'No tracked hand frames. Show the selected hand and try again.'
      );
    if (clip.test) {
      const result = this.models.get(clip.key).predictHand(clip.frames);
      this.message(
        `Fresh test: expected ${clip.label}; predicted ${result.label ?? 'unknown'} (${result.score.toFixed(2)}).`
      );
    } else {
      this.trainer().addExample(clip.label, clip.frames);
      this.refresh();
      this.message(
        `Added ${clip.label} from ${clip.hand}. You can add another take or class.`
      );
    }
  }
  async train() {
    this.ensureIdle();
    const controller = new AbortController();
    this.training = controller;
    const source = this.trainer();
    this.refresh();
    this.message('Training...');
    try {
      const result = await source.train({
        signal: controller.signal,
        onProgress: (fraction) =>
          this.message(`Training ${Math.round(fraction * 100)}%`),
      });
      if (this.closed) {
        result.dispose();
        return;
      }
      this.activateModel(result);
      this.message('Model updated. Try either hand, or test a fresh clip.');
    } finally {
      this.training = null;
      this.refresh();
    }
  }
  cancel() {
    this.clearRecording();
    this.training?.abort(new DOMException('Training cancelled', 'AbortError'));
    this.refresh();
    this.message('Cancelled. The current model is still active.');
  }

  receiveHand(hand, frame) {
    if (!frame) {
      this.readings[hand] = 'No tracking';
    } else {
      if (
        this.recording?.hand === hand &&
        this.recording.key !== 'sound' &&
        frame.timeMs >= this.recording.start &&
        frame.timeMs <= this.recording.end
      )
        this.recording.frames.push(frame);
      const model = this.models.get(this.state.kind);
      if (model && model.kind !== 'sound') {
        const result = model.predictHand([frame]);
        if (result)
          this.readings[hand] =
            `${result.label ?? 'unknown'}  ${Math.round(result.score * 20) * 5}%`;
      } else this.readings[hand] = 'Tracked / train a model';
    }
  }

  buildUI() {
    const text = (value, size = 20) =>
      new xb.UIText({
        text: value,
        pointerEvents: 'none',
        style: {fontSize: size},
      });
    const button = (label, fn) =>
      new xb.UIButton({
        label,
        onClick: this.run(fn),
        style: {
          height: 58,
          flexGrow: 1,
          flexBasis: 0,
          fontSize: 20,
        },
      });
    const surface = {
      flexDirection: 'column',
      gap: 16,
      padding: 24,
    };
    const row = (...children) =>
      new xb.UIPanel({
        style: {flexDirection: 'row', gap: 10, width: '100%'},
        children,
      });
    this.ui = {
      status: text(this.statusText),
      mode: text('Hand poses', 28),
      summary: text('No examples yet', 16),
      model: text('Record examples, then Train & use', 16),
      left: text('No tracking', 24),
      right: text('No tracking', 24),
      sound: text('Microphone off', 24),
    };
    this.ui.modeButtons = Object.fromEntries(
      [
        ['hand-pose', 'Poses'],
        ['sound', 'Sound'],
      ].map(([kind, label]) => [
        kind,
        button(label, () => this.selectProject(kind)),
      ])
    );
    this.ui.hand = button('Record: right hand', () => {
      this.ensureIdle();
      this.state.hand = this.state.hand === 'left' ? 'right' : 'left';
      this.refresh();
    });
    this.ui.label = new xb.UITextInput({
      ariaLabel: 'Class name',
      value: this.state.label,
      placeholder: 'Class name',
      maxLength: 80,
      onChange: (value) => {
        this.state.label = value;
        this.refresh();
      },
      style: {flexGrow: 2, flexBasis: 0, height: 58, fontSize: 24},
    });
    const nextClass = button('Next class', () => {
      this.ensureIdle();
      const labels =
        this.state.kind === 'sound'
          ? ['clap', 'background', 'whistle']
          : ['open', 'fist', 'pinch', 'neutral'];
      this.state.label =
        labels[(labels.indexOf(this.state.label) + 1) % labels.length];
      this.refresh();
    });
    this.ui.record = button('Record example', () => this.record());
    this.ui.train = button('Train & use', this.train);
    this.ui.test = button('Test clip', () => this.record(true));
    this.ui.cancel = button('Cancel', this.cancel);
    this.ui.mic = button('Enable microphone', async () => {
      if (this.audio) this.stopMicrophone();
      else await this.enableMicrophone();
      this.refresh();
    });
    const files = new xb.UICard({
      size: {width: 0.72, height: 'auto'},
      style: surface,
      manipulation: true,
      children: [
        text('Settings', 28),
        row(...Object.values(this.ui.modeButtons)),
        row(this.ui.hand, this.ui.test),
        row(this.ui.mic),
        row(
          button('Save here', () => this.browserProject(true)),
          button('Restore', () => this.browserProject(false))
        ),
        row(
          button('Export project', () =>
            this.download(
              this.trainer().exportProject(),
              'interactive-ml-project.json'
            )
          ),
          button('Export TFLite', () => {
            const model = this.models.get(this.state.kind);
            if (!model) throw new Error('Train a model first.');
            this.download(
              new Blob([model.exportTFLite()], {
                type: 'application/octet-stream',
              }),
              `interactive-ml-${model.kind}.tflite`
            );
            this.message(
              'TFLite file saved. Labels and feature details are included.'
            );
          })
        ),
        row(
          button('Import model/project', () => this.importInput.click()),
          button('Undo example', () => {
            this.ensureIdle();
            this.trainer().removeLastExample();
            this.refresh();
            this.message(
              'Last example removed. Train again to update the model.'
            );
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
          backgroundColor: xb.ui.theme.colors.raisedSurface,
          borderRadius: 8,
        },
        children: [text(label, 16), value],
      });
    this.ui.handPredictions = row(
      tile('LEFT HAND', this.ui.left),
      tile('RIGHT HAND', this.ui.right)
    );
    this.ui.soundPrediction = tile('SOUND', this.ui.sound);
    this.ui.status.style.height = 56;
    this.ui.status.style.fontSize = 20;
    this.ui.record.style.backgroundColor = xb.ui.theme.colors.primary;
    const card = new xb.UICard({
      size: {width: 0.72, height: 0.68},
      style: surface,
      manipulation: true,
      children: [
        row(
          this.ui.mode,
          button('Settings', () => {
            files.visible = !files.visible;
          })
        ),
        row(this.ui.label, nextClass),
        this.ui.summary,
        row(this.ui.record, this.ui.train, this.ui.cancel),
        this.ui.status,
        this.ui.model,
        this.ui.handPredictions,
        this.ui.soundPrediction,
        text('One hand teaches both. Add examples, then train again.', 16),
      ],
    });
    card.position.set(0, 1.5, -1.5);
    this.add(card, files);
    this.refresh();
  }

  audioCall(clip) {
    const audio = this.audio;
    if (!audio || audio.pending)
      throw new Error('Audio is unavailable or busy.');
    return new Promise((resolve, reject) => {
      audio.pending = {resolve, reject};
      try {
        audio.worker.postMessage({clip}, clip ? [clip.samples.buffer] : []);
      } catch (error) {
        audio.pending = null;
        reject(error);
      }
    });
  }
  extractor = {
    featureId: YAMNET_FEATURE_ID,
    dimensions: 1024,
    extract: async (clip) => (await this.audioCall(clip)).features,
  };
  async enableMicrophone() {
    if (this.audio || this.closed) return;
    const audio = (this.audio = {
      listener: new xb.AudioListener({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }),
      worker: new Worker(new URL('./audio.worker.js', import.meta.url), {
        type: 'module',
      }),
      pending: null,
      ready: false,
    });
    audio.worker.onmessage = ({data}) => {
      const pending = audio.pending;
      audio.pending = null;
      if (data.error) pending?.reject(new Error(data.error));
      else pending?.resolve(data);
    };
    audio.worker.onerror = audio.worker.onmessageerror = () => {
      if (this.audio !== audio) return;
      this.stopMicrophone();
      this.message('Audio worker failed. Check model downloads and retry.');
    };
    this.message('Loading local sound model and requesting microphone...');
    this.refresh();
    let failure,
      samples,
      offset = 0;
    try {
      await audio.listener.startCapture({
        onError: (error) => {
          failure = error;
        },
        onAudioData: (buffer) => {
          if (this.audio !== audio || !audio.ready) return;
          const sampleRate = audio.listener.audioContext.sampleRate;
          samples ??= new Float32Array(sampleRate);
          for (const value of new Int16Array(buffer)) {
            samples[offset++] = value / 32768;
            if (offset !== samples.length) continue;
            // Skip complete windows while extraction is busy; keep audio contiguous.
            if (!audio.pending) {
              void this.handleAudio({samples, sampleRate}, audio).catch(
                (error) => {
                  if (this.audio === audio) this.message(error.message);
                }
              );
            }
            samples = new Float32Array(sampleRate);
            offset = 0;
          }
        },
      });
      if (this.audio !== audio) return;
      if (failure) throw failure;
      const {backend} = await this.audioCall();
      if (this.audio !== audio) return;
      audio.ready = true;
      this.message(`Sound ready (${backend}). Record one-second examples.`);
    } catch (error) {
      if (this.audio === audio) {
        this.stopMicrophone();
        throw error;
      }
    } finally {
      // The SDK cannot cancel a pending permission request. Release late capture.
      if (this.audio !== audio) audio.listener.cleanup();
      this.refresh();
    }
  }
  async handleAudio(clip, audio) {
    const record =
      this.recording?.key === 'sound' &&
      performance.now() - (clip.samples.length / clip.sampleRate) * 1000 >=
        this.recording.start
        ? this.recording
        : null;
    const model = this.models.get('sound');
    if (!record && !model) return;
    if (record) record.processing = true;
    try {
      const features = await this.extractor.extract(clip);
      if (this.audio !== audio) return;
      if (record && record === this.recording) {
        if (record.test) {
          const result = model.predictFeatures(features, YAMNET_FEATURE_ID);
          this.message(
            `Fresh sound test: expected ${record.label}; predicted ${result.label ?? 'unknown'}.`
          );
        } else {
          this.projects.get('sound').addFeatures(record.label, features);
          this.message(`Added sound example: ${record.label}.`);
        }
      }
      if (model && model === this.models.get('sound')) {
        const result = model.predictFeatures(features, YAMNET_FEATURE_ID);
        this.readings.sound = `${result.label ?? 'unknown'} (${result.score.toFixed(2)})`;
      }
    } finally {
      if (record && record === this.recording) {
        this.clearRecording();
        this.refresh();
      }
    }
  }
  stopMicrophone() {
    const audio = this.audio;
    this.audio = null;
    audio?.listener.cleanup();
    audio?.worker.terminate();
    audio?.pending?.reject(new Error('Microphone stopped.'));
    if (this.recording?.key === 'sound') this.clearRecording();
    this.readings.sound = 'Microphone off';
    this.refresh();
  }
  download(value, name) {
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
  async browserProject(write) {
    this.ensureIdle();
    const projectKey = this.state.kind;
    const value = write ? this.trainer().exportProject() : null;
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
        this.importValue(result);
      }
      this.message(
        write
          ? 'Training project saved in this browser.'
          : 'Training project restored. Train to activate a model.'
      );
    } finally {
      db.close();
    }
  }
  importModel(next) {
    this.ensureIdle();
    if (
      next.kind === 'sound' &&
      (next.featureId !== YAMNET_FEATURE_ID ||
        next.export().classifier.mean.length !== this.extractor.dimensions)
    ) {
      next.dispose();
      throw new Error('This demo uses YAMNet features.');
    }
    this.selectProject(next.kind);
    this.activateModel(next);
    this.message('Model loaded and active.');
  }
  importValue(value) {
    this.ensureIdle();
    if (value?.format === 'xrblocks-interactive-ml') {
      this.importModel(new Predictor(value));
      return;
    }
    const isHand = value?.format === 'xrblocks-interactive-ml-project';
    const next = isHand
      ? HandTrainer.loadProject(value)
      : SoundTrainer.loadProject(value, this.extractor);
    this.selectProject(isHand ? 'hand-pose' : 'sound');
    // A restored dataset has no trained model until the user trains it.
    this.models.get(this.state.kind)?.dispose();
    this.models.delete(this.state.kind);
    this.projects.set(this.state.kind, next);
    this.state.label = Object.keys(next.counts)[0] ?? this.state.label;
    this.refresh();
    this.message('Project loaded. Train to activate a model.');
  }
  async importFile() {
    const file = this.importInput.files[0];
    if (!file) return;
    try {
      this.ensureIdle();
      if (file.size > 20 * 1024 * 1024)
        throw new Error('Use a file smaller than 20 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.ensureIdle();
      if (new TextDecoder().decode(bytes.subarray(4, 8)) === 'TFL3')
        this.importModel(Predictor.fromTFLite(bytes));
      else this.importValue(JSON.parse(new TextDecoder().decode(bytes)));
    } finally {
      this.importInput.value = '';
    }
  }

  static dependencies = {user: xb.User};
  lastSampleMs = -Infinity;
  init({user}) {
    this.user = user;
    xb.ui.theme = 'glimmerOpaque';
    this.buildUI();
    this.importInput.onchange = this.run(this.importFile);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide, {once: true});
  }
  update() {
    if (this.closed || document.hidden) return;
    const now = performance.now();
    this.recordingTick();
    if (this.state.kind === 'hand-pose' && now - this.lastSampleMs >= 40) {
      this.lastSampleMs = now;
      const predicting = this.models.has('hand-pose');
      for (const [hand, handedness] of [
        ['left', xb.Handedness.LEFT],
        ['right', xb.Handedness.RIGHT],
      ]) {
        if (
          predicting ||
          (this.recording?.hand === hand && now >= this.recording.start)
        ) {
          this.receiveHand(hand, captureHand(this.user.hands, handedness, now));
        } else {
          this.readings[hand] = this.user.hands?.hands[handedness]?.visible
            ? 'Tracked / train a model'
            : 'No tracking';
        }
      }
    }
    this.renderPredictions();
  }
  onVisibilityChange = () => {
    if (document.hidden) {
      this.cancel();
      this.stopMicrophone();
    }
  };
  onPageHide = () => {
    void xb.core.dispose();
  };
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.cancel();
    this.stopMicrophone();
    for (const model of this.models.values()) model.dispose();
    this.importInput.onchange = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    super.dispose();
  }
}

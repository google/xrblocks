import * as xb from 'xrblocks';

export class LiveAssistant {
  constructor(onStatus, onTranscript, onStopped) {
    this.onStatus = onStatus;
    this.onTranscript = onTranscript;
    this.onStopped = onStopped;
    this.inputText = '';
    this.outputText = '';
    this.history = [];
    this.running = false;
    this.stopping = false;
    this.cameraUnavailable = false;
    this.cameraTimer = undefined;
  }

  async start() {
    if (this.running) return;
    this.stopping = false;
    this.onStatus('Connecting microphone, camera, and Gemini…');
    try {
      xb.ai.setLiveCallbacks({
        onopen: () => this.onStatus('Connected. Speak naturally.'),
        onmessage: (message) => this.handleMessage(message),
        onerror: (event) => this.handleError(event),
        onclose: () => this.handleClose(),
      });
      await xb.core.sound.enableAudio();
      await xb.ai.startLiveSession();
      this.running = true;
      this.startCameraFrames();
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  async stop() {
    if (!this.running) return;
    this.stopping = true;
    await xb.ai.stopLiveSession();
    this.cleanup();
    this.onStatus('Stopped.');
    this.onStopped();
  }

  startCameraFrames() {
    this.cameraTimer = setInterval(() => void this.sendCameraFrame(), 1000);
  }

  async sendCameraFrame() {
    try {
      const image = await xb.core.deviceCamera?.getSnapshot({
        outputFormat: 'base64',
        mimeType: 'image/jpeg',
        quality: 0.8,
        width: 768,
        height: 432,
      });
      if (!image) return this.reportCameraUnavailable();
      const match = image.match(/^data:([^;,]+)[^,]*,(.*)$/s);
      if (!match) return this.reportCameraUnavailable();
      this.cameraUnavailable = false;
      xb.ai.sendRealtimeInput({video: {mimeType: match[1], data: match[2]}});
    } catch {
      this.reportCameraUnavailable();
    }
  }

  reportCameraUnavailable() {
    if (this.cameraUnavailable) return;
    this.cameraUnavailable = true;
    this.onStatus('Camera frame unavailable; continuing with audio.');
  }

  handleMessage(message) {
    if (message.data) void xb.core.sound.playAIAudio(message.data);
    const content = message.serverContent;
    if (!content) return;
    if (content.inputTranscription?.text) {
      this.inputText += content.inputTranscription.text;
      this.renderTranscript();
    }
    if (content.outputTranscription?.text) {
      this.outputText += content.outputTranscription.text;
      this.renderTranscript();
    }
    if (content.interrupted) {
      xb.core.sound.stopAIAudio();
      this.onStatus('Assistant interrupted.');
    }
    if (content.turnComplete) this.finishTurn();
  }

  finishTurn() {
    if (this.inputText) this.history.push(`You: ${this.inputText}`);
    if (this.outputText) this.history.push(`Assistant: ${this.outputText}`);
    this.inputText = '';
    this.outputText = '';
    this.renderTranscript();
  }

  renderTranscript() {
    const lines = [...this.history];
    if (this.inputText) lines.push(`You: ${this.inputText}`);
    if (this.outputText) lines.push(`Assistant: ${this.outputText}`);
    this.onTranscript(lines.join('\n\n'));
  }

  handleError(event) {
    this.onStatus(event.message || 'Gemini Live failed.');
  }

  handleClose() {
    this.cleanup();
    if (this.stopping) return;
    this.onStatus('Disconnected.');
    this.onStopped();
  }

  cleanup() {
    if (this.cameraTimer) clearInterval(this.cameraTimer);
    this.cameraTimer = undefined;
    this.running = false;
    xb.core.sound.disableAudio();
    xb.core.sound.stopAIAudio();
  }
}

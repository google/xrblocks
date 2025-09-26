import * as xb from 'xrblocks';

import {TranscriptionManager} from './TranscriptionManager.js';

export class GeminiManager extends xb.Script {
  constructor() {
    super();
    this.xrDeviceCamera = null;
    this.transcription = null;
    this.ai = null;
    this.isAIRunning = false;
    this.screenshotInterval = null;
    this.defaultText = '';
  }

  init() {
    this.xrDeviceCamera = xb.core.deviceCamera;
    this.ai = xb.core.ai;
    this.createTextDisplay();
  }

  async toggleGeminiLive() {
    return this.isAIRunning ? this.stopGeminiLive() : this.startGeminiLive();
  }

  async startGeminiLive() {
    if (this.isAIRunning || !this.ai) return;
    try {
      await xb.core.sound.enableAudio();
      await this.startLiveAI();
      this.startScreenshotCapture();
      this.isAIRunning = true;
      this.updateButtonState();
    } catch (error) {
      console.error('Failed to start AI session:', error);
      this.transcription?.addText(
          'Error: Failed to start AI session - ' + error.message);
      this.cleanup();
      this.isAIRunning = false;
      this.updateButtonState();
    }
  }

  async stopGeminiLive() {
    if (!this.isAIRunning) return;
    await this.ai?.stopLiveSession?.();
    this.cleanup();
    this.isAIRunning = false;
    this.updateButtonState();
    this.transcription?.clear();
    this.transcription?.setText(this.defaultText);
  }

  async startLiveAI() {
    return new Promise((resolve, reject) => {
      this.ai.setLiveCallbacks({
        onopen: resolve,
        onmessage: (message) => this.handleAIMessage(message),
        onerror: reject,
        onclose: (closeEvent) => {
          this.cleanup();
          this.isAIRunning = false;
          this.updateButtonState();
          this.transcription?.clear();
          this.transcription?.setText(closeEvent.reason || this.defaultText);
        }
      });
      this.ai.startLiveSession().catch(reject);
    });
  }

  createTextDisplay() {
    this.textPanel = new xb.SpatialPanel(
        {width: 3, height: 1.5, backgroundColor: '#1a1a1abb'});
    const grid = this.textPanel.addGrid();

    const responseDisplay = new xb.ScrollingTroikaTextView(
        {text: this.defaultText, fontSize: 0.03, textAlign: 'left'});
    grid.addRow({weight: 0.7}).add(responseDisplay);
    this.transcription = new TranscriptionManager(responseDisplay);

    this.toggleButton = grid.addRow({weight: 0.3}).addTextButton({
      text: '▶ Start',
      fontColor: '#ffffff',
      backgroundColor: '#006644',
      fontSize: 0.2,
    });
    this.toggleButton.onTriggered = () => this.toggleGeminiLive();

    this.textPanel.position.set(0, 1.2, -2);
    this.add(this.textPanel);
  }

  handleAIMessage(message) {
    message.data && xb.core.sound.playAIAudio(message.data);

    const content = message.serverContent;
    if (content) {
      content.inputTranscription?.text &&
          this.transcription.handleInputTranscription(
              content.inputTranscription.text);
      content.outputTranscription?.text &&
          this.transcription.handleOutputTranscription(
              content.outputTranscription.text);
      content.turnComplete && this.transcription.finalizeTurn();
    }
  }

  startScreenshotCapture() {
    this.screenshotInterval = setInterval(() => {
      const base64Image = this.xrDeviceCamera?.getSnapshot(
          {outputFormat: 'base64', mimeType: 'image/jpeg', quality: 1});
      if (base64Image) {
        const base64Data = base64Image.startsWith('data:') ?
            base64Image.split(',')[1] :
            base64Image;
        try {
          this.ai?.sendRealtimeInput?.(
              {video: {data: base64Data, mimeType: 'image/jpeg'}});
        } catch (error) {
          console.warn(error);
          this.stopGeminiLive();
        }
      }
    }, 1000);
  }

  updateButtonState() {
    this.toggleButton?.setText(this.isAIRunning ? '⏹ Stop' : '▶ Start');
  }

  cleanup() {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
    xb.core.sound?.disableAudio();
    xb.core.sound?.stopAIAudio();
  }

  dispose() {
    this.cleanup();
    super.dispose();
  }
}

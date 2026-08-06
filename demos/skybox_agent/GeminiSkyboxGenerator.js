/* eslint-env browser */
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

import {TranscriptionManager} from './TranscriptionManager.js';

export class GeminiSkyboxGenerator extends xb.Script {
  constructor() {
    super();
    this.transcription = null;
    this.liveAgent = null;
    this.statusText = null;
    this.defaultText =
      "I am a skybox designer agent. Describe the background you want, and I'll render it for you!";
  }

  init() {
    this.createTextDisplay();
    this.createAgent();

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);
  }

  createAgent() {
    this.liveAgent = new xb.SkyboxAgent(
      xb.core.ai,
      xb.core.sound,
      xb.core.scene,
      {
        onSessionStart: () => {
          this.updateButtonState();
          this.updateStatus('Session started - Ready to listen');
        },
        onSessionEnd: () => {
          this.updateButtonState();
          this.transcription?.clear();
          this.transcription?.setText(this.defaultText);
          this.updateStatus('Session ended');
        },
        onError: (error) => {
          this.updateStatus(`Error: ${error.message}`);
          this.transcription?.addText(`✗ Error: ${error.message}`);
        },
      }
    );
  }

  async toggleGeminiLive() {
    const isActive = this.liveAgent?.getSessionState().isActive;
    return isActive ? this.stopGeminiLive() : this.startGeminiLive();
  }

  async startGeminiLive() {
    if (this.liveAgent?.getSessionState().isActive) return;

    try {
      this.updateStatus('Starting session...');

      // Enable audio BEFORE starting the session
      await xb.core.sound.enableAudio();

      // Start live session with callbacks
      await this.liveAgent.startLiveSession({
        onopen: () => {
          this.updateStatus('Connected - Listening...');
        },
        onmessage: (message) => this.handleAIMessage(message),
        onclose: (closeEvent) => {
          this.handleSessionClose(closeEvent);
        },
      });
    } catch (error) {
      this.updateStatus(`Failed to start: ${error.message}`);
      this.transcription?.addText(
        `Error: Failed to start AI session - ${error.message}`
      );
      await this.cleanup();
    }
  }

  async stopGeminiLive() {
    if (!this.liveAgent?.getSessionState().isActive) return;
    await this.cleanup();
  }

  handleSessionClose(closeEvent) {
    if (closeEvent.reason) {
      this.transcription?.addText(closeEvent.reason);
    }
    xb.core.sound?.disableAudio();
    xb.core.sound?.stopAIAudio();
  }

  createTextDisplay() {
    this.textPanel = new xb.SpatialPanel({
      width: 3,
      height: 1.8,
      backgroundColor: '#1a1a1abb',
    });
    const grid = this.textPanel.addGrid();

    const statusRow = grid.addRow({weight: 0.1});
    this.statusText = statusRow.addText({
      text: 'Click Start to begin',
      fontSize: 0.04,
      fontColor: '#4ecdc4',
      textAlign: 'center',
    });

    const responseDisplay = new xb.ScrollingTroikaTextView({
      text: this.defaultText,
      fontSize: 0.03,
      textAlign: 'left',
    });
    grid.addRow({weight: 0.65}).add(responseDisplay);
    this.transcription = new TranscriptionManager(responseDisplay);

    this.toggleButton = grid.addRow({weight: 0.25}).addTextButton({
      text: '▶ Start',
      fontColor: '#ffffff',
      backgroundColor: '#006644',
      fontSize: 0.2,
    });
    this.toggleButton.onTriggered = () => this.toggleGeminiLive();

    this.textPanel.position.set(0, 1.2, -2);
    this.add(this.textPanel);
  }

  async handleAIMessage(message) {
    if (message.data) {
      xb.core.sound.playAIAudio(message.data);
    }

    const content = message.serverContent;
    if (content) {
      if (content.inputTranscription?.text) {
        this.transcription.handleInputTranscription(
          content.inputTranscription.text
        );
      }
      if (content.outputTranscription?.text) {
        this.transcription.handleOutputTranscription(
          content.outputTranscription.text
        );
      }
      if (content.turnComplete) {
        this.transcription.finalizeTurn();
      }
    }

    if (message.toolCall) {
      this.updateStatus('AI is calling a tool...');
      const functionResponses = [];

      for (const fc of message.toolCall.functionCalls) {
        const tool = this.liveAgent.findTool(fc.name);

        if (tool) {
          const promptText = fc.args?.prompt || 'custom scene';
          this.updateStatus(`Generating skybox: ${promptText}...`);

          // Small delay to ensure status is visible before long operation
          await new Promise((resolve) => setTimeout(resolve, 100));

          const result = await tool.execute(fc.args);
          const response = xb.SkyboxAgent.createToolResponse(
            fc.id,
            fc.name,
            result
          );
          functionResponses.push(response);
          if (result.success) {
            this.updateStatus('Skybox generated successfully!');
            this.transcription.addText(`✓ ${result.data || 'Task completed'}`);
          } else {
            this.updateStatus(`Generation failed: ${result.error}`);
            this.transcription.addText(`✗ Error: ${result.error}`);
          }
        } else {
          this.updateStatus(`Tool not found: ${fc.name}`);
          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: {error: `Tool ${fc.name} not found`},
          });
          this.transcription.addText(`✗ Tool not found: ${fc.name}`);
        }
      }

      this.liveAgent.sendToolResponse({functionResponses});
    }
  }

  updateButtonState() {
    const isActive = this.liveAgent?.getSessionState().isActive;
    this.toggleButton?.setText(isActive ? '⏹ Stop' : '▶ Start');
  }

  updateStatus(message) {
    if (this.statusText) {
      this.statusText.text = message;
    }
  }

  async cleanup() {
    if (this.liveAgent?.getSessionState().isActive) {
      try {
        await this.liveAgent.stopLiveSession();
      } catch (e) {
        this.updateStatus(`Error stopping session: ${e.message}`);
      }
    }
    xb.core.sound?.disableAudio();
    xb.core.sound?.stopAIAudio();
  }

  async dispose() {
    await this.cleanup();
    super.dispose();
  }
}

async function requestAudioPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    stream.getTracks().forEach((track) => track.stop());
    return stream;
  } catch (error) {
    this.transcription.addText(
      `✗ Error requesting audio permission: ${error.message}`
    );
    return null;
  }
}

async function start() {
  try {
    await requestAudioPermission();

    const options = new xb.Options();
    options.enableUI();
    options.enableHands();
    options.enableAI();
    options.setAppTitle('Generating Skybox with Gemini');

    xb.init(options);
    xb.add(new GeminiSkyboxGenerator());
  } catch (error) {
    this.transcription.addText(`✗ Error initializing: ${error.message}`);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});

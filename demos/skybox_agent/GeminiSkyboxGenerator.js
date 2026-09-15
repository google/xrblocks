/* eslint-env browser */

import * as THREE from 'three';
import * as xb from 'xrblocks';

import {TranscriptionManager} from './TranscriptionManager.js';

export class GeminiSkyboxGenerator extends xb.Script {
  constructor() {
    super();
    this.transcription = null;
    this.liveAgent = null;
    this.startPending = false;
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
    if (this.startPending || this.liveAgent?.getSessionState().isActive) return;
    this.startPending = true;
    this.toggleButton.disabled = true;

    try {
      this.updateStatus('Starting session...');

      // Enable audio BEFORE starting the session
      await xb.core.sound.enableAudio();
      if (!xb.core.sound.isAudioEnabled()) {
        throw new Error('Microphone capture did not start.');
      }

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
    } finally {
      this.startPending = false;
      this.toggleButton.disabled = false;
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
    this.statusText = new xb.UIText({
      text: 'Click Start to begin',
      style: {
        height: 60,
        fontSize: 24,
        lineHeight: 1.35,
        color: '#4ecdc4',
        textAlign: 'center',
      },
    });

    const responseDisplay = new xb.UIText({
      text: this.defaultText,
      style: {
        flexGrow: 1,
        fontSize: 24,
        lineHeight: 1.35,
        whiteSpace: 'pre-line',
        overflow: 'hidden',
      },
    });
    this.transcription = new TranscriptionManager(responseDisplay);

    this.toggleButton = new xb.UIButton({
      label: 'Start',
      icon: 'mic',
      style: {
        width: '100%',
        height: 80,
        color: '#ffffff',
        backgroundColor: '#006644',
      },
      onClick: () => void this.toggleGeminiLive(),
    });
    this.textPanel = new xb.UICard({
      size: {width: 3, height: 1.8},
      pixelSize: 0.003,
      style: {
        flexDirection: 'column',
        gap: 20,
        padding: 24,
        backgroundColor: '#1a1a1abb',
      },
      children: [this.statusText, responseDisplay, this.toggleButton],
    });

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
    this.toggleButton.label = isActive ? 'Stop' : 'Start';
    this.toggleButton.icon = isActive ? 'stop' : 'mic';
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

async function start() {
  const options = new xb.Options();
  options.enableHands();
  options.enableAI();
  options.setAppTitle('Generating Skybox with Gemini');

  xb.add(new GeminiSkyboxGenerator());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});

import 'xrblocks/addons/simulator/ui/MicButton.js';
import 'xrblocks/addons/simulator/ui/GeminiLiveApiKeyInput.js';

import {css, html, LitElement} from 'lit';
import {createRef, ref} from 'lit/directives/ref.js';
import {ApiKeyEnteredEvent, MicButtonPressedEvent} from 'xrblocks/addons/simulator/ui/GeminiLiveEvents.js';

import {GeminiLiveWebInterface} from './GeminiLiveWebInterface.js';

export class GeminiLivePanel extends LitElement {
  static properties = {
    micRecording: {type: Boolean},
    responseText: {type: String},
  };
  static styles = css`
    :host {
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 60rem;
        -webkit-transform: translateX(-50%);
        transform: translateX(-50%)
    }

    .control-panel {
        width: 30rem;
        height: 3rem;
        display: flex;
        margin: 1rem auto;
        column-gap: 1rem;
    }

    .text-input {
        flex-grow: 1;
        border-radius: 3rem;
        height: 100%;
        background: #00000088;
        border: none;
        color: white;
        padding: 0rem 1rem;
    }

    .material-symbols-outlined {
        font-variation-settings:
        'FILL' 0,
        'wght' 400,
        'GRAD' 0,
        'opsz' 24
    }

    .response-panel-wrapper {
        display: flex;
        flex-direction: row;
        background: #00000088;
        border-radius: 1rem;
        margin: 1rem auto;
        padding: 1rem;
        width: 50rem;
        border: 1px solid #333;
        box-sizing: border-box;
    }

    .response-panel {
        flex-grow: 1;
        padding: 1rem;
        height: 6rem;
        color: white;
        font-family: monospace;
        font-size: 0.9rem;
        line-height: 1.4;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .response-panel::-webkit-scrollbar {
      display: none;
    }
  `;

  textInputRef = createRef();
  responsePanelRef = createRef();

  constructor() {
    super();
    this.micRecording = false;
    this.responseText = '';
    this.apiKey = '';
    this.apiKeyInputElement = null;
    this.addEventListener(
        MicButtonPressedEvent.type, this.onMicButtonClicked.bind(this));
    this.geminiLive = null;

    // For tracking partial transcriptions
    this.currentTranscriptionId = null;
    this.currentTranscriptionText = null;

    if (!this.apiKey) {
      this.showApiKeyPrompt();
      return;
    }
  }

  showApiKeyPrompt() {
    if (this.apiKeyInputElement) {
      console.log('apiKeyInputElement already exists');
      return;
    }
    this.apiKeyInputElement =
        document.createElement('xrblocks-simulator-geminilive-apikeyinput');
    this.apiKeyInputElement.addEventListener(ApiKeyEnteredEvent.type, (e) => {
      console.log('Received key:', e.apiKey);
      this.apiKey = e.apiKey;
      this.apiKeyInputElement.remove();
      this.apiKeyInputElement = null;
      this.onMicButtonClicked();
    });
    document.body.appendChild(this.apiKeyInputElement);
  }

  async connectGeminiLive() {
    const apiKey = this.apiKey;
    if (!apiKey && !this.apiKeyInputElement) {
      this.showApiKeyPrompt();
      return;
    }

    if (!apiKey) {
      return;
    }

    try {
      console.log('Connecting to Gemini Live...');
      this.geminiLive = new GeminiLiveWebInterface(apiKey);
      this.geminiLive.setCallbacks({
        onTranscription: (data) => this.handleTranscription(data),
      });

      this.geminiLive.setScreenCaptureInterval(3000);  // Set to 3 seconds
      const initialized = await this.geminiLive.initialize();
      if (!initialized) {
        console.error(
            'Failed to initialize. Please ensure microphone permissions are granted.');
        return;
      }
      await this.geminiLive.startSession();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }

  async disconnectGeminiLive() {
    if (this.geminiLive) {
      await this.geminiLive.stopSession();
      this.geminiLive.cleanup();
      this.geminiLive = null;
    }
  }

  handleTranscription(data) {
    const timestamp = new Date().toLocaleTimeString();
    if (data.type === 'input' || data.type === 'output') {
      if (data.action === 'create') {
        const typeLabel = data.type === 'input' ? 'You' : 'Gemini';
        const newEntry = `[${timestamp}] ${typeLabel}: ${data.text}`;
        if (data.isPartial) {
          if (this.currentTranscriptionId !== data.id) {
            this.currentTranscriptionId = data.id;
            this.responseText += newEntry + '\n';
          } else {
            const lines = this.responseText.split('\n');
            lines[lines.length - 2] = newEntry;
            this.responseText = lines.join('\n');
          }
        } else {
          this.responseText += newEntry + '\n';
        }
      } else if (data.action === 'update') {
        if (this.currentTranscriptionId === data.id) {
          const typeLabel = data.type === 'input' ? 'You' : 'Gemini';
          const updatedEntry = `[${timestamp}] ${typeLabel}: ${data.text}`;

          const lines = this.responseText.split('\n');
          lines[lines.length - 2] = updatedEntry;
          this.responseText = lines.join('\n');
        }
      } else if (data.action === 'finalize') {
        if (this.currentTranscriptionId === data.id) {
          this.currentTranscriptionId = null;
          this.currentTranscriptionText = null;
        }
      }
    } else if (data.type === 'turnComplete') {
      // Handle turn completion if needed
    }

    this.requestUpdate();
    this.updateComplete.then(() => {
      if (this.responsePanelRef.value) {
        this.responsePanelRef.value.scrollTop =
            this.responsePanelRef.value.scrollHeight;
      }
    });
  }

  firstUpdated() {
    this.textInputRef.value.addEventListener(
        'keydown', this.textInputKeyDown.bind(this));
    if (this.apiKey) {
      this.onMicButtonClicked();
    }
  }

  async onMicButtonClicked() {
    if (this.micRecording) {
      await this.disconnectGeminiLive();
    } else {
      await this.connectGeminiLive();
    }
    if (!this.apiKey) {
      return;
    }
    this.micRecording = !this.micRecording;
  }

  textInputKeyDown(event) {
    if (event.key === 'Enter') {
      const text = event.target.value;
      this.responseText += '\n' + text;
      event.target.value = '';
    }
    event.stopPropagation();
  }

  render() {
    return html`
        <div class="response-panel-wrapper">
            <p class="response-panel" ${ref(this.responsePanelRef)}>${
        this.responseText}</p>
        </div>
        <div class="control-panel">
            <xrblocks-simulator-geminilive-micbutton
                ?micRecording=${this.micRecording}
            ></xrblocks-simulator-geminilive-micbutton>
            <input type="text" class="text-input" placeholder="Ask Gemini" ${
        ref(this.textInputRef)}>
        </div>
    `;
  }
}
customElements.define('xrblocks-simulator-geminilive', GeminiLivePanel);

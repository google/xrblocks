import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';
import { MicButtonPressedEvent } from './GeminiLiveEvents.js';

let MicButton = class MicButton extends LitElement {
    constructor() {
        super(...arguments);
        this.micRecording = false;
    }
    static { this.styles = css `
    .mic-input {
        flex-grow: 0;
        border-radius: 3rem;
        width: 3rem;
        height: 100%;
        background: #00000088;
        color: white;
        border: none;
    }

    .mic-input-icon {
        text-align: center;
        line-height: 3rem;
        width: 100%;
    }

    .material-symbols-outlined {
        font-variation-settings:
        'FILL' 0,
        'wght' 400,
        'GRAD' 0,
        'opsz' 24
    }
  `; }
    onMicButtonClicked() {
        this.dispatchEvent(new MicButtonPressedEvent());
    }
    getHaloCss() {
        return `box-shadow:
            0 0 10px rgba(22,127,56, 0.4),
            0 0 20px rgba(22,127,56, 0.3),
            0 0 30px rgba(22,127,56, 0.2);
    `;
    }
    render() {
        let micInputStyle = '';
        if (this.micRecording) {
            micInputStyle = this.getHaloCss();
        }
        return html `
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=mic" />
        <button class="mic-input" style=${micInputStyle} @click=${this.onMicButtonClicked.bind(this)}>
            <span class="material-symbols-outlined mic-input-icon">
                mic
            </span>
        </button>
    `;
    }
};
__decorate([
    property({ type: Boolean })
], MicButton.prototype, "micRecording", void 0);
MicButton = __decorate([
    customElement('xrblocks-simulator-geminilive-micbutton')
], MicButton);

export { MicButton };

import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { ApiKeyEnteredEvent } from './GeminiLiveEvents.js';

let GeminiLiveApiKeyInput = class GeminiLiveApiKeyInput extends LitElement {
    constructor() {
        super(...arguments);
        this.textInputRef = createRef();
    }
    static { this.styles = css `
    :host {
        position: absolute;
        top: 10%;
        left: 50%;
        -webkit-transform: translate(-50%, -50%);
        transform: translate(-50%, -50%);
        z-index: 1000;
    }

    .info-prompt {
        width: 50rem;
        display: flex;
        background: #00000088;
        margin: 1rem auto;
        padding: 1rem;
        border-radius: 1rem;
        color: white;
        font-size: 0.9rem;
        line-height: 1.4;
        text-align: center;
        justify-content: center;
        align-items: center;
        border: 1px solid #333;
        box-sizing: border-box;
    }

    .text-input {
        display: block;
        width: 20rem;
        height: 3rem;
        border-radius: 3rem;
        background: #00000088;
        border: none;
        color: white;
        padding: 0rem 1rem;
        margin: 0 auto;
        font-size: 0.9rem;
        box-sizing: border-box;
    }

    .text-input::placeholder {
        color: #aaa;
        opacity: 1;
    }

    .text-input:focus {
        outline: none;
        border: 1px solid #555;
    }
  `; }
    firstUpdated() {
        this.textInputRef.value.addEventListener('keydown', this.textInputKeyDown.bind(this));
    }
    textInputKeyDown(event) {
        if (event.key === 'Enter') {
            this.dispatchEvent(new ApiKeyEnteredEvent(event.target.value));
        }
        event.stopPropagation();
    }
    render() {
        return html `
        <p class="info-prompt">
            Gemini Key Required: Please paste your key from Google AI Studio below.
        </p>
        <input type="password" type="text" class="text-input" placeholder="Gemini Key" ${ref(this.textInputRef)}>
    `;
    }
};
GeminiLiveApiKeyInput = __decorate([
    customElement('xrblocks-simulator-geminilive-apikeyinput')
], GeminiLiveApiKeyInput);

export { GeminiLiveApiKeyInput };

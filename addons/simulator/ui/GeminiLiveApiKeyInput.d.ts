import { LitElement } from 'lit';
import { Ref } from 'lit/directives/ref.js';
export declare class GeminiLiveApiKeyInput extends LitElement {
    static styles: import("lit").CSSResult;
    textInputRef: Ref<HTMLInputElement>;
    firstUpdated(): void;
    textInputKeyDown(event: KeyboardEvent): void;
    render(): import("lit-html").TemplateResult<1>;
}

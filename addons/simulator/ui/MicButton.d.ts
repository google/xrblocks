import { LitElement } from 'lit';
export declare class MicButton extends LitElement {
    micRecording: boolean;
    static styles: import("lit").CSSResult;
    onMicButtonClicked(): void;
    getHaloCss(): string;
    render(): import("lit-html").TemplateResult<1>;
}

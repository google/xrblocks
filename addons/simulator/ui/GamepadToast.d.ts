import { LitElement } from 'lit';
export declare function buttonName(index: number): string;
export declare class GamepadToast extends LitElement {
    static styles: import("lit").CSSResult;
    visible: boolean;
    private _timer;
    /** Map of button label → action description. */
    controls: Record<string, string>;
    private _flashMessage;
    show(controls: Record<string, string>, duration?: number): void;
    /** Show a brief single-line message (e.g. "Active Hand: Right"). */
    flash(message: string, duration?: number): void;
    dismiss(): void;
    render(): import("lit-html").TemplateResult<1>;
}

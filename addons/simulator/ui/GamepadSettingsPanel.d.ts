import { LitElement } from 'lit';
import * as xb from 'xrblocks';
export declare class GamepadSettingsPanel extends LitElement {
    static styles: import("lit").CSSResult;
    bindings?: xb.GamepadBindings;
    gamepadController?: xb.GamepadController;
    private _listeningAction;
    private _bindingSnapshot;
    private _focusedIndex;
    private _rafId;
    private _prevStickY;
    private _navPrevButtons;
    private _navJustPressed;
    private _navUpdatePrev;
    private get _totalItems();
    show(): void;
    hide(): void;
    disconnectedCallback(): void;
    private _startNavLoop;
    private _stopNavLoop;
    private _pollNavigation;
    private _moveFocus;
    private _activateFocused;
    private _refreshSnapshot;
    private _startListening;
    private _resetDefaults;
    render(): import("lit-html").TemplateResult<1>;
}

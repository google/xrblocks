import { LitElement } from 'lit';
import * as xb from 'xrblocks';
export declare class SimulatorModeIndicator extends LitElement {
    static styles: import("lit").CSSResult;
    simulatorMode: xb.SimulatorMode;
    getModeName(): xb.SimulatorMode;
    setSimulatorMode(newMode: xb.SimulatorMode): void;
    onClick(): void;
    render(): import("lit-html").TemplateResult<1>;
}

import { LitElement } from 'lit';
import * as xb from 'xrblocks';
export declare class SimulatorSettingsPanel extends LitElement implements xb.ISimulatorSettingsPanelElement {
    static styles: import("lit").CSSResult;
    environments: xb.SimulatorEnvironment[];
    activeEnvironmentIndex: number;
    simulatorMode: xb.SimulatorMode;
    instructionsEnabled: boolean;
    private _isOpen;
    private _togglePanel;
    private _onEnvironmentChange;
    private _onModeChange;
    private _onShowInstructions;
    render(): import("lit-html").TemplateResult<1>;
}

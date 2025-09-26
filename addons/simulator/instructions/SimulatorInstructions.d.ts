import './CustomInstruction.js';
import './HandsInstructions.js';
import './NavigationInstructions.js';
import './UserInstructions.js';
import { LitElement } from 'lit';
import type { SimulatorCustomInstruction } from '../../../simulator/SimulatorOptions.js';
export declare class SimulatorInstructions extends LitElement {
    static styles: import("lit").CSSResult;
    steps: import("lit-html").TemplateResult<1>[];
    customInstructions: SimulatorCustomInstruction[];
    step: number;
    constructor();
    closeInstructions(): void;
    continueButtonClicked(): void;
    render(): import("lit-html").TemplateResult<1>;
}

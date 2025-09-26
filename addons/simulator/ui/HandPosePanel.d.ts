import { LitElement } from 'lit';
import * as xb from 'xrblocks';
export declare class HandPosePanel extends LitElement {
    static styles: import("lit").CSSResult;
    posePanelRef: import("lit-html/directives/ref.js").Ref<Element>;
    handPose: xb.SimulatorHandPose;
    visible: boolean;
    update(changedProperties: Map<string, unknown>): void;
    sendHandPoseRequest(pose: xb.SimulatorHandPose): void;
    /**
     * @returns An array of `TemplateResult` objects, one for each hand pose.
     */
    getHandPoseButtons(): import("lit-html").TemplateResult<1>[];
    onHandPoseChanged(): void;
    scrollToCurrentHandPose(): void;
    render(): import("lit-html").TemplateResult<1>;
}

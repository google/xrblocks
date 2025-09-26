import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';
import {classMap} from 'lit/directives/class-map.js';
import {createRef, ref} from 'lit/directives/ref.js';
import * as xb from 'xrblocks';

@customElement('xrblocks-simulator-hand-pose-panel')
export class HandPosePanel extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      bottom: 0;
      left: 50%;
      -webkit-transform: translateX(-50%);
      transform: translateX(-50%);
      max-width: calc(100% - 24rem);
      width: fit-content;
    }

    .hand-pose-panel {
      box-sizing: border-box;
      border: none;
      margin: 1rem 0px;
      border-radius: 5rem;
      background:rgba(0, 0, 0, 0.5);
      color: #FFF;
      max-width: 100%;
      width: fit-content;
      height: 3rem;
      text-align: center;
      vertical-align: middle;
      padding-left: 1rem;
      padding-right: 1rem;
      white-space: nowrap;
      overflow-y: hidden;
      overflow-x: scroll;
    }

    .hand-pose-panel::-webkit-scrollbar {
      display: none;
    }

    .hand-pose-button {
      color: #FFFFFF44;
      font-size: 1.2em;
      line-height: 3rem;
      background: transparent;
      text-align: center;
      vertical-align: middle;
      border: none;
    }

    .hand-pose-button.selected {
      color: #FFFFFFFF;
    }
  `;

  posePanelRef = createRef();

  // Default to the first hand pose
  @property({type: String})
  handPose: xb.SimulatorHandPose = Object.values(xb.SimulatorHandPose)[0];
  @property({type: Boolean}) visible = true;

  override update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('handPose')) {
      this.onHandPoseChanged();
    }
    super.update(changedProperties);
  }

  sendHandPoseRequest(pose: xb.SimulatorHandPose) {
    this.dispatchEvent(new xb.SimulatorHandPoseChangeRequestEvent(pose));
  }

  /**
   * @returns An array of `TemplateResult` objects, one for each hand pose.
   */
  getHandPoseButtons() {
    const buttons = [];
    for (const pose of Object.values(xb.SimulatorHandPose)) {
      const poseName = xb.SIMULATOR_HAND_POSE_NAMES[pose];
      const classes = {
        'hand-pose-button': true,
        'selected': this.handPose === pose,
      };
      const clickCall = () => this.sendHandPoseRequest(pose);
      buttons.push(html`
        <button class=${classMap(classes)} @click = ${clickCall} data-pose=${
          pose}>${poseName}</button>
      `);
    }
    return buttons;
  }

  onHandPoseChanged() {
    this.scrollToCurrentHandPose();
  }

  scrollToCurrentHandPose() {
    const handPosePanel = this.posePanelRef.value;
    if (!handPosePanel) return;
    const selectedButton = handPosePanel.querySelector(
        `.hand-pose-button[data-pose=${this.handPose}]`);
    if (selectedButton) {
      selectedButton.scrollIntoView(
          {behavior: 'smooth', inline: 'center', block: 'nearest'});
    }
  }

  render() {
    if (!this.visible) {
      return html``;
    }
    const handPoseButtons = this.getHandPoseButtons();
    return html`
    <div class="hand-pose-panel" ${ref(this.posePanelRef)}>
      ${handPoseButtons}
    </div>
    `;
  }
}

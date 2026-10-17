import {css, html, LitElement, type TemplateResult} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';

import {SimulatorMode} from '../../../SimulatorOptions.js';

export interface OverlayInstructionItem {
  keys: string[];
  label: string;
}

export function getOverlayInstructionsForMode(
  mode: SimulatorMode
): OverlayInstructionItem[][] {
  switch (mode) {
    case SimulatorMode.POSE:
      return [
        [{keys: ['W', 'A', 'S', 'D'], label: 'Move'}],
        [{keys: ['Mouse'], label: 'Click and drag to look around'}],
      ];
    case SimulatorMode.POINTER_LOCK:
      return [
        [{keys: ['W', 'A', 'S', 'D'], label: 'Move'}],
        [
          {
            keys: ['Mouse'],
            label: 'Click the screen, then move the mouse to look around',
          },
        ],
      ];
    case SimulatorMode.CONTROLLER:
      return [
        [
          {keys: ['W', 'A', 'S', 'D'], label: 'Move hand'},
          {keys: ['Shift', 'W', 'A', 'S', 'D'], label: 'Move'},
        ],
        [
          {keys: ['Right Click'], label: 'Look'},
          {keys: ['Left Click'], label: 'Rotate hand'},
        ],
        [
          {keys: ['Space'], label: 'Pinch'},
          {keys: ['T'], label: 'Switch hand'},
        ],
      ];
    case SimulatorMode.USER:
    case SimulatorMode.EDITOR:
    default:
      return [
        [{keys: ['W', 'A', 'S', 'D'], label: 'Move'}],
        [
          {keys: ['Right Click'], label: 'Drag to look around'},
          {keys: ['Left Click'], label: 'Select'},
        ],
      ];
  }
}

@customElement('xrblocks-simulator-overlay-instructions')
export class SimulatorOverlayInstructions extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      bottom: 4.75rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      pointer-events: none;
      user-select: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.65rem;
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
      opacity: 0;
      transition: opacity 0.5s ease;
    }

    :host([visible]) {
      opacity: 1;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 1.25rem;
    }

    .group {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .keys {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .key {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-width: 2rem;
      height: 2rem;
      padding: 0 0.55rem;
      border-radius: 0.45rem;
      border: 1.5px solid rgba(255, 255, 255, 0.85);
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      color: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      line-height: 1;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }

    .label {
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
      white-space: nowrap;
    }
  `;

  @property({type: String}) simulatorMode: SimulatorMode = SimulatorMode.USER;

  @property({type: Boolean, reflect: true}) visible = false;

  private renderGroup(item: OverlayInstructionItem): TemplateResult {
    return html`
      <div class="group">
        <div class="keys">
          ${item.keys.map((key) => html`<kbd class="key">${key}</kbd>`)}
        </div>
        <span class="label">${item.label}</span>
      </div>
    `;
  }

  render() {
    const rows = getOverlayInstructionsForMode(this.simulatorMode);
    return html`
      ${rows.map(
        (row) =>
          html`<div class="row">
            ${row.map((item) => this.renderGroup(item))}
          </div>`
      )}
    `;
  }
}

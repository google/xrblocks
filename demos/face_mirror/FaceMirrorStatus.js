import {css, html, LitElement} from 'lit';

export class FaceMirrorStatus extends LitElement {
  static properties = {
    stateText: {type: String},
    blendshapes: {type: Array},
    weights: {type: Object},
  };

  static styles = css`
    :host {
      position: fixed;
      top: 12px;
      right: 12px;
      min-width: 240px;
      padding: 14px 18px;
      background: rgba(15, 18, 25, 0.85);
      color: #f0f0f0;
      font:
        14px/1.5 system-ui,
        sans-serif;
      border-radius: 10px;
      border: 1px solid rgba(71, 150, 227, 0.4);
      z-index: 50;
      max-height: 80vh;
      overflow: hidden;
      box-sizing: border-box;
    }
    .title {
      font-weight: 600;
      color: #00f0ff;
      margin-bottom: 6px;
    }
    .state {
      color: #a0aec0;
      margin-bottom: 10px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 2px 0;
    }
    .label {
      width: 130px;
      font-size: 12px;
      color: #ccc;
    }
    .track {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: linear-gradient(90deg, #4796e3, #9b5de5);
      width: 0%;
      transition: width 0.1s ease;
    }
  `;

  constructor() {
    super();
    this.stateText = 'Loading model...';
    this.blendshapes = [];
    this.weights = {};
  }

  updateState(statusText) {
    this.stateText = statusText;
  }

  updateBars(face) {
    const nextWeights = {};
    for (const name of this.blendshapes) {
      nextWeights[name] = face.getBlendshape(name);
    }
    this.weights = nextWeights;
  }

  resetBars() {
    const nextWeights = {};
    for (const name of this.blendshapes) {
      nextWeights[name] = 0;
    }
    this.weights = nextWeights;
  }

  render() {
    return html`
      <div class="title">FACE LANDMARKER</div>
      <div class="state">${this.stateText}</div>
      <div id="bars">
        ${this.blendshapes.map((name) => {
          const val = this.weights[name] || 0;
          const pct = (val * 100).toFixed(0) + '%';
          return html`
            <div class="row">
              <div class="label">${name}</div>
              <div class="track">
                <div class="fill" style="width: ${pct}"></div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }
}

customElements.define('face-mirror-status', FaceMirrorStatus);

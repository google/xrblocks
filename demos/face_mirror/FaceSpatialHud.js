import * as THREE from 'three';
import {HeadLeashBehavior, UIPanel, UIText} from 'uiblocks';
import {FEATURED_BLENDSHAPES} from './FaceMeshIndices.js';

export class FaceSpatialHud {
  constructor(uiCore) {
    this.uiCore = uiCore;
    this.init();
  }

  init() {
    this.hudCard = this.uiCore.createCard({
      name: 'FaceHudCard',
      sizeX: 0.6,
      sizeY: 0.5,
      behaviors: [
        new HeadLeashBehavior({
          offset: new THREE.Vector3(0.85, 0.35, -1.1),
          posLerp: 0.1,
          rotLerp: 0.1,
        }),
      ],
    });

    const hudPanel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(15, 18, 25, 0.85)',
      innerShadowColor: 'rgba(100, 180, 255, 0.15)',
      innerShadowBlur: 80,
      strokeWidth: 3,
      strokeColor: {
        gradientType: 'linear',
        rotation: 45,
        stops: [
          {position: 0, color: '#4796e3'},
          {position: 1, color: '#9b5de5'},
        ],
      },
      cornerRadius: 24,
      padding: 24,
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
    });

    this.titleText = new UIText('FACE LANDMARKER', {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#00f0ff',
      textAlign: 'center',
      width: '100%',
    });

    this.spatialStateText = new UIText('Loading model...', {
      fontSize: 18,
      color: '#a0aec0',
      textAlign: 'center',
      width: '100%',
      paddingBottom: 12,
    });

    const separator = new UIPanel({
      width: '100%',
      height: 2,
      fillColor: 'rgba(255, 255, 255, 0.15)',
      marginBottom: 12,
    });

    hudPanel.add(this.titleText, this.spatialStateText, separator);

    this.spatialBars = new Map();
    for (const name of FEATURED_BLENDSHAPES) {
      const fill = new UIPanel({
        flexGrow: 0,
        height: '100%',
        fillColor: '#4796e3',
        cornerRadius: 5,
      });
      const spacer = new UIPanel({
        flexGrow: 1,
        height: '100%',
      });
      hudPanel.add(
        new UIPanel({
          width: '100%',
          height: 26,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 4,
        }).add(
          new UIText(name, {fontSize: 15, color: '#cccccc', width: 180}),
          new UIPanel({
            flexGrow: 1,
            flexShrink: 1,
            height: 10,
            fillColor: 'rgba(255, 255, 255, 0.15)',
            cornerRadius: 5,
            flexDirection: 'row',
            alignItems: 'stretch',
          }).add(fill, spacer)
        )
      );
      this.spatialBars.set(name, {fill, spacer});
    }
    this.hudCard.add(hudPanel);
  }

  updateState(statusText) {
    if (this.spatialStateText) {
      this.spatialStateText.setText(statusText);
    }
  }

  updateBars(face) {
    if (!this.lastBarValues) this.lastBarValues = new Map();
    for (const name of FEATURED_BLENDSHAPES) {
      const v = face.getBlendshape(name);
      // Skip writing to the uikit panels when the value hasn't moved
      // by more than 0.5%. Each setProperties triggers a layout pass
      // via the yoga wasm bridge; on a 12-bar HUD that's ~24 layouts
      // per detection at ~30fps. With this gate a held expression
      // (eyes blink, brows neutral) collapses to one or two writes.
      const prev = this.lastBarValues.get(name);
      if (prev !== undefined && Math.abs(v - prev) < 0.005) continue;
      this.lastBarValues.set(name, v);

      const spatial = this.spatialBars.get(name);
      if (spatial) {
        spatial.fill.setProperties({flexGrow: v});
        spatial.spacer.setProperties({flexGrow: 1 - v});
      }
    }
  }

  resetBars() {
    if (this.lastBarValues) this.lastBarValues.clear();
    for (const spatial of this.spatialBars.values()) {
      spatial.fill.setProperties({flexGrow: 0});
      spatial.spacer.setProperties({flexGrow: 1});
    }
  }
}

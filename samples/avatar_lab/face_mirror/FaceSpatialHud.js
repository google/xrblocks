import * as THREE from 'three';
import * as xb from 'xrblocks';

import {FEATURED_BLENDSHAPES} from './FaceMeshIndices.js';

export class FaceSpatialHud {
  constructor(owner) {
    this.init(owner);
  }

  init(owner) {
    this.spatialStateText = new xb.UIText({
      text: 'Loading model...',
      style: {fontSize: 18, textAlign: 'center'},
    });

    this.spatialBars = new Map();
    const bars = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        flexDirection: 'column',
        gap: 4,
      },
    });
    for (const name of FEATURED_BLENDSHAPES) {
      const fill = new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          width: '0%',
          height: '100%',
          flexShrink: 0,
          alignSelf: 'flex-start',
          backgroundColor: xb.ui.theme.colors.primary,
          borderRadius: 5,
        },
      });
      bars.add(
        new xb.UIPanel({
          style: {
            width: '100%',
            height: 22,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            overflow: 'hidden',
          },
          children: [
            new xb.UIText({
              text: name,
              style: {
                width: 180,
                flexShrink: 0,
                fontSize: 15,
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              },
            }),
            new xb.UIPanel({
              pointerEvents: 'none',
              style: {
                width: 300,
                flexShrink: 0,
                height: 10,
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                backgroundColor: xb.ui.theme.colors.raisedSurface,
                borderRadius: 5,
                overflow: 'hidden',
              },
              children: [fill],
            }),
          ],
        })
      );
      this.spatialBars.set(name, fill);
    }

    this.hudCard = new xb.UICard({
      size: {width: 0.6, height: 0.5},
      children: [
        createExitXRButton(),
        new xb.UIText({
          text: 'FACE LANDMARKER',
          style: {
            fontSize: 32,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        this.spatialStateText,
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            width: '100%',
            height: 2,
            backgroundColor: xb.ui.theme.colors.outline,
          },
        }),
        bars,
      ],
    });
    this.hudCard.name = 'FaceHudCard';
    this.hudCard.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0.85, 0.35, -1.1),
        smoothing: 0.1,
      }),
      new xb.FaceCamera({mode: 'spherical', smoothing: 0.1})
    );
    owner.add(this.hudCard);
  }

  updateState(statusText) {
    this.spatialStateText.text = statusText;
  }

  updateBars(face) {
    if (!this.lastBarValues) this.lastBarValues = new Map();
    for (const name of FEATURED_BLENDSHAPES) {
      const value = THREE.MathUtils.clamp(face.getBlendshape(name), 0, 1);
      const previous = this.lastBarValues.get(name);
      if (previous !== undefined && Math.abs(value - previous) < 0.005) {
        continue;
      }
      this.lastBarValues.set(name, value);
      const fill = this.spatialBars.get(name);
      if (fill) fill.style.width = `${value * 100}%`;
    }
  }

  resetBars() {
    this.lastBarValues?.clear();
    for (const fill of this.spatialBars.values()) {
      fill.style.width = '0%';
    }
  }
}

function createExitXRButton() {
  return new xb.UIButton({
    label: 'X',
    ariaLabel: 'Exit XR',
    pointerEvents: 'auto',
    style: {
      position: 'absolute',
      top: -48,
      left: 0,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(30, 30, 36, 0.92)',
      borderColor: 'rgba(255, 255, 255, 0.25)',
      borderWidth: 1.5,
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 'bold',
      justifyContent: 'center',
      alignItems: 'center',
    },
    onClick: async () => {
      const session = xb.core?.renderer?.xr?.getSession?.();
      if (!session) return;
      try {
        await session.end();
      } catch {
        // Ignore errors when ending the XR session.
      }
    },
  });
}

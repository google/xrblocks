import * as THREE from 'three';
import * as xb from 'xrblocks';

import {DepthVisualizationPass} from './DepthVisualizationPass.js';

export class DepthMapScene extends xb.Script {
  static dependencies = {
    camera: THREE.Camera,
    depth: xb.Depth,
  };

  async init({camera, depth}) {
    if (!xb.core.effects) {
      throw new Error('Depth Map requires post-processing.');
    }

    this.depth = depth;
    this.depthVisPass = new DepthVisualizationPass(xb.scene, camera);
    if (xb.isWebGPURenderer(xb.core.renderer)) {
      await this.depthVisPass.initWebGPU();
    }
    xb.core.effects.addPass(this.depthVisPass);
    this.depthVisPass.setAlpha(1);
    this.add(
      createDepthOpacityControl((opacity) => {
        this.depthVisPass.setAlpha(opacity);
      })
    );

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    this.add(light);
  }

  update() {
    this.depthVisPass.updateEnvironmentalDepthTexture(this.depth);
  }
}

function createDepthOpacityControl(onInput) {
  const valueText = new xb.UIText({
    text: '100%',
    style: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'right',
    },
  });
  const header = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    children: [
      new xb.UIText({
        text: 'DEPTH OPACITY',
        style: {fontSize: 24, fontWeight: 'bold'},
      }),
      valueText,
    ],
  });
  const slider = new xb.UISlider({
    ariaLabel: 'Depth opacity',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    style: {width: '100%', height: 42, borderRadius: 14},
    onInput: (opacity) => {
      valueText.text = `${Math.round(opacity * 100)}%`;
      onInput(opacity);
    },
  });
  const overlay = new xb.UIOverlay({
    style: {
      width: 620,
      position: 'absolute',
      left: '50%',
      bottom: 32,
      transform: {translateX: '-50%'},
      flexDirection: 'column',
      gap: 8,
    },
    children: [createExitXRButton(), header, slider],
  });
  overlay.name = 'Depth opacity control';
  return overlay;
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

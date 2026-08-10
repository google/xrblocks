import * as THREE from 'three';
import * as xb from 'xrblocks';

class DepthMeshVisualizer extends xb.Script {
  constructor() {
    super();
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    this.add(light);
  }

  init() {
    xb.core.depth.depthMesh.material.uniforms.uOpacity.value = 1;
    this.add(
      createDepthOpacityControl((opacity) => {
        xb.core.depth.depthMesh.material.uniforms.uOpacity.value = opacity;
      })
    );
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
    children: [header, slider],
  });
  overlay.name = 'Depth opacity control';
  return overlay;
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.setAppTitle('Depth Mesh');
  options.depth = new xb.DepthOptions(xb.xrDepthMeshVisualizationOptions);
  options.depth.depthTypeRequest = [xb.getUrlParameter('depthType') ?? 'raw'];
  xb.add(new DepthMeshVisualizer());
  xb.init(options);
});

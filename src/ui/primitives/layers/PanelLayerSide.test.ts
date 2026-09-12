import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {PanelShaderMaterial} from './PanelLayer';
import {GradientFillFragmentShader} from '../../shaders/GradientFill.frag';
import {GradientStrokeFragmentShader} from '../../shaders/GradientStroke.frag';
import {GradientDropShadowFragmentShader} from '../../shaders/GradientDropShadow.frag';
import {GradientInnerShadowFragmentShader} from '../../shaders/GradientInnerShadow.frag';

describe('PanelShaderMaterial side', () => {
  it('renders visual layers on the front side by default', () => {
    expect(new PanelShaderMaterial().side).toBe(THREE.FrontSide);
  });

  it('clips custom panel paints with the same ancestor planes as text and hit surfaces', () => {
    const material = new PanelShaderMaterial();
    expect(material.clipping).toBe(true);
    expect(material.vertexShader).toContain(
      '#include <clipping_planes_vertex>'
    );
    for (const fragment of [
      GradientFillFragmentShader,
      GradientStrokeFragmentShader,
      GradientDropShadowFragmentShader,
      GradientInnerShadowFragmentShader,
    ]) {
      expect(fragment).toContain('#include <clipping_planes_pars_fragment>');
      expect(fragment).toContain('float clippingAlpha = panelClipAlpha()');
      expect(fragment).toContain('gl_FragColor.a *= clippingAlpha');
    }
    material.dispose();
  });
});

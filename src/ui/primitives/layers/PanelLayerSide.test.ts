import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {PanelShaderMaterial} from './PanelLayer';

describe('PanelShaderMaterial side', () => {
  it('renders visual layers on the front side by default', () => {
    expect(new PanelShaderMaterial().side).toBe(THREE.FrontSide);
  });
});

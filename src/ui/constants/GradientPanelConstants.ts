import * as THREE from 'three';

export const MAX_GRADIENT_STOPS = 4;

export const DEFAULT_GRADIENT_PANEL_PROPS = {
  cornerRadius: 0.0,

  fillColor: 'rgba(0,0,0,0)',

  innerShadowColor: 'rgba(0,0,0,0)',
  innerShadowBlur: 0.0,
  innerShadowPosition: new THREE.Vector2(0, 0),
  innerShadowSpread: 0.0,
  innerShadowFalloff: 1.0,

  dropShadowColor: 'rgba(0,0,0,0)',
  dropShadowBlur: 0.0,
  dropShadowPosition: new THREE.Vector2(0, 0),
  dropShadowSpread: 0.0,
  dropShadowFalloff: 1.0,

  strokeColor: 'rgba(0,0,0,0)',
  strokeWidth: 0.0,
  strokeAlign: 'center',
} as const;

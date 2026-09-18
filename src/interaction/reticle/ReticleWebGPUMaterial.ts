import * as THREE from 'three';
import {
  clamp,
  dFdx,
  dFdy,
  Discard,
  distance,
  float,
  Fn,
  length,
  max,
  mix,
  smoothstep,
  step,
  sub,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import {NodeMaterial} from 'three/webgpu';

import type {Reticle} from './Reticle';

/**
 * Applies a WebGPU NodeMaterial to a reticle and synchronizes uniform changes.
 *
 * @param reticle - The reticle to configure with a WebGPU material.
 */
export function applyWebGPUReticleMaterial(reticle: Reticle): void {
  const uColor = uniform(new THREE.Color().copy(reticle.uniforms.uColor.value));
  const uPressed = uniform(reticle.uniforms.uPressed.value);

  const fragmentNode = Fn(() => {
    const dist = distance(uv(), vec2(0.5, 0.5));
    Discard(dist.greaterThan(0.45));

    const antialiasDist = max(
      length(vec2(dFdx(dist), dFdy(dist))),
      float(0.001)
    );
    const outerRadius = sub(float(0.5), antialiasDist);
    const clampedOuterDelta = clamp(
      sub(dist, outerRadius),
      float(0.0),
      antialiasDist
    );
    const outerAlpha = sub(float(1.0), clampedOuterDelta.div(antialiasDist));

    const innerBaseColor = vec4(uColor.mul(0.5), 0.5);
    const pressedInnerColor = vec4(uColor, 1.0);
    const innerGradientColor = vec4(0.054, 0.054, 0.054, 1.0);
    const outerRingColor = vec4(0.077, 0.077, 0.077, 1.0);
    const gradientEnd = float(0.46);
    const gradientStart = float(0.33);
    const pressedInnerRadius = float(0.41);

    const unpressedInnerColor = mix(
      innerBaseColor,
      innerGradientColor,
      smoothstep(gradientStart, gradientEnd, dist)
    );
    const unpressedColor = mix(
      unpressedInnerColor,
      outerRingColor,
      step(gradientEnd, dist)
    );

    const smoothDistance = antialiasDist.mul(4.0);
    const percentToInnerRad = max(
      sub(pressedInnerRadius, dist),
      float(0.0)
    ).div(pressedInnerRadius);
    const pressedColorT = clamp(
      sub(
        sub(float(1.0), percentToInnerRad),
        sub(float(1.0), smoothDistance)
      ).div(smoothDistance),
      float(0.0),
      float(1.0)
    );
    const pressedColor = mix(pressedInnerColor, outerRingColor, pressedColorT);
    const finalColor = mix(unpressedColor, pressedColor, uPressed);

    const premultiplied = finalColor.mul(outerAlpha);
    const alpha = premultiplied.w;
    return vec4(premultiplied.xyz.div(max(alpha, float(0.001))), alpha);
  })();

  const material = new NodeMaterial();
  material.fragmentNode = fragmentNode;
  material.transparent = true;
  material.depthTest = reticle.depthTestEnabled;
  material.depthWrite = false;

  reticle.setCustomMaterial(material, () => {
    uColor.value.copy(reticle.uniforms.uColor.value);
    uPressed.value = reticle.uniforms.uPressed.value;
  });
}

import * as THREE from 'three';
import {
  clamp,
  float,
  Fn,
  materialOpacity,
  max,
  positionWorld,
  select,
  texture as tslTexture,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';

import type {Shader, ShaderUniforms} from '../../utils/Types';

type MaterialWithOpacityNode = THREE.Material & {
  opacityNode?: unknown;
};

/**
 * Configures a `THREE.Material` for depth occlusion under `THREE.WebGPURenderer`
 * by attaching a TSL `opacityNode` and returning a `Shader`-compatible uniform
 * handle that can be registered in `Depth.occludableShaders`.
 *
 * @param material - The material to make occludable.
 * @returns A `Shader` object whose `uniforms` stay synchronized with the TSL nodes.
 */
export function addWebGPUOcclusionToMaterial(material: THREE.Material): Shader {
  material.transparent = true;

  const placeholderTexture = new THREE.DataTexture(
    new Uint8Array([255, 255, 0, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  placeholderTexture.needsUpdate = true;

  const uOcclusionEnabled = uniform(1.0);
  const clipFromWorldMatrix = new THREE.Matrix4();
  const uOcclusionClipFromWorld = uniform(clipFromWorldMatrix);

  const clipCoord = uOcclusionClipFromWorld.mul(vec4(positionWorld, 1.0));
  const ndc = clipCoord.xy.div(max(float(0.0001), clipCoord.w));
  const occlusionCoords = vec2(
    ndc.x.mul(0.5).add(0.5),
    float(0.5).sub(ndc.y.mul(0.5))
  );
  const occlusionMapNode = tslTexture(placeholderTexture, occlusionCoords);

  const opacityNode = Fn(() => {
    const sampleRg = occlusionMapNode;
    const normalizedSample = sampleRg.r.div(max(float(0.0001), sampleRg.g));
    const occlusionValue = clamp(normalizedSample, float(0.0), float(1.0));
    const occlusionFactor = select(
      uOcclusionEnabled.greaterThan(0.5),
      occlusionValue,
      float(1.0)
    );
    return materialOpacity.mul(occlusionFactor);
  })();

  (material as MaterialWithOpacityNode).opacityNode = opacityNode;
  material.needsUpdate = true;

  let currentOcclusionEnabled = true;
  let currentOcclusionMap: THREE.Texture | null = placeholderTexture;

  const uniforms: ShaderUniforms = {
    occlusionEnabled: {
      get value() {
        return currentOcclusionEnabled;
      },
      set value(enabled: boolean) {
        currentOcclusionEnabled = Boolean(enabled);
        uOcclusionEnabled.value = currentOcclusionEnabled ? 1.0 : 0.0;
      },
    },
    tOcclusionMap: {
      get value() {
        return currentOcclusionMap;
      },
      set value(tex: THREE.Texture | null) {
        currentOcclusionMap = tex;
        occlusionMapNode.value = tex ?? placeholderTexture;
      },
    },
    uOcclusionClipFromWorld: {
      value: clipFromWorldMatrix,
    },
  };

  return {
    uniforms,
    vertexShader: '',
    fragmentShader: '',
  };
}

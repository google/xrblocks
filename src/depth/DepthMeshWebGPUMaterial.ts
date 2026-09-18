import * as THREE from 'three';
import {
  clamp,
  dot,
  float,
  Fn,
  max,
  mix,
  normalLocal,
  normalize,
  positionView,
  pow,
  reflect,
  step,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {NodeMaterial} from 'three/webgpu';

import type {DepthMesh} from './DepthMesh';

function turboColormap(x_immutable: Parameters<typeof float>[0]) {
  const x = float(x_immutable);
  const kRedVec4 = vec4(0.55305649, 3.00913185, -5.46192616, -11.11819092);
  const kGreenVec4 = vec4(0.16207513, 0.17712472, 15.240915, -36.5065796);
  const kBlueVec4 = vec4(-0.05195877, 5.18000081, -30.94853351, 81.96403246);
  const kRedVec2 = vec2(27.81927491, -14.87899417);
  const kGreenVec2 = vec2(25.95549545, -5.02738237);
  const kBlueVec2 = vec2(-86.5347657, 30.23299484);

  const v4 = vec4(1.0, x, x.mul(x), x.mul(x).mul(x));
  const v2 = vec2(v4.z.mul(v4.z), v4.w.mul(v4.z));
  return vec3(
    dot(v4, kRedVec4).add(dot(v2, kRedVec2)),
    dot(v4, kGreenVec4).add(dot(v2, kGreenVec2)),
    dot(v4, kBlueVec4).add(dot(v2, kBlueVec2))
  );
}

/**
 * Applies a WebGPU TSL NodeMaterial to a DepthMesh for debug/texture visualization.
 *
 * @param depthMesh - The DepthMesh instance to configure.
 */
export function applyWebGPUDepthMeshMaterial(depthMesh: DepthMesh): void {
  const srcUniforms = depthMesh.depthTextureUniforms;
  if (!srcUniforms) return;

  const uColor = uniform(new THREE.Color().copy(srcUniforms.uColor.value));
  const uLightDirection = uniform(
    new THREE.Vector3().copy(srcUniforms.uLightDirection.value)
  );
  const uOpacity = uniform(srcUniforms.uOpacity.value);
  const uDebug = uniform(srcUniforms.uDebug.value);
  const uMinDepth = uniform(srcUniforms.uMinDepth.value);
  const uMaxDepth = uniform(srcUniforms.uMaxDepth.value);
  const uRawValueToMeters = uniform(srcUniforms.uRawValueToMeters.value);

  const placeholderTexture = new THREE.DataTexture(
    new Float32Array([0]),
    1,
    1,
    THREE.RedFormat,
    THREE.FloatType
  );
  placeholderTexture.needsUpdate = true;
  const viewUv = vec2(uv().x, float(1.0).sub(uv().y));
  const depthTextureNode = tslTexture(
    srcUniforms.uDepthTexture.value ?? placeholderTexture,
    viewUv
  );

  const fragmentNode = Fn(() => {
    const lightDir = normalize(uLightDirection);
    const n = normalize(normalLocal);
    const ambient = uColor.mul(0.1);
    const diff = max(dot(n, lightDir), float(0.0)).mul(uColor);
    const viewDir = normalize(positionView.negate());
    const reflectDir = reflect(lightDir.negate(), n);
    const spec = pow(
      max(dot(viewDir, reflectDir), float(0.0)),
      float(16.0)
    ).mul(0.5);
    const finalColor = ambient.add(diff).add(vec3(spec));
    const debugOutput = vec4(finalColor, float(1.0)).mul(uOpacity);

    const sampledDepth = depthTextureNode.r.mul(uRawValueToMeters).mul(8.0);
    const normalizedDepth = clamp(
      sampledDepth
        .sub(uMinDepth)
        .div(max(uMaxDepth.sub(uMinDepth), float(0.0001))),
      float(0.0),
      float(1.0)
    );
    const depthOutput = vec4(turboColormap(normalizedDepth), float(1.0)).mul(
      uOpacity
    );

    return mix(depthOutput, debugOutput, step(float(0.5), uDebug));
  })();

  const material = new NodeMaterial();
  material.fragmentNode = fragmentNode;
  material.side = THREE.DoubleSide;
  material.transparent = true;
  material.forceSinglePass = true;

  depthMesh.setCustomMaterial(material, () => {
    uColor.value.copy(srcUniforms.uColor.value);
    uLightDirection.value.copy(srcUniforms.uLightDirection.value);
    uOpacity.value = srcUniforms.uOpacity.value;
    uDebug.value = srcUniforms.uDebug.value;
    uMinDepth.value = srcUniforms.uMinDepth.value;
    uMaxDepth.value = srcUniforms.uMaxDepth.value;
    uRawValueToMeters.value = srcUniforms.uRawValueToMeters.value;
    if (srcUniforms.uDepthTexture.value) {
      depthTextureNode.value = srcUniforms.uDepthTexture.value;
    }
  });
}

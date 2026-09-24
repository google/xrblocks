import * as THREE from 'three';
import {
  clamp,
  dot,
  float,
  Fn,
  mix,
  select,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {NodeMaterial, QuadMesh} from 'three/webgpu';

function turboColormap(x_immutable) {
  const x = clamp(float(x_immutable).mul(0.9).add(0.03), 0.0, 1.0);
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
 * Creates a WebGPU QuadMesh + TSL NodeMaterial for depth map visualization.
 *
 * @param {object} srcUniforms - Uniform dictionary from DepthVisualizationPass.
 * @returns {{quadMesh: QuadMesh, syncUniforms: () => void, dispose: () => void}}
 */
export function createWebGPUDepthVisualizationQuad(srcUniforms) {
  const uRawValueToMeters = uniform(srcUniforms.uRawValueToMeters.value);
  const uAlpha = uniform(srcUniforms.uAlpha.value);
  const uUsingFloatDepth = uniform(
    srcUniforms.uUsingFloatDepth.value ? 1.0 : 0.0
  );
  const uNormDepthBufferFromNormView = uniform(
    new THREE.Matrix4().copy(srcUniforms.uNormDepthBufferFromNormView.value)
  );

  const placeholderDiffuse = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  placeholderDiffuse.needsUpdate = true;

  const placeholderDepth = new THREE.DataTexture(
    new Float32Array([0]),
    1,
    1,
    THREE.RedFormat,
    THREE.FloatType
  );
  placeholderDepth.needsUpdate = true;

  const diffuseTextureNode = tslTexture(
    srcUniforms.tDiffuse.value ?? placeholderDiffuse,
    uv()
  );

  // QuadMesh's QuadGeometry already defines UV origin at the top-left
  // (uv.y = 0 at top, 1 at bottom), matching WebXR normalized view coordinates.
  const viewUv = uv();
  const depthUv = uNormDepthBufferFromNormView.mul(vec4(viewUv, 0.0, 1.0)).xy;
  const depthTextureNode = tslTexture(
    srcUniforms.uDepthTexture.value ?? placeholderDepth,
    depthUv
  );

  const fragmentNode = Fn(() => {
    const diffuse = diffuseTextureNode;
    const floatDepthMeters = depthTextureNode.r.mul(uRawValueToMeters);
    const packedDepthMeters = dot(
      depthTextureNode.rg,
      vec2(255.0, 256.0 * 255.0)
    ).mul(uRawValueToMeters);
    const realDepth = select(
      uUsingFloatDepth.greaterThan(0.5),
      floatDepthMeters,
      packedDepthMeters
    );
    const depthVisualization = vec4(
      turboColormap(clamp(realDepth.div(8.0), 0.0, 1.0)),
      1.0
    );
    const visualizationAlpha = uAlpha.mul(float(1.0).sub(diffuse.a));
    return mix(diffuse, depthVisualization, visualizationAlpha);
  })();

  const material = new NodeMaterial();
  material.name = 'DepthMapWebGPUShader';
  material.fragmentNode = fragmentNode;
  material.depthTest = false;
  material.depthWrite = false;

  const quadMesh = new QuadMesh(material);

  const syncUniforms = () => {
    uRawValueToMeters.value = srcUniforms.uRawValueToMeters.value;
    uAlpha.value = srcUniforms.uAlpha.value;
    uUsingFloatDepth.value = srcUniforms.uUsingFloatDepth.value ? 1.0 : 0.0;
    uNormDepthBufferFromNormView.value.copy(
      srcUniforms.uNormDepthBufferFromNormView.value
    );
    if (srcUniforms.tDiffuse.value) {
      diffuseTextureNode.value = srcUniforms.tDiffuse.value;
    }
    if (srcUniforms.uDepthTexture.value) {
      depthTextureNode.value = srcUniforms.uDepthTexture.value;
    }
  };

  const dispose = () => {
    material.dispose();
    placeholderDiffuse.dispose();
    placeholderDepth.dispose();
  };

  return {quadMesh, syncUniforms, dispose};
}

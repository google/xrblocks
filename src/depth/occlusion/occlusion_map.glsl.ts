// Postprocessing to convert a render texture + depth map into an occlusion map.
export const OcclusionMapShader = {
  name: 'OcclusionMapShader',
  defines: {},

  vertexShader: /* glsl */ `
varying vec2 vTexCoord;

void main() {
    vTexCoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
  `,

  fragmentShader: /* glsl */ `
#include <packing>

precision mediump float;

uniform sampler2D uDepthTexture;
uniform mat4 uUvTransform;
uniform float uRawValueToMeters;
uniform float uAlpha;
uniform float uViewId;
uniform bool uFloatDepth;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;

varying vec2 vTexCoord;

float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
  // Depth is packed into the luminance and alpha components of its texture.
  // The texture is in a normalized format, storing raw values that need to be
  // converted to meters.
  vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
  if (uFloatDepth) {
    return packedDepthAndVisibility.r * uRawValueToMeters;
  }
  return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * uRawValueToMeters;
}

float readOrthographicDepth( sampler2D depthSampler, vec2 coord ) {
  float fragCoordZ = texture2D( depthSampler, coord ).x;
  // See https://github.com/mrdoob/three.js/issues/23072.
  #ifdef USE_LOGDEPTHBUF
    float viewZ = 1.0 - exp2(fragCoordZ * log(cameraFar + 1.0) / log(2.0));
  #else
    float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
  #endif
  return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
}

void main(void) {
  vec4 texCoord = vec4(vTexCoord, 0, 1);
  vec2 uv = texCoord.xy;
  uv.y = 1.0 - uv.y;

  vec4 diffuse = texture2D( tDiffuse, texCoord.xy );
  highp float real_depth = DepthGetMeters(uDepthTexture, uv);
  highp float virtual_depth =
    (readOrthographicDepth(tDepth, texCoord.xy ) *
    (cameraFar - cameraNear) + cameraNear);
  gl_FragColor = vec4(step(virtual_depth, real_depth), step(0.001, diffuse.a), 0.0, 0.0);
}
`

};

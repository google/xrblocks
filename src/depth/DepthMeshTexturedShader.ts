export const DepthMeshTexturedShader = {
  name: 'DepthMeshTexturedShader',
  vertexShader: /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  vNormal = normal;

  // Computes the view position.
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}
`,
  fragmentShader: /* glsl */ `
#include <packing>

uniform vec3 uColor;
uniform sampler2D uDepthTexture;
uniform vec3 uLightDirection;
uniform vec2 uResolution;
uniform float uRawValueToMeters;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

const highp float kMaxDepthInMeters = 8.0;
const float kInvalidDepthThreshold = 0.01;
uniform float uMinDepth;
uniform float uMaxDepth;
uniform float uDebug;
uniform float uOpacity;
uniform bool uUsingFloatDepth;

float saturate(in float x) {
  return clamp(x, 0.0, 1.0);
}

vec3 TurboColormap(in float x) {
  const vec4 kRedVec4 = vec4(0.55305649, 3.00913185, -5.46192616, -11.11819092);
  const vec4 kGreenVec4 = vec4(0.16207513, 0.17712472, 15.24091500, -36.50657960);
  const vec4 kBlueVec4 = vec4(-0.05195877, 5.18000081, -30.94853351, 81.96403246);
  const vec2 kRedVec2 = vec2(27.81927491, -14.87899417);
  const vec2 kGreenVec2 = vec2(25.95549545, -5.02738237);
  const vec2 kBlueVec2 = vec2(-86.53476570, 30.23299484);

  // Adjusts color space via 6 degree poly interpolation to avoid pure red.
  vec4 v4 = vec4( 1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  return vec3(
    dot(v4, kRedVec4)   + dot(v2, kRedVec2),
    dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
    dot(v4, kBlueVec4)  + dot(v2, kBlueVec2)
  );
}

// Depth is packed into the luminance and alpha components of its texture.
// The texture is in a normalized format, storing raw values that need to be
// converted to meters.
float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
  if (uUsingFloatDepth) {
    return texture2D(depth_texture, depth_uv).r * uRawValueToMeters;
  }
  vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
  return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * uRawValueToMeters;
}

vec3 DepthGetColorVisualization(in float x) {
  return step(kInvalidDepthThreshold, x) * TurboColormap(x);
}

void main() {
  vec3 lightDirection = normalize(uLightDirection);

  // Compute UV coordinates relative to resolution
  // vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 uv = vUv;

  // Ambient, diffuse, and specular terms
  vec3 ambient = 0.1 * uColor;
  float diff = max(dot(vNormal, lightDirection), 0.0);
  vec3 diffuse = diff * uColor;

  vec3 viewDir = normalize(vViewPosition);
  vec3 reflectDir = reflect(-lightDirection, vNormal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
  vec3 specular = vec3(0.5) * spec; // Adjust specular color/strength

  // Combine Phong lighting
  vec3 finalColor = ambient + diffuse + specular;
  // finalColor = vec3(vNormal);

  // Output color
  gl_FragColor = uOpacity * vec4(finalColor, 1.0);

  if (uDebug > 0.5) {
    return;
  }

  vec2 depth_uv = uv;
  depth_uv.y = 1.0 - depth_uv.y;

  float depth = DepthGetMeters(uDepthTexture, depth_uv) * 8.0;
  float normalized_depth =
    saturate((depth - uMinDepth) / (uMaxDepth - uMinDepth));
  gl_FragColor = uOpacity * vec4(TurboColormap(normalized_depth), 1.0);
}
`
};

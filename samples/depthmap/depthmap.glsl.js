export const DepthMapShader = {
  name: 'DepthMapShader',
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
  uniform sampler2DArray uDepthTextureArray;
  uniform float uRawValueToMeters;
  uniform float uAlpha;
  uniform float uIsTextureArray;
  uniform int uView;
  uniform float uDepthNear;
  uniform bool uUsingFloatDepth;
  uniform mat4 uNormDepthBufferFromNormView;

  uniform sampler2D tDiffuse;
  uniform float cameraNear;
  uniform float cameraFar;

  varying vec2 vTexCoord;

  float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
    if (uUsingFloatDepth) {
      return uRawValueToMeters * texture2D(depth_texture, depth_uv).r;
    }
    vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
    return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * uRawValueToMeters;
  }

  float DepthArrayGetMeters(in sampler2DArray depth_texture, in vec2 depth_uv) {
    float textureValue = texture(depth_texture, vec3(depth_uv.x, depth_uv.y, uView)).r;
    return uRawValueToMeters * uDepthNear / (1.0 - textureValue);
  }

  vec3 TurboColormap(in float x) {
    const vec4 kRedVec4 = vec4(0.55305649, 3.00913185, -5.46192616, -11.11819092);
    const vec4 kGreenVec4 = vec4(0.16207513, 0.17712472, 15.24091500, -36.50657960);
    const vec4 kBlueVec4 = vec4(-0.05195877, 5.18000081, -30.94853351, 81.96403246);
    const vec2 kRedVec2 = vec2(27.81927491, -14.87899417);
    const vec2 kGreenVec2 = vec2(25.95549545, -5.02738237);
    const vec2 kBlueVec2 = vec2(-86.53476570, 30.23299484);

    // Adjusts color space via 6 degree poly interpolation to avoid pure red.
    x = clamp(x * 0.9 + 0.03, 0.0, 1.0);
    vec4 v4 = vec4( 1.0, x, x * x, x * x * x);
    vec2 v2 = v4.zw * v4.z;
    return vec3(
      dot(v4, kRedVec4)   + dot(v2, kRedVec2),
      dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
      dot(v4, kBlueVec4)  + dot(v2, kBlueVec2)
    );
  }

  void main(void) {
    vec4 texCoord = vec4(vTexCoord, 0, 1);
    vec2 uv = texCoord.xy;

    vec4 diffuse = texture2D( tDiffuse, texCoord.xy );
    highp float real_depth;
    if (uIsTextureArray < 0.5) {
      vec2 view_uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
      vec2 depth_uv = (uNormDepthBufferFromNormView * vec4(view_uv, 0.0, 1.0)).xy;
      real_depth = DepthGetMeters(uDepthTexture, depth_uv);
    } else {
      real_depth = DepthArrayGetMeters(uDepthTextureArray, uv);
    }
    vec4 depth_visualization = vec4(
      TurboColormap(clamp(real_depth / 8.0, 0.0, 1.0)), 1.0);
    gl_FragColor = mix(diffuse, depth_visualization, uAlpha);
  }
`,
};

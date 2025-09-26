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
  uniform float uRawValueToMeters;
  uniform float uAlpha;

  uniform sampler2D tDiffuse;
  uniform float cameraNear;
  uniform float cameraFar;

  varying vec2 vTexCoord;

  float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
    // Assume we're using floating point depth.
    return uRawValueToMeters * texture2D(depth_texture, depth_uv).r;
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
    uv.y = 1.0 - uv.y;

    vec4 diffuse = texture2D( tDiffuse, texCoord.xy );
    highp float real_depth = DepthGetMeters(uDepthTexture, uv);
    vec4 depth_visualization = vec4(
      TurboColormap(clamp(real_depth / 8.0, 0.0, 1.0)), 1.0);
    gl_FragColor = mix(diffuse, depth_visualization, uAlpha);
  }
`
};

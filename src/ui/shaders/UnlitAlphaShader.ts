/**
 * A basic, performant shader for rendering textures with transparency.
 *
 * This shader does not react to scene lighting ("Unlit"), making it ideal for
 * UI elements, sprites, or other objects that should maintain their original
 * texture colors regardless of lighting conditions. It supports both per-pixel
 * alpha from the texture and a global opacity uniform for fading effects.
 */
export const UnlitAlphaShader = {
  uniforms: {uTexture: {value: null}, uOpacity: {value: 1.0}},

  vertexShader: /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,
  fragmentShader: /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
  }
`
};

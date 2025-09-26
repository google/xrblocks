// Postprocessing shader which applies occlusion onto the entire rendered frame.
export const OcclusionShader = {
  name: 'OcclusionShader',
  defines: {},
  vertexShader: /* glsl */ `
varying vec2 vTexCoord;

void main() {
    vTexCoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
    `,
  fragmentShader: /* glsl */ `
precision mediump float;

uniform sampler2D tDiffuse;
uniform sampler2D tOcclusionMap;

varying vec2 vTexCoord;

void main(void) {
  vec4 diffuse = texture2D(tDiffuse, vTexCoord);
  vec4 occlusion = texture2D(tOcclusionMap, vTexCoord);
  float occlusionValue = occlusion.r / max(0.0001, occlusion.g);
  occlusionValue = clamp(occlusionValue, 0.0, 1.0);
  gl_FragColor = occlusionValue * diffuse;

  gl_FragColor = sRGBTransferOETF( gl_FragColor );
}
`
};

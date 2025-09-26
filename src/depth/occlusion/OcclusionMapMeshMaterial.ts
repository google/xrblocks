
import * as THREE from 'three';

export class OcclusionMapMeshMaterial extends THREE.MeshBasicMaterial {
  uniforms: {[uniform: string]: THREE.IUniform};

  constructor(camera: THREE.PerspectiveCamera, useFloatDepth: boolean) {
    super();
    this.uniforms = {
      uDepthTexture: {value: null},
      uRawValueToMeters: {value: 8.0 / 65536.0},
      cameraFar: {value: camera.far},
      cameraNear: {value: camera.near},
      uFloatDepth: {value: useFloatDepth},
    };
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      this.uniforms = shader.uniforms;
      shader.vertexShader =
          shader.vertexShader
              .replace(
                  '#include <common>',
                  [
                    'varying vec2 vTexCoord;', 'varying float vVirtualDepth;',
                    '#include <common>'
                  ].join('\n'))
              .replace('#include <fog_vertex>', [
                '#include <fog_vertex>',
                'vec4 view_position = modelViewMatrix * vec4( position, 1.0 );',
                'vVirtualDepth = -view_position.z;',
                'gl_Position = gl_Position / gl_Position.w;',
                'vTexCoord = 0.5 + 0.5 * gl_Position.xy;'
              ].join('\n'));
      shader.fragmentShader =
          shader.fragmentShader
              .replace(
                  'uniform vec3 diffuse;',
                  [
                    'uniform vec3 diffuse;', 'uniform sampler2D uDepthTexture;',
                    'uniform float uRawValueToMeters;',
                    'uniform float cameraNear;', 'uniform float cameraFar;',
                    'uniform bool uFloatDepth;', 'varying vec2 vTexCoord;',
                    'varying float vVirtualDepth;'
                  ].join('\n'))
              .replace(
                  '#include <clipping_planes_pars_fragment>',
                  [
                    '#include <clipping_planes_pars_fragment>', `
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
`
                  ].join('\n'))
              .replace('#include <dithering_fragment>', [
                '#include <dithering_fragment>',
                'vec4 texCoord = vec4(vTexCoord, 0, 1);',
                'vec2 uv = vec2(texCoord.x, 1.0 - texCoord.y);',
                'highp float real_depth = DepthGetMeters(uDepthTexture, uv);',
                'gl_FragColor = vec4(step(vVirtualDepth, real_depth), 1.0, 0.0, 1.0);'
              ].join('\n'));
    };
  }
}

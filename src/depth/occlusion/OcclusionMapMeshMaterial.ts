import * as THREE from 'three';

export class OcclusionMapMeshMaterial extends THREE.MeshBasicMaterial {
  uniforms: {[uniform: string]: THREE.IUniform};

  constructor(camera: THREE.PerspectiveCamera, useFloatDepth: boolean) {
    super();
    this.uniforms = {
      uDepthTexture: {value: null},
      uDepthTextureArray: {value: null},
      uViewId: {value: 0.0},
      uIsTextureArray: {value: 0.0},
      uRawValueToMeters: {value: 8.0 / 65536.0},
      cameraFar: {value: camera.far},
      cameraNear: {value: camera.near},
      uFloatDepth: {value: useFloatDepth},
      uDepthViewMatrix: {value: camera.matrixWorldInverse.clone()},
      uDepthProjectionMatrix: {value: camera.projectionMatrix.clone()},
      // Used for interpreting Quest 3 depth.
      uDepthNear: {value: 0},
    };
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      this.uniforms = shader.uniforms;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          [
            'uniform mat4 uDepthProjectionMatrix;',
            'uniform mat4 uDepthViewMatrix;',
            'varying vec2 vTexCoord;',
            'varying float vVirtualDepth;',
            '#include <common>',
          ].join('\n')
        )
        .replace(
          '#include <fog_vertex>',
          [
            '#include <fog_vertex>',
            'vec4 world_position = modelMatrix * vec4( position, 1.0 );',
            'vec4 depth_view_position = uDepthViewMatrix * world_position;',
            'vVirtualDepth = -depth_view_position.z;',
            'vec4 depth_clip_position = uDepthProjectionMatrix * depth_view_position;',
            'vec2 depth_ndc = depth_clip_position.xy / max(0.00001, depth_clip_position.w);',
            'vTexCoord = 0.5 + 0.5 * depth_ndc;',
          ].join('\n')
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'uniform vec3 diffuse;',
          [
            'uniform vec3 diffuse;',
            'uniform sampler2D uDepthTexture;',
            'uniform sampler2DArray uDepthTextureArray;',
            'uniform float uRawValueToMeters;',
            'uniform float cameraNear;',
            'uniform float cameraFar;',
            'uniform bool uFloatDepth;',
            'uniform bool uIsTextureArray;',
            'uniform float uDepthNear;',
            'uniform int uViewId;',
            'varying vec2 vTexCoord;',
            'varying float vVirtualDepth;',
          ].join('\n')
        )
        .replace(
          '#include <clipping_planes_pars_fragment>',
          [
            '#include <clipping_planes_pars_fragment>',
            `
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
  float DepthArrayGetMeters(in sampler2DArray depth_texture, in vec2 depth_uv) {
    float textureValue = texture(depth_texture, vec3(depth_uv.x, depth_uv.y, uViewId)).r;
    return uRawValueToMeters * uDepthNear / (1.0 - textureValue);
  }
`,
          ].join('\n')
        )
        .replace(
          '#include <dithering_fragment>',
          [
            '#include <dithering_fragment>',
            'vec4 texCoord = vec4(vTexCoord, 0, 1);',
            'vec2 uv = vec2(texCoord.x, uIsTextureArray?texCoord.y:(1.0 - texCoord.y));',
            'highp float real_depth = uIsTextureArray ? DepthArrayGetMeters(uDepthTextureArray, uv) : DepthGetMeters(uDepthTexture, uv);',
            'bool outOfBounds = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || vVirtualDepth <= 0.0;',
            'float isNotOccluded = outOfBounds ? 1.0 : step(vVirtualDepth, real_depth);',
            'gl_FragColor = vec4(isNotOccluded, 1.0, 0.0, 1.0);',
          ].join('\n')
        );
    };
  }
}

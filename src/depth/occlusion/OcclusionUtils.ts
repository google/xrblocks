import * as THREE from 'three';
import type {Shader} from '../../utils/Types';

export class OcclusionUtils {
  /**
   * Creates a simple material used for rendering objects into the occlusion
   * map. This material is intended to be used with `renderer.overrideMaterial`.
   * @returns A new instance of THREE.MeshBasicMaterial.
   */
  static createOcclusionMapOverrideMaterial() {
    return new THREE.MeshBasicMaterial();
  }

  /**
   * Modifies a material's shader in-place to incorporate distance-based
   * alpha occlusion. This is designed to be used with a material's
   * `onBeforeCompile` property. This only works with built-in three.js
   * materials.
   * @param shader - The shader object provided by onBeforeCompile.
   */
  static addOcclusionToShader(shader: Shader) {
    shader.uniforms.occlusionEnabled = {value: true};
    shader.uniforms.tOcclusionMap = {value: null};
    shader.uniforms.uOcclusionClipFromWorld = {value: new THREE.Matrix4()};
    shader.defines = {USE_UV: true, DISTANCE: true};
    shader.vertexShader =
        shader.vertexShader
            .replace(
                '#include <common>',
                [
                  'uniform mat4 uOcclusionClipFromWorld;',
                  'varying vec4 vOcclusionScreenCoord;', '#include <common>'
                ].join('\n'))
            .replace('#include <fog_vertex>', [
              '#include <fog_vertex>',
              'vOcclusionScreenCoord = uOcclusionClipFromWorld * worldPosition;',
            ].join('\n'));
    shader.fragmentShader =
        shader.fragmentShader
            .replace(
                'uniform vec3 diffuse;',
                [
                  'uniform vec3 diffuse;',
                  'uniform bool occlusionEnabled;',
                  'uniform sampler2D tOcclusionMap;',
                  'varying vec4 vOcclusionScreenCoord;',
                ].join('\n'))
            .replace('vec4 diffuseColor = vec4( diffuse, opacity );', [
              'vec4 diffuseColor = vec4( diffuse, opacity );',
              'vec2 occlusion_coordinates = 0.5 + 0.5 * vOcclusionScreenCoord.xy / vOcclusionScreenCoord.w;',
              'vec2 occlusion_sample = texture2D(tOcclusionMap, occlusion_coordinates.xy).rg;',
              'occlusion_sample = occlusion_sample / max(0.0001, occlusion_sample.g);',
              'float occlusion_value = clamp(occlusion_sample.r, 0.0, 1.0);',
              'diffuseColor.a *= occlusionEnabled ? occlusion_value : 1.0;',
            ].join('\n'));
  }
}
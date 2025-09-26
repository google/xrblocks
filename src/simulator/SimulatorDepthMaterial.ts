import * as THREE from 'three';

export class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
  override onBeforeCompile(
      shader:
          {vertexShader: string, fragmentShader: string, uniforms: object}) {
    shader.vertexShader =
        shader.vertexShader
            .replace(
                '#include <clipping_planes_pars_vertex>',
                [
                  '#include <clipping_planes_pars_vertex>',
                  'varying vec4 vViewCoordinates;'
                ].join('\n'))
            .replace('#include <project_vertex>', [
              '#include <project_vertex>', 'vViewCoordinates = mvPosition;'
            ].join('\n'));
    shader.fragmentShader =
        shader.fragmentShader
            .replace(
                '#include <clipping_planes_pars_fragment>',
                [
                  '#include <clipping_planes_pars_fragment>',
                  'varying vec4 vViewCoordinates;'
                ].join('\n'))
            .replace('#include <dithering_fragment>', [
              '#include <dithering_fragment>',
              'gl_FragColor = vec4(-vViewCoordinates.z, 0.0, 0.0, 1.0);'
            ].join('\n'));
  }
}
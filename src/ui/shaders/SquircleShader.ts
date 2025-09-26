import * as THREE from 'three';

/**
 * Shader for the non-interactive Panel background.
 *
 * This shader renders a simple, anti-aliased rounded rectangle (squircle). It
 * can display either a solid background color or a texture map. It is more
 * performant than the SpatialPanelShader as it omits all interactive highlight
 * calculations.
 */
export const SquircleShader = {
  uniforms: {
    'uMainTex': {value: null},
    'uUseImage': {value: 0.0},
    'uBackgroundColor': {
      value: new THREE.Vector4(0.4, 0.8, 1.0, 1.0),
    },
    'uBoxSize': {value: new THREE.Vector2(0.5, 0.5)},
    'uRadius': {value: 0.05},
    'uOpacity': {value: 1.0}
  },

  vertexShader: /* glsl */ `
    #define USE_UV
    #include <common>
    #include <batching_pars_vertex>
    #include <uv_pars_vertex>
    #include <envmap_pars_vertex>
    #include <color_pars_vertex>
    #include <fog_pars_vertex>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    #include <logdepthbuf_pars_vertex>
    #include <clipping_planes_pars_vertex>

    void main() {
      #include <uv_vertex>
      #include <color_vertex>
      #include <morphinstance_vertex>
      #include <morphcolor_vertex>
      #include <batching_vertex>

      #if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )

        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>

      #endif

      #include <begin_vertex>
      #include <morphtarget_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
      #include <logdepthbuf_vertex>
      #include <clipping_planes_vertex>

      #include <worldpos_vertex>
      #include <envmap_vertex>
      #include <fog_vertex>
    }
  `,

  fragmentShader: /* glsl */ `
    precision mediump float;

    uniform sampler2D uMainTex;
    uniform vec4 uBackgroundColor;
    uniform vec2 uBoxSize;
    uniform float uRadius;
    uniform float uUseImage;
    uniform float uOpacity;

    #define USE_UV
    #include <common>
    #include <dithering_pars_fragment>
    #include <color_pars_fragment>
    #include <uv_pars_fragment>
    #include <map_pars_fragment>
    #include <alphamap_pars_fragment>
    #include <alphatest_pars_fragment>
    #include <alphahash_pars_fragment>
    #include <aomap_pars_fragment>
    #include <lightmap_pars_fragment>
    #include <envmap_common_pars_fragment>
    #include <envmap_pars_fragment>
    #include <fog_pars_fragment>
    #include <specularmap_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    #include <clipping_planes_pars_fragment>

    // Distance function for rounded box.
    float distRoundBox(vec2 p, vec2 b, float r) {
      return length(max(abs(p) - b + r, 0.0)) - r;
    }

    void main(void) {
      #include <clipping_planes_fragment>

      #include <logdepthbuf_fragment>
      #include <map_fragment>
      #include <color_fragment>
      #include <alphamap_fragment>
      #include <alphatest_fragment>
      #include <alphahash_fragment>
      #include <specularmap_fragment>
      vec2 size = uBoxSize * 1000.0;

      // Calculates the adjusted radius based on box size.
      float radius = min(size.x, size.y) * (0.05 + uRadius);
      vec2 half_size = 0.5 * size;

      // Compute the distance from the rounded box edge.
      float dist = distRoundBox(vUv * size - half_size, half_size, radius);

      // Use lerp for smooth color transition based on distance.
      vec4 colorInside = uBackgroundColor;

      if (uUseImage > 0.5) {
        colorInside = texture2D(uMainTex, vUv);
        colorInside.a = 1.0;
      }

      // Transparent black for outside.
      vec4 colorOutside = vec4(0.0, 0.0, 0.0, 0.0);

      vec4 finalColor = mix(colorInside, colorOutside, smoothstep(0.0, 1.0, dist));

      // Return premultiplied alpha.
      gl_FragColor = uOpacity * finalColor.a * vec4(finalColor.rgb, 1.0);
    }
  `
};

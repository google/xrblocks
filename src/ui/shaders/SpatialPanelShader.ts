import * as THREE from 'three';

/**
 * Shader for the interactive SpatialPanel UI component.
 *
 * This shader renders a rounded rectangle (squircle) that can display a
 * background color or texture. Its key feature is the ability to render
 * dynamic, radial "glow" highlights at the location of up to two controller
 * reticles. The highlight is constrained to the panel's border, providing clear
 * visual feedback for dragging and interaction.
 */
export const SpatialPanelShader = {
  uniforms: {
    'uMainTex': {value: null},
    'uUseImage': {value: 0.0},
    'uBackgroundColor': {
      value: new THREE.Vector4(0.4, 0.8, 1.0, 1.0),
    },
    'uBoxSize': {value: new THREE.Vector2(0.5, 0.5)},
    'uRadius': {value: 0.05},
    'uReticleUVs': {value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5)},
    'uSelected': {value: new THREE.Vector2(0.0, 0.0)},
    'uBorderWidth': {value: 0.1},
    'uHighlightRadius': {value: 0.2},
    'uOutlineWidth': {value: 0.01},
    'uOpacity': {value: 1.0}
  },

  vertexShader: /* glsl */ `
    varying vec2 vTexCoord;

    void main() {
      vTexCoord = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,

  fragmentShader: /* glsl */ `
    precision mediump float;

    uniform sampler2D uMainTex;
    uniform vec4 uBackgroundColor;
    uniform vec2 uBoxSize;
    uniform float uRadius;
    uniform float uUseImage;

    uniform vec4 uReticleUVs;
    uniform vec2 uSelected;
    uniform float uBorderWidth;
    uniform float uHighlightRadius;
    uniform float uOutlineWidth;
    uniform float uOpacity;

    varying vec2 vTexCoord;

    // Distance function for rounded box.
    float distRoundBox(vec2 p, vec2 b, highp float r) {
      return length(max(abs(p) - b + r, 0.0)) - r;
    }

    vec4 highlight(in vec4 baseColor, in vec4 colorOutside,
                   in float distOuterUV, in float aa, in vec2 mouse, in float selected) {

      vec4 highlightColor = vec4(0.0);
      float normDist = 1.0; // Initialize outside the highlight range
      bool mousePressed = selected > 0.0;
      bool mouseHovering = selected <= 0.0 && length(uReticleUVs.xy) > 0.0;
      bool mouseNearBorder = (mouseHovering || mousePressed);
      vec4 finalColor = baseColor;

      if (mouseNearBorder) {
        // Scale mouse and fragment coordinates by the inverse of uBoxSize

        vec2 fragAspect = vTexCoord;
        fragAspect.x *= uBoxSize.x / uBoxSize.y;
        vec2 mouseAspect = mouse;
        mouseAspect.x *= uBoxSize.x / uBoxSize.y;

        // Calculate vector from mouse to fragment in aspect-corrected space
        vec2 diffAspect = fragAspect - mouseAspect;

        // Calculate the distance in the aspect-corrected space
        float distToMouseAspect = length(diffAspect);

        // Normalized distance from mouse within the highlight radius
        normDist = distToMouseAspect / uHighlightRadius;

        // Define highlight color
        float innerWhite = mousePressed ? 0.9 : 0.8;

        // Radial gradient calculation
        float radialFactor = smoothstep(1.0, 0.0, normDist); // 1 at center, 0 at edge
        highlightColor = vec4(vec3(innerWhite), 1.0) * vec4(vec3(1.0), radialFactor);

        // Calculate distance to the inner edge of the border in UV space
        float distInnerUV = distRoundBox(
          (vTexCoord - 0.5) * uBoxSize,
          (uBoxSize - uBorderWidth) * 0.5, 0.5 * uRadius);

        float highlightEdgeSharpness = 200.0;
        float innerHighlightAmount = clamp(highlightEdgeSharpness * -distOuterUV, 0.0, 1.0);
        float outerHighlightAmount = clamp(highlightEdgeSharpness * distInnerUV, 0.0, 1.0);
        float highlightAmount = min(innerHighlightAmount, outerHighlightAmount);
        vec4 highlightColor = mix(finalColor, finalColor + highlightColor, highlightColor.a);
        finalColor = mix(finalColor, highlightColor, highlightAmount);
      }
      return finalColor;
    }

    void main(void) {
      vec2 size = uBoxSize * 1000.0;
      float radius = min(size.x, size.y) * (0.05 + uRadius);
      vec2 half_size = 0.5 * size;

      // Distance to the outer edge of the round box in UV space (0-1)
      float distOuterUV = distRoundBox(vTexCoord * uBoxSize - uBoxSize * 0.5, uBoxSize * 0.5, uRadius);

      // Antialiasing delta
      float aa = fwidth(distOuterUV) * 0.8;

      // Base color: opaque inside, transparent outside
      vec4 colorInside = uBackgroundColor;
      if (uUseImage > 0.5) {
          colorInside = texture2D(uMainTex, vTexCoord);
          colorInside.a = 1.0;
      }
      vec4 colorOutside = vec4(0.0, 0.0, 0.0, 0.0);
      vec4 baseColor = mix(colorInside, colorOutside, smoothstep(0.0, aa, distOuterUV));

      vec4 finalColor1 = highlight(baseColor, colorOutside, distOuterUV, aa, uReticleUVs.xy, uSelected.x);
      vec4 finalColor2 = highlight(baseColor, colorOutside, distOuterUV, aa, uReticleUVs.zw, uSelected.y);

      gl_FragColor = uOpacity * max(finalColor1, finalColor2);
    }
  `
};

import * as THREE from 'three';

/**
 * Shader for the Reticle UI component.
 *
 * This shader renders a dynamic, anti-aliased circle that provides visual
 * feedback for user interaction. It can smoothly transition between a hollow
 * ring (idle/hover state) and a solid, shrinking circle (pressed state).
 * The anti-aliasing is achieved using screen-space derivatives (fwidth) to
 * ensure crisp edges at any resolution or distance.
 */
export const ReticleShader = {
  name: 'ReticleShader',
  uniforms: {
    'uColor': {value: new THREE.Color().setHex(0xFFFFFF)},
    'uPressed': {value: 0.0},
  },

  vertexShader: /* glsl */ `
  varying vec2 vTexCoord;

  void main() {
    vTexCoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    // Makes the position slightly closer to avoid z fighting.
    gl_Position.z -= 0.1;
  }
`,
  fragmentShader: /* glsl */ `
  precision mediump float;

  uniform sampler2D uDepthTexture;
  uniform vec3 uColor;
  uniform float uPressed;

  varying vec2 vTexCoord;

  void main(void) {
    // Distance from center of quad.
    highp float dist = distance(vTexCoord, vec2(0.5f, 0.5f));
    if (dist > 0.45) discard;

    // Get the rate of change of dist on x and y.
    highp vec2 dist_grad = vec2(dFdx(dist), dFdy(dist));
    highp float grad_magnitude = length(dist_grad);
    highp float antialias_dist = max(grad_magnitude, 0.001f);

    // Outer radius is 0.5, but we want to bring it in a few pixels so we have room
    // for a gradient outward to anti-alias the circle.
    // These "few pixels" are determined by our derivative calculation above.
    highp float outerradius = 0.5f - antialias_dist;
    highp float delta_to_outer = dist - outerradius;
    highp float clamped_outer_delta = clamp(delta_to_outer, 0.0f, antialias_dist);
    highp float outer_alpha = 1.0f - (clamped_outer_delta / antialias_dist);

    // #FFFFFF = (1,1,1)
    // #FFFFFF with 0.5 alpha = (((1,1,1) * 0.5), 0.5)
    vec4 inner_base_color = vec4(0.5 * uColor, 0.5);
    vec4 pressed_inner_color = vec4(uColor, 1.0);
    // #505050 = (0.077,0.077,0.077)
    // #505050 with 0.7 alpha = (((0.077,0.077,0.077)*0.7), 0.7)
    const vec4 inner_gradient_color = vec4(0.054, 0.054, 0.054, 1.0);
    const vec4 outer_ring_color = vec4(0.077, 0.077, 0.077, 1.0);
    // 0.5 - stoke_width (0.75dp = 0.04 approx)
    const float gradient_end = 0.46;
    // 73% of gradient_end
    const float gradient_start = 0.33;
    // gradient_end - 130% stoke_width. Additional 30% to account for the down scaling.
    const float pressed_inner_radius = 0.41;

    vec4 unpressed_inner_color =
            mix(inner_base_color, inner_gradient_color,
                    smoothstep(gradient_start, gradient_end, dist));
    vec4 unpressed_color =
            mix(unpressed_inner_color, outer_ring_color,
                    step(gradient_end, dist));

    // Builds a smooth gradient to fade between colors.
    highp float smooth_distance = antialias_dist * 4.0;
    float percent_to_inner_rad = max(pressed_inner_radius - dist, 0.0) / pressed_inner_radius;
    highp float pressed_color_t = 1.0 - percent_to_inner_rad;
    pressed_color_t -= (1.0 - smooth_distance);
    pressed_color_t *= (1.0 / smooth_distance);
    pressed_color_t = clamp(pressed_color_t, 0.0, 1.0);
    vec4 pressed_color = mix(pressed_inner_color, outer_ring_color, pressed_color_t);

    vec4 final_color = mix(unpressed_color, pressed_color, uPressed);
    gl_FragColor = final_color * outer_alpha;
    // Converts to straight alpha.
    gl_FragColor.rgb = gl_FragColor.rgb / max(gl_FragColor.a, 0.001);
  }
`
};

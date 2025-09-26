import * as THREE from 'three';

export class LinearGradientMaterial extends THREE.ShaderMaterial {
  constructor() {
    const options = {
      uniforms: {
        time: {value: 1.0},
        resolution: {value: new THREE.Vector2()},
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

      varying vec2 vTexCoord;

      void main() {
        // --- Constants ---
        const vec4 startColor = vec4(0.125,0.486,1.000, 1.0);
        const vec4 quarterColor = vec4(0.035,0.557,0.984, 1.0);
        const vec4 thirdQuarterColor = vec4(0.678,0.529,0.922, 1.0);
        const vec4 endColor = vec4(0.933,0.302,0.369, 1.0);
        const float angle = radians(90.0 + 16.0);
        const vec2 origin = vec2(0.5, 0.5);

        // --- Pre-calculate rotation components ---
        float rotation = radians(90.0) - angle;
        float cosRot = cos(rotation);
        float sinRot = sin(rotation);

        // --- Normalized and centered UV ---
        vec2 uv = vTexCoord - origin;

        // --- Rotate the UV coordinates ---
        vec2 rotatedUV = vec2(
            cosRot * uv.x - sinRot * uv.y,
            sinRot * uv.x + cosRot * uv.y
        ) + origin;

        // --- Original color mixing logic based on rotatedUV.x ---
        if (rotatedUV.x < 0.5) {
          gl_FragColor = mix(startColor, quarterColor, smoothstep(0.0, 0.25, rotatedUV.x));
        } else if (rotatedUV.x < 0.75) {
          gl_FragColor = mix(quarterColor, thirdQuarterColor, smoothstep(0.5, 0.75, rotatedUV.x));
        } else {
          gl_FragColor = mix(thirdQuarterColor, endColor, smoothstep(0.75, 1.0, rotatedUV.x));
        }
      }`
    };
    super(options);
  }
}

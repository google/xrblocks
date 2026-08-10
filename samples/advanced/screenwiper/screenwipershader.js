import * as THREE from 'three';

const noise_texture = new THREE.TextureLoader().load(
  'screenwiper_assets/Noise.png'
);
noise_texture.wrapS = THREE.RepeatWrapping;
noise_texture.wrapT = THREE.RepeatWrapping;

const color_map = new THREE.TextureLoader().load(
  'screenwiper_assets/ColorMap.png'
);
color_map.wrapS = THREE.RepeatWrapping;

export const ScreenWiperShader = {
  name: 'ScreenWiperShader',

  defines: {
    DEG_TO_RAD: 3.14159265359 / 180.0,
  },

  uniforms: {
    uTexture: {value: noise_texture},
    uMask: {value: null},
    uColorMap: {value: color_map},
    uTime: {value: new THREE.Vector4(0.0, 0.0, 0.0, 0.0)},
    uMoveSpeed: {value: 0.1},
    uColorSpeed: {value: 0.2},
    uPulseSpeed: {value: 4.0},
    uPulseAmount: {value: 0.025},
    uHoleColor: {
      value: new THREE.Vector4(
        49.0 / 255,
        103.0 / 255,
        154.0 / 255,
        64.0 / 255
      ),
    },
  },

  vertexShader: /* glsl */ `

          varying vec2 vUv;

          void main() {

              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

          }`,

  fragmentShader: /* glsl */ `

          #include <common>

          varying vec2 vUv;

          uniform sampler2D uTexture;
          uniform sampler2D uMask;
          uniform sampler2D uColorMap;
          uniform vec4 uTime;
          uniform float uColorSpeed;
          uniform float uMoveSpeed;
          uniform float uPulseSpeed;
          uniform float uPulseAmount;
          uniform vec4 uHoleColor;


          void main() {
            // Sample at uv scale 1.
            vec2 uv1 = vUv;
            uv1.x += sin(uTime.x * 4.89 * uMoveSpeed);
            uv1.y += uTime.y * .123 * uMoveSpeed;
            vec4 tex1 = texture(uTexture, 2.0 * uv1);

            // Sample at uv scale 2.
            vec2 uv2 = vUv * 2.0;
            uv2.x += uTime.y * 0.277 * uMoveSpeed;
            uv2.y += sin(uTime.x * 6.231 * uMoveSpeed);
            vec4 tex2 = texture(uTexture, 2.0 * uv2);

            float totalValue = (tex1.r * 0.75) + (tex2.r * 0.25);
            vec4 mapColor = texture(uColorMap, vec2(totalValue + uTime.x * uColorSpeed, 0.5));
            vec4 col = saturate(mapColor);
            col.a = 1.0;

            // Mask.
            float pulseInside = sin(uTime.y * uPulseSpeed + vUv.x * 150.0) * uPulseAmount;
            float pulseOutside = cos(uTime.y * uPulseSpeed + vUv.x * 150.0) * uPulseAmount;
            vec4 mask = texture(uMask, vUv);
            vec4 tintedCol = mix(col, uHoleColor, 0.5);
            col = mix(tintedCol, col, step(0.8 + pulseOutside, mask.r));
            col.a = mix(0.0, max(col.a, tintedCol.a), step(0.5 + pulseInside, mask.r));
            gl_FragColor = col;
          }`,
};

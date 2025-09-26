import * as THREE from 'three';


export const ClearShader = {
  name: 'ClearShader',

  defines: {
    DEG_TO_RAD: 3.14159265359 / 180.0,
  },

  uniforms: {
    uClearColor: {
      value:
          new THREE.Vector4(1.0, 1.0, 1.0, 1.0),
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
          uniform vec4 uClearColor;


          void main() {
            gl_FragColor = uClearColor;
          }`,
};

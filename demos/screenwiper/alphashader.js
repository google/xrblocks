import * as THREE from "three";

export const AlphaShader = {
  name: "AlphaShader",

  defines: {
    DEG_TO_RAD: 3.14159265359 / 180.0,
  },

  uniforms: {
    tDiffuse: { value: null },
    uWiperDegrees: { value: 10.0 },
    uLeftWiperActive: { value: false },
    uLeftHandCartesianCoordinate: { value: new THREE.Vector3(0.0, -1.0, 0.0) },
    uRightWiperActive: { value: false },
    uRightHandCartesianCoordinate: { value: new THREE.Vector3(0.0, -1.0, 0.0) },
    uReturnSpeed: { value: 0.005 },
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

          uniform sampler2D tDiffuse;
          uniform float uWiperDegrees;
          uniform bool uLeftWiperActive;
          uniform vec3 uLeftHandCartesianCoordinate;
          uniform bool uRightWiperActive;
          uniform vec3 uRightHandCartesianCoordinate;
          uniform float uReturnSpeed;

          vec3 sphericalToCartesian(vec3 spherical) {
            float x = spherical.x * cos(spherical.y) * sin(spherical.z);
            float y = spherical.x * cos(spherical.z);
            float z = spherical.x * sin(spherical.y) * sin(spherical.z);
            return vec3(x, y, z);
          }

          float getWiperValue(bool wiperActive, vec3 handCartesianCoordinate) {
            if (!wiperActive) return 1.0;
            vec3 cartesianCoordinate = sphericalToCartesian(vec3(1.0, PI - vUv.x * 2.0 * PI, PI - vUv.y * PI));
            float cosineSimilarity = dot(handCartesianCoordinate, cartesianCoordinate);
            float wiperValue = 1.0 - smoothstep(cos(uWiperDegrees * DEG_TO_RAD), 1.0, cosineSimilarity);
            wiperValue = 0.95 + 0.05 * wiperValue;
            return wiperValue;
          }

          void main() {
              float prevFrameValue = texture(tDiffuse, vUv).g;
              float newFrameValue = prevFrameValue + uReturnSpeed * (uLeftWiperActive || uRightWiperActive ? 0.0 : 1.0);
              newFrameValue *= getWiperValue(uLeftWiperActive, uLeftHandCartesianCoordinate);
              newFrameValue *= getWiperValue(uRightWiperActive, uRightHandCartesianCoordinate);
              gl_FragColor = vec4(vec3(newFrameValue), 1.0);
          }`,
};

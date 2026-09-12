import * as THREE from 'three';
import { SCENE_TIMES_OF_DAY } from './SceneTypes.js';

/** A modest slab, so the ground reads as solid at a grazing angle. */
const GROUND_THICKNESS = 0.1;
/** Fixed, modest tessellation; an environment never chooses its own detail. */
const GROUND_SEGMENTS = 24;
const SKY_SEGMENTS = 32;
const SKY_RINGS = 20;
/** Well inside the default far plane of 100 meters. */
const SKY_RADIUS = 60;
/** Gentle authored ground variation, as fractions of the ground color. */
const EDGE_SHADE = 0.22;
const PATCH_SHADE = 0.12;
const KEY_LIGHT_DISTANCE = 24;
/**
 * A very low key light stretches shadows past any bounded shadow camera, so
 * the light keeps the sky azimuth but never drops below this elevation.
 */
const MIN_KEY_ELEVATION = 18;
const SHADOW_MAP_SIZE = 1024;
const MIN_SHADOW_EXTENT = 8;
const MAX_SHADOW_EXTENT = 26;
/** Room for the shadows a low key light casts beyond the ground itself. */
const SHADOW_MARGIN = 8;
const PALETTES = {
    moonlight: {
        zenith: '#050a1c',
        horizon: '#16274f',
        haze: '#070b16',
        body: '#eef2ff',
        bodyElevation: 35,
        bodyAzimuth: 38,
        bodyAngularRadius: 0.05,
        bodyDetail: 1,
        glow: '#8fa8e8',
        glowStrength: 0.6,
        glowFalloff: 160,
        starIntensity: 0.9,
        keyColor: '#bacfff',
        keyIntensity: 1.1,
        skyLight: '#879dc4',
        groundLight: '#344566',
        fillIntensity: 0.8,
        groundTint: '#a0b4d8',
        groundRoughness: 0.95,
    },
    sunrise: {
        zenith: '#2a5a96',
        horizon: '#ffb877',
        haze: '#2a1f1c',
        body: '#fff0c9',
        bodyElevation: 8,
        bodyAzimuth: 24,
        bodyAngularRadius: 0.06,
        bodyDetail: 0,
        glow: '#ff9a4d',
        glowStrength: 1,
        glowFalloff: 22,
        starIntensity: 0,
        keyColor: '#ffb066',
        keyIntensity: 1.8,
        skyLight: '#ffd2a1',
        groundLight: '#4a3428',
        fillIntensity: 0.6,
        groundTint: '#ffd0a8',
        groundRoughness: 0.85,
    },
    daylight: {
        zenith: '#2a72d4',
        horizon: '#cfe4ff',
        haze: '#4a4f45',
        body: '#fffdf5',
        bodyElevation: 62,
        bodyAzimuth: -10,
        bodyAngularRadius: 0.045,
        bodyDetail: 0,
        glow: '#ffe9c2',
        glowStrength: 0.5,
        glowFalloff: 300,
        starIntensity: 0,
        keyColor: '#fff6e2',
        keyIntensity: 2.4,
        skyLight: '#bcd8ff',
        groundLight: '#6b6a55',
        fillIntensity: 0.9,
        groundTint: '#ffffff',
        groundRoughness: 0.8,
    },
    sunset: {
        zenith: '#1f2c63',
        horizon: '#ff7a44',
        haze: '#1d1512',
        body: '#ffd9a0',
        bodyElevation: 7,
        bodyAzimuth: 200,
        bodyAngularRadius: 0.062,
        bodyDetail: 0,
        glow: '#ff6a2c',
        glowStrength: 1.1,
        glowFalloff: 18,
        starIntensity: 0.12,
        keyColor: '#ff8a4a',
        keyIntensity: 1.6,
        skyLight: '#ffb391',
        groundLight: '#33231a',
        fillIntensity: 0.5,
        groundTint: '#f4b48d',
        groundRoughness: 0.85,
    },
};
const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
/**
 * An authored gradient sky with one celestial body, its halo, and procedural
 * stars. It samples no texture and runs no generated code.
 */
const SKY_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>

uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 hazeColor;
uniform vec3 bodyColor;
uniform vec3 bodyDirection;
uniform float bodyAngularRadius;
uniform float bodyDetail;
uniform vec3 glowColor;
uniform float glowStrength;
uniform float glowFalloff;
uniform float starIntensity;

varying vec3 vDirection;

float hash13(vec3 cell) {
  vec3 value = fract(cell * 0.1031);
  value += dot(value, value.zyx + 31.32);
  return fract((value.x + value.y) * value.z);
}

float starField(vec3 direction) {
  vec3 scaled = direction * 180.0;
  vec3 cell = floor(scaled);
  float seed = hash13(cell);
  float presence = smoothstep(0.986, 0.999, seed);
  vec3 jitter = vec3(hash13(cell + 11.0), hash13(cell + 23.0), hash13(cell + 37.0));
  float radius = length(fract(scaled) - 0.5 - 0.3 * (jitter - 0.5));
  float twinkle = 0.55 + 0.45 * fract(seed * 137.0);
  return presence * twinkle * (1.0 - smoothstep(0.02, 0.34, radius));
}

void main() {
  vec3 direction = normalize(vDirection);
  float height = clamp(direction.y, -1.0, 1.0);
  vec3 sky = mix(horizonColor, zenithColor, pow(max(height, 0.0), 0.55));
  sky = mix(sky, hazeColor, 1.0 - smoothstep(-0.24, -0.02, height));

  float cosAngle = dot(direction, bodyDirection);
  float glow = pow(max(cosAngle, 0.0), glowFalloff) * glowStrength;
  sky += glowColor * glow;

  float angle = acos(clamp(cosAngle, -1.0, 1.0));
  float edge = angle / max(bodyAngularRadius, 0.001);
  float disc = 1.0 - smoothstep(0.86, 1.0, edge);
  // A soft limb and gentle maria read as a sphere, not a flat cut-out.
  float limb = 0.78 + 0.22 * sqrt(max(1.0 - edge * edge, 0.0));
  float maria = 0.5 + 0.5 * sin(direction.x * 90.0) * sin(direction.y * 70.0) *
      sin(direction.z * 80.0);
  float shade = limb * mix(1.0, 0.84 + 0.16 * maria, bodyDetail);
  sky = mix(sky, bodyColor * shade, disc * smoothstep(-0.06, 0.02, height));

  sky += starIntensity * starField(direction) *
      smoothstep(-0.02, 0.3, height) * (1.0 - min(glow, 1.0));

  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;
function readPalette(environment) {
    const palette = SCENE_TIMES_OF_DAY.includes(environment.timeOfDay)
        ? PALETTES[environment.timeOfDay]
        : undefined;
    if (!palette) {
        throw new Error(`Unsupported environment time of day "${environment.timeOfDay}".`);
    }
    return palette;
}
function readSize(environment) {
    const size = environment.size;
    if (!Array.isArray(size) ||
        size.length !== 2 ||
        size.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error('A virtual environment needs a finite, positive ground size.');
    }
    return [size[0], size[1]];
}
function directionOf(elevation, azimuth) {
    const polar = THREE.MathUtils.degToRad(elevation);
    const around = THREE.MathUtils.degToRad(azimuth);
    return new THREE.Vector3(Math.cos(polar) * Math.sin(around), Math.sin(polar), -Math.cos(polar) * Math.cos(around));
}
/** Deterministic, texture-free ground variation. */
function patch(x, z) {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return value - Math.floor(value);
}
/**
 * A slab whose top sits at Y=0, shaded per vertex so a large ground plane is
 * not a flat plastic sheet: mild patchiness plus a soft edge falloff.
 */
function createGroundGeometry(width, depth) {
    const geometry = new THREE.BoxGeometry(width, GROUND_THICKNESS, depth, GROUND_SEGMENTS, 1, GROUND_SEGMENTS);
    geometry.translate(0, -GROUND_THICKNESS / 2, 0);
    const position = geometry.getAttribute('position');
    const shades = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index++) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const rim = Math.max(Math.abs(x) / (width / 2), Math.abs(z) / (depth / 2));
        const shade = (1 - EDGE_SHADE * THREE.MathUtils.smoothstep(rim, 0.65, 1)) *
            (1 + PATCH_SHADE * (patch(x * 0.9, z * 0.9) - 0.5));
        shades.fill(shade, index * 3, index * 3 + 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
    return geometry;
}
/**
 * Bounds of the ground a virtual environment owns, in environment-local
 * meters. The sky dome, its celestial body, and the lights are backdrop, so
 * they are deliberately excluded and a whole-world fit stays finite and tight.
 *
 * @param environment - The environment settings.
 * @returns A new box covering the ground slab, centered in X/Z with its top
 *     at Y=0.
 */
function getEnvironmentBounds(environment) {
    const [width, depth] = readSize(environment);
    // Reject settings the content build could not render, from either entry.
    readPalette(environment);
    return new THREE.Box3(new THREE.Vector3(-width / 2, -GROUND_THICKNESS, -depth / 2), new THREE.Vector3(width / 2, 0, depth / 2));
}
/**
 * Builds a bounded virtual setting as one detached group: a ground slab, a
 * back-sided sky dome with an authored gradient, celestial body, and stars,
 * and the key and fill lights for that time of day. Every geometry, material,
 * and light is freshly owned by this result; nothing is cached or shared
 * between builds, and no global renderer, scene, or camera state is touched.
 * The sky and ground never take pointer hits, so objects and UI stay reachable.
 *
 * @param environment - The environment settings; they are never mutated.
 * @returns A new group holding `ground`, `sky`, `key-light`, its target, and
 *     `fill-light`. Failed construction disposes what it built and rethrows;
 *     Roomcraft owns disposal of a successful result.
 */
function createEnvironmentContent(environment) {
    const [width, depth] = readSize(environment);
    const palette = readPalette(environment);
    const root = new THREE.Group();
    root.name = 'environment';
    root.xb = { pointerEvents: 'none' };
    const owned = [];
    try {
        const groundGeometry = createGroundGeometry(width, depth);
        owned.push(groundGeometry);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(environment.groundColor).multiply(new THREE.Color(palette.groundTint)),
            roughness: palette.groundRoughness,
            metalness: 0,
            vertexColors: true,
            dithering: true,
        });
        owned.push(groundMaterial);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.name = 'ground';
        ground.receiveShadow = true;
        ground.xb = { pointerEvents: 'none' };
        const bodyDirection = directionOf(palette.bodyElevation, palette.bodyAzimuth);
        const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, SKY_SEGMENTS, SKY_RINGS);
        owned.push(skyGeometry);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                zenithColor: { value: new THREE.Color(palette.zenith) },
                horizonColor: { value: new THREE.Color(palette.horizon) },
                hazeColor: { value: new THREE.Color(palette.haze) },
                bodyColor: { value: new THREE.Color(palette.body) },
                bodyDirection: { value: bodyDirection },
                bodyAngularRadius: { value: palette.bodyAngularRadius },
                bodyDetail: { value: palette.bodyDetail },
                glowColor: { value: new THREE.Color(palette.glow) },
                glowStrength: { value: palette.glowStrength },
                glowFalloff: { value: palette.glowFalloff },
                starIntensity: { value: palette.starIntensity },
            },
            vertexShader: SKY_VERTEX_SHADER,
            fragmentShader: SKY_FRAGMENT_SHADER,
            side: THREE.BackSide,
            depthWrite: false,
            dithering: true,
        });
        owned.push(skyMaterial);
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        sky.name = 'sky';
        sky.xb = { pointerEvents: 'none' };
        const key = new THREE.DirectionalLight(new THREE.Color(palette.keyColor), palette.keyIntensity);
        key.name = 'key-light';
        owned.push(key);
        key.position
            .copy(directionOf(Math.max(palette.bodyElevation, MIN_KEY_ELEVATION), palette.bodyAzimuth))
            .multiplyScalar(KEY_LIGHT_DISTANCE);
        key.castShadow = true;
        key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
        key.shadow.bias = -0.0005;
        key.shadow.normalBias = 0.02;
        const extent = THREE.MathUtils.clamp(Math.hypot(width, depth) / 2 + SHADOW_MARGIN, MIN_SHADOW_EXTENT, MAX_SHADOW_EXTENT);
        const shadowCamera = key.shadow.camera;
        shadowCamera.left = -extent;
        shadowCamera.right = extent;
        shadowCamera.top = extent;
        shadowCamera.bottom = -extent;
        shadowCamera.near = 1;
        shadowCamera.far = KEY_LIGHT_DISTANCE * 2;
        shadowCamera.updateProjectionMatrix();
        // Aim at this environment's own origin, wherever Roomcraft is placed.
        const keyTarget = new THREE.Object3D();
        keyTarget.name = 'key-light-target';
        key.target = keyTarget;
        const fill = new THREE.HemisphereLight(new THREE.Color(palette.skyLight), new THREE.Color(palette.groundLight), palette.fillIntensity);
        fill.name = 'fill-light';
        owned.push(fill);
        root.add(ground, sky, key, keyTarget, fill);
    }
    catch (error) {
        for (const resource of owned)
            resource.dispose();
        throw error;
    }
    return root;
}

export { createEnvironmentContent, getEnvironmentBounds };

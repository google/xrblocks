import * as THREE from 'three';

const PORTAL_RADIUS = 0.6;

/**
 * Generic shader-disc portal. Owns the disc geometry, edge feather, animated
 * torus ring, halo, bob animation and placement logic — the actual world
 * inside the disc is a pluggable scene module passed in via the constructor.
 *
 *   new Portal({ scene: CosmicScene })
 *
 * A scene module exports:
 *   {
 *     ringCool:  'vec3(...)',  // optional GLSL literal for ring/halo tint
 *     ringWarm:  'vec3(...)',
 *     haloInner: 'vec3(...)',
 *     haloOuter: 'vec3(...)',
 *     uniforms:  {...},        // optional extra uniforms (object literal)
 *     helpers:   '...glsl...', // extra functions injected before main()
 *     body:      '...glsl...', // body that produces `vec3 col`
 *                              //   inputs in scope: vec2 p, float r,
 *                              //                   float uTime, vec3 uCamLocal
 *   }
 */
export class Portal extends THREE.Object3D {
  constructor({scene, label = ''} = {}) {
    super();

    if (!scene) throw new Error('Portal requires a `scene` module.');

    this._scene = scene;
    this._label = label;
    this._t = 0;
    this._bobBaseY = null;
    this._tmpVec = new THREE.Vector3();
    this._held = false;

    this._buildDisc();
    this._buildRing();
    this._buildHalo();
  }

  setHeld(held) {
    this._held = !!held;
    // Pop the ring slightly larger when held so it's obvious which one
    // is going to move on the next click.
    const s = this._held ? 1.15 : 1.0;
    this._ring.scale.setScalar(s);
    this._halo.scale.setScalar(s);
  }

  // -- Public API ----------------------------------------------------------

  placeAt(worldPoint, faceNormal, hitObjectMatrix) {
    if (!this.parent) return;
    this.position.copy(worldPoint);
    this.parent.worldToLocal(this.position);

    if (faceNormal) {
      const worldNormal = faceNormal.clone();
      if (hitObjectMatrix) {
        worldNormal
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hitObjectMatrix))
          .normalize();
      }
      const worldPos = this.getWorldPosition(new THREE.Vector3());
      this.lookAt(worldPos.add(worldNormal));

      // Nudge slightly off the surface so the disc doesn't z-fight.
      this.position.addScaledVector(
        new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion),
        0.02
      );
    }

    this._bobBaseY = this.position.y;
  }

  update(dt) {
    this._t += dt * 4.0;
    // Ring spins faster + portal bobs harder while held.
    this._ring.rotation.z += dt * (this._held ? 4.5 : 1.6);

    if (this._bobBaseY === null) this._bobBaseY = this.position.y;
    const bobAmp = this._held ? 0.06 : 0.03;
    const bobSpd = this._held ? 0.9 : 0.25;
    this.position.y = this._bobBaseY + Math.sin(this._t * bobSpd) * bobAmp;

    if (this._disc.material.uniforms) {
      this._disc.material.uniforms.uTime.value = this._t;
    }
    // Note: uCamLocal is updated per-eye in the disc's onBeforeRender so XR
    // gets correct stereo parallax inside the portal. The `camera` arg here
    // (mono) would clobber that, so we deliberately don't write uCamLocal
    // from update().
    if (this._ring.material.uniforms) {
      this._ring.material.uniforms.uTime.value = this._t;
    }
  }

  // -- Construction --------------------------------------------------------

  _buildDisc() {
    const s = this._scene;
    const ringCool = s.ringCool || 'vec3(0.35, 0.7, 1.0)';
    const ringWarm = s.ringWarm || 'vec3(1.0, 0.55, 0.9)';
    const haloInner = s.haloInner || 'vec3(0.4, 0.7, 1.0)';
    const haloOuter = s.haloOuter || 'vec3(1.0, 0.6, 0.9)';
    this._ringCool = ringCool;
    this._ringWarm = ringWarm;
    this._haloInner = haloInner;
    this._haloOuter = haloOuter;
    this._ringColorExpr = s.ringColorExpr || 'mix(cool, warm, band)';

    const sceneUniforms = s.uniforms || {};
    const sceneUniformDecls = Object.entries(sceneUniforms)
      .map(([name, u]) => `uniform ${u.type || 'float'} ${name};`)
      .join('\n        ');

    const geom = new THREE.CircleGeometry(PORTAL_RADIUS, 96);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uCamLocal: {value: new THREE.Vector3(0, 0, 1.6)},
        ...Object.fromEntries(
          Object.entries(sceneUniforms).map(([n, u]) => [n, {value: u.value}])
        ),
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uCamLocal;
        ${sceneUniformDecls}
        varying vec2 vUv;

        // ---------- shared helpers (used by every scene) ----------
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                                + (d - b) * u.x * u.y;
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p); p *= 2.07; a *= 0.5;
          }
          return v;
        }
        float ridgedFbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 5; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * n * n; p *= 2.13; a *= 0.5;
          }
          return v;
        }
        float warpedFbm(vec2 p) {
          vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
          vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)),
                        fbm(p + 4.0 * q + vec2(8.3, 2.8)));
          return fbm(p + 4.0 * r);
        }
        float starsLayer(vec2 uv, float density, float threshold) {
          vec2 g = floor(uv * density);
          vec2 f = fract(uv * density);
          float h = hash(g);
          if (h < threshold) return 0.0;
          vec2 jitter = vec2(hash(g + 1.7), hash(g + 7.3)) * 0.6 + 0.2;
          float d = length(f - jitter);
          float twinkle = 0.5 + 0.5 * sin(uTime * (2.0 + h * 6.0) + h * 30.0);
          return smoothstep(0.05, 0.0, d) * (0.5 + twinkle * 0.5);
        }
        // Parallax offset for layered stereo depth.
        // depthBehindP: 0 = on disc surface, positive = behind disc (p-space units).
        vec2 parallaxP(vec2 uv, vec3 rayDir, float depthBehindP) {
          return uv + rayDir.xy * depthBehindP / max(-rayDir.z, 0.3);
        }

        float raySphere(vec3 ro, vec3 rd, vec3 c, float rad) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float d = b * b - (dot(oc, oc) - rad * rad);
          if (d < 0.0) return -1.0;
          return -b - sqrt(d);
        }

        // ---------- scene-specific helpers ----------
        ${s.helpers || ''}

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float diskAlpha = smoothstep(1.0, 0.94, r);
          if (diskAlpha <= 0.0) discard;

          // Ray from eye through this disc fragment (for stereo parallax).
          // Approach inspired by iq's portal technique (shadertoy.com/view/4sX3Rn).
          vec3 discPt = vec3(p * ${PORTAL_RADIUS.toFixed(1)}, 0.0);
          vec3 rd = normalize(discPt - uCamLocal);

          vec3 col = vec3(0.0);

          // ---------- scene body ----------
          ${s.body}

          // Subtle inner vignette + tone-map.
          col *= mix(1.0, 0.7, smoothstep(0.7, 1.0, r));
          col = col / (col + vec3(1.0));
          col = pow(col, vec3(0.85));

          gl_FragColor = vec4(col, diskAlpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      // Write depth so this disc occludes other portals (and their additive
      // rings/halos) that sit behind it. The thin edge feather still writes
      // depth, which is fine — anything truly behind the rim is occluded.
      depthWrite: true,
    });
    this._disc = new THREE.Mesh(geom, mat);
    this._disc.renderOrder = 1;
    // Per-eye stereo: three.js calls onBeforeRender once per camera, including
    // each sub-camera of an XR ArrayCamera. Updating uCamLocal here means each
    // eye gets its own ray origin and the world inside the disc has real
    // parallax depth instead of looking flat.
    const tmpEye = new THREE.Vector3();
    this._disc.onBeforeRender = (renderer, sceneArg, camera) => {
      camera.getWorldPosition(tmpEye);
      this.worldToLocal(tmpEye);
      mat.uniforms.uCamLocal.value.copy(tmpEye);
    };
    this.add(this._disc);
  }

  _buildRing() {
    const ringGeom = new THREE.TorusGeometry(PORTAL_RADIUS, 0.035, 24, 96);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: {uTime: {value: 0}},
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        vec3 hsv2rgb(vec3 c) {
          vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
          return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
        }
        void main() {
          float band = sin(vUv.x * 30.0 - uTime * 3.0) * 0.5 + 0.5;
          vec3 cool = ${this._ringCool};
          vec3 warm = ${this._ringWarm};
          vec3 col = ${this._ringColorExpr};
          float rim = smoothstep(0.0, 0.5, vUv.y) *
                      smoothstep(1.0, 0.5, vUv.y);
          gl_FragColor = vec4(col * (1.5 + rim * 1.2), 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._ring = new THREE.Mesh(ringGeom, ringMat);
    this._ring.renderOrder = 3;
    this.add(this._ring);
  }

  _buildHalo() {
    const haloGeom = new THREE.RingGeometry(
      PORTAL_RADIUS * 1.02,
      PORTAL_RADIUS * 1.55,
      64
    );
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = max(smoothstep(1.0, 0.6, r) - smoothstep(0.6, 0.0, r), 0.0);
          vec3 col = mix(${this._haloInner}, ${this._haloOuter},
                         smoothstep(0.5, 1.0, r));
          gl_FragColor = vec4(col * a, a * 0.6);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.renderOrder = 2;
    this._halo = halo;
    this.add(halo);
  }
}

Portal.RADIUS = PORTAL_RADIUS;

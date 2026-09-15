import * as THREE from 'three';

import {CosmicScene} from './scenes/CosmicScene.js';

const SPHERE_RADIUS = 50;
const IMMERSIVE_SCALE = 4.0; // Push planets farther out so user doesn't reach them in 2 steps.

/**
 * Full-surround cosmic environment for "walk-in" mode.
 * Renders the cosmic raymarcher on an inverted sphere around the user,
 * with direction-based UVs so the scene wraps naturally in 360°.
 */
export class CosmicImmersive extends THREE.Object3D {
  constructor() {
    super();
    this._time = 0;
    this._buildSphere();
  }

  show(portalWorldMatrix, fromSide = 'front') {
    let m = portalWorldMatrix.clone();
    if (fromSide === 'back') {
      // User entered through the back face of the portal — apply a 180° yaw
      // so they spawn facing the scene rather than the wall behind it.
      m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    }
    this._entryMatrix = m;
    this._entryMatrixInv = m.clone().invert();
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  update(dt, camera) {
    if (!this.visible) return;
    this._time += dt * 4.0;

    const mat = this._sphere.material;
    mat.uniforms.uTime.value = this._time;

    if (camera) {
      // Camera world position → portal-local space = cosmic origin.
      const camWorld = camera.getWorldPosition(new THREE.Vector3());
      const camLocal = camWorld.clone().applyMatrix4(this._entryMatrixInv);
      mat.uniforms.uCamLocal.value.copy(camLocal);

      // Camera world quaternion → portal-local rotation for view directions.
      const portalQuat = new THREE.Quaternion().setFromRotationMatrix(
        this._entryMatrix
      );
      const portalQuatInv = portalQuat.clone().invert();
      // Build a rotation Matrix4, then extract upper-left 3×3 as Matrix3.
      const rotMat4 = new THREE.Matrix4().makeRotationFromQuaternion(
        portalQuatInv
      );
      mat.uniforms.uViewRotation.value.setFromMatrix4(rotMat4);
    }

    // Keep sphere centered on camera so it always surrounds the user.
    if (camera) {
      camera.getWorldPosition(this.position);
    }
  }

  _buildSphere() {
    const s = CosmicScene;
    const geom = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uCamLocal: {value: new THREE.Vector3(0, 0, 1.6)},
        uViewRotation: {value: new THREE.Matrix3()},
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          // Direction from center to vertex (normalized sphere direction).
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uCamLocal;
        uniform mat3 uViewRotation;
        varying vec3 vWorldDir;

        // ---------- shared helpers (3D to avoid spherical UV seam) ----------
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float hash3(vec3 p) {
          p = fract(p * vec3(123.34, 456.21, 789.53));
          p += dot(p, p.yzx + 45.32);
          return fract(p.x * p.y * p.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash3(i), hash3(i + vec3(1,0,0)), u.x),
                mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), u.x), u.y),
            mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), u.x),
                mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), u.x), u.y),
            u.z);
        }
        float fbm3(vec3 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise3(p); p *= 2.07; a *= 0.5;
          }
          return v;
        }
        float ridgedFbm3(vec3 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
            v += a * n * n; p *= 2.13; a *= 0.5;
          }
          return v;
        }
        float warpedFbm3(vec3 p) {
          vec3 q = vec3(fbm3(p), fbm3(p + vec3(5.2, 1.3, 3.7)),
                        fbm3(p + vec3(9.1, 4.6, 2.8)));
          return fbm3(p + 4.0 * q);
        }

        // 2D hash/noise kept for starsLayer and raymarched object surfaces
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
          for (int i = 0; i < 4; i++) {
            v += a * noise(p); p *= 2.07; a *= 0.5;
          }
          return v;
        }
        float ridgedFbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * n * n; p *= 2.13; a *= 0.5;
          }
          return v;
        }
        float warpedFbm(vec2 p) {
          vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
          return fbm(p + 4.0 * q);
        }

        float starsLayer(vec3 rd, float density, float threshold) {
          // Use octahedral mapping for seamless 2D grid on a sphere.
          vec3 a = abs(rd);
          float sum = a.x + a.y + a.z;
          vec2 oct = rd.xz / sum;
          if (rd.y < 0.0) {
            oct = (1.0 - abs(oct.yx)) * vec2(oct.x >= 0.0 ? 1.0 : -1.0,
                                              oct.y >= 0.0 ? 1.0 : -1.0);
          }
          vec2 uv = oct * 0.5 + 0.5;
          vec2 g = floor(uv * density);
          vec2 f = fract(uv * density);
          float h = hash(g);
          if (h < threshold) return 0.0;
          vec2 jitter = vec2(hash(g + 1.7), hash(g + 7.3)) * 0.6 + 0.2;
          float d = length(f - jitter);
          float twinkle = 0.5 + 0.5 * sin(uTime * (2.0 + h * 6.0) + h * 30.0);
          return smoothstep(0.05, 0.0, d) * (0.5 + twinkle * 0.5);
        }

        float raySphere(vec3 ro, vec3 rd, vec3 c, float rad) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float d = b * b - (dot(oc, oc) - rad * rad);
          if (d < 0.0) return -1.0;
          return -b - sqrt(d);
        }

        // ---------- cosmic scene helpers ----------
        ${s.helpers}

        void main() {
          // View direction in cosmic-local space.
          vec3 rd = normalize(uViewRotation * vWorldDir);
          vec3 ro = uCamLocal;

          // Forward-cone projection for 2D effects (comets, events).
          // Matches the disc-portal's p when looking forward.
          float forwardness = max(-rd.z, 0.0);
          vec2 p = rd.xy / max(-rd.z, 0.15);

          // ---- Nebula background (depth-layered 3D noise for volume) ----
          vec3 nebulaA = vec3(0.05, 0.08, 0.30);
          vec3 nebulaB = vec3(0.55, 0.18, 0.70);
          vec3 nebulaC = vec3(0.95, 0.45, 0.25);
          vec3 nebulaD = vec3(0.35, 0.85, 1.00);
          vec3 col = vec3(0.005, 0.005, 0.02);
          // Near layer (depth 1.5) — large soft structures
          {
            vec3 nDir = rd * 1.5;
            float ln1 = warpedFbm3(nDir + vec3(uTime * 0.03, -uTime * 0.02, uTime * 0.01));
            float ln2 = fbm3(nDir * 2.8 - vec3(uTime * 0.05, uTime * 0.04, -uTime * 0.03));
            float ld = pow(ln1 * 0.55 + ln2 * 0.45, 1.6);
            vec3 lc = mix(nebulaA, nebulaB, smoothstep(0.15, 0.7, ln1));
            lc = mix(lc, nebulaC, smoothstep(0.55, 1.0, ln2) * 0.9);
            lc *= 0.15 + ld * 2.4;
            col = mix(col, lc, ld * 0.35);
          }
          // Mid layer (depth 2.8) — primary detail
          {
            vec3 nDir = rd * 2.8;
            float mn1 = warpedFbm3(nDir + vec3(uTime * 0.03, -uTime * 0.02, uTime * 0.01));
            float mn2 = fbm3(nDir * 2.8 - vec3(uTime * 0.05, uTime * 0.04, -uTime * 0.03));
            float mn3 = ridgedFbm3(nDir * 4.0 + vec3(-uTime * 0.04, uTime * 0.03, uTime * 0.02));
            float mDensity = pow(mn1 * 0.55 + mn2 * 0.45, 1.6);
            float mWisps = pow(mn3, 2.2);
            vec3 mc = mix(nebulaA, nebulaB, smoothstep(0.15, 0.7, mn1));
            mc = mix(mc, nebulaC, smoothstep(0.55, 1.0, mn2) * 0.9);
            mc = mix(mc, nebulaD, mWisps * 0.6);
            mc *= 0.15 + mDensity * 2.4;
            col = mix(col, mc, clamp(mDensity * 0.7, 0.0, 1.0));
          }
          // Far layer (depth 5.0) — distant haze
          {
            vec3 nDir = rd * 5.0;
            float fn1 = fbm3(nDir * 1.2 + vec3(uTime * 0.02, -uTime * 0.015, uTime * 0.01));
            float fn3 = ridgedFbm3(nDir * 3.0 + vec3(-uTime * 0.03, uTime * 0.02, uTime * 0.015));
            float fDensity = pow(fn1, 1.8);
            float fWisps = pow(fn3, 2.2);
            vec3 fc = mix(nebulaA, nebulaB, smoothstep(0.2, 0.75, fn1));
            fc = mix(fc, nebulaD, fWisps * 0.5);
            fc *= 0.1 + fDensity * 1.8;
            col = mix(col, fc, clamp(fDensity * 0.4, 0.0, 1.0));
          }
          col = mix(vec3(0.005, 0.005, 0.02), col, 0.92);

          // ---- Stars (octahedral mapping, no seam) ----
          float s1 = starsLayer(rd, 45.0, 0.975);
          float s2 = starsLayer(rd, 95.0, 0.985);
          float s3 = starsLayer(rd, 180.0, 0.992);
          float s4 = starsLayer(rd, 260.0, 0.996);
          col += vec3(0.9, 0.95, 1.0) *
                 (s1 * 1.1 + s2 * 0.9 + s3 * 0.7 + s4 * 0.6);

          // ---- Raymarched objects (true 3D, scaled positions) ----
          float t = uTime;
          float sc = ${IMMERSIVE_SCALE.toFixed(1)};

          vec3 sunPos = vec3(0.05, 0.65, -2.6) * sc;
          float sunRad = 0.18 * sc;
          vec3 sunDir = normalize(sunPos - ro);
          vec3 planetPos = vec3(-0.85, -0.10, -1.6) * sc;
          float planetRad = 0.40 * sc;
          float gasA = t * 0.05;
          vec3 gasPos = vec3(0.95 + sin(gasA) * 0.06,
                             0.10 + cos(gasA * 0.7) * 0.04,
                             -2.2 + cos(gasA) * 0.10) * sc;
          float gasRad = 0.42 * sc;
          float moonA = t * 0.18;
          vec3 moonOffset = vec3(cos(moonA) * 0.85,
                                 sin(moonA * 1.3) * 0.12,
                                 sin(moonA) * 0.85) * sc;
          vec3 moonPos = planetPos + moonOffset;
          float moonRad = 0.11 * sc;
          vec3 lightDirPlanet = normalize(sunPos - planetPos);
          vec3 lightDirMoon   = normalize(sunPos - moonPos);
          vec3 lightDirGas    = normalize(sunPos - gasPos);
          vec3 limbCenter = vec3(-3.5, -5.5, -3.5) * sc;
          float limbRadius = 5.5 * sc;
          vec3 lightDirLimb = normalize(sunPos - limbCenter);

          float tBest = 1e9; int hitId = 0;
          float tP = raySphere(ro, rd, planetPos, planetRad);
          float tM = raySphere(ro, rd, moonPos, moonRad);
          float tS = raySphere(ro, rd, sunPos, sunRad);
          float tG = raySphere(ro, rd, gasPos, gasRad);
          float tLB = raySphere(ro, rd, limbCenter, limbRadius);
          if (tP > 0.0 && tP < tBest) { tBest = tP; hitId = 1; }
          if (tM > 0.0 && tM < tBest) { tBest = tM; hitId = 2; }
          if (tS > 0.0 && tS < tBest) { tBest = tS; hitId = 3; }
          if (tG > 0.0 && tG < tBest) { tBest = tG; hitId = 4; }
          if (tLB > 0.0 && tLB < tBest) { tBest = tLB; hitId = 5; }

          // Saturn-style ring around gas giant.
          float rt = 0.55;
          vec3 ringN = normalize(vec3(0.15, cos(rt), sin(rt)));
          float ringDenom = dot(rd, ringN);
          if (abs(ringDenom) > 1e-3) {
            float tR = dot(gasPos - ro, ringN) / ringDenom;
            if (tR > 0.0) {
              vec3 rp = ro + rd * tR - gasPos;
              float rr = length(rp);
              float inner = gasRad * 1.3;
              float outer = gasRad * 2.4;
              if (rr > inner && rr < outer) {
                float u = (rr - inner) / (outer - inner);
                float ang = atan(rp.z, rp.x) + t * 0.06;
                float bands = fbm(vec2(u * 40.0, 0.0)) * 0.55
                            + fbm(vec2(u * 140.0, 7.3)) * 0.30
                            + fbm(vec2(u * 320.0, 1.1)) * 0.15;
                bands = smoothstep(0.28, 0.78, bands);
                float gap1 = smoothstep(0.46, 0.49, u) - smoothstep(0.49, 0.53, u);
                float gap2 = smoothstep(0.72, 0.74, u) - smoothstep(0.74, 0.77, u);
                float gap3 = smoothstep(0.18, 0.20, u) - smoothstep(0.20, 0.22, u);
                bands *= 1.0 - clamp(gap1 + gap2 + gap3, 0.0, 1.0);
                float dust = fbm(vec2(ang * 60.0, u * 30.0));
                bands *= 0.55 + dust * 0.7;
                bands *= smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u);
                vec3 ringCol = mix(vec3(1.00, 0.85, 0.55),
                                   vec3(0.90, 0.95, 1.10), u);
                vec3 ringHit = ro + rd * tR;
                vec3 toLight = normalize(sunPos - ringHit);
                float shadowT = raySphere(ringHit, toLight, gasPos, gasRad * 1.02);
                float shade = (shadowT > 0.0) ? 0.35 : 1.0;
                bool behind = (hitId == 4 && tR > tBest);
                if (!behind) {
                  col += ringCol * bands * shade * 1.6;
                }
              }
            }
          }

          // Horizon gas-giant limb ring.
          {
            vec3 limbRingN = normalize(vec3(-0.25, 0.90, 0.15));
            float lrd = dot(rd, limbRingN);
            if (abs(lrd) > 1e-3) {
              float tLR = dot(limbCenter - ro, limbRingN) / lrd;
              if (tLR > 0.0) {
                bool behindLimb = (tLB > 0.0 && tLR > tLB);
                bool behindObj = (hitId != 5 && hitId > 0 && tLR > tBest);
                if (!behindLimb && !behindObj) {
                  vec3 rp = ro + rd * tLR - limbCenter;
                  float rr = length(rp);
                  float lInner = limbRadius * 1.15;
                  float lOuter = limbRadius * 1.8;
                  if (rr > lInner && rr < lOuter) {
                    float u = (rr - lInner) / (lOuter - lInner);
                    float ang = atan(rp.z, rp.x) + t * 0.03;
                    float rb = fbm(vec2(u * 50.0, 0.0)) * 0.5
                             + fbm(vec2(u * 150.0, 5.1)) * 0.3
                             + fbm(vec2(u * 350.0, 2.2)) * 0.2;
                    rb = smoothstep(0.25, 0.75, rb);
                    float rGap1 = smoothstep(0.40, 0.43, u) - smoothstep(0.43, 0.47, u);
                    float rGap2 = smoothstep(0.65, 0.67, u) - smoothstep(0.67, 0.70, u);
                    rb *= 1.0 - clamp(rGap1 + rGap2, 0.0, 1.0);
                    float rDust = fbm(vec2(ang * 50.0, u * 25.0));
                    rb *= 0.5 + rDust * 0.7;
                    rb *= smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.95, u);
                    vec3 lrCol = mix(vec3(0.65, 0.80, 0.95),
                                     vec3(0.85, 0.95, 1.05), u);
                    vec3 lrHit = ro + rd * tLR;
                    vec3 toL = normalize(sunPos - lrHit);
                    float shT = raySphere(lrHit, toL, limbCenter, limbRadius * 1.01);
                    float shade = (shT > 0.0) ? 0.30 : 1.0;
                    col += lrCol * rb * shade * 1.4;
                  }
                }
              }
            }
          }

          // Sun glow + corona + flare.
          {
            float breathe = 0.85 + 0.15 * sin(t * 0.6);
            vec3 oc = ro - sunPos;
            float b2 = dot(oc, rd);
            float closest = length(oc - rd * (-b2));
            float halo = smoothstep(0.9, 0.0, closest / (sunRad * 4.0));
            float coronaR = closest / sunRad;
            float angSun = atan(
                dot(rd - sunDir * dot(rd, sunDir), vec3(0.0, 1.0, 0.0)),
                dot(rd - sunDir * dot(rd, sunDir), vec3(1.0, 0.0, 0.0)));
            float corona = smoothstep(5.0, 1.0, coronaR)
                         * (0.5 + 0.5 * fbm(vec2(angSun * 4.0, t * 0.3 + coronaR)));
            col += vec3(1.0, 0.85, 0.55) * halo * 0.9 * breathe;
            col += vec3(1.0, 0.55, 0.20) * corona * 0.45;
            float flarePhase = mod(t, 11.0) / 11.0;
            float flareEnv = smoothstep(0.0, 0.05, flarePhase)
                           * smoothstep(0.35, 0.10, flarePhase);
            col += vec3(1.0, 0.7, 0.3)
                 * smoothstep(2.0, 0.6, coronaR) * flareEnv * 1.2;
          }

          // Planet shading.
          if (hitId == 1) {
            vec3 hp = ro + rd * tBest;
            vec3 n = normalize(hp - planetPos);
            col = shadePlanet(n, lightDirPlanet, rd,
                vec3(0.05, 0.20, 0.55), vec3(0.30, 0.55, 0.25),
                vec3(1.00, 1.00, 1.00));
          } else if (hitId == 2) {
            vec3 hp = ro + rd * tBest;
            vec3 n = normalize(hp - moonPos);
            float crater = fbm(vec2(n.x * 8.0, n.z * 8.0));
            float lon = atan(n.z, n.x);
            float lat = asin(clamp(n.y, -1.0, 1.0));
            float surface = fbm(vec2(lon, lat) * 4.0);
            vec3 base = mix(vec3(0.55, 0.50, 0.48),
                            vec3(0.85, 0.80, 0.75), surface);
            base *= 0.7 + crater * 0.5;
            float lambert = max(dot(n, lightDirMoon), 0.0);
            col = base * (0.1 + lambert);
          } else if (hitId == 3) {
            vec3 hp = ro + rd * tBest;
            vec3 n = normalize(hp - sunPos);
            float surf = fbm(vec2(n.x * 4.0 + t * 0.30, n.y * 4.0 - t * 0.20));
            float granules = fbm(vec2(n.x * 18.0 - t * 0.4, n.y * 18.0 + t * 0.3));
            vec3 c = mix(vec3(1.00, 0.55, 0.20),
                         vec3(1.00, 0.95, 0.80), surf);
            c += vec3(0.4, 0.15, 0.05) * (granules - 0.5) * 0.6;
            float limb = pow(max(dot(n, -rd), 0.0), 0.45);
            col = c * 1.6 * limb;
          } else if (hitId == 4) {
            vec3 hp = ro + rd * tBest;
            vec3 n = normalize(hp - gasPos);
            float lon = atan(n.z, n.x);
            float lat = asin(clamp(n.y, -1.0, 1.0));
            float bandNoise = fbm(vec2(lat * 6.0, lon * 0.5 + t * 0.05));
            float bands = sin(lat * 14.0 + bandNoise * 3.0) * 0.5 + 0.5;
            vec3 colA = vec3(0.95, 0.78, 0.50);
            vec3 colB = vec3(0.78, 0.55, 0.30);
            vec3 colC = vec3(1.00, 0.92, 0.72);
            vec3 base = mix(colA, colB, bands);
            base = mix(base, colC, smoothstep(0.55, 0.85,
                       fbm(vec2(lon * 2.0 + t * 0.1, lat * 2.0))) * 0.6);
            float spot = smoothstep(0.30, 0.0,
                length(vec2(lon - 1.0, lat + 0.3)));
            base = mix(base, vec3(0.90, 0.35, 0.20), spot * 0.7);
            float lambert = max(dot(n, lightDirGas), 0.0);
            float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
            col = base * (0.35 + lambert * 0.95)
                + vec3(1.0, 0.75, 0.55) * rim * 0.55;
          } else if (hitId == 5) {
            vec3 hp = ro + rd * tBest;
            vec3 n = normalize(hp - limbCenter);
            float lon = atan(n.z, n.x) + t * 0.02;
            float lat = asin(clamp(n.y, -1.0, 1.0));
            float bandN = fbm(vec2(lat * 8.0, lon * 0.3 + t * 0.03));
            float bands = sin(lat * 20.0 + bandN * 4.0) * 0.5 + 0.5;
            vec3 limbA = vec3(0.30, 0.55, 0.85);
            vec3 limbB = vec3(0.15, 0.30, 0.55);
            vec3 limbC = vec3(0.65, 0.85, 1.00);
            vec3 base = mix(limbA, limbB, bands);
            base = mix(base, limbC, smoothstep(0.6, 0.9,
                       fbm(vec2(lon * 1.5 + t * 0.06, lat * 1.5))) * 0.5);
            float storm = smoothstep(0.35, 0.0,
                length(vec2(lon - 2.0, lat + 0.15) * vec2(1.0, 1.5)));
            base = mix(base, vec3(0.90, 0.95, 1.00), storm * 0.5);
            float lambert = max(dot(n, lightDirLimb), 0.0);
            float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
            col = base * (0.20 + lambert * 0.80)
                + vec3(0.55, 0.80, 1.00) * rim * 0.65;
          }

          // ---- Comets (forward cone only) ----
          float fwdMask = smoothstep(0.0, 0.3, forwardness);
          if (fwdMask > 0.0) {
            col += cosmicComet(p, uTime, 0.13) * fwdMask;
            col += cosmicComet(p, uTime + 2.7, 0.61) * fwdMask;
            col += cosmicComet(p, uTime + 4.1, 0.84) * fwdMask;
          }

          // ---- Supernova every 22s (forward cone) ----
          if (fwdMask > 0.0) {
            float snCycle = 22.0;
            float snK = floor(uTime / snCycle);
            float snLocal = uTime - snK * snCycle;
            vec2 snPos = vec2(hash(vec2(snK, 1.7)) * 1.4 - 0.7,
                             hash(vec2(snK, 4.3)) * 1.4 - 0.7);
            vec2 snD = p - snPos;
            float dSn = length(snD);
            float snAng = atan(snD.y, snD.x);
            float flash = smoothstep(0.0, 0.25, snLocal)
                        * smoothstep(6.0, 0.4, snLocal);
            float snCore = smoothstep(0.06, 0.0, dSn) * 4.5;
            float bloom = smoothstep(0.7, 0.0, dSn) * 1.4;
            vec3 hotCol = mix(vec3(0.7, 0.85, 1.20),
                              vec3(1.00, 0.95, 0.80), smoothstep(0.0, 1.0, snLocal));
            hotCol = mix(hotCol, vec3(1.00, 0.55, 0.30),
                         smoothstep(2.0, 6.0, snLocal));
            col += hotCol * (snCore + bloom) * flash * fwdMask;
            float jetAng = hash(vec2(snK, 13.7)) * 6.2832;
            vec2 jetDir = vec2(cos(jetAng), sin(jetAng));
            float snAlong = dot(snD, jetDir);
            float snAcross = dot(snD, vec2(-jetDir.y, jetDir.x));
            float jetR = smoothstep(0.0, 4.0, snLocal) * 0.6;
            float jet = smoothstep(0.04, 0.0, abs(snAcross))
                      * smoothstep(jetR, jetR * 0.05, abs(snAlong));
            jet *= smoothstep(7.0, 1.5, snLocal);
            jet *= 0.4 + 0.6 * fbm(vec2(snAlong * 30.0, uTime * 0.6));
            col += vec3(0.85, 0.95, 1.10) * jet * 0.9 * fwdMask;
            float ringR = smoothstep(0.0, 6.0, snLocal) * 0.65;
            float perturb = ridgedFbm(vec2(snAng * 3.0 + snK * 5.0, ringR * 8.0)) * 0.06;
            float frontDist = abs(dSn - (ringR + perturb));
            float snWidth = 0.012 + smoothstep(0.0, 6.0, snLocal) * 0.025;
            float shock = smoothstep(snWidth, 0.0, frontDist);
            shock *= 0.5 + ridgedFbm(vec2(snAng * 8.0, ringR * 22.0 + uTime * 0.3)) * 1.1;
            float shockFade = smoothstep(8.0, 1.5, snLocal);
            col += vec3(1.0, 0.95, 1.0) * shock * shockFade * 1.4 * fwdMask;
          }

          // ---- Meteor shower every 17s (forward cone) ----
          if (fwdMask > 0.0) {
            float msCycle = 17.0;
            float msK = floor(uTime / msCycle);
            float msLocal = uTime - msK * msCycle;
            float burstEnv = smoothstep(0.0, 0.2, msLocal)
                           * smoothstep(2.5, 0.2, msLocal);
            if (burstEnv > 0.0) {
              float msAng = hash(vec2(msK, 9.1)) * 6.2832;
              vec2 mDir = vec2(cos(msAng), sin(msAng));
              vec2 mPerp = vec2(-mDir.y, mDir.x);
              for (int i = 0; i < 7; i++) {
                float fi = float(i);
                vec2 origin = vec2(hash(vec2(msK, fi + 11.1)) * 2.0 - 1.0,
                                   hash(vec2(msK, fi + 23.7)) * 2.0 - 1.0);
                float speed = 1.6 + hash(vec2(msK, fi + 4.4));
                vec2 mPos = origin + mDir * (msLocal * speed);
                vec2 dd = p - mPos;
                float across2 = dot(dd, mPerp);
                float along2 = dot(dd, -mDir);
                float head = smoothstep(0.012, 0.0, length(dd));
                float tail = smoothstep(0.005, 0.0, abs(across2))
                           * smoothstep(0.30, 0.0, along2)
                           * step(0.0, along2);
                col += vec3(1.0, 0.9, 0.7) * (head * 1.8 + tail * 0.85) * burstEnv * fwdMask;
              }
            }
          }

          // ---- Rocket flyby every 13s (forward cone) ----
          if (fwdMask > 0.0) {
            float rCycle = 13.0;
            float rK = floor(uTime / rCycle);
            float rLocal = uTime - rK * rCycle;
            float rLife = smoothstep(0.0, 0.3, rLocal)
                        * smoothstep(rCycle, rCycle - 1.0, rLocal);
            float rAng = hash(vec2(rK, 31.7)) * 6.2832;
            vec2 rDir = vec2(cos(rAng), sin(rAng));
            vec2 rPerp = vec2(-rDir.y, rDir.x);
            vec2 rStart = -rDir * 1.6 + rPerp * (hash(vec2(rK, 7.7)) - 0.5);
            vec2 rPos = rStart + rDir * rLocal * 0.30;
            vec2 rd2 = p - rPos;
            float rAlong = dot(rd2, -rDir);
            float rAcross = dot(rd2, rPerp);
            float hull = smoothstep(0.055, 0.038, abs(rAlong))
                       * smoothstep(0.014, 0.0, abs(rAcross));
            float wing = smoothstep(0.045, 0.0, abs(rAlong + 0.005))
                       * smoothstep(0.005, 0.0, max(abs(rAcross) - 0.030, 0.0));
            col += vec3(0.95, 0.97, 1.00) * (hull + wing) * 1.6 * rLife * fwdMask;
            float plumeAlong = rAlong + 0.060;
            float plume = smoothstep(0.32, 0.0, plumeAlong) * step(0.0, plumeAlong)
                        * smoothstep(0.018, 0.0, abs(rAcross));
            col += vec3(0.30, 0.65, 1.00) * plume * 1.4 * rLife * fwdMask;
            float plumeCore = plume * smoothstep(0.10, 0.0, plumeAlong);
            col += vec3(1.00, 0.95, 0.75) * plumeCore * 2.0 * rLife * fwdMask;
          }

          // ---- Wormhole every 27s (forward cone) ----
          if (fwdMask > 0.0) {
            float wCycle = 27.0;
            float wK = floor(uTime / wCycle);
            float wLocal = uTime - wK * wCycle;
            float wOpen = smoothstep(0.0, 2.0, wLocal) * smoothstep(8.0, 5.0, wLocal);
            if (wOpen > 0.001) {
              vec2 wPos = vec2(hash(vec2(wK, 71.3)) * 1.2 - 0.6,
                              hash(vec2(wK, 88.9)) * 1.2 - 0.6);
              vec2 wd = p - wPos;
              float wdr = length(wd);
              float wAng = atan(wd.y, wd.x);
              float horizon = smoothstep(0.05, 0.045, wdr);
              col *= 1.0 - horizon * wOpen * fwdMask;
              float discMask = smoothstep(0.05, 0.06, wdr)
                             * smoothstep(0.22, 0.10, wdr);
              float swirl = pow(warpedFbm(vec2(wAng * 4.0 + uTime * 2.0,
                                               wdr * 25.0 - uTime * 1.5)), 1.6);
              vec3 discCol = mix(vec3(1.0, 0.55, 0.20),
                                 vec3(0.55, 0.75, 1.20),
                                 smoothstep(0.05, 0.22, wdr));
              col += discCol * discMask * swirl * 1.8 * wOpen * fwdMask;
              float arc = smoothstep(0.072, 0.060, wdr) * smoothstep(0.045, 0.058, wdr);
              col += vec3(1.0, 0.85, 0.55) * arc * (0.6 + 0.4 * cos(wAng)) * wOpen * 1.2 * fwdMask;
            }
          }

          // Tone-map.
          col = col / (col + vec3(1.0));
          col = pow(col, vec3(0.85));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this._sphere = new THREE.Mesh(geom, mat);
    this._sphere.renderOrder = -100;
    this._sphere.frustumCulled = false;
    // Prevent raycast from hitting the sky sphere.
    this._sphere.raycast = () => {};
    this.add(this._sphere);
    this.visible = false;
  }
}

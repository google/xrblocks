import * as THREE from 'three';

const SPHERE_RADIUS = 50;

/**
 * Full-surround deep ocean for "walk-in" mode.
 * Inverted sphere: surface caustics + sunbeams up top, marine snow + abyss
 * below, drifting jellyfish and a passing whale shark in mid-water,
 * rising bubble columns.
 */
export class UnderwaterImmersive extends THREE.Object3D {
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
    this._time += dt;

    const mat = this._sphere.material;
    mat.uniforms.uTime.value = this._time;

    if (camera) {
      const camWorld = camera.getWorldPosition(new THREE.Vector3());
      const camLocal = camWorld.clone().applyMatrix4(this._entryMatrixInv);
      mat.uniforms.uCamLocal.value.copy(camLocal);

      const portalQuat = new THREE.Quaternion().setFromRotationMatrix(
        this._entryMatrix
      );
      const portalQuatInv = portalQuat.clone().invert();
      const rotMat4 = new THREE.Matrix4().makeRotationFromQuaternion(
        portalQuatInv
      );
      mat.uniforms.uViewRotation.value.setFromMatrix4(rotMat4);
    }

    if (camera) {
      camera.getWorldPosition(this.position);
    }
  }

  _buildSphere() {
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
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i); float b = hash(i + vec2(1,0));
          float c = hash(i + vec2(0,1)); float d = hash(i + vec2(1,1));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                                + (d - b) * u.x * u.y;
        }
        float noise3(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash3(i), hash3(i + vec3(1,0,0)), u.x),
                mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), u.x), u.y),
            mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), u.x),
                mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), u.x), u.y),
            u.z);
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
          return v;
        }
        float fbm3(vec3 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise3(p); p *= 2.07; a *= 0.5; }
          return v;
        }

        // Voronoi-ish caustic pattern at world position xz.
        float caustic(vec2 uv, float t) {
          vec2 p = uv * 0.6;
          float v = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            v += sin(p.x * (1.0 + fi * 0.4) + t * (0.7 + fi * 0.2))
               * sin(p.y * (1.3 + fi * 0.3) + t * (0.9 - fi * 0.15));
          }
          return pow(max(v * 0.33 + 0.5, 0.0), 2.5);
        }

        float raySphere(vec3 ro, vec3 rd, vec3 c, float rad) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float d = b * b - (dot(oc, oc) - rad * rad);
          if (d < 0.0) return -1.0;
          return -b - sqrt(d);
        }

        // Drifting jellyfish: glowing bell on top + trailing tendrils below.
        vec3 jellyfish(vec3 ro, vec3 rd, vec3 pos, float t, float seed) {
          vec3 oc = pos - ro;
          float along = dot(oc, rd);
          if (along < 0.5 || along > 25.0) return vec3(0.0);
          float fade = 1.0 / (1.0 + along * 0.08);
          float pulse = 0.5 + 0.5 * sin(t * 1.2 + seed * 7.0);
          vec3 color = mix(vec3(0.4, 0.85, 1.0), vec3(0.85, 0.55, 1.0),
                           sin(t + seed) * 0.5 + 0.5);

          // ---- Bell (upper hemisphere of a sphere) ----
          float bellR = 0.28 + 0.04 * pulse;
          float th = raySphere(ro, rd, pos, bellR);
          float bellHit = 0.0;
          if (th > 0.0) {
            vec3 hp = ro + rd * th;
            vec3 n = normalize(hp - pos);
            // Only the dome (top half).
            if (n.y > -0.05) {
              // Edge glow: fresnel-ish (rim brighter).
              float rim = pow(1.0 - max(-dot(rd, n), 0.0), 2.5);
              // Translucent fill (brighter near top center).
              float fill = smoothstep(-0.1, 1.0, n.y) * 0.6;
              bellHit = (fill + rim * 0.9) * (0.7 + pulse * 0.4);
            }
          }

          // ---- Tendrils: 6 vertical streamers hanging below bell ----
          float tendril = 0.0;
          vec3 proj = ro + rd * along;
          vec3 d = proj - pos;
          // Sample only if ray passes near bell center horizontally and below it.
          float horizD = length(d.xz);
          if (horizD < bellR * 1.4 && d.y < 0.0 && d.y > -1.0) {
            for (int k = 0; k < 6; k++) {
              float fk = float(k);
              float ang = fk / 6.0 * 6.28318;
              vec2 base = vec2(cos(ang), sin(ang)) * bellR * 0.6;
              // Sway tendrils.
              base += vec2(sin(t * 1.5 + fk + seed) * 0.02,
                           cos(t * 1.3 + fk * 1.7) * 0.02);
              float dx = length(d.xz - base);
              tendril += smoothstep(0.025, 0.0, dx)
                       * smoothstep(0.0, -0.8, d.y);
            }
          }

          // ---- Soft halo behind the whole creature ----
          float halo = smoothstep(bellR * 3.0, bellR, length(d)) * 0.18;

          return color * (bellHit + tendril * 0.5 + halo) * fade;
        }

        // Whale shark silhouette swimming past: oriented body, falls dim.
        vec3 whaleShark(vec3 ro, vec3 rd, float t) {
          // Position: slow horizontal arc across the user's view.
          float phase = t * 0.04;
          vec3 pos = vec3(sin(phase) * 18.0, -3.0 + sin(t * 0.1) * 0.5,
                          cos(phase) * 18.0 - 4.0);
          vec3 oc = pos - ro;
          float along = dot(oc, rd);
          if (along < 1.0 || along > 40.0) return vec3(0.0);
          vec3 proj = ro + rd * along;
          vec3 d = pos - proj;
          // Stretched ellipsoid: longer along forward of motion.
          vec3 fwd = vec3(cos(phase), 0.0, -sin(phase));
          float along2 = dot(d, fwd);
          vec3 perp = d - fwd * along2;
          // Body shape
          float body = smoothstep(0.6, 0.0, length(vec2(along2 / 4.0, length(perp))));
          // Tail wedge
          float tail = smoothstep(0.6, 0.0, length(vec2((along2 - 4.0) / 1.5, length(perp) * 2.0)));
          float silhouette = max(body, tail * 0.7);
          float fade = 1.0 / (1.0 + along * 0.05);
          // Dark grey with subtle white spots.
          vec3 spot = vec3(noise(perp.xy * 6.0 + along2));
          vec3 bodyCol = mix(vec3(0.06, 0.10, 0.14), vec3(0.18, 0.25, 0.30), spot.r);
          return bodyCol * silhouette * fade;
        }

        // Rising bubble columns: vertical streams at hashed xz positions.
        vec3 bubbles(vec3 ro, vec3 rd, float t) {
          vec3 col = vec3(0.0);
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float seed = fi * 13.7;
            // Column base at fixed xz.
            vec2 base = vec2(sin(seed) * 8.0 + cos(seed * 1.3) * 4.0,
                             cos(seed * 0.7) * 8.0 + sin(seed * 1.1) * 4.0);
            // Bubble height: cycles upward over time.
            float bh = mod(t * 1.5 + seed * 3.0, 6.0) - 1.0;
            vec3 pos = vec3(base.x + sin(bh + seed) * 0.15,
                            -2.5 + bh,
                            base.y + cos(bh + seed) * 0.15);
            vec3 oc = pos - ro;
            float along = dot(oc, rd);
            if (along < 0.3 || along > 20.0) continue;
            vec3 proj = ro + rd * along;
            float d = length(pos - proj);
            float r = 0.05 + 0.02 * sin(bh * 4.0 + seed);
            float bubble = smoothstep(r, 0.0, d) * 0.4;
            float fade = 1.0 / (1.0 + along * 0.15);
            col += vec3(0.85, 0.95, 1.00) * bubble * fade;
          }
          return col;
        }

        // Schools of clownfish: ray-ellipsoid body with proper shading,
        // black/white bands, eye, and tail fin. Lit by surface sunlight.
        // Ray-ellipsoid: returns nearest t, or -1.
        float rayEllip(vec3 ro, vec3 rd, vec3 axes) {
          vec3 roS = ro / axes;
          vec3 rdS = rd / axes;
          float A = dot(rdS, rdS);
          float B = dot(roS, rdS);
          float C = dot(roS, roS) - 1.0;
          float d = B * B - A * C;
          if (d < 0.0) return -1.0;
          return (-B - sqrt(d)) / A;
        }

        // Detailed clownfish: body + peduncle + dorsal + 2 pectoral fins +
        // forked caudal. Lit by surface sun. 2 schools x 3 fish.
        vec3 clownfishSchool(vec3 ro, vec3 rd, float t) {
          vec3 col = vec3(0.0);
          vec3 sunDir = normalize(vec3(0.2, 1.0, -0.3));
          vec3 bodyAxes = vec3(0.28, 0.16, 0.105);
          vec3 tailAxes = vec3(0.10, 0.07, 0.028);
          vec3 dorsalAxes = vec3(0.13, 0.11, 0.013);
          vec3 pectAxes = vec3(0.08, 0.018, 0.06);
          for (int s = 0; s < 2; s++) {
            float fs = float(s);
            vec3 schoolC = vec3(
                sin(t * 0.04 + fs * 2.1) * 2.5 + cos(fs * 3.7) * 1.5,
                -0.3 + sin(t * 0.05 + fs) * 0.4,
                cos(t * 0.045 + fs * 1.7) * 2.5 + sin(fs * 2.3) * 1.2);
            vec3 fwd = normalize(vec3(
                cos(t * 0.04 + fs * 2.1) * 2.5,
                0.0,
                -sin(t * 0.045 + fs * 1.7) * 2.5) + vec3(0.001));
            vec3 sideAx = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float seed = fs * 7.0 + fi * 1.3;
              vec3 off = vec3(
                  cos(seed) * 0.9 + sin(seed * 3.7) * 0.3,
                  sin(seed * 1.7) * 0.20,
                  sin(seed) * 0.9 + cos(seed * 2.1) * 0.3);
              vec3 pos = schoolC + off;
              float wig = sin(t * 3.5 + seed * 4.0) * 0.05;
              vec3 fwdW = normalize(fwd + sideAx * wig);
              vec3 sideW = normalize(cross(fwdW, vec3(0.0, 1.0, 0.0)));
              vec3 upW = normalize(cross(sideW, fwdW));

              vec3 oc = ro - pos;
              vec3 roL = vec3(dot(oc, fwdW), dot(oc, upW), dot(oc, sideW));
              vec3 rdL = vec3(dot(rd, fwdW), dot(rd, upW), dot(rd, sideW));

              // Body ellipsoid (head pointing +x).
              vec3 bodyOff = vec3(0.05, 0.0, 0.0);
              float tBody = rayEllip(roL - bodyOff, rdL, bodyAxes);
              // Tail peduncle.
              vec3 tailOff = vec3(-0.18, 0.0, 0.0);
              float tTail = rayEllip(roL - tailOff, rdL, tailAxes);
              // Dorsal fin (thin in z, tall in y, on top).
              vec3 dorsalOff = vec3(0.02, 0.20, 0.0);
              float tDor = rayEllip(roL - dorsalOff, rdL, dorsalAxes);
              // Pectoral fins (left & right, swept slightly back).
              vec3 pectOffL = vec3(0.06, -0.05, 0.10);
              vec3 pectOffR = vec3(0.06, -0.05, -0.10);
              float tPL = rayEllip(roL - pectOffL, rdL, pectAxes);
              float tPR = rayEllip(roL - pectOffR, rdL, pectAxes);

              // Closest hit + which part.
              float tH = -1.0;
              int which = 0;
              if (tBody > 0.3 && tBody < 18.0) { tH = tBody; which = 1; }
              if (tTail > 0.3 && tTail < 18.0 &&
                  (tH < 0.0 || tTail < tH)) { tH = tTail; which = 2; }
              if (tDor > 0.3 && tDor < 18.0 &&
                  (tH < 0.0 || tDor < tH)) { tH = tDor; which = 3; }
              if (tPL > 0.3 && tPL < 18.0 &&
                  (tH < 0.0 || tPL < tH)) { tH = tPL; which = 4; }
              if (tPR > 0.3 && tPR < 18.0 &&
                  (tH < 0.0 || tPR < tH)) { tH = tPR; which = 5; }

              if (which > 0) {
                vec3 hpL = roL + rdL * tH;
                vec3 nL;
                if (which == 1) {
                  nL = normalize((hpL - bodyOff) / (bodyAxes * bodyAxes));
                } else if (which == 2) {
                  nL = normalize((hpL - tailOff) / (tailAxes * tailAxes));
                } else if (which == 3) {
                  nL = normalize((hpL - dorsalOff) / (dorsalAxes * dorsalAxes));
                } else if (which == 4) {
                  nL = normalize((hpL - pectOffL) / (pectAxes * pectAxes));
                } else {
                  nL = normalize((hpL - pectOffR) / (pectAxes * pectAxes));
                }
                vec3 nW = sideW * nL.z + upW * nL.y + fwdW * nL.x;
                float u = hpL.x / 0.30;
                float v = hpL.y / 0.16;
                vec3 base = vec3(1.00, 0.45, 0.05);
                if (which == 1) {
                  // Three white bands w/ black trim, only on body.
                  float bandD = min(min(abs(u - 0.55), abs(u - 0.05)),
                                    abs(u + 0.4));
                  float white = smoothstep(0.16, 0.10, bandD);
                  float black = smoothstep(0.22, 0.16, bandD)
                              - smoothstep(0.16, 0.10, bandD);
                  base = mix(base, vec3(0.04, 0.04, 0.04), black);
                  base = mix(base, vec3(1.00, 1.00, 1.00), white);
                  // Eye on side of head.
                  float eyeD = length(vec2(u - 0.72, v - 0.20));
                  base = mix(base, vec3(0.02, 0.02, 0.02),
                             smoothstep(0.08, 0.05, eyeD));
                  base = mix(base, vec3(1.0, 1.0, 1.0),
                             smoothstep(0.035, 0.018, eyeD));
                  // Mouth: small dark curve at front.
                  float mouthD = abs(u - 0.95) + abs(v + 0.05) * 0.5;
                  base = mix(base, vec3(0.05, 0.02, 0.0),
                             smoothstep(0.10, 0.05, mouthD));
                  // Lighter belly.
                  base = mix(base, base * 1.5,
                             smoothstep(0.0, -0.7, v));
                } else if (which == 3 || which == 4 || which == 5) {
                  // Fins: black margin near outer edge.
                  float edge;
                  if (which == 3) edge = abs(hpL.y - dorsalOff.y) / dorsalAxes.y;
                  else edge = abs(hpL.x - bodyOff.x) / 0.10;
                  base = mix(base, vec3(0.04, 0.04, 0.04),
                             smoothstep(0.78, 0.95, edge));
                }
                float lamb = max(dot(nW, sunDir), 0.0);
                float rim = pow(1.0 - max(dot(nW, -rd), 0.0), 2.5);
                vec3 fishCol = base * (0.35 + lamb * 0.85)
                             + vec3(0.4, 0.6, 0.8) * rim * 0.25;
                col += fishCol * 1.6 / (1.0 + tH * 0.1);
              }

              // Forked caudal fin: upper + lower triangular slabs.
              float denom = dot(rd, sideW);
              if (abs(denom) > 1e-4) {
                for (int k = 0; k < 2; k++) {
                  float kk = float(k);
                  // Upper lobe k=0 (centered above), lower k=1 (below).
                  float yC = (kk == 0.0) ? 0.06 : -0.06;
                  vec3 finC = pos + fwdW * (-0.32) + upW * yC;
                  float tFin = dot(finC - ro, sideW) / denom;
                  if (tFin > 0.3 && tFin < 18.0 &&
                      (tH < 0.0 || tFin < tH)) {
                    vec3 fp = ro + rd * tFin - finC;
                    float fu = dot(fp, fwdW);
                    float fv = dot(fp, upW);
                    // Triangular lobe widening backward.
                    float yLo = (kk == 0.0) ? 0.0 : -0.10 - fu * 0.5;
                    float yHi = (kk == 0.0) ? 0.10 + fu * 0.5 + 0.06 : 0.0;
                    float finMask = step(fu, 0.0) * step(-0.16, fu)
                                  * step(yLo, fv) * step(fv, yHi);
                    if (finMask > 0.0) {
                      vec3 finBase = vec3(1.00, 0.45, 0.05);
                      // Black trailing edge.
                      float trail = step(fu, -0.13);
                      finBase = mix(finBase, vec3(0.04, 0.04, 0.04), trail);
                      col += finBase * 1.4 / (1.0 + tFin * 0.1);
                    }
                  }
                }
              }
            }
          }
          return col;
        }

        // Coral reef: 5 colorful clusters with trunk + tilted branches + bumpy
        // surface noise.
        vec3 coralReef(vec3 ro, vec3 rd) {
          vec3 sunDir = normalize(vec3(0.2, 1.0, -0.3));
          float bestT = 100.0;
          vec3 bestCol = vec3(0.0);
          vec3 bestN = vec3(0.0);
          vec3 bestHp = vec3(0.0);
          for (int c = 0; c < 5; c++) {
            float fc = float(c);
            vec3 base = vec3(
                cos(fc * 1.7 + 0.5) * 5.5,
                -6.0,
                sin(fc * 1.7 + 0.5) * 5.5);
            vec3 palette;
            if (c == 0) palette = vec3(1.00, 0.30, 0.55);
            else if (c == 1) palette = vec3(1.00, 0.55, 0.10);
            else if (c == 2) palette = vec3(0.60, 0.25, 0.90);
            else if (c == 3) palette = vec3(1.00, 0.85, 0.20);
            else palette = vec3(0.20, 0.85, 0.70);
            // Trunk.
            vec3 trunkAx = vec3(0.10, 0.55, 0.10);
            vec3 trunkCtr = base + vec3(0.0, 0.55, 0.0);
            float tT = rayEllip(ro - trunkCtr, rd, trunkAx);
            if (tT > 0.3 && tT < bestT) {
              bestT = tT;
              bestHp = ro + rd * tT - trunkCtr;
              bestN = normalize(bestHp / (trunkAx * trunkAx));
              bestCol = palette;
            }
            // 6 tilted branches radiating up and out.
            for (int b = 0; b < 6; b++) {
              float fb = float(b);
              float ang = fb * 1.04 + fc * 0.7;
              float tilt = 0.7 + sin(fb + fc) * 0.2;
              vec3 dir = normalize(vec3(cos(ang), tilt, sin(ang)));
              vec3 side = normalize(
                  cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(0.001));
              vec3 up = normalize(cross(side, dir));
              vec3 ctr = base + vec3(0.0, 0.55, 0.0) + dir * 0.35;
              vec3 oc = ro - ctr;
              vec3 roL = vec3(dot(oc, dir), dot(oc, up), dot(oc, side));
              vec3 rdL = vec3(dot(rd, dir), dot(rd, up), dot(rd, side));
              vec3 ax = vec3(0.32, 0.07, 0.07);
              float tB = rayEllip(roL, rdL, ax);
              if (tB > 0.3 && tB < bestT) {
                bestT = tB;
                vec3 hpL = roL + rdL * tB;
                vec3 nL = normalize(hpL / (ax * ax));
                bestN = side * nL.z + up * nL.y + dir * nL.x;
                bestHp = ro + rd * tB - ctr;
                bestCol = palette;
              }
            }
          }
          if (bestT >= 100.0) return vec3(0.0);
          // Bumpy organic surface from fbm.
          float bumpy = fbm3(bestHp * 8.0);
          vec3 base = bestCol * mix(0.75, 1.10, bumpy);
          float lamb = max(dot(bestN, sunDir), 0.0);
          float rim = pow(1.0 - max(dot(bestN, -rd), 0.0), 2.5);
          vec3 col = base * (0.35 + lamb * 0.85)
                   + vec3(0.5, 0.7, 0.9) * rim * 0.25;
          return col / (1.0 + bestT * 0.06);
        }

        // Blue tang school: Dory-style. Tall blue body, yellow tail, palette mark.
        vec3 blueTangSchool(vec3 ro, vec3 rd, float t) {
          vec3 col = vec3(0.0);
          vec3 sunDir = normalize(vec3(0.2, 1.0, -0.3));
          vec3 bodyAxes = vec3(0.26, 0.22, 0.085);
          vec3 tailAxes = vec3(0.10, 0.09, 0.025);
          vec3 dorsalAxes = vec3(0.13, 0.13, 0.012);
          vec3 pectAxes = vec3(0.07, 0.018, 0.05);
          vec3 schoolC = vec3(
              sin(t * 0.06) * 3.0 + 1.5,
              0.5 + sin(t * 0.07) * 0.3,
              cos(t * 0.07) * 3.0 - 1.5);
          vec3 fwd = normalize(vec3(
              cos(t * 0.06) * 3.0, 0.0,
              -sin(t * 0.07) * 3.0) + vec3(0.001));
          vec3 sideAx = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
          for (int i = 0; i < 4; i++) {
            float seed = float(i) * 1.7 + 3.3;
            vec3 off = vec3(
                cos(seed) * 0.7 + sin(seed * 2.1) * 0.25,
                sin(seed * 1.7) * 0.20,
                sin(seed) * 0.7);
            vec3 pos = schoolC + off;
            float wig = sin(t * 3.5 + seed * 4.0) * 0.05;
            vec3 fwdW = normalize(fwd + sideAx * wig);
            vec3 sideW = normalize(cross(fwdW, vec3(0.0, 1.0, 0.0)));
            vec3 upW = normalize(cross(sideW, fwdW));
            vec3 oc = ro - pos;
            vec3 roL = vec3(dot(oc, fwdW), dot(oc, upW), dot(oc, sideW));
            vec3 rdL = vec3(dot(rd, fwdW), dot(rd, upW), dot(rd, sideW));

            vec3 bodyOff = vec3(0.04, 0.0, 0.0);
            float tBody = rayEllip(roL - bodyOff, rdL, bodyAxes);
            vec3 tailOff = vec3(-0.18, 0.0, 0.0);
            float tTail = rayEllip(roL - tailOff, rdL, tailAxes);
            vec3 dorsalOff = vec3(0.02, 0.24, 0.0);
            float tDor = rayEllip(roL - dorsalOff, rdL, dorsalAxes);
            vec3 pectOffL = vec3(0.06, -0.04, 0.10);
            vec3 pectOffR = vec3(0.06, -0.04, -0.10);
            float tPL = rayEllip(roL - pectOffL, rdL, pectAxes);
            float tPR = rayEllip(roL - pectOffR, rdL, pectAxes);

            float tH = -1.0;
            int which = 0;
            if (tBody > 0.3 && tBody < 18.0) { tH = tBody; which = 1; }
            if (tTail > 0.3 && tTail < 18.0 &&
                (tH < 0.0 || tTail < tH)) { tH = tTail; which = 2; }
            if (tDor > 0.3 && tDor < 18.0 &&
                (tH < 0.0 || tDor < tH)) { tH = tDor; which = 3; }
            if (tPL > 0.3 && tPL < 18.0 &&
                (tH < 0.0 || tPL < tH)) { tH = tPL; which = 4; }
            if (tPR > 0.3 && tPR < 18.0 &&
                (tH < 0.0 || tPR < tH)) { tH = tPR; which = 5; }

            if (which > 0) {
              vec3 hpL = roL + rdL * tH;
              vec3 nL;
              if (which == 1) {
                nL = normalize((hpL - bodyOff) / (bodyAxes * bodyAxes));
              } else if (which == 2) {
                nL = normalize((hpL - tailOff) / (tailAxes * tailAxes));
              } else if (which == 3) {
                nL = normalize((hpL - dorsalOff) / (dorsalAxes * dorsalAxes));
              } else if (which == 4) {
                nL = normalize((hpL - pectOffL) / (pectAxes * pectAxes));
              } else {
                nL = normalize((hpL - pectOffR) / (pectAxes * pectAxes));
              }
              vec3 nW = sideW * nL.z + upW * nL.y + fwdW * nL.x;
              float u = hpL.x / 0.30;
              float v = hpL.y / 0.22;
              vec3 base = vec3(0.10, 0.40, 0.95);
              if (which == 1) {
                // Black palette / "6" mark on upper body.
                float bd = length(vec2((u + 0.05) * 1.2, (v - 0.20) * 0.9));
                base = mix(base, vec3(0.03, 0.03, 0.10),
                           smoothstep(0.55, 0.30, bd));
                // Yellow tail/back third.
                base = mix(base, vec3(1.0, 0.85, 0.10),
                           smoothstep(-0.30, -0.65, u));
                // Eye on head.
                float eyeD = length(vec2(u - 0.65, v - 0.10));
                base = mix(base, vec3(0.02, 0.02, 0.05),
                           smoothstep(0.08, 0.05, eyeD));
                base = mix(base, vec3(1.0, 1.0, 1.0),
                           smoothstep(0.035, 0.018, eyeD));
                // Mouth.
                float mouthD = abs(u - 0.95) + abs(v + 0.05) * 0.5;
                base = mix(base, vec3(0.05, 0.02, 0.0),
                           smoothstep(0.10, 0.05, mouthD));
              } else if (which == 2) {
                // Tail peduncle is yellow.
                base = vec3(1.0, 0.85, 0.10);
              } else if (which == 3) {
                // Dorsal fin: blue with yellow tip.
                float topness = (hpL.y - dorsalOff.y) / dorsalAxes.y;
                base = mix(vec3(0.10, 0.40, 0.95),
                           vec3(1.0, 0.85, 0.10),
                           smoothstep(0.4, 0.95, topness));
              } else {
                // Pectorals: blue with darker edge.
                float edge = abs(hpL.x - bodyOff.x) / 0.10;
                base = mix(vec3(0.10, 0.40, 0.95),
                           vec3(0.04, 0.04, 0.10),
                           smoothstep(0.78, 0.95, edge));
              }
              float lamb = max(dot(nW, sunDir), 0.0);
              float rim = pow(1.0 - max(dot(nW, -rd), 0.0), 2.5);
              vec3 fishCol = base * (0.35 + lamb * 0.85)
                           + vec3(0.4, 0.6, 0.9) * rim * 0.25;
              col += fishCol * 1.6 / (1.0 + tH * 0.1);
            }

            // Forked yellow caudal fin.
            float denom = dot(rd, sideW);
            if (abs(denom) > 1e-4) {
              for (int k = 0; k < 2; k++) {
                float kk = float(k);
                float yC = (kk == 0.0) ? 0.06 : -0.06;
                vec3 finC = pos + fwdW * (-0.32) + upW * yC;
                float tFin = dot(finC - ro, sideW) / denom;
                if (tFin > 0.3 && tFin < 18.0 &&
                    (tH < 0.0 || tFin < tH)) {
                  vec3 fp = ro + rd * tFin - finC;
                  float fu = dot(fp, fwdW);
                  float fv = dot(fp, upW);
                  float yLo = (kk == 0.0) ? 0.0 : -0.10 - fu * 0.5;
                  float yHi = (kk == 0.0) ? 0.10 + fu * 0.5 + 0.06 : 0.0;
                  float finMask = step(fu, 0.0) * step(-0.16, fu)
                                * step(yLo, fv) * step(fv, yHi);
                  if (finMask > 0.0) {
                    vec3 finBase = vec3(1.0, 0.85, 0.10);
                    float trail = step(fu, -0.13);
                    finBase = mix(finBase, vec3(0.04, 0.04, 0.10), trail);
                    col += finBase * 1.4 / (1.0 + tFin * 0.1);
                  }
                }
              }
            }
          }
          return col;
        }

        // Marine snow: fine particles drifting downward.
        float marineSnow(vec3 ro, vec3 rd, float t) {
          float v = 0.0;
          for (int i = 0; i < 16; i++) {
            float fi = float(i);
            float seed = fi * 7.13;
            float along = mix(2.0, 18.0, fract(seed * 0.37));
            vec3 sample_p = ro + rd * along;
            // Slow drift downward.
            sample_p.y += t * 0.3 + seed;
            vec3 cell = floor(sample_p * 1.5);
            vec3 fc = fract(sample_p * 1.5);
            float h = hash3(cell);
            if (h > 0.985) {
              float d = length(fc - 0.5);
              v += smoothstep(0.05, 0.0, d) * 0.4 / (1.0 + along * 0.3);
            }
          }
          return v;
        }

        // Sunbeam shafts from above: density along ray scales by surface
        // brightness at sample points.
        float sunbeams(vec3 ro, vec3 rd, float t) {
          if (rd.y < 0.05) return 0.0;
          // Step along ray from the user up toward the surface (y=8).
          float density = 0.0;
          float surfaceY = 8.0;
          for (int i = 1; i <= 12; i++) {
            float fi = float(i);
            float along = fi * 0.7;
            vec3 sample_p = ro + rd * along;
            // Closer to surface = brighter.
            float depthFactor = clamp(sample_p.y / surfaceY, 0.0, 1.0);
            // Caustic-modulated brightness.
            float c = caustic(sample_p.xz, t);
            density += c * depthFactor * 0.05;
          }
          // Vertical bias: stronger when looking up.
          density *= pow(max(rd.y, 0.0), 0.6);
          return density;
        }

        void main() {
          vec3 rd = normalize(uViewRotation * vWorldDir);
          vec3 ro = uCamLocal;

          // ---- Vertical depth gradient ----
          // Above eye = brighter (toward surface), below = abyss.
          float t = uTime;
          vec3 surfaceCol = vec3(0.20, 0.65, 0.85);
          vec3 midCol = vec3(0.05, 0.30, 0.55);
          vec3 abyssCol = vec3(0.005, 0.020, 0.075);
          float depthT = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(abyssCol, midCol, smoothstep(0.25, 0.55, depthT));
          col = mix(col, surfaceCol, smoothstep(0.55, 0.95, depthT));

          // ---- Surface caustics when looking up ----
          if (rd.y > 0.3) {
            // Project ray to a plane at y = surface.
            float surfaceY = 8.0;
            float kt = (surfaceY - ro.y) / rd.y;
            if (kt > 0.0) {
              vec3 sp = ro + rd * kt;
              // Gentle refractive wobble on the surface plane.
              sp.xz += vec2(sin(t * 0.3 + sp.x * 0.5) * 0.4,
                            cos(t * 0.25 + sp.z * 0.5) * 0.4);
              float c = caustic(sp.xz, t);
              col = mix(col, vec3(0.95, 1.00, 0.75),
                        c * smoothstep(0.3, 0.95, rd.y) * 0.55);
              // Sun disc through surface.
              vec3 sunDir = normalize(vec3(0.2, 1.0, -0.3));
              float sa = max(dot(rd, sunDir), 0.0);
              col += vec3(1.00, 0.95, 0.75)
                   * smoothstep(0.965, 0.995, sa) * 0.9;
              col += vec3(1.00, 0.95, 0.75)
                   * smoothstep(0.85, 1.0, sa) * 0.25;
            }
          }

          // ---- Sunbeam shafts (volumetric) ----
          float beams = sunbeams(ro, rd, t);
          col += vec3(0.80, 0.95, 1.00) * beams * 1.4;

          // ---- Distant ground (ocean floor) ----
          if (rd.y < -0.1) {
            float gt = -ro.y - 6.0;
            float t2 = gt / rd.y;
            if (t2 > 0.0 && t2 < 80.0) {
              vec3 gp = ro + rd * t2;
              float gn = fbm(gp.xz * 0.15);
              vec3 ground = mix(vec3(0.18, 0.14, 0.08),
                                vec3(0.30, 0.25, 0.15), gn);
              float fog = smoothstep(0.0, 35.0, t2);
              col = mix(ground, col, fog);
            }
          }

          // ---- Drifting jellyfish (animated 3D positions) ----
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float seed = fi * 11.3;
            vec3 jp = vec3(
              sin(t * 0.2 + seed) * 5.0 + cos(seed * 1.7) * 3.0,
              0.5 + sin(t * 0.3 + seed * 0.7) * 2.0,
              cos(t * 0.25 + seed) * 5.0 + sin(seed * 0.9) * 3.0);
            col += jellyfish(ro, rd, jp, t, seed);
          }

          // ---- Whale shark passing ----
          col += whaleShark(ro, rd, t);

          // ---- Rising bubble columns ----
          col += bubbles(ro, rd, t);

          // ---- Coral reef on the floor ----
          col += coralReef(ro, rd);

          // ---- Clownfish schools ----
          col += clownfishSchool(ro, rd, t);

          // ---- Blue tang school ----
          col += blueTangSchool(ro, rd, t);

          // ---- Marine snow ----
          col += vec3(0.95, 0.98, 1.00) * marineSnow(ro, rd, t);

          // ---- Depth-distance haze (blue scattering) ----
          // Horizontal rays travel through more water — fade toward deep teal.
          vec3 deepFog = vec3(0.02, 0.12, 0.22);
          float viewDist = clamp(1.0 - abs(rd.y), 0.0, 1.0);
          float haze = viewDist * viewDist * 0.35;
          col = mix(col, deepFog, haze);

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
    this._sphere.raycast = () => {};
    this.add(this._sphere);
    this.visible = false;
  }
}

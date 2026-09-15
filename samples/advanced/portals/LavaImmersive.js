import * as THREE from 'three';

const SPHERE_RADIUS = 50;

/**
 * Full-surround volcanic landscape for "walk-in" mode.
 * Inverted sphere: smoky red/orange sky with ash plume + lightning,
 * distant volcano silhouette with glowing crater, rising ember columns
 * in 3D, lava bombs arcing past, glowing magma ground beneath.
 */
export class LavaImmersive extends THREE.Object3D {
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

        // Volcano silhouette mask in cylindrical (azimuth, altitude) coords.
        // Returns mask 0..1 for "inside cone", plus crater glow factor.
        vec2 volcanoAt(vec3 rd, float az0, float dist, float t) {
          float az = atan(rd.x, -rd.z);
          float alt = asin(clamp(rd.y, -1.0, 1.0));
          // Center the volcano at az0.
          float dAz = az - az0;
          if (dAz > 3.14159) dAz -= 6.28318;
          if (dAz < -3.14159) dAz += 6.28318;
          // Distance scales the cone size.
          float coneW = 0.18 / dist;
          float coneTop = 0.22 / dist;
          // Cone profile: triangular.
          float dxNorm = abs(dAz) / coneW;
          float topAlt = coneTop * (1.0 - dxNorm);
          // Add jagged top noise.
          float jagged = (noise(vec2(dAz * 50.0, t * 0.05)) - 0.5) * 0.012;
          topAlt += jagged;
          float mask = step(alt, topAlt) * step(0.0, alt) * step(dxNorm, 1.0);
          // Crater glow: bright top center.
          float crater = exp(-dxNorm * 8.0)
                       * smoothstep(coneTop * 0.5, coneTop, alt) * mask;
          return vec2(mask, crater);
        }

        float raySphere(vec3 ro, vec3 rd, vec3 c, float rad) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float d = b * b - (dot(oc, oc) - rad * rad);
          if (d < 0.0) return -1.0;
          return -b - sqrt(d);
        }

        // Ray vs axis-aligned ellipsoid centered at origin.
        float rayEllip(vec3 oc, vec3 rd, vec3 ax) {
          vec3 ocS = oc / ax;
          vec3 rdS = rd / ax;
          float a = dot(rdS, rdS);
          float b = dot(ocS, rdS);
          float c = dot(ocS, ocS) - 1.0;
          float d = b * b - a * c;
          if (d < 0.0) return -1.0;
          float t = (-b - sqrt(d)) / a;
          return t;
        }

        // Ray vs truncated cone (volcano with flat-top crater).
        // base: world position of the base center; topY: vertical height to
        // crater plateau; bottomR: base radius; topR: crater radius.
        // Returns vec4(rgb, t) — t = 1e9 on miss.
        vec4 volcanoCone(vec3 ro, vec3 rd, vec3 base, float topY,
                         float bottomR, float topR, float t) {
          vec3 sunDir = normalize(vec3(0.3, 0.6, -0.7));
          // Virtual apex (where extended sides converge).
          float craterOffset = topR * topY / max(bottomR - topR, 0.001);
          vec3 apex = base + vec3(0.0, topY + craterOffset, 0.0);
          float tanT = bottomR / (topY + craterOffset);
          float tan2 = tanT * tanT;
          vec3 oc = ro - apex;
          float a = rd.x * rd.x + rd.z * rd.z - tan2 * rd.y * rd.y;
          float b = oc.x * rd.x + oc.z * rd.z - tan2 * oc.y * rd.y;
          float c = oc.x * oc.x + oc.z * oc.z - tan2 * oc.y * oc.y;
          float tCone = 1e9;
          if (abs(a) > 1e-5) {
            float disc = b * b - a * c;
            if (disc > 0.0) {
              float sq = sqrt(disc);
              float t0 = (-b - sq) / a;
              float t1 = (-b + sq) / a;
              for (int k = 0; k < 2; k++) {
                float ti = (k == 0) ? t0 : t1;
                if (ti > 0.5 && ti < tCone) {
                  float py = ro.y + rd.y * ti;
                  if (py >= base.y && py <= base.y + topY) tCone = ti;
                }
              }
            }
          }
          float tPlat = 1e9;
          if (abs(rd.y) > 1e-5) {
            float plateauY = base.y + topY;
            float tp = (plateauY - ro.y) / rd.y;
            if (tp > 0.5) {
              vec3 hp = ro + rd * tp;
              float r = length(hp.xz - apex.xz);
              if (r <= topR) tPlat = tp;
            }
          }
          float tBest = min(tCone, tPlat);
          if (tBest >= 1e9) return vec4(0.0, 0.0, 0.0, 1e9);
          bool hitPlat = (tPlat <= tCone);
          vec3 hp = ro + rd * tBest;
          vec3 nrm;
          if (hitPlat) {
            nrm = vec3(0.0, 1.0, 0.0);
          } else {
            vec3 op = hp - apex;
            nrm = normalize(vec3(op.x, -tan2 * op.y, op.z));
          }
          vec3 col;
          if (hitPlat) {
            // Cracked dark crust with glowing molten fissures.
            float r = length(hp.xz - apex.xz) / topR;
            float crustNoise = fbm3(hp * 1.8 + vec3(0.0, t * 0.15, 0.0));
            float fissure = fbm3(hp * 3.5 + vec3(t * 0.25, 0.0, t * 0.2));
            float crackMask = smoothstep(0.48, 0.60, fissure);
            vec3 crust = mix(vec3(0.06, 0.03, 0.02),
                             vec3(0.16, 0.08, 0.05), crustNoise);
            vec3 hotLava = mix(vec3(1.00, 0.55, 0.10),
                               vec3(1.00, 0.95, 0.55),
                               smoothstep(0.55, 0.75, fissure));
            col = mix(crust, hotLava, crackMask);
            // Brighter near center where it's hottest.
            col *= mix(1.4, 0.85, r);
          } else {
            float h = clamp((hp.y - base.y) / topY, 0.0, 1.0);
            float ang = atan(hp.x - apex.x, hp.z - apex.z);
            // Layered strata using vertical bands.
            float strata = fbm3(vec3(ang * 1.5, h * 6.0, 0.0));
            float pebble = fbm3(hp * 3.5);
            vec3 darkRock = vec3(0.07, 0.04, 0.03);
            vec3 midRock = vec3(0.20, 0.11, 0.07);
            vec3 ashRock = vec3(0.32, 0.26, 0.22);
            vec3 rock = mix(darkRock, midRock, strata);
            rock = mix(rock, ashRock, smoothstep(0.55, 0.95, h) * 0.55);
            rock = mix(rock * 0.85, rock * 1.15, pebble);
            // Discrete lava channels: a few angular bands that gain near top.
            float chan = abs(fract(ang * 1.9 + fbm3(hp * 0.6) * 0.4) - 0.5);
            float channelMask = smoothstep(0.04, 0.0, chan)
                              * smoothstep(0.15, 0.65, h);
            float trickle = fbm(vec2(ang * 8.0, h * 4.5 - t * 0.18));
            channelMask *= smoothstep(0.35, 0.75, trickle);
            vec3 lavaHot = mix(vec3(0.85, 0.18, 0.04),
                               vec3(1.00, 0.70, 0.20),
                               smoothstep(0.6, 1.0, h));
            col = mix(rock, lavaHot, channelMask);
            // Hot rim glow just below the crater edge.
            float rimGlow = smoothstep(0.88, 1.0, h);
            col += vec3(1.00, 0.50, 0.10) * rimGlow * 0.55;
            float lamb = max(dot(nrm, sunDir), 0.0);
            float ao = mix(0.6, 1.0, h);
            col = col * (0.22 + lamb * 0.95) * ao;
            float rim = pow(1.0 - max(dot(nrm, -rd), 0.0), 2.5);
            col += vec3(0.55, 0.28, 0.18) * rim * 0.20;
            // Lava channels emit even in shadow.
            col += lavaHot * channelMask * 0.55;
          }
          return vec4(col, tBest);
        }

        // Foreground lava rocks scattered around the user.
        vec4 lavaRocks(vec3 ro, vec3 rd, float t) {
          vec3 sunDir = normalize(vec3(0.3, 0.6, -0.7));
          float bestT = 1e9;
          vec3 bestCol = vec3(0.0);
          vec3 bestN = vec3(0.0);
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float ang = fi * 0.91;
            float dist = 4.5 + mod(fi * 1.7, 4.0);
            vec3 base = vec3(cos(ang) * dist, -1.6,
                              sin(ang) * dist);
            float ry = 0.35 + 0.18 * sin(fi * 2.3);
            vec3 ax = vec3(0.7 + 0.2 * cos(fi * 1.7),
                            ry,
                            0.6 + 0.2 * sin(fi * 1.7));
            vec3 ctr = base + vec3(0.0, ry, 0.0);
            float th = rayEllip(ro - ctr, rd, ax);
            if (th > 0.3 && th < bestT) {
              bestT = th;
              vec3 hp = ro + rd * th - ctr;
              bestN = normalize(hp / (ax * ax));
              float n = fbm3(hp * 4.0 + fi);
              vec3 rock = mix(vec3(0.06, 0.03, 0.02),
                              vec3(0.18, 0.09, 0.07), n);
              // Glowing crack underneath.
              float crack = smoothstep(0.55, 0.7,
                                        fbm(hp.xz * 9.0 + t * 0.2));
              crack *= max(-bestN.y, 0.0);  // crack glow on undersides
              bestCol = mix(rock, vec3(1.0, 0.42, 0.08), crack * 0.6);
            }
          }
          if (bestT >= 1e9) return vec4(0.0, 0.0, 0.0, 1e9);
          float lamb = max(dot(bestN, sunDir), 0.0);
          float rim = pow(1.0 - max(dot(bestN, -rd), 0.0), 2.5);
          vec3 col = bestCol * (0.30 + lamb * 0.85)
                   + vec3(1.0, 0.5, 0.2) * rim * 0.18;
          return vec4(col, bestT);
        }

        // Rising ember columns: small fast glowing particles around user.
        vec3 embers(vec3 ro, vec3 rd, float t) {
          vec3 col = vec3(0.0);
          for (int i = 0; i < 14; i++) {
            float fi = float(i);
            float seed = fi * 9.7;
            // Column base xz (close to user).
            vec2 base = vec2(sin(seed) * 4.0 + cos(seed * 1.7) * 2.5,
                             cos(seed * 0.9) * 4.0 + sin(seed * 1.3) * 2.5);
            // Ember height cycles upward fast.
            float eh = mod(t * 2.5 + seed * 5.0, 4.0);
            vec3 pos = vec3(base.x + sin(eh * 2.0 + seed) * 0.2,
                            -1.0 + eh,
                            base.y + cos(eh * 2.0 + seed) * 0.2);
            vec3 oc = pos - ro;
            float along = dot(oc, rd);
            if (along < 0.3 || along > 12.0) continue;
            vec3 proj = ro + rd * along;
            float d = length(pos - proj);
            float r = 0.06;
            float spark = smoothstep(r, 0.0, d);
            float pulse = 0.7 + 0.3 * sin(eh * 8.0 + seed);
            float fade = (1.0 - eh / 4.0) / (1.0 + along * 0.2);
            col += vec3(1.00, 0.55, 0.15) * spark * pulse * fade * 1.2;
          }
          return col;
        }


        void main() {
          vec3 rd = normalize(uViewRotation * vWorldDir);
          vec3 ro = uCamLocal;
          float t = uTime;

          // ---- Smoky red sky gradient ----
          float skyT = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 lowSky = vec3(0.95, 0.45, 0.15);
          vec3 midSky = vec3(0.55, 0.15, 0.10);
          vec3 highSky = vec3(0.18, 0.04, 0.12);
          vec3 col = mix(lowSky, midSky, smoothstep(0.45, 0.65, skyT));
          col = mix(col, highSky, smoothstep(0.65, 1.0, skyT));

          // Drifting ash clouds (3D noise based on direction).
          float ash = fbm3(rd * 2.5 + vec3(t * 0.05, 0.0, t * 0.04));
          ash *= smoothstep(0.0, 0.4, rd.y);
          col = mix(col, vec3(0.10, 0.05, 0.10), ash * 0.55);

          // Distant glowing sparks high in the sky.
          if (rd.y > 0.0) {
            // Octahedral mapping for seamless grid.
            vec3 a = abs(rd);
            float sum = a.x + a.y + a.z;
            vec2 oct = rd.xz / sum;
            if (rd.y < 0.0) {
              oct = (1.0 - abs(oct.yx)) * vec2(oct.x >= 0.0 ? 1.0 : -1.0,
                                                oct.y >= 0.0 ? 1.0 : -1.0);
            }
            vec2 uv = oct * 0.5 + 0.5;
            float sparks = 0.0;
            for (int k = 0; k < 1; k++) {
              vec2 g = floor(uv * 80.0);
              vec2 f = fract(uv * 80.0);
              float h = hash(g);
              if (h > 0.992) {
                vec2 jit = vec2(hash(g + 1.7), hash(g + 7.3)) * 0.6 + 0.2;
                sparks = smoothstep(0.05, 0.0, length(f - jit));
              }
            }
            col += vec3(1.0, 0.85, 0.55) * sparks * 0.6;
          }

          // ---- 3D raycast volcanoes (parallax correctly as user walks) ----
          // Track best opaque hit (volcanoes + rocks).
          float opaqueT = 1e9;
          vec3 opaqueCol = vec3(0.0);
          // ---- 3D raycast volcanoes (true cone shape with crater) ----
          // base, topY (height), bottomR, topR (crater radius).
          vec4 v1Hit = volcanoCone(ro, rd, vec3(2.0, -1.6, -16.0), 6.0,
                                    8.5, 2.6, t);
          if (v1Hit.w < opaqueT) {
            opaqueT = v1Hit.w;
            opaqueCol = v1Hit.rgb;
          }
          vec4 v2Hit = volcanoCone(ro, rd, vec3(-15.0, -1.6, 8.0), 4.2,
                                    6.0, 1.8, t);
          if (v2Hit.w < opaqueT) {
            opaqueT = v2Hit.w;
            opaqueCol = v2Hit.rgb;
          }
          vec4 rocksHit = lavaRocks(ro, rd, t);
          if (rocksHit.w < opaqueT) {
            opaqueT = rocksHit.w;
            opaqueCol = rocksHit.rgb;
          }
          if (opaqueT < 1e8) {
            // Atmospheric fog blends distant volcanoes into smoky sky.
            float fogF = smoothstep(4.0, 60.0, opaqueT);
            col = mix(opaqueCol, col, fogF * 0.55);
          }

          // ---- Animated plume + lava spurts above each volcano apex ----
          for (int v = 0; v < 2; v++) {
            vec3 apexW = (v == 0) ? vec3(2.0, 4.4, -16.0)
                                   : vec3(-15.0, 2.6, 8.0);
            for (int i = 0; i < 14; i++) {
              float h = float(i) * 0.65;
              float ty = apexW.y + h;
              if (abs(rd.y) < 0.001) continue;
              float ti = (ty - ro.y) / rd.y;
              if (ti < 0.5 || ti > opaqueT) continue;
              vec3 p = ro + rd * ti;
              vec2 d = p.xz - apexW.xz;
              float r = length(d);
              float radius = 1.6 + h * 0.55;
              float mask = smoothstep(radius, radius * 0.35, r);
              float n = fbm3(vec3(d.x * 0.45, h * 0.6 - t * 0.5,
                                   d.y * 0.45));
              vec3 ashHot = vec3(0.55, 0.30, 0.18);
              vec3 ashCold = vec3(0.20, 0.16, 0.18);
              vec3 ashCol = mix(ashHot, ashCold, smoothstep(0.0, 6.0, h));
              ashCol = mix(ashCol * 0.4, ashCol, n);
              col += ashCol * mask * (0.06 + n * 0.10);
              if (h < 1.5) {
                col += vec3(1.0, 0.55, 0.20) * mask * (1.5 - h) * 0.07;
              }
            }
            for (int b = 0; b < 5; b++) {
              float fb = float(b) + float(v) * 11.3;
              float cycle = 2.6 + fb * 0.31;
              float phase = mod(t + fb * 0.7, cycle) / cycle;
              float ck = floor((t + fb * 0.7) / cycle);
              float ang = hash(vec2(fb, ck)) * 6.28318;
              float spread = 0.5 + hash(vec2(fb + 3.1, ck)) * 0.8;
              float peakH = 2.5 + hash(vec2(fb + 7.7, ck)) * 2.0;
              vec3 dir = vec3(cos(ang) * spread, 0.0, sin(ang) * spread);
              vec3 pos = apexW + dir * phase
                       + vec3(0.0,
                              peakH * 4.0 * phase * (1.0 - phase), 0.0);
              vec3 oc2 = ro - pos;
              float rad = 0.18;
              float bSp = dot(oc2, rd);
              float cSp = dot(oc2, oc2) - rad * rad;
              float disc = bSp * bSp - cSp;
              if (disc > 0.0) {
                float ts = -bSp - sqrt(disc);
                if (ts > 0.5 && ts < opaqueT) {
                  vec3 lavaC = mix(vec3(1.0, 0.95, 0.55),
                                   vec3(0.95, 0.30, 0.05), phase);
                  col = mix(col, lavaC * 1.6, 0.95);
                }
              }
              vec3 tp = ro + rd * max(dot(pos - ro, rd), 0.5);
              float trail = exp(-length(tp - pos) * 4.0)
                          * smoothstep(0.0, 0.6, phase);
              col += vec3(1.0, 0.55, 0.20) * trail * 0.4;
            }
          }

          // ---- Embers ----
          col += embers(ro, rd, t);

          // ---- Lava ground beneath user (looking down) ----
          // Ground sits at y = -1.6 so the user's head (ro.y ~ 0) is roughly
          // standing height above it instead of half-buried in it.
          if (rd.y < -0.05) {
            float groundY = -1.6;
            float gt = (groundY - ro.y) / rd.y;
            if (gt > 0.0 && gt < 60.0 && gt < opaqueT) {
              vec3 gp = ro + rd * gt;
              // Solidified crust with hot crack pattern.
              float crust = fbm(gp.xz * 0.4);
              float cracks = fbm(gp.xz * 1.5 + t * 0.05);
              float crackMask = smoothstep(0.55, 0.65, cracks)
                              - smoothstep(0.65, 0.75, cracks);
              vec3 ground = mix(vec3(0.04, 0.02, 0.02),
                                vec3(0.15, 0.08, 0.06), crust);
              vec3 crackCol = vec3(1.00, 0.45, 0.10)
                            * (0.7 + 0.3 * sin(t * 3.0 + dot(gp.xz, vec2(2.0))));
              ground = mix(ground, crackCol, crackMask * 1.2);
              float fog = smoothstep(0.0, 25.0, gt);
              col = mix(ground, col, fog * 0.7);
            }
          }

          // ---- Lightning flashes in ash plume ----
          {
            float beat = floor(t * 0.5);
            float flashSeed = hash(vec2(beat, 31.7));
            if (flashSeed > 0.7) {
              float local = fract(t * 0.5);
              float flash = exp(-local * 12.0) * smoothstep(0.0, 0.04, local);
              vec3 flashDir = normalize(vec3(sin(2.4) * 0.7, 0.5,
                                             -cos(2.4) * 0.7));
              float ang = max(dot(rd, flashDir), 0.0);
              col += vec3(0.95, 0.85, 1.00) * smoothstep(0.85, 1.0, ang)
                   * flash * 1.6;
            }
          }

          // Atmospheric glow tint (warm lift).
          col = mix(col, vec3(0.55, 0.20, 0.10), 0.08);

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

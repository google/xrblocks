import * as THREE from 'three';

const SPHERE_RADIUS = 50;

/**
 * Full-surround neon city for "walk-in" mode.
 * Inverted sphere: smoggy purple sky with neon billboards, ring of
 * skyscraper silhouettes around the user with lit-window grids,
 * hover-cars streaking past as glowing line streaks, holographic billboard,
 * occasional rain streaks, wet street with neon reflections.
 */
export class CyberpunkImmersive extends THREE.Object3D {
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
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i); float b = hash(i + vec2(1,0));
          float c = hash(i + vec2(0,1)); float d = hash(i + vec2(1,1));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                                + (d - b) * u.x * u.y;
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
          return v;
        }

        // Building silhouette in cylindrical (azimuth, altitude) space.
        // Returns mask 0..1 plus window-light contribution (vec3).
        // azBase = building center azimuth; widthAz = half angular width.
        // heightAlt = top altitude; baseAlt = base altitude (usually 0).
        struct BuildingHit {
          float mask;
          vec3 windowCol;
          float windowMask;
          float topGlow;
        };

        BuildingHit buildingAt(vec3 rd, float azBase, float widthAz,
                                float heightAlt, float seed, float t) {
          BuildingHit h;
          h.mask = 0.0; h.windowCol = vec3(0.0);
          h.windowMask = 0.0; h.topGlow = 0.0;
          float az = atan(rd.x, -rd.z);
          float alt = asin(clamp(rd.y, -1.0, 1.0));
          float dAz = az - azBase;
          if (dAz > 3.14159) dAz -= 6.28318;
          if (dAz < -3.14159) dAz += 6.28318;
          if (abs(dAz) > widthAz) return h;
          if (alt < 0.0 || alt > heightAlt) return h;
          h.mask = 1.0;
          // Local building UVs: (0..1 across, 0..1 up).
          float u = (dAz + widthAz) / (widthAz * 2.0);
          float v = alt / heightAlt;
          // Window grid.
          vec2 grid = vec2(8.0, 26.0);
          vec2 cell = vec2(u, v) * grid;
          vec2 fc = fract(cell);
          vec2 ic = floor(cell);
          float lit = step(0.55, hash(ic + seed));
          float win = step(0.18, fc.x) * step(fc.x, 0.82)
                    * step(0.20, fc.y) * step(fc.y, 0.85);
          float flickerOn = step(0.92, hash(ic + seed + 7.7));
          float flicker = mix(1.0,
              0.5 + 0.5 * sin(t * 6.0 + ic.x + ic.y),
              flickerOn);
          h.windowMask = lit * win * flicker;
          // Window color: warm yellow / cyan / magenta variations per building.
          float colorRoll = hash(vec2(seed, 33.7));
          vec3 wc;
          if (colorRoll < 0.5) {
            wc = vec3(1.00, 0.85, 0.50); // warm
          } else if (colorRoll < 0.75) {
            wc = vec3(0.20, 0.95, 1.00); // cyan
          } else {
            wc = vec3(1.00, 0.30, 0.80); // magenta
          }
          h.windowCol = wc;
          // Top antenna glow.
          float topZone = smoothstep(0.95, 1.0, v);
          h.topGlow = topZone * (0.5 + 0.5 * sin(t * 3.0 + seed * 7.0));
          return h;
        }

        // Pick the closest building among a few in the slot containing this
        // azimuth. We use 18 slots around the circle; each has its own params.
        BuildingHit cityRing(vec3 rd, float t) {
          BuildingHit hit;
          hit.mask = 0.0; hit.windowCol = vec3(0.0);
          hit.windowMask = 0.0; hit.topGlow = 0.0;
          float az = atan(rd.x, -rd.z);
          float density = 18.0;
          float slice = az * density / (2.0 * 3.14159265);
          float slotIdx = floor(slice);
          // Try this slot and its two neighbours so widths can overlap.
          for (int k = -1; k <= 1; k++) {
            float si = slotIdx + float(k);
            float seed = si + 19.0;
            float baseAz = (si + 0.5) * (2.0 * 3.14159265) / density;
            // Per-building param variation.
            float widthAz = 0.10 + hash(vec2(seed, 1.7)) * 0.06;
            float heightAlt = 0.18 + hash(vec2(seed, 2.7)) * 0.40;
            BuildingHit h = buildingAt(rd, baseAz, widthAz, heightAlt,
                                        seed, t);
            // The closer (taller) building visually overrides; we approximate
            // by picking the one that wrote the higher altitude top.
            if (h.mask > 0.5 && heightAlt > 0.0 && h.mask >= hit.mask) {
              if (hit.mask < 0.5 || heightAlt > 0.18) {
                hit = h;
              }
            }
          }
          return hit;
        }

        // Ray-AABB intersection. Returns nearest positive t and normal.
        // Returns -1 if no hit.
        float rayBox(vec3 ro, vec3 rd, vec3 ctr, vec3 hsz,
                      out vec3 nrm) {
          vec3 m = 1.0 / rd;
          vec3 oc = ctr - ro;
          vec3 t1 = (oc - hsz) * m;
          vec3 t2 = (oc + hsz) * m;
          vec3 tmin = min(t1, t2);
          vec3 tmax = max(t1, t2);
          float tNear = max(max(tmin.x, tmin.y), tmin.z);
          float tFar = min(min(tmax.x, tmax.y), tmax.z);
          if (tNear > tFar || tFar < 0.0) return -1.0;
          if (tNear == tmin.x) nrm = vec3(-sign(rd.x), 0.0, 0.0);
          else if (tNear == tmin.y) nrm = vec3(0.0, -sign(rd.y), 0.0);
          else nrm = vec3(0.0, 0.0, -sign(rd.z));
          return tNear;
        }

        // 3D ring of skyscraper boxes. Returns vec4(rgb, t).
        vec4 cityRing3D(vec3 ro, vec3 rd, float t) {
          float bestT = 1e9;
          vec3 bestCol = vec3(0.0);
          for (int i = 0; i < 14; i++) {
            if (i == 10 || i == 11) continue; // park wedge — no building here
            float fi = float(i);
            float seed = fi + 19.0;
            float ang = fi * (6.28318 / 14.0)
                      + (hash(vec2(seed, 0.7)) - 0.5) * 0.15;
            float dist = 18.0 + hash(vec2(seed, 1.7)) * 14.0;
            vec3 base = vec3(cos(ang) * dist, -1.6, sin(ang) * dist);
            float w = 2.5 + hash(vec2(seed, 2.7)) * 2.5;
            float d = 2.5 + hash(vec2(seed, 3.7)) * 2.5;
            float h = 8.0 + hash(vec2(seed, 4.7)) * 18.0;
            vec3 hsz = vec3(w, h * 0.5, d);
            vec3 ctr = base + vec3(0.0, h * 0.5, 0.0);
            vec3 nrm;
            float th = rayBox(ro, rd, ctr, hsz, nrm);
            if (th > 0.5 && th < bestT) {
              bestT = th;
              vec3 hp = ro + rd * th - ctr;
              // Pick window UV based on hit face.
              vec2 uv = vec2(0.0);
              float isSide = 1.0 - step(0.5, abs(nrm.y));
              if (abs(nrm.x) > 0.5) {
                uv = vec2((hp.z + d) / (2.0 * d),
                           (hp.y + h * 0.5) / h);
              } else if (abs(nrm.z) > 0.5) {
                uv = vec2((hp.x + w) / (2.0 * w),
                           (hp.y + h * 0.5) / h);
              }
              vec2 grid = vec2(6.0, 16.0);
              vec2 cell = uv * grid;
              vec2 fc = fract(cell);
              vec2 ic = floor(cell);
              float lit = step(0.55, hash(ic + seed));
              float win = step(0.18, fc.x) * step(fc.x, 0.82)
                        * step(0.20, fc.y) * step(fc.y, 0.85);
              float flickerOn = step(0.92, hash(ic + seed + 7.7));
              float flicker = mix(1.0,
                  0.5 + 0.5 * sin(t * 6.0 + ic.x + ic.y),
                  flickerOn);
              float winMask = lit * win * flicker * isSide;
              float colorRoll = hash(vec2(seed, 33.7));
              vec3 wc;
              if (colorRoll < 0.5) wc = vec3(1.00, 0.85, 0.50);
              else if (colorRoll < 0.75) wc = vec3(0.20, 0.95, 1.00);
              else wc = vec3(1.00, 0.30, 0.80);
              vec3 buildingBase = vec3(0.020, 0.015, 0.035)
                                + vec3(0.06, 0.02, 0.08);
              vec3 c = buildingBase + wc * winMask * 1.5;
              // Antenna glow on top face.
              float topMask = step(0.5, nrm.y);
              c += vec3(1.0, 0.30, 0.55) * topMask
                 * (0.4 + 0.3 * sin(t * 3.0 + seed * 7.0));
              // ---- Shop fronts on lower 2 stories ----
              float lowZone = step(uv.y, 0.10) * isSide;
              vec2 sgrid = vec2(3.0, 2.0);
              vec2 scell = uv * sgrid;
              vec2 sf = fract(scell);
              vec2 si = floor(scell);
              float swin = step(0.08, sf.x) * step(sf.x, 0.92)
                         * step(0.15, sf.y) * step(sf.y, 0.92);
              float doorway = step(abs(sf.x - 0.5), 0.12)
                            * step(sf.y, 0.55);
              float shopRoll = hash(si + seed + 13.3);
              vec3 shopCol = (shopRoll < 0.34)
                  ? vec3(1.00, 0.80, 0.30)
                  : (shopRoll < 0.67)
                      ? vec3(1.00, 0.20, 0.70)
                      : vec3(0.20, 0.95, 1.00);
              float interior = 0.65 + 0.35
                  * sin(t * 3.0 + si.x * 11.0 + si.y * 7.0);
              float shopMask = swin * (1.0 - doorway * 0.85) * interior;
              vec3 shopFacade = vec3(0.06, 0.04, 0.05)
                              + shopCol * shopMask * 2.0;
              c = mix(c, shopFacade, lowZone);
              // Store sign band slightly above shop front.
              float signBand = step(0.105, uv.y) * step(uv.y, 0.135)
                             * isSide;
              c += shopCol * signBand
                 * (1.0 + 0.3 * sin(t * 5.0 + seed));
              bestCol = c;
            }
          }
          return vec4(bestCol, bestT);
        }

        // Holographic neon billboard slabs at fixed positions.
        vec4 neonBillboards(vec3 ro, vec3 rd, float t) {
          float bestT = 1e9;
          vec3 bestCol = vec3(0.0);
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float ang = fi * 2.094 + 0.5;
            float dist = 8.0 + fi * 1.5;
            vec3 ctr = vec3(cos(ang) * dist, 2.5 + fi * 0.8,
                             sin(ang) * dist);
            vec3 hsz = vec3(2.0, 1.2, 0.08);
            // Orient slab to face inward (rotate hsz xz by ang).
            // Use AABB approximation: swap x/z for slabs roughly perpendicular
            // to the radial direction.
            if (abs(cos(ang)) < abs(sin(ang))) hsz = vec3(0.08, 1.2, 2.0);
            vec3 nrm;
            float th = rayBox(ro, rd, ctr, hsz, nrm);
            if (th > 0.5 && th < bestT) {
              bestT = th;
              vec3 hp = ro + rd * th - ctr;
              vec2 uv = vec2(hp.x / hsz.x, hp.y / hsz.y) * 0.5 + 0.5;
              if (hsz.x < 0.2) uv = vec2(hp.z / hsz.z, hp.y / hsz.y) * 0.5
                                  + 0.5;
              float scan = 0.5 + 0.5 * sin(uv.y * 80.0 + t * 8.0);
              float flicker = 0.7 + 0.3 * sin(t * 18.0 + fi);
              vec3 base = vec3(0.0);
              if (i == 0) base = vec3(1.00, 0.30, 0.80);
              else if (i == 1) base = vec3(0.20, 0.95, 1.00);
              else base = vec3(1.00, 0.75, 0.20);
              float shape = smoothstep(0.05, 0.10, uv.x)
                          * smoothstep(0.05, 0.10, 1.0 - uv.x)
                          * smoothstep(0.10, 0.20, uv.y)
                          * smoothstep(0.10, 0.20, 1.0 - uv.y);
              bestCol = base * (0.7 + scan * 0.5) * flicker * shape * 1.4;
            }
          }
          return vec4(bestCol, bestT);
        }

        // ---- Street life: cars, hovercars, pedestrians, traffic lights ----
        // Returns vec4(rgb, t) for the closest hit primitive.
        vec4 streetLife(vec3 ro, vec3 rd, float t) {
          float bestT = 1e9;
          vec3 bestCol = vec3(0.0);
          vec3 nrm;

          // Ground cars: 8 across two circular lanes, opposite directions.
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float lane = mod(fi, 2.0);
            float r = mix(15.5, 13.8, lane);
            float dir = mix(1.0, -1.0, lane);
            float spd = mix(0.20, 0.26, lane);
            float baseAng = fi * 0.7854 + lane * 0.39;
            float ang = baseAng + dir * t * spd;
            // Skip cars currently inside the park wedge.
            float pd = mod(ang + 1.5708 + 3.14159, 6.28318) - 3.14159;
            if (abs(pd) < 0.30) continue;
            vec3 ctr = vec3(cos(ang) * r, -1.40, sin(ang) * r);
            vec3 hsz = vec3(0.42, 0.18, 0.42);
            float th = rayBox(ro, rd, ctr, hsz, nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th;
              vec3 fwd = vec3(-sin(ang), 0.0, cos(ang)) * dir;
              vec3 fwdAxis = (abs(fwd.x) > abs(fwd.z))
                  ? vec3(sign(fwd.x), 0.0, 0.0)
                  : vec3(0.0, 0.0, sign(fwd.z));
              float head = step(0.9, dot(nrm, fwdAxis));
              float tail = step(0.9, dot(nrm, -fwdAxis));
              vec3 body = vec3(0.04, 0.03, 0.07);
              bestCol = body
                      + vec3(1.00, 0.95, 0.80) * head * 1.8
                      + vec3(1.00, 0.15, 0.10) * tail * 1.4;
            }
          }

          // Hovercars: 4 above ground, opposite layer flow.
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float lane = mod(fi, 2.0);
            float r = mix(12.0, 13.5, lane);
            float dir = mix(-1.0, 1.0, lane);
            float spd = mix(0.32, 0.38, lane);
            float baseAng = fi * 1.5708 + 0.6;
            float ang = baseAng + dir * t * spd;
            float pd = mod(ang + 1.5708 + 3.14159, 6.28318) - 3.14159;
            if (abs(pd) < 0.30) continue;
            float yH = mix(2.6, 3.6, lane);
            vec3 ctr = vec3(cos(ang) * r, yH, sin(ang) * r);
            vec3 hsz = vec3(0.45, 0.16, 0.45);
            float th = rayBox(ro, rd, ctr, hsz, nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th;
              vec3 fwd = vec3(-sin(ang), 0.0, cos(ang)) * dir;
              vec3 fwdAxis = (abs(fwd.x) > abs(fwd.z))
                  ? vec3(sign(fwd.x), 0.0, 0.0)
                  : vec3(0.0, 0.0, sign(fwd.z));
              float head = step(0.9, dot(nrm, fwdAxis));
              float tail = step(0.9, dot(nrm, -fwdAxis));
              float bottom = step(0.5, -nrm.y);
              vec3 body = vec3(0.06, 0.05, 0.10);
              bestCol = body
                      + vec3(0.20, 0.95, 1.00) * head * 1.6
                      + vec3(1.00, 0.25, 0.60) * tail * 1.4
                      + vec3(0.30, 0.95, 1.00) * bottom * 0.7;
            }
          }

          // Pedestrians: 12 silhouettes drifting along the sidewalk.
          for (int i = 0; i < 12; i++) {
            float fi = float(i);
            float r = 16.5 + hash(vec2(fi, 7.3)) * 0.7;
            float dir = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
            float spd = 0.04 + hash(vec2(fi, 9.1)) * 0.02;
            float baseAng = fi * 0.5236 + hash(vec2(fi, 3.3)) * 0.3;
            float ang = baseAng + dir * t * spd;
            float pd = mod(ang + 1.5708 + 3.14159, 6.28318) - 3.14159;
            if (abs(pd) < 0.30) continue;
            float bob = sin(t * 4.0 + fi * 1.7) * 0.04;
            vec3 ctr = vec3(cos(ang) * r, -1.10 + bob, sin(ang) * r);
            vec3 hsz = vec3(0.10, 0.32, 0.10);
            float th = rayBox(ro, rd, ctr, hsz, nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th;
              vec3 hp = ro + rd * th - ctr;
              float headZ = step(0.22, hp.y);
              vec3 body = vec3(0.020, 0.018, 0.030);
              vec3 head = vec3(0.10, 0.08, 0.12);
              float rim = 1.0 - abs(nrm.y);
              vec3 neon = vec3(0.45, 0.10, 0.35) * rim * 0.4;
              bestCol = mix(body, head, headZ) + neon;
            }
          }

          // Traffic lights: 4 poles at intersections of the street loop.
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float ang = fi * 1.5708 + 0.3927;
            float r = 14.7;
            vec3 base = vec3(cos(ang) * r, -1.60, sin(ang) * r);
            vec3 poleHsz = vec3(0.07, 1.20, 0.07);
            vec3 poleCtr = base + vec3(0.0, 1.20, 0.0);
            float th = rayBox(ro, rd, poleCtr, poleHsz, nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th;
              bestCol = vec3(0.04, 0.03, 0.05);
            }
            vec3 headHsz = vec3(0.18, 0.18, 0.18);
            vec3 headCtr = base + vec3(0.0, 2.55, 0.0);
            float th2 = rayBox(ro, rd, headCtr, headHsz, nrm);
            if (th2 > 0.05 && th2 < bestT) {
              bestT = th2;
              float ph = mod(t + fi * 2.0, 9.0);
              vec3 lit;
              if (ph < 3.0) lit = vec3(1.00, 0.10, 0.10);
              else if (ph < 5.0) lit = vec3(1.00, 0.85, 0.10);
              else lit = vec3(0.10, 1.00, 0.30);
              bestCol = vec3(0.04, 0.03, 0.05) + lit * 1.6;
            }
          }

          return vec4(bestCol, bestT);
        }

        // ---- Neon night park: holographic urban green space ----
        vec4 nightPark(vec3 ro, vec3 rd, float t) {
          float bestT = 1e9;
          vec3 bestCol = vec3(0.0);
          vec3 nrm;
          // Park sits inside the street ring (cars at r=13.8-15.5) so it
          // reads as a clear foreground feature, and at azimuth -π/2 so it
          // lands directly in front of the user (forward = -z, matching the
          // hologram/sky azimuth convention atan(rd.x, -rd.z)).
          float parkAng = -1.5708;
          float parkR = 10.0;
          vec3 pc = vec3(cos(parkAng) * parkR, -1.6, sin(parkAng) * parkR);

          // Grass slab (6×6, 0.05 tall, emissive cyan-green).
          float th = rayBox(ro, rd, pc + vec3(0.0, 0.025, 0.0),
                            vec3(3.0, 0.025, 3.0), nrm);
          if (th > 0.05 && th < bestT) {
            bestT = th;
            bestCol = vec3(0.04, 0.14, 0.10) * 1.3;
          }

          // Three holographic trees (trunk + canopy).
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float ta = -0.7 + fi * 0.7;
            vec3 tb = pc + vec3(cos(ta) * 2.0, 0.0, sin(ta) * 2.0);
            th = rayBox(ro, rd, tb + vec3(0.0, 0.75, 0.0),
                        vec3(0.075, 0.75, 0.075), nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th; bestCol = vec3(0.04, 0.03, 0.05);
            }
            th = rayBox(ro, rd, tb + vec3(0.0, 1.80, 0.0),
                        vec3(0.45, 0.30, 0.45), nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th;
              float hue = sin(t * 0.3 + fi * 2.1) * 0.5 + 0.5;
              bestCol = mix(vec3(1.00, 0.20, 0.80),
                            vec3(0.20, 1.00, 0.90), hue) * 1.4;
            }
          }

          // Holo-statue: tall emissive prism with colour drift.
          th = rayBox(ro, rd, pc + vec3(0.0, 0.60, 0.0),
                      vec3(0.15, 0.60, 0.15), nrm);
          if (th > 0.05 && th < bestT) {
            bestT = th;
            vec3 hp = ro + rd * th - (pc + vec3(0.0, 0.60, 0.0));
            float vGrad = (hp.y + 0.60) / 1.20;
            float drift = sin(t * 0.5 + vGrad * 4.0) * 0.5 + 0.5;
            bestCol = mix(vec3(0.20, 0.40, 1.00),
                          vec3(1.00, 0.20, 0.90), drift) * 1.6;
          }

          // Two lamp posts (pole + glowing head).
          for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float la = -0.5 + fi * 1.0;
            vec3 lb = pc + vec3(cos(la) * 2.8, 0.0, sin(la) * 2.8);
            th = rayBox(ro, rd, lb + vec3(0.0, 1.10, 0.0),
                        vec3(0.05, 1.10, 0.05), nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th; bestCol = vec3(0.04, 0.03, 0.05);
            }
            th = rayBox(ro, rd, lb + vec3(0.0, 2.30, 0.0),
                        vec3(0.12, 0.08, 0.12), nrm);
            if (th > 0.05 && th < bestT) {
              bestT = th; bestCol = vec3(1.00, 0.65, 0.20) * 1.5;
            }
          }

          return vec4(bestCol, bestT);
        }

        float raySphere(vec3 ro, vec3 rd, vec3 c, float rad) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float d = b * b - (dot(oc, oc) - rad * rad);
          if (d < 0.0) return -1.0;
          return -b - sqrt(d);
        }

        // Hover-car streaks: thin horizontal bright lines crossing the sky.
        vec3 hoverCars(vec3 rd, float t) {
          vec3 col = vec3(0.0);
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float seed = fi * 13.7;
            float lane = mix(0.05, 0.30, hash(vec2(seed, 1.3)));
            float spd = mix(0.4, 0.9, hash(vec2(seed, 2.7)));
            // Horizontal sweep: az = -PI..PI cycles.
            float phase = mod(t * spd + seed, 6.28318) - 3.14159;
            float az = atan(rd.x, -rd.z);
            float alt = asin(clamp(rd.y, -1.0, 1.0));
            float dAz = az - phase;
            if (dAz > 3.14159) dAz -= 6.28318;
            if (dAz < -3.14159) dAz += 6.28318;
            float dAlt = alt - lane;
            // Streak: long thin trail behind position.
            float along = -dAz; // behind = az < phase
            float thickness = 0.012;
            float bright = smoothstep(thickness, 0.0, abs(dAlt))
                         * smoothstep(0.0, 0.005, along)
                         * smoothstep(0.20, 0.0, along);
            // Color alternates cyan / magenta / amber.
            vec3 streakCol;
            float roll = hash(vec2(seed, 3.7));
            if (roll < 0.4) streakCol = vec3(0.20, 0.95, 1.00);
            else if (roll < 0.75) streakCol = vec3(1.00, 0.30, 0.80);
            else streakCol = vec3(1.00, 0.75, 0.20);
            col += streakCol * bright * 1.4;
          }
          return col;
        }

        // Holographic billboard: rectangular flicker with scanlines.
        vec3 hologram(vec3 rd, float t) {
          float az = atan(rd.x, -rd.z);
          float alt = asin(clamp(rd.y, -1.0, 1.0));
          // Place hologram at fixed direction.
          float az0 = -0.6;
          float alt0 = 0.18;
          float dAz = az - az0;
          if (dAz > 3.14159) dAz -= 6.28318;
          if (dAz < -3.14159) dAz += 6.28318;
          float dAlt = alt - alt0;
          float w = 0.10, h = 0.08;
          if (abs(dAz) > w || abs(dAlt) > h) return vec3(0.0);
          // Scanlines.
          float scan = 0.5 + 0.5 * sin(dAlt * 220.0 + t * 6.0);
          float flicker = 0.7 + 0.3 * sin(t * 18.0);
          // Shape: "logo-like" arc.
          float shape = smoothstep(0.5, 0.45, length(vec2(dAz / w, dAlt / h)));
          vec3 base = mix(vec3(0.20, 0.95, 1.00),
                          vec3(1.00, 0.30, 0.80), 0.5 + 0.5 * sin(t * 0.7));
          return base * shape * scan * flicker * 1.3;
        }

        // Rain streaks: short diagonal lines as projected directional noise.
        float rain(vec3 rd, float t) {
          float az = atan(rd.x, -rd.z);
          float alt = asin(clamp(rd.y, -1.0, 1.0));
          // Diagonal streak coordinate.
          vec2 uv = vec2(az * 8.0 + alt * 1.5, alt * 18.0 + t * 4.0);
          float r = 0.0;
          for (int k = 0; k < 2; k++) {
            float fk = float(k);
            vec2 cell = floor(uv + vec2(fk * 0.37, 0.0));
            vec2 fc = fract(uv + vec2(fk * 0.37, 0.0));
            float h = hash(cell);
            if (h > 0.94) {
              float streak = smoothstep(0.04, 0.0, abs(fc.x - 0.5))
                           * smoothstep(0.45, 0.0, abs(fc.y - 0.5));
              r += streak * 0.4;
            }
          }
          // Above horizon only.
          r *= smoothstep(-0.05, 0.20, alt);
          return r;
        }

        // Wet street reflection: when looking down, mirror the sky/buildings.
        // Plane sits at y = -1.6 to match the base of buildings/cars/peds.
        vec3 wetStreet(vec3 ro, vec3 rd, float t) {
          if (rd.y > -0.05) return vec3(0.0);
          float gt = (-1.6 - ro.y) / rd.y;
          if (gt < 0.0 || gt > 60.0) return vec3(0.0);
          vec3 gp = ro + rd * gt;
          // Puddle pattern: brighter in puddle areas.
          float puddle = fbm(gp.xz * 0.4);
          puddle = smoothstep(0.45, 0.7, puddle);
          // Reflected ray (mirror across y=0).
          vec3 refRd = vec3(rd.x, -rd.y, rd.z);
          // Sample the ring sky color along reflected direction (cheap).
          float az = atan(refRd.x, -refRd.z);
          // Pick a representative neon color based on azimuth.
          float c = sin(az * 3.0 + t * 0.2) * 0.5 + 0.5;
          vec3 reflCol = mix(vec3(0.20, 0.05, 0.18),
                             vec3(1.00, 0.30, 0.80), c);
          // Mix in cyan glow.
          reflCol += vec3(0.20, 0.95, 1.00)
                   * smoothstep(0.5, 1.0, sin(az * 5.0 + t * 0.3) * 0.5 + 0.5)
                   * 0.4;
          // Base wet asphalt color.
          vec3 base = vec3(0.04, 0.03, 0.06);
          float fog = smoothstep(0.0, 25.0, gt);
          vec3 col = mix(base, reflCol * 0.5, puddle);
          // Distance fade into smog.
          col = mix(col, vec3(0.10, 0.04, 0.15), fog * 0.7);
          return col;
        }

        void main() {
          vec3 rd = normalize(uViewRotation * vWorldDir);
          vec3 ro = uCamLocal;
          float t = uTime;

          // ---- Smoggy purple sky with magenta horizon ----
          float skyT = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 skyHigh = vec3(0.04, 0.02, 0.10);
          vec3 skyMid = vec3(0.18, 0.05, 0.22);
          vec3 skyLow = vec3(0.45, 0.10, 0.35);
          vec3 col = mix(skyLow, skyMid, smoothstep(0.50, 0.65, skyT));
          col = mix(col, skyHigh, smoothstep(0.65, 1.0, skyT));

          // Smog clouds.
          float smog = fbm(vec2(atan(rd.x, -rd.z) * 2.5,
                                rd.y * 4.0 + t * 0.05));
          col = mix(col, vec3(0.20, 0.05, 0.18),
                    smog * smoothstep(0.0, 0.3, rd.y) * 0.5);

          // ---- 3D raycast city ring (parallaxes correctly) ----
          float opaqueT = 1e9;
          vec3 opaqueCol = vec3(0.0);
          vec4 cityHit = cityRing3D(ro, rd, t);
          if (cityHit.w < opaqueT) {
            opaqueT = cityHit.w;
            opaqueCol = cityHit.rgb;
          }
          vec4 boardHit = neonBillboards(ro, rd, t);
          if (boardHit.w < opaqueT) {
            opaqueT = boardHit.w;
            opaqueCol = boardHit.rgb;
          }
          vec4 streetHit = streetLife(ro, rd, t);
          if (streetHit.w < opaqueT) {
            opaqueT = streetHit.w;
            opaqueCol = streetHit.rgb;
          }
          vec4 parkHit = nightPark(ro, rd, t);
          if (parkHit.w < opaqueT) {
            opaqueT = parkHit.w;
            opaqueCol = parkHit.rgb;
          }
          if (opaqueT < 1e8) {
            float fogF = smoothstep(8.0, 50.0, opaqueT);
            col = mix(opaqueCol, col, fogF * 0.4);
          }

          // ---- Hover-car streaks ----
          col += hoverCars(rd, t);

          // ---- Holographic billboard ----
          col += hologram(rd, t);

          // ---- Rain streaks (above horizon, slight bright shimmer) ----
          col += vec3(0.50, 0.65, 0.95) * rain(rd, t) * 0.6;

          // ---- Wet street (looking down) ----
          if (rd.y < 0.0) {
            float gt = (-1.6 - ro.y) / rd.y;
            if (gt > 0.0 && gt < opaqueT) {
              vec3 streetCol = wetStreet(ro, rd, t);
              float weight = smoothstep(0.0, -0.05, rd.y);
              col = mix(col, streetCol, weight);
            }
          }

          // Atmospheric magenta lift.
          col = mix(col, vec3(0.55, 0.10, 0.45), 0.05);

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

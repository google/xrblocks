// Cyberpunk scene: rain-soaked neon city skyline at night, hover-cars
// streaking past, lightning, drone swarm flyover, holographic billboard,
// distant explosions, scanline holograms.
export const CyberpunkScene = {
  name: 'Cyberpunk',

  ringCool: 'vec3(0.95, 0.10, 0.55)',
  ringWarm: 'vec3(0.10, 0.95, 0.95)',
  haloInner: 'vec3(1.00, 0.20, 0.65)',
  haloOuter: 'vec3(0.20, 0.90, 1.00)',

  helpers: /* glsl */ `
    // Rectangular building silhouette with random window grid.
    float buildingMask(vec2 p, float cx, float w, float h, float baseY) {
      return step(abs(p.x - cx), w)
           * step(baseY, p.y)
           * step(p.y, baseY + h);
    }

    // Returns 1.0 inside a window of the building grid (with random lit-ness).
    float windowsAt(vec2 p, float cx, float w, float h, float baseY,
                    float seed) {
      vec2 lp = (p - vec2(cx - w, baseY)) / vec2(w * 2.0, h);
      if (lp.x < 0.0 || lp.x > 1.0 || lp.y < 0.0 || lp.y > 1.0) return 0.0;
      vec2 grid = vec2(8.0, 22.0);
      vec2 cell = lp * grid;
      vec2 fc = fract(cell);
      vec2 ic = floor(cell);
      float lit = step(0.55, hash(ic + seed));
      // Window rectangle inside cell.
      float win = step(0.18, fc.x) * step(fc.x, 0.82)
                * step(0.25, fc.y) * step(fc.y, 0.85);
      // Some windows flicker.
      float flickerOn = step(0.92, hash(ic + seed + 7.7));
      float flicker = mix(1.0,
          0.5 + 0.5 * sin(uTime * 6.0 + ic.x + ic.y),
          flickerOn);
      return lit * win * flicker;
    }

    // Ray-AABB intersection.
    float rayBoxC(vec3 ro, vec3 rd, vec3 ctr, vec3 hsz, out vec3 nrm) {
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

    // 3D ring of skyscraper boxes around the user.
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
        float bw = 2.5 + hash(vec2(seed, 2.7)) * 2.5;
        float bd = 2.5 + hash(vec2(seed, 3.7)) * 2.5;
        float bh = 8.0 + hash(vec2(seed, 4.7)) * 18.0;
        vec3 hsz = vec3(bw, bh * 0.5, bd);
        vec3 ctr = base + vec3(0.0, bh * 0.5, 0.0);
        vec3 nrm;
        float th = rayBoxC(ro, rd, ctr, hsz, nrm);
        if (th > 0.5 && th < bestT) {
          bestT = th;
          vec3 hp = ro + rd * th - ctr;
          vec2 uv = vec2(0.0);
          float isSide = 1.0 - step(0.5, abs(nrm.y));
          if (abs(nrm.x) > 0.5) {
            uv = vec2((hp.z + bd) / (2.0 * bd),
                       (hp.y + bh * 0.5) / bh);
          } else if (abs(nrm.z) > 0.5) {
            uv = vec2((hp.x + bw) / (2.0 * bw),
                       (hp.y + bh * 0.5) / bh);
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
          float signBand = step(0.105, uv.y) * step(uv.y, 0.135)
                         * isSide;
          c += shopCol * signBand * (1.0 + 0.3 * sin(t * 5.0 + seed));
          bestCol = c;
        }
      }
      return vec4(bestCol, bestT);
    }

    // ---- Street life: cars, hovercars, pedestrians, traffic lights ----
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
        float th = rayBoxC(ro, rd, ctr, hsz, nrm);
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
        float th = rayBoxC(ro, rd, ctr, hsz, nrm);
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
        float th = rayBoxC(ro, rd, ctr, hsz, nrm);
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
        float th = rayBoxC(ro, rd, poleCtr, poleHsz, nrm);
        if (th > 0.05 && th < bestT) {
          bestT = th;
          bestCol = vec3(0.04, 0.03, 0.05);
        }
        vec3 headHsz = vec3(0.18, 0.18, 0.18);
        vec3 headCtr = base + vec3(0.0, 2.55, 0.0);
        float th2 = rayBoxC(ro, rd, headCtr, headHsz, nrm);
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
      float th = rayBoxC(ro, rd, pc + vec3(0.0, 0.025, 0.0),
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
        th = rayBoxC(ro, rd, tb + vec3(0.0, 0.75, 0.0),
                      vec3(0.075, 0.75, 0.075), nrm);
        if (th > 0.05 && th < bestT) {
          bestT = th; bestCol = vec3(0.04, 0.03, 0.05);
        }
        th = rayBoxC(ro, rd, tb + vec3(0.0, 1.80, 0.0),
                      vec3(0.45, 0.30, 0.45), nrm);
        if (th > 0.05 && th < bestT) {
          bestT = th;
          float hue = sin(t * 0.3 + fi * 2.1) * 0.5 + 0.5;
          bestCol = mix(vec3(1.00, 0.20, 0.80),
                        vec3(0.20, 1.00, 0.90), hue) * 1.4;
        }
      }

      // Holo-statue: tall emissive prism with colour drift.
      th = rayBoxC(ro, rd, pc + vec3(0.0, 0.60, 0.0),
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
        th = rayBoxC(ro, rd, lb + vec3(0.0, 1.10, 0.0),
                      vec3(0.05, 1.10, 0.05), nrm);
        if (th > 0.05 && th < bestT) {
          bestT = th; bestCol = vec3(0.04, 0.03, 0.05);
        }
        th = rayBoxC(ro, rd, lb + vec3(0.0, 2.30, 0.0),
                      vec3(0.12, 0.08, 0.12), nrm);
        if (th > 0.05 && th < bestT) {
          bestT = th; bestCol = vec3(1.00, 0.65, 0.20) * 1.5;
        }
      }

      return vec4(bestCol, bestT);
    }
  `,

  body: /* glsl */ `
    vec3 ro = uCamLocal;
    // Stereo parallax layers.
    vec2 pFar  = parallaxP(p, rd, 0.35);
    vec2 pBack = parallaxP(p, rd, 0.22);
    vec2 pMid  = parallaxP(p, rd, 0.12);
    vec2 pNear = parallaxP(p, rd, 0.04);

    // ---- Sky: deep purple haze with magenta horizon glow ----
    vec3 skyHigh = vec3(0.04, 0.02, 0.10);
    vec3 skyMid  = vec3(0.20, 0.05, 0.30);
    vec3 skyLow  = vec3(0.50, 0.10, 0.45);
    col = mix(skyLow, skyMid, smoothstep(-0.2, 0.4, pFar.y));
    col = mix(col, skyHigh, smoothstep(0.4, 1.0, pFar.y));

    // Drifting smog/clouds.
    float smog = fbm(vec2(pFar.x * 2.0 + uTime * 0.05, pFar.y * 2.0));
    col = mix(col, vec3(0.35, 0.10, 0.40), smog * smoothstep(0.0, 0.6, pFar.y) * 0.4);

    // ---- 3D raycast city ring (parallaxes correctly) ----
    vec4 cityHit = cityRing3D(ro, rd, uTime);
    float opaqueT = cityHit.w;
    vec3 opaqueCol = cityHit.rgb;
    vec4 streetHit = streetLife(ro, rd, uTime);
    if (streetHit.w < opaqueT) {
      opaqueT = streetHit.w;
      opaqueCol = streetHit.rgb;
    }
    vec4 parkHit = nightPark(ro, rd, uTime);
    if (parkHit.w < opaqueT) {
      opaqueT = parkHit.w;
      opaqueCol = parkHit.rgb;
    }
    if (opaqueT < 1e8) {
      float fogF = smoothstep(8.0, 50.0, opaqueT);
      col = mix(opaqueCol, col, fogF * 0.4);
    }

    // ---- Neon signs glowing on the buildings ----
    {
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float cx = (fi - 1.5) * 0.55 + 0.05;
        float cy = -0.20 + hash(vec2(fi, 13.7)) * 0.4;
        vec2 d = pMid - vec2(cx, cy);
        // Vertical neon strip.
        float strip = smoothstep(0.012, 0.0, abs(d.x))
                    * smoothstep(0.10, 0.0, abs(d.y));
        vec3 nc = (mod(fi, 2.0) < 0.5)
                ? vec3(1.00, 0.20, 0.65)
                : vec3(0.20, 0.95, 1.00);
        // Pulsing.
        float pulse = 0.7 + 0.3 * sin(uTime * 2.0 + fi);
        col += nc * strip * pulse * 1.2;
        // Halo glow around it.
        float halo = smoothstep(0.08, 0.0, length(d * vec2(2.0, 1.0)));
        col += nc * halo * pulse * 0.4;
      }
    }

    // ---- Always-on rain (diagonal streaks) ----
    {
      // Rotated coordinates for diagonal rain.
      vec2 rp = vec2(pNear.x + pNear.y * 0.3, pNear.y);
      vec2 g = vec2(rp.x * 30.0, rp.y * 4.0 - uTime * 6.0);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float h = hash(cell);
      if (h > 0.55) {
        float streak = smoothstep(0.05, 0.0, abs(f.x - 0.5))
                     * smoothstep(0.5, 0.0, f.y) * step(0.0, f.y);
        col += vec3(0.55, 0.75, 1.00) * streak * 0.5;
      }
    }

    // Wet street reflections at the bottom.
    if (pNear.y < -0.55) {
      float refl = smoothstep(-0.55, -1.0, pNear.y);
      // Reflect city colors with vertical streaks.
      vec3 wetCol = vec3(0.10, 0.05, 0.20)
                  + vec3(1.0, 0.3, 0.7) * sin(pNear.x * 8.0 + uTime * 2.0) * 0.05;
      // Distorted vertical light streaks.
      float lights = sin(pNear.x * 30.0 + uTime * 1.0) * 0.5 + 0.5;
      lights = pow(lights, 4.0) * refl;
      col = mix(col, wetCol, refl * 0.7);
      col += vec3(1.0, 0.4, 0.8) * lights * 0.4;
      col += vec3(0.4, 0.95, 1.0) * pow(sin(pNear.x * 18.0 - uTime * 0.7), 6.0)
           * refl * 0.5;
    }

    // ---- Hover-cars streaking horizontally every 3s ----
    {
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float cycle = 3.0 + fi * 0.3;
        float local = mod(uTime + fi * 1.7, cycle);
        float dir = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
        float by = -0.05 + (hash(vec2(fi, 5.5)) - 0.5) * 0.4;
        float bx = -1.6 * dir + dir * local * (1.6 / cycle) * 2.0;
        vec2 d = pMid - vec2(bx, by);
        // Compact body.
        float body = smoothstep(0.030, 0.024, abs(d.x))
                   * smoothstep(0.008, 0.0, abs(d.y));
        // Front headlight (white) / rear (red), depending on direction.
        float front = smoothstep(0.005, 0.0,
            length(vec2(d.x - 0.025 * dir, d.y)));
        float rear = smoothstep(0.005, 0.0,
            length(vec2(d.x + 0.025 * dir, d.y)));
        col += vec3(0.20, 0.30, 0.50) * body * 1.5;
        col += vec3(1.00, 0.95, 0.85) * front * 2.5;
        col += vec3(1.00, 0.20, 0.20) * rear * 2.0;
        // Streak trail behind.
        float trail = smoothstep(0.20, 0.0, d.x * dir + 0.030)
                    * step(0.0, d.x * dir + 0.030)
                    * smoothstep(0.004, 0.0, abs(d.y));
        col += vec3(1.0, 0.30, 0.50) * trail * 0.7;
      }
    }

    // ---- Holographic billboard appearing every 11s ----
    {
      float cycle = 11.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float life = smoothstep(0.0, 1.0, local) * smoothstep(7.0, 5.0, local);
      // Big rectangle in upper sky.
      vec2 hc = vec2((hash(vec2(k, 11.1)) - 0.5) * 0.8, 0.45);
      vec2 d = pBack - hc;
      float box = step(abs(d.x), 0.30) * step(abs(d.y), 0.18);
      // Scanlines.
      float scan = 0.5 + 0.5 * sin(pBack.y * 80.0 - uTime * 6.0);
      // Glitchy face/icon: just bands of color.
      float bands = step(0.5, fract(d.y * 8.0 + uTime * 0.5));
      vec3 holoCol = mix(vec3(0.20, 0.95, 1.00),
                         vec3(1.00, 0.20, 0.85), bands);
      col = mix(col, holoCol * (0.7 + scan * 0.5), box * life * 0.85);
      // Glitch flicker.
      float glitch = step(0.96, hash(vec2(floor(uTime * 8.0), k)));
      col = mix(col, vec3(1.0, 1.0, 1.0), box * life * glitch * 0.5);
      // Border glow.
      float border = step(0.28, abs(d.x)) * step(abs(d.y), 0.18)
                   + step(0.16, abs(d.y)) * step(abs(d.x), 0.30);
      col += vec3(1.0, 0.20, 0.85) * border * life * 0.8;
    }

    // ---- Drone swarm flyover every 9s ----
    {
      float cycle = 9.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float life = smoothstep(0.0, 0.5, local) * smoothstep(cycle, cycle - 1.0, local);
      for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float dly = fi * 0.10;
        float prog = local - dly;
        if (prog > 0.0) {
          float baseX = -1.6 + prog * 0.45;
          float baseY = 0.30 + sin(prog * 3.0 + fi * 1.5) * 0.05
                      + (hash(vec2(k, fi + 11.7)) - 0.5) * 0.15;
          vec2 dr = pMid - vec2(baseX, baseY);
          float body = smoothstep(0.006, 0.0, length(dr));
          col += vec3(0.40, 0.85, 1.00) * body * 1.8 * life;
          // Blink red beneath.
          float blink = step(0.5, fract(uTime * 4.0 + fi));
          float light = smoothstep(0.004, 0.0,
              length(pMid - vec2(baseX, baseY - 0.008))) * blink;
          col += vec3(1.0, 0.20, 0.20) * light * 1.5 * life;
        }
      }
    }

    // ---- Lightning strike every 13s (with thunder flash) ----
    {
      float cycle = 13.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float flash = smoothstep(0.0, 0.04, local) * smoothstep(0.6, 0.05, local);
      flash *= 0.5 + 0.5 * sin(local * 50.0);
      // Sky-wide brightening.
      float upper = smoothstep(-0.4, 0.5, pFar.y);
      col += vec3(0.65, 0.55, 0.95) * flash * upper * 0.6;
      // Vertical fork.
      float bx = (hash(vec2(k, 19.7)) - 0.5) * 1.6;
      float zigzag = bx + sin(pFar.y * 22.0 + k) * 0.05
                       + sin(pFar.y * 60.0 + k * 3.0) * 0.015;
      float bolt = smoothstep(0.005, 0.0, abs(pFar.x - zigzag))
                 * smoothstep(-0.4, 1.0, pFar.y);
      col += vec3(0.85, 0.75, 1.20) * bolt * flash * 4.0;
    }

    // ---- Distant explosion every 19s ----
    {
      float cycle = 19.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      vec2 ep = vec2((hash(vec2(k, 23.1)) - 0.5) * 1.2,
                     -0.10 + hash(vec2(k, 31.3)) * 0.3);
      float dr = length(pBack - ep);
      float flash = smoothstep(0.0, 0.15, local) * smoothstep(3.5, 0.3, local);
      float core = smoothstep(0.04, 0.0, dr) * 4.0;
      float bloom = smoothstep(0.5, 0.0, dr) * 1.0;
      vec3 ec = mix(vec3(1.0, 0.95, 0.55),
                    vec3(1.0, 0.45, 0.15),
                    smoothstep(0.0, 1.5, local));
      col += ec * (core + bloom) * flash;
      // Shockwave.
      float radius = local * 0.4;
      float shock = smoothstep(0.015, 0.0, abs(dr - radius))
                  * smoothstep(3.0, 0.5, local);
      col += vec3(1.0, 0.85, 0.55) * shock * 1.5;
    }
  `,
};

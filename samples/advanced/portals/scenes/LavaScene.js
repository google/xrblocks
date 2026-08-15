// Lava scene: erupting volcano on the horizon, molten lava river,
// rising ember columns, lava bombs arcing through the sky, lightning
// in volcanic ash plume, occasional pyroclastic flow shock.
export const LavaScene = {
  name: 'Volcano',

  ringCool: 'vec3(0.95, 0.30, 0.05)',
  ringWarm: 'vec3(1.00, 0.85, 0.20)',
  haloInner: 'vec3(1.00, 0.45, 0.10)',
  haloOuter: 'vec3(1.00, 0.85, 0.30)',

  helpers: /* glsl */ `
    // Volcano silhouette + glowing crater.
    float volcanoMask(vec2 p, vec2 c, float w, float h) {
      // Triangular cone with rough top.
      float dx = abs(p.x - c.x);
      float top = c.y + h - dx * (h / w);
      float jagged = (fbm(vec2(p.x * 8.0, 0.0)) - 0.5) * 0.02;
      float surf = top + jagged;
      return step(p.y, surf) * step(c.y - 0.05, p.y);
    }

    // Ray vs axis-aligned ellipsoid.
    float rayEllipL(vec3 oc, vec3 rd, vec3 ax) {
      vec3 ocS = oc / ax;
      vec3 rdS = rd / ax;
      float a = dot(rdS, rdS);
      float b = dot(ocS, rdS);
      float c = dot(ocS, ocS) - 1.0;
      float d = b * b - a * c;
      if (d < 0.0) return -1.0;
      return (-b - sqrt(d)) / a;
    }

    float fbm3L(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * fbm(p.xy + p.z * 1.3);
        p *= 2.07;
        a *= 0.5;
      }
      return v;
    }

    // Ray vs truncated cone (volcano with flat-top crater).
    // base: world position of base; topY: height to crater plateau;
    // bottomR: base radius; topR: crater radius.
    vec4 volcanoCone(vec3 ro, vec3 rd, vec3 base, float topY,
                      float bottomR, float topR, float t) {
      vec3 sunDir = normalize(vec3(0.3, 0.6, -0.7));
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
        float r = length(hp.xz - apex.xz) / topR;
        float crustNoise = fbm3L(hp * 1.8 + vec3(0.0, t * 0.15, 0.0));
        float fissure = fbm3L(hp * 3.5 + vec3(t * 0.25, 0.0, t * 0.2));
        float crackMask = smoothstep(0.48, 0.60, fissure);
        vec3 crust = mix(vec3(0.06, 0.03, 0.02),
                         vec3(0.16, 0.08, 0.05), crustNoise);
        vec3 hotLava = mix(vec3(1.00, 0.55, 0.10),
                           vec3(1.00, 0.95, 0.55),
                           smoothstep(0.55, 0.75, fissure));
        col = mix(crust, hotLava, crackMask);
        col *= mix(1.4, 0.85, r);
      } else {
        float h = clamp((hp.y - base.y) / topY, 0.0, 1.0);
        float ang = atan(hp.x - apex.x, hp.z - apex.z);
        float strata = fbm3L(vec3(ang * 1.5, h * 6.0, 0.0));
        float pebble = fbm3L(hp * 3.5);
        vec3 darkRock = vec3(0.07, 0.04, 0.03);
        vec3 midRock = vec3(0.20, 0.11, 0.07);
        vec3 ashRock = vec3(0.32, 0.26, 0.22);
        vec3 rock = mix(darkRock, midRock, strata);
        rock = mix(rock, ashRock, smoothstep(0.55, 0.95, h) * 0.55);
        rock = mix(rock * 0.85, rock * 1.15, pebble);
        float chan = abs(fract(ang * 1.9 + fbm3L(hp * 0.6) * 0.4) - 0.5);
        float channelMask = smoothstep(0.04, 0.0, chan)
                          * smoothstep(0.15, 0.65, h);
        float trickle = fbm(vec2(ang * 8.0, h * 4.5 - t * 0.18));
        channelMask *= smoothstep(0.35, 0.75, trickle);
        vec3 lavaHot = mix(vec3(0.85, 0.18, 0.04),
                           vec3(1.00, 0.70, 0.20),
                           smoothstep(0.6, 1.0, h));
        col = mix(rock, lavaHot, channelMask);
        float rimGlow = smoothstep(0.88, 1.0, h);
        col += vec3(1.00, 0.50, 0.10) * rimGlow * 0.55;
        float lamb = max(dot(nrm, sunDir), 0.0);
        float ao = mix(0.6, 1.0, h);
        col = col * (0.22 + lamb * 0.95) * ao;
        float rimL = pow(1.0 - max(dot(nrm, -rd), 0.0), 2.5);
        col += vec3(0.55, 0.28, 0.18) * rimL * 0.20;
        col += lavaHot * channelMask * 0.55;
      }
      return vec4(col, tBest);
    }

    // Foreground lava rocks scattered around the user.
    vec4 lavaRocks3D(vec3 ro, vec3 rd, float t) {
      vec3 sunDir = normalize(vec3(0.3, 0.6, -0.7));
      float bestT = 1e9;
      vec3 bestCol = vec3(0.0);
      vec3 bestN = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float ang = fi * 0.91;
        float dist = 4.5 + mod(fi * 1.7, 4.0);
        vec3 base = vec3(cos(ang) * dist, -1.6, sin(ang) * dist);
        float ry = 0.35 + 0.18 * sin(fi * 2.3);
        vec3 ax = vec3(0.7 + 0.2 * cos(fi * 1.7), ry,
                        0.6 + 0.2 * sin(fi * 1.7));
        vec3 ctr = base + vec3(0.0, ry, 0.0);
        float th = rayEllipL(ro - ctr, rd, ax);
        if (th > 0.3 && th < bestT) {
          bestT = th;
          vec3 hp = ro + rd * th - ctr;
          bestN = normalize(hp / (ax * ax));
          float n = fbm3L(hp * 4.0 + fi);
          vec3 rock = mix(vec3(0.06, 0.03, 0.02),
                          vec3(0.18, 0.09, 0.07), n);
          float crack = smoothstep(0.55, 0.7,
                                    fbm(hp.xz * 9.0 + t * 0.2));
          crack *= max(-bestN.y, 0.0);
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
  `,

  body: /* glsl */ `
    vec3 ro = uCamLocal;
    // Stereo parallax layers.
    vec2 pFar  = parallaxP(p, rd, 0.35);
    vec2 pBack = parallaxP(p, rd, 0.22);
    vec2 pMid  = parallaxP(p, rd, 0.12);
    vec2 pNear = parallaxP(p, rd, 0.04);

    // ---- Sky: smoky red/orange gradient ----
    float sky = smoothstep(-0.4, 1.0, pFar.y);
    vec3 high = vec3(0.20, 0.05, 0.15);
    vec3 mid  = vec3(0.55, 0.15, 0.10);
    vec3 low  = vec3(0.95, 0.45, 0.15);
    col = mix(low, mid, smoothstep(-0.4, 0.4, pFar.y));
    col = mix(col, high, smoothstep(0.4, 1.0, pFar.y));

    // Drifting ash clouds in the sky.
    float ash = fbm(vec2(pFar.x * 2.0 + uTime * 0.05, pFar.y * 2.5));
    ash *= smoothstep(-0.2, 1.0, pFar.y);
    col = mix(col, vec3(0.10, 0.05, 0.10), ash * 0.55);

    // Faint distant stars / sparks visible through the haze.
    {
      vec2 uvFar = pFar * 0.5 + 0.5;
      float spark = starsLayer(uvFar * 2.0 + vec2(uTime * 0.02, 0.0), 80.0, 0.992);
      col += vec3(1.0, 0.8, 0.5) * spark * 0.6;
    }

    // ---- 3D raycast volcanoes (parallax correctly with head movement) ----
    float opaqueT = 1e9;
    vec3 opaqueCol = vec3(0.0);
    vec4 v1Hit = volcanoCone(ro, rd, vec3(2.0, -1.6, -16.0), 6.0,
                              8.5, 2.6, uTime);
    if (v1Hit.w < opaqueT) {
      opaqueT = v1Hit.w;
      opaqueCol = v1Hit.rgb;
    }
    vec4 v2Hit = volcanoCone(ro, rd, vec3(-15.0, -1.6, 8.0), 4.2,
                              6.0, 1.8, uTime);
    if (v2Hit.w < opaqueT) {
      opaqueT = v2Hit.w;
      opaqueCol = v2Hit.rgb;
    }
    vec4 rocksHit = lavaRocks3D(ro, rd, uTime);
    if (rocksHit.w < opaqueT) {
      opaqueT = rocksHit.w;
      opaqueCol = rocksHit.rgb;
    }
    if (opaqueT < 1e8) {
      // Light atmospheric fog only; keep the volcano shape readable.
      float fogF = smoothstep(8.0, 80.0, opaqueT);
      col = mix(opaqueCol, col, fogF * 0.25);
    }

    // ---- Animated ash plume + lava spurts above main volcano apex ----
    {
      vec3 apexW = vec3(2.0, 4.4, -16.0);
      // Sample kNumSlices horizontal slices from the crater upward; each
      // slice tests distance from the vertical column through the apex.
      const int kNumSlices = 14;
      for (int i = 0; i < kNumSlices; i++) {
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
        float n = fbm3L(vec3(d.x * 0.45, h * 0.6 - uTime * 0.5,
                              d.y * 0.45));
        // Cooler grey/brown ash higher up; warmer near the base.
        vec3 ashHot = vec3(0.55, 0.30, 0.18);
        vec3 ashCold = vec3(0.20, 0.16, 0.18);
        vec3 ashCol = mix(ashHot, ashCold, smoothstep(0.0, 6.0, h));
        ashCol = mix(ashCol * 0.4, ashCol, n);
        col += ashCol * mask * (0.06 + n * 0.10);
        // Hot orange glow at the base of the plume.
        if (h < 1.5) {
          col += vec3(1.0, 0.55, 0.20) * mask * (1.5 - h) * 0.07;
        }
      }
      // Lava spurts: 5 glowing bombs arc up out of the crater on staggered
      // timers, then fall back. Each is a small bright sphere.
      for (int b = 0; b < 5; b++) {
        float fb = float(b);
        float cycle = 2.6 + fb * 0.31;
        float phase = mod(uTime + fb * 0.7, cycle) / cycle;
        // Random launch direction, stable per cycle index.
        float ck = floor((uTime + fb * 0.7) / cycle);
        float ang = hash(vec2(fb, ck)) * 6.28318;
        float spread = 0.5 + hash(vec2(fb + 3.1, ck)) * 0.8;
        float peakH = 2.5 + hash(vec2(fb + 7.7, ck)) * 2.0;
        // Parabolic trajectory.
        vec3 dir = vec3(cos(ang) * spread, 0.0, sin(ang) * spread);
        vec3 pos = apexW + dir * phase
                 + vec3(0.0, peakH * 4.0 * phase * (1.0 - phase), 0.0);
        // Ray-sphere test.
        vec3 oc2 = ro - pos;
        float rad = 0.18;
        float bSp = dot(oc2, rd);
        float cSp = dot(oc2, oc2) - rad * rad;
        float disc = bSp * bSp - cSp;
        if (disc > 0.0) {
          float ts = -bSp - sqrt(disc);
          if (ts > 0.5 && ts < opaqueT) {
            // Hot at launch, cools as it arcs.
            vec3 lavaC = mix(vec3(1.0, 0.95, 0.55),
                             vec3(0.95, 0.30, 0.05), phase);
            col = mix(col, lavaC * 1.6, 0.95);
          }
        }
        // Glowing trail behind the bomb.
        vec3 tp = ro + rd * max(dot(pos - ro, rd), 0.5);
        float trail = exp(-length(tp - pos) * 4.0)
                    * smoothstep(0.0, 0.6, phase);
        col += vec3(1.0, 0.55, 0.20) * trail * 0.4;
      }
    }

    // 2D effects anchored above the main 3D volcano's projected apex.
    vec2 volcCenter = vec2(0.10, -0.20);
    float volcW = 0.8;
    float volcH = 0.55;

    // ---- Lava river running across the foreground ----
    {
      float riverY = -0.65 + sin(pNear.x * 3.0 + uTime * 0.3) * 0.04;
      float riverBand = smoothstep(0.18, 0.0, abs(pNear.y - riverY))
                      * step(pNear.y, -0.45);
      // Flowing texture along x.
      float flow = fbm(vec2(pNear.x * 6.0 - uTime * 0.6, pNear.y * 8.0));
      float flow2 = fbm(vec2(pNear.x * 14.0 - uTime * 1.2, pNear.y * 16.0));
      vec3 lavaCol = mix(vec3(1.00, 0.85, 0.20),
                         vec3(0.95, 0.30, 0.05), flow);
      lavaCol = mix(lavaCol, vec3(0.20, 0.05, 0.02),
                    smoothstep(0.55, 0.85, flow2) * 0.8);
      col = mix(col, lavaCol * 1.6, riverBand);
      // Heat haze glow around it.
      float glow = smoothstep(0.30, 0.0, abs(pNear.y - riverY)) * step(pNear.y, -0.30);
      col += vec3(1.0, 0.45, 0.10) * glow * 0.35;
    }

    // ---- Always-on rising embers ----
    {
      for (int i = 0; i < 24; i++) {
        float fi = float(i);
        float life = mod(uTime * (0.4 + hash(vec2(fi, 7.7)) * 0.5)
                       + fi * 0.5, 3.0);
        float bx = (hash(vec2(fi, 1.7)) - 0.5) * 1.6
                 + sin(life * 2.0 + fi) * 0.05;
        float by = -0.7 + life * 0.6;
        vec2 d = pNear - vec2(bx, by);
        float dr = length(d);
        float ember = smoothstep(0.012, 0.0, dr);
        // Color cools as it rises.
        vec3 ec = mix(vec3(1.0, 0.85, 0.35),
                      vec3(0.85, 0.20, 0.05), life / 3.0);
        // Fade out near top.
        float fade = smoothstep(3.0, 1.5, life);
        col += ec * ember * fade * 1.6;
      }
    }

    // ---- Volcanic ash plume rising from crater (always on) ----
    // Removed: 2D screen-space plume no longer aligns with the 3D volcano apex.
    // The 3D cone reads on its own; immersive view has its own properly-anchored
    // sky-projected plume.

    // Removed: 2D screen-space mega-blast dome — the 3D bombs already convey
    // eruption energy and the flat semicircle didn't sit naturally on the cone.

    // ---- Volcanic lightning in ash plume every 7s ----
    {
      float cycle = 7.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float flash = smoothstep(0.0, 0.04, local) * smoothstep(0.4, 0.05, local);
      flash *= 0.5 + 0.5 * sin(local * 80.0);
      // Forked bolt within the plume area.
      vec2 startB = vec2((hash(vec2(k, 13.1)) - 0.5) * 0.4,
                         volcCenter.y + volcH + 0.6);
      vec2 endB   = vec2(startB.x + (hash(vec2(k, 27.7)) - 0.5) * 0.3,
                         volcCenter.y + volcH + 0.05);
      // Sample bolt as zig-zag line.
      float boltDist = 1e9;
      vec2 prev = startB;
      for (int i = 1; i <= 6; i++) {
        float fi = float(i) / 6.0;
        vec2 ptN = mix(startB, endB, fi);
        ptN.x += (hash(vec2(k, fi * 31.0 + 7.7)) - 0.5) * 0.06;
        // Distance from pBack to segment prev->ptN.
        vec2 seg = ptN - prev;
        float tSeg = clamp(dot(pBack - prev, seg) / dot(seg, seg), 0.0, 1.0);
        vec2 closest = prev + seg * tSeg;
        boltDist = min(boltDist, length(pBack - closest));
        prev = ptN;
      }
      float bolt = smoothstep(0.008, 0.0, boltDist);
      col += vec3(1.00, 0.95, 1.10) * bolt * flash * 4.0;
      // Glow halo around bolt.
      col += vec3(0.85, 0.55, 1.00) * smoothstep(0.06, 0.0, boltDist)
           * flash * 0.7;
    }

    // ---- Pyroclastic shock wave every 17s ----
    {
      float cycle = 17.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      vec2 cr = vec2(0.0, volcCenter.y + volcH);
      float dr = length(pBack - cr);
      float radius = local * 0.35;
      float shock = smoothstep(0.04, 0.0, abs(dr - radius))
                  * smoothstep(4.0, 0.5, local)
                  * step(0.0, dr - 0.05);
      col += vec3(1.0, 0.65, 0.30) * shock * 1.3;
      // Distortion ring darkens slightly inside.
      col *= 1.0 - smoothstep(0.04, 0.0, abs(dr - radius)) * 0.2
                 * smoothstep(4.0, 0.5, local);
    }
  `,
};

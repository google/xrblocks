// Forest scene: dense forest at twilight with fireflies, distant lightning
// storm, owl gliding past, comet through canopy, mist rolling in,
// occasional shooting star.
export const ForestScene = {
  name: 'Forest',

  ringCool: 'vec3(0.10, 0.45, 0.20)',
  ringWarm: 'vec3(0.85, 0.95, 0.40)',
  haloInner: 'vec3(0.30, 0.85, 0.55)',
  haloOuter: 'vec3(0.85, 1.00, 0.55)',

  helpers: /* glsl */ `
    // Vertical-cylinder ray test (axis = Y).
    float rayCylinderY(vec3 ro, vec3 rd, vec2 c, float r,
                       float yMin, float yMax) {
      vec2 d = rd.xz;
      vec2 oc = ro.xz - c;
      float a = dot(d, d);
      if (a < 1e-6) return -1.0;
      float b = dot(oc, d);
      float disc = b * b - a * (dot(oc, oc) - r * r);
      if (disc < 0.0) return -1.0;
      float t = (-b - sqrt(disc)) / a;
      if (t < 0.0) return -1.0;
      float hy = ro.y + rd.y * t;
      if (hy < yMin || hy > yMax) return -1.0;
      return t;
    }

    // Same 18-tree forest as ForestImmersive: 8 inner ring (4-7m),
    // 10 outer ring (8-13m). Eye at y=0, ground at y=-1.6.
    // Returns vec4(rgb, hitT) or vec4(0,0,0,-1) on miss.
    vec4 forestTrees3D(vec3 ro, vec3 rd) {
      const float GY = -1.6;
      float bestT = 1e9; int bestId = 0; vec2 bestPos = vec2(0.0);
      float bestScale = 1.0;
      for (int i = 0; i < 18; i++) {
        float fi = float(i);
        float ringT = (fi < 8.0) ? fi / 8.0 : (fi - 8.0) / 10.0;
        float ang = ringT * 6.28318 + hash(vec2(fi, 1.7)) * 0.6;
        float radius = (fi < 8.0)
            ? mix(4.0, 7.0, hash(vec2(fi, 3.3)))
            : mix(8.0, 13.0, hash(vec2(fi, 5.1)));
        vec2 pos = vec2(cos(ang), sin(ang)) * radius;
        float scale = 1.6 + hash(vec2(fi, 9.7)) * 1.4;
        float lAng = hash(vec2(fi, 13.1)) * 6.28318;
        float lAmt = (hash(vec2(fi, 17.3)) - 0.3) * 0.4 * scale;
        vec2 lean = vec2(cos(lAng), sin(lAng)) * lAmt;
        float sway = sin(uTime * 0.5 + hash(vec2(fi, 21.7)) * 6.28) * 0.12;
        float trunkTopY = GY + 1.4 * scale;
        float t = rayCylinderY(ro, rd, pos, 0.10 * scale, GY, trunkTopY);
        if (t > 0.0 && t < bestT) {
          bestT = t; bestId = 1; bestPos = pos; bestScale = scale;
        }
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          float cy = trunkTopY + (0.4 + fk * 0.55) * scale;
          float rVar = 0.85 + 0.3 * hash(vec2(pos.x * 7.3 + fk, pos.y * 3.1));
          float cr = (0.95 - fk * 0.18) * scale * rVar;
          float hFrac = (fk + 1.0) / 4.0;
          vec2 off = lean * hFrac + vec2(sway) * hFrac;
          float ts = raySphere(ro, rd, vec3(pos.x + off.x, cy, pos.y + off.y), cr);
          if (ts > 0.0 && ts < bestT) {
            bestT = ts; bestId = 2; bestPos = pos; bestScale = scale;
          }
        }
      }
      if (bestId == 0) return vec4(0.0, 0.0, 0.0, -1.0);
      vec3 hp = ro + rd * bestT;
      vec3 col;
      if (bestId == 1) {
        float bark = fbm(vec2(hp.y * 6.0,
                        atan(hp.z - bestPos.y, hp.x - bestPos.x) * 4.0));
        col = mix(vec3(0.030, 0.022, 0.015),
                  vec3(0.075, 0.055, 0.035), bark);
      } else {
        vec3 trunkTop = vec3(bestPos.x, GY + 1.4 * bestScale, bestPos.y);
        vec3 n = normalize(hp - trunkTop);
        float topLight = max(n.y, 0.0);
        float needles = fbm(hp.xz * 6.0 + hp.y * 3.0);
        vec3 base = mix(vec3(0.025, 0.050, 0.028),
                        vec3(0.055, 0.100, 0.050), needles);
        float breathe = 0.92 + 0.08 * sin(uTime * 0.6
          + bestPos.x * 1.3 + bestPos.y * 0.9);
        col = base * (0.45 + topLight * 0.7) * breathe;
      }
      float fog = smoothstep(3.0, 16.0, bestT);
      col = mix(col, vec3(0.10, 0.08, 0.18), fog * 0.6);
      return vec4(col, bestT);
    }

    // A vertical tree-trunk silhouette (kept for legacy; unused).
    float treeMask(vec2 p, float cx, float w, float h, float baseY) {
      float taper = w * (1.0 - smoothstep(baseY, baseY + h, p.y) * 0.6);
      float trunk = smoothstep(taper, taper * 0.85, abs(p.x - cx))
                  * step(baseY, p.y) * step(p.y, baseY + h);
      float dx = abs(p.x - cx);
      float canopyTop = baseY + h + 0.25;
      float canopy = step(p.y, canopyTop - dx / (w * 4.0))
                   * step(baseY + h * 0.4, p.y);
      return clamp(trunk + canopy, 0.0, 1.0);
    }
  `,

  body: /* glsl */ `
    // Stereo parallax layers.
    vec2 pFar  = parallaxP(p, rd, 0.35);
    vec2 pBack = parallaxP(p, rd, 0.22);
    vec2 pMid  = parallaxP(p, rd, 0.12);
    vec2 pNear = parallaxP(p, rd, 0.04);

    // ---- Twilight sky: deep purple to teal ----
    vec3 skyTop = vec3(0.05, 0.04, 0.18);
    vec3 skyMid = vec3(0.12, 0.08, 0.30);
    vec3 skyLow = vec3(0.30, 0.18, 0.35);
    col = mix(skyLow, skyMid, smoothstep(-0.3, 0.4, pFar.y));
    col = mix(col, skyTop, smoothstep(0.4, 1.0, pFar.y));

    // Crescent moon glow up high.
    {
      vec2 mp = vec2(0.55, 0.65);
      float dr = length(pFar - mp);
      float halo = smoothstep(0.3, 0.0, dr);
      col += vec3(0.85, 0.85, 1.00) * halo * 0.4;
      // Crescent: bright disc minus offset disc.
      float disc = smoothstep(0.06, 0.05, dr);
      float bite = smoothstep(0.06, 0.05, length(pFar - (mp + vec2(0.02, 0.01))));
      col += vec3(1.0, 0.97, 0.90) * max(disc - bite, 0.0) * 1.5;
    }

    // Stars in upper sky.
    {
      vec2 uvFar = pFar * 0.5 + 0.5;
      float s1 = starsLayer(uvFar * 2.0, 60.0, 0.985);
      float s2 = starsLayer(uvFar * 2.0 + 5.0, 130.0, 0.992);
      float upper = smoothstep(-0.1, 0.5, pFar.y);
      col += vec3(0.95, 0.95, 1.0) * (s1 + s2 * 0.6) * upper * 0.9;
    }

    // ---- 3D ground (matches immersive: y=-1.6 plane) ----
    {
      vec3 ro = uCamLocal;
      float gy = -1.6;
      if (rd.y < -0.001 && ro.y > gy) {
        float t = (gy - ro.y) / rd.y;
        if (t > 0.0 && t < 200.0) {
          vec3 gp = ro + rd * t;
          float gn = fbm(gp.xz * 0.4);
          vec3 ground = mix(vec3(0.03, 0.04, 0.02),
                            vec3(0.08, 0.07, 0.04), gn);
          // Creek — winding stream on the forest floor
          float creekPath = sin(gp.z * 0.7 + 1.5) * 1.8
                          + sin(gp.z * 0.3) * 2.5;
          float creekDist = abs(gp.x - creekPath);
          float creekW = 0.35 + 0.1 * sin(gp.z * 1.2);
          float creek = smoothstep(creekW, creekW * 0.4, creekDist);
          if (creek > 0.01) {
            vec2 flowUV = gp.xz + vec2(0.0, uTime * 0.2);
            float ripple = fbm(flowUV * 4.0);
            vec3 water = mix(vec3(0.03, 0.05, 0.12),
                             vec3(0.06, 0.10, 0.20), ripple);
            water += vec3(0.04, 0.03, 0.08) * ripple;
            ground = mix(ground, water, creek);
          }
          float fog = smoothstep(0.0, 25.0, t);
          col = mix(ground, col, fog * 0.7);
        }
      }
    }

    // ---- 3D raycast trees (same 18-tree layout as the immersive) ----
    {
      vec3 ro = uCamLocal;
      vec4 trees = forestTrees3D(ro, rd);
      if (trees.a > 0.0) col = trees.rgb;
    }

    // Moonbeams — soft volumetric light shafts through canopy gaps
    {
      vec3 mRo = uCamLocal;
      vec3 mLD = normalize(vec3(-0.45, -0.75, 0.55));
      for (int b = 0; b < 3; b++) {
        float fb = float(b);
        vec3 bO = vec3(sin(fb * 2.4 + 0.8) * 3.5,
                       3.9,
                       cos(fb * 2.4 + 0.8) * 3.0);
        vec3 w = mRo - bO;
        float dd = dot(rd, mLD);
        float den = 1.0 - dd * dd;
        if (den > 0.001) {
          float sC = (dd * dot(w, mLD) - dot(w, rd)) / den;
          float tC = (dot(w, mLD) - dd * dot(w, rd)) / den;
          if (sC > 0.5 && tC > 0.0) {
            vec3 pR = mRo + rd * sC;
            vec3 pB = bO + mLD * tC;
            float dist = length(pR - pB);
            float beam = smoothstep(0.6, 0.0, dist) * 0.12;
            beam *= smoothstep(0.0, 1.5, tC) * smoothstep(8.0, 5.0, tC);
            beam *= smoothstep(-1.6, -1.0, pR.y)
                  * smoothstep(4.0, 1.5, pR.y);
            beam *= smoothstep(20.0, 2.0, sC);
            col += vec3(0.50, 0.55, 0.75) * beam;
          }
        }
      }
    }

    // Ground mist rolling in (always on, animated).
    {
      float mist = fbm(vec2(pNear.x * 3.0 + uTime * 0.1, pNear.y * 6.0));
      mist *= smoothstep(-0.2, -0.7, pNear.y);
      col = mix(col, vec3(0.50, 0.55, 0.70), mist * 0.45);
    }

    // ---- Always-on fireflies dancing through trees ----
    {
      for (int i = 0; i < 18; i++) {
        float fi = float(i);
        float bx = (hash(vec2(fi, 1.1)) - 0.5) * 1.8
                 + sin(uTime * (0.5 + hash(vec2(fi, 5.5))) + fi) * 0.15;
        float by = -0.5 + hash(vec2(fi, 9.7)) * 0.6
                 + cos(uTime * (0.4 + hash(vec2(fi, 7.3))) + fi * 1.7) * 0.1;
        vec2 d = pMid - vec2(bx, by);
        float dr = length(d);
        // Slow blink.
        float blink = 0.5 + 0.5 * sin(uTime * 1.5 + fi * 2.7);
        float core = smoothstep(0.008, 0.0, dr) * blink;
        float halo = smoothstep(0.04, 0.0, dr) * blink * 0.5;
        col += vec3(0.95, 1.00, 0.55) * (core * 2.0 + halo);
      }
    }

    // ---- Owl gliding past every 12s ----
    {
      float cycle = 12.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float life = smoothstep(0.0, 0.3, local) * smoothstep(cycle, cycle - 1.0, local);
      // Right-to-left or left-to-right.
      float dir = (mod(k, 2.0) < 0.5) ? 1.0 : -1.0;
      float baseX = -1.6 * dir + dir * local * 0.32;
      float baseY = 0.20 + sin(local * 1.5 + k) * 0.03;
      vec2 c = vec2(baseX, baseY);
      vec2 d = pMid - c;
      // Body silhouette
      float body = smoothstep(0.025, 0.020, length(d * vec2(1.4, 1.0)));
      // Wings: two flapping arcs.
      float flap = sin(uTime * 6.0 + k * 2.0);
      for (int s = -1; s <= 1; s += 2) {
        float fs = float(s);
        vec2 wc = c + vec2(fs * 0.05, 0.0);
        vec2 wd = pMid - wc;
        // Wing rotates with flap.
        float wAng = fs * (0.6 + flap * 0.5);
        float wx = wd.x * cos(wAng) - wd.y * sin(wAng);
        float wy = wd.x * sin(wAng) + wd.y * cos(wAng);
        float wing = smoothstep(0.05, 0.04, abs(wy))
                   * smoothstep(0.07, 0.0, wx * fs)
                   * step(0.0, wx * fs);
        body = max(body, wing);
      }
      col = mix(col, vec3(0.04, 0.04, 0.05), body * life);
      // Eye glints.
      float eye = smoothstep(0.005, 0.0,
          length(pMid - c - vec2(0.012, 0.005)))
        + smoothstep(0.005, 0.0,
          length(pMid - c - vec2(-0.012, 0.005)));
      col += vec3(1.0, 0.85, 0.20) * eye * life * 1.5;
    }

    // ---- Comet streaking through canopy every 16s ----
    {
      float cycle = 16.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float life = smoothstep(0.0, 0.2, local) * smoothstep(2.5, 0.2, local);
      // Diagonal streak from upper-right to lower-left.
      vec2 start = vec2(1.4, 0.9);
      vec2 end   = vec2(-1.4, -0.2);
      vec2 dir = normalize(end - start);
      vec2 perp = vec2(-dir.y, dir.x);
      vec2 pos = mix(start, end, clamp(local * 0.5, 0.0, 1.0));
      vec2 d = pBack - pos;
      float along = dot(d, -dir);
      float across = dot(d, perp);
      float head = smoothstep(0.02, 0.0, length(d));
      float tail = smoothstep(0.005, 0.0, abs(across))
                 * smoothstep(0.55, 0.0, along)
                 * step(0.0, along);
      col += vec3(0.90, 0.85, 1.00) * (head * 2.5 + tail * 1.1) * life;
      // Wide soft halo glow as it passes.
      col += vec3(0.40, 0.55, 0.85) * smoothstep(0.15, 0.0, length(d))
           * life * 0.4;
    }

    // ---- Distant lightning storm flashes every 8s ----
    {
      float cycle = 8.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float flash = smoothstep(0.0, 0.05, local) * smoothstep(0.5, 0.05, local);
      flash *= 0.5 + 0.5 * sin(local * 60.0);
      // Light up entire sky briefly.
      float upper = smoothstep(-0.4, 0.5, pFar.y);
      col += vec3(0.65, 0.75, 0.95) * flash * upper * 0.6;
      // Forked bolt low on the horizon.
      float bx = (hash(vec2(k, 17.1)) - 0.5) * 1.4;
      float bolt = smoothstep(0.005, 0.0,
          abs(pFar.x - (bx + sin(pFar.y * 18.0 + k) * 0.04)))
        * smoothstep(0.4, -0.3, pFar.y) * step(-0.4, pFar.y);
      col += vec3(1.0, 1.0, 1.10) * bolt * flash * 3.0;
    }

    // ---- Aurora ribbon shimmer every 24s ----
    {
      float cycle = 24.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float life = smoothstep(0.0, 2.0, local) * smoothstep(8.0, 5.0, local);
      if (life > 0.001) {
        // Horizontal undulating ribbon high in sky.
        float bandY = 0.55 + sin(pFar.x * 3.0 + uTime * 0.6) * 0.08
                           + sin(pFar.x * 7.0 + uTime * 0.4) * 0.04;
        float band = exp(-pow((pFar.y - bandY) / 0.10, 2.0));
        float streak = pow(fbm(vec2(pFar.x * 18.0, pFar.y * 6.0 - uTime * 0.8)), 1.4);
        vec3 aurCol = mix(vec3(0.30, 1.00, 0.60),
                          vec3(0.40, 0.55, 1.00),
                          0.5 + 0.5 * sin(pFar.x * 2.0 + uTime * 0.5));
        col += aurCol * band * streak * life * 1.0;
      }
    }
  `,
};

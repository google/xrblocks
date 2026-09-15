// Cosmic scene: deep space with Earth, gas giant + rings, sun, moon, comets,
// and cinematic events (supernova, meteor shower, rocket flyby, ISS,
// pulsar, wormhole, aurora curtain).
export const CosmicScene = {
  name: 'Cosmic',

  ringCool: 'vec3(0.55, 0.85, 1.30)',
  ringWarm: 'vec3(1.30, 0.70, 1.15)',
  ringColorExpr:
    'hsv2rgb(vec3(fract(vUv.x * 1.0 + uTime * 0.08), 0.85, 1.0)) * (0.9 + band * 0.6)',
  haloInner: 'vec3(0.65, 0.90, 1.40)',
  haloOuter: 'vec3(1.30, 0.75, 1.20)',

  helpers: /* glsl */ `
    vec3 shadePlanet(vec3 n, vec3 lightDir, vec3 viewDir,
                     vec3 ocean, vec3 land, vec3 cloud) {
      float lon = atan(n.z, n.x) + uTime * 0.05;
      float lat = asin(clamp(n.y, -1.0, 1.0));
      vec2 uv = vec2(lon, lat) * 1.6;
      float h = fbm(uv) * 0.7 + fbm(uv * 3.1) * 0.3;
      float landMask = smoothstep(0.48, 0.56, h);
      vec3 beach = vec3(0.78, 0.72, 0.50);
      vec3 grass = land;
      vec3 mountain = vec3(0.55, 0.48, 0.42);
      vec3 surface = ocean;
      surface = mix(surface, beach,
          smoothstep(0.46, 0.50, h) - smoothstep(0.50, 0.54, h));
      surface = mix(surface, grass, smoothstep(0.50, 0.58, h));
      surface = mix(surface, mountain, smoothstep(0.65, 0.78, h));
      float cloudLon = atan(n.z, n.x) + uTime * 0.08;
      vec2 cuv = vec2(cloudLon, lat) * 1.6;
      float clouds = smoothstep(0.55, 0.78,
          fbm(cuv * 1.7 + vec2(uTime * 0.04, 0.0)));
      clouds *= smoothstep(0.40, 0.55, fbm(cuv * 4.0));
      surface = mix(surface, cloud, clouds * 0.7);
      float nightSide = clamp(-dot(n, lightDir), 0.0, 1.0);
      float cityMask = landMask
          * smoothstep(0.55, 0.75, fbm(uv * 6.0))
          * smoothstep(0.5, 0.85, fbm(uv * 18.0));
      vec3 cityGlow = vec3(1.0, 0.85, 0.55) * cityMask * nightSide * 0.6;
      float poleBand = smoothstep(1.05, 1.30, abs(lat));
      float aurora = poleBand
          * (0.55 + 0.45 * sin(uTime * 1.6 + lon * 3.0))
          * (0.5 + 0.5 * fbm(vec2(lon * 4.0, uTime * 0.7)));
      vec3 auroraCol = vec3(0.30, 1.00, 0.55) * aurora * nightSide * 0.9;
      float lambert = max(dot(n, lightDir), 0.0);
      float ambient = 0.10;
      vec3 reflectDir = reflect(-lightDir, n);
      float spec = pow(max(dot(reflectDir, -viewDir), 0.0), 32.0);
      float oceanMask = 1.0 - landMask;
      vec3 specular = vec3(1.0, 0.95, 0.85) * spec * oceanMask * 0.9;
      float rim = pow(1.0 - max(dot(n, -viewDir), 0.0), 2.5);
      vec3 atmosphere = vec3(0.45, 0.7, 1.0);
      return surface * (ambient + lambert)
           + specular + atmosphere * rim * 0.85
           + cityGlow + auroraCol;
    }

    vec4 cosmicRaymarch(vec2 sp, float t) {
      vec3 ro = uCamLocal;
      vec3 surfacePoint = vec3(sp * 0.6, 0.0);
      vec3 rd = normalize(surfacePoint - ro);

      vec3 sunPos = vec3(0.05, 0.65, -2.6);
      float sunRad = 0.18;
      vec3 sunDir = normalize(sunPos - ro);
      vec3 planetPos = vec3(-0.85, -0.10, -1.6);
      float planetRad = 0.40;
      float gasA = t * 0.05;
      vec3 gasPos = vec3(0.95 + sin(gasA) * 0.06,
                         0.10 + cos(gasA * 0.7) * 0.04,
                         -2.2 + cos(gasA) * 0.10);
      float gasRad = 0.42;
      float moonA = t * 0.18;
      vec3 moonOffset = vec3(cos(moonA) * 0.85,
                             sin(moonA * 1.3) * 0.12,
                             sin(moonA) * 0.85);
      vec3 moonPos = planetPos + moonOffset;
      float moonRad = 0.11;
      vec3 lightDirPlanet = normalize(sunPos - planetPos);
      vec3 lightDirMoon   = normalize(sunPos - moonPos);
      vec3 lightDirGas    = normalize(sunPos - gasPos);
      vec3 limbCenter = vec3(-3.5, -5.5, -3.5);
      float limbRadius = 5.5;
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

      vec3 rgb = vec3(0.0);
      float a = 0.0;

      // Saturn-style ring around the gas giant.
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
              rgb += ringCol * bands * shade * 1.6;
              a = max(a, bands * 0.95);
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
                rgb += lrCol * rb * shade * 1.4;
                a = max(a, rb * 0.9);
              }
            }
          }
        }
      }

      // Sun glow + corona + flare.
      {
        float breathe = 0.85 + 0.15 * sin(t * 0.6);
        vec3 oc = ro - sunPos;
        float b = dot(oc, rd);
        float closest = length(oc - rd * (-b));
        float halo = smoothstep(0.9, 0.0, closest / (sunRad * 4.0));
        float coronaR = closest / sunRad;
        float angSun = atan(
            dot(rd - sunDir * dot(rd, sunDir), vec3(0.0, 1.0, 0.0)),
            dot(rd - sunDir * dot(rd, sunDir), vec3(1.0, 0.0, 0.0)));
        float corona = smoothstep(5.0, 1.0, coronaR)
                     * (0.5 + 0.5 * fbm(vec2(angSun * 4.0, t * 0.3 + coronaR)));
        rgb += vec3(1.0, 0.85, 0.55) * halo * 0.9 * breathe;
        rgb += vec3(1.0, 0.55, 0.20) * corona * 0.45;
        a = max(a, halo * 0.6);
        float flarePhase = mod(t, 11.0) / 11.0;
        float flareEnv = smoothstep(0.0, 0.05, flarePhase)
                       * smoothstep(0.35, 0.10, flarePhase);
        rgb += vec3(1.0, 0.7, 0.3)
             * smoothstep(2.0, 0.6, coronaR) * flareEnv * 1.2;
        vec2 sScreen = sunPos.xy / abs(sunPos.z);
        vec2 d2 = sp - sScreen;
        float streak = smoothstep(0.018, 0.0, abs(d2.y))
                     * smoothstep(0.9, 0.0, abs(d2.x));
        rgb += vec3(1.0, 0.7, 0.4) * streak * 0.7 * breathe;
      }

      if (hitId == 1) {
        vec3 hp = ro + rd * tBest;
        vec3 n = normalize(hp - planetPos);
        rgb = shadePlanet(n, lightDirPlanet, rd,
            vec3(0.05, 0.20, 0.55), vec3(0.30, 0.55, 0.25),
            vec3(1.00, 1.00, 1.00));
        a = 1.0;
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
        rgb = base * (0.1 + lambert);
        a = 1.0;
      } else if (hitId == 3) {
        vec3 hp = ro + rd * tBest;
        vec3 n = normalize(hp - sunPos);
        float surf = fbm(vec2(n.x * 4.0 + t * 0.30, n.y * 4.0 - t * 0.20));
        float granules = fbm(vec2(n.x * 18.0 - t * 0.4, n.y * 18.0 + t * 0.3));
        vec3 c = mix(vec3(1.00, 0.55, 0.20),
                     vec3(1.00, 0.95, 0.80), surf);
        c += vec3(0.4, 0.15, 0.05) * (granules - 0.5) * 0.6;
        float spot = smoothstep(0.18, 0.0,
            length(vec2(n.x - sin(t * 0.07) * 0.4,
                        n.y - cos(t * 0.05) * 0.3)));
        c *= 1.0 - spot * 0.6;
        float limb = pow(max(dot(n, -rd), 0.0), 0.45);
        rgb = c * 1.6 * limb;
        a = 1.0;
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
        rgb = base * (0.35 + lambert * 0.95)
            + vec3(1.0, 0.75, 0.55) * rim * 0.55;
        a = 1.0;
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
        rgb = base * (0.20 + lambert * 0.80)
            + vec3(0.55, 0.80, 1.00) * rim * 0.65;
        a = 1.0;
      }
      return vec4(rgb, a);
    }

    vec3 cosmicComet(vec2 sp, float t, float seed) {
      float period = 7.5 + seed * 9.0;
      float phase = mod(t + seed * 17.13, period) / period;
      float curve = (seed - 0.5) * 1.6;
      float headR = 0.025 + seed * 0.025;
      vec3 col = mix(vec3(0.85, 0.95, 1.00),
                     vec3(1.00, 0.80, 0.55), seed);
      vec2 start = vec2(-1.5 + seed * 0.6,  1.2 - seed * 0.5);
      vec2 end   = vec2( 1.4 - seed * 0.7, -1.1 + seed * 0.3);
      vec2 mid   = mix(start, end, 0.5) + vec2(0.0, curve) * 0.6;
      vec2 pos = mix(mix(start, mid, phase), mix(mid, end, phase), phase);
      vec2 dir = normalize(mix(mid - start, end - mid, phase));
      vec2 perp = vec2(-dir.y, dir.x);
      vec2 d = sp - pos;
      float along = dot(d, -dir);
      float across = dot(d, perp);
      float head = smoothstep(headR, 0.0, length(d));
      float tailLen = 0.35 + seed * 0.4;
      float wobble = sin(along * 18.0 - t * 6.0) * 0.004;
      float tail = smoothstep(0.010, 0.0, abs(across + wobble))
                 * smoothstep(tailLen, 0.0, along)
                 * step(0.0, along);
      float life = smoothstep(0.0, 0.05, phase)
                 * smoothstep(1.0, 0.85, phase);
      return col * (head * 2.4 + tail * 1.0) * life;
    }
  `,

  body: /* glsl */ `
    vec2 nUv = p * 1.4;
    vec3 nebulaA = vec3(0.05, 0.08, 0.30);
    vec3 nebulaB = vec3(0.55, 0.18, 0.70);
    vec3 nebulaC = vec3(0.95, 0.45, 0.25);
    vec3 nebulaD = vec3(0.35, 0.85, 1.00);
    col = vec3(0.005, 0.005, 0.02);
    // Near depth layer — large soft structures
    {
      vec2 nuv = nUv * 0.7;
      float ln1 = warpedFbm(nuv + vec2(uTime * 0.03, -uTime * 0.02));
      float ln2 = fbm(nuv * 2.8 - vec2(uTime * 0.05, uTime * 0.04));
      float ld = pow(ln1 * 0.55 + ln2 * 0.45, 1.6);
      vec3 lc = mix(nebulaA, nebulaB, smoothstep(0.15, 0.7, ln1));
      lc = mix(lc, nebulaC, smoothstep(0.55, 1.0, ln2) * 0.9);
      lc *= 0.15 + ld * 2.4;
      col = mix(col, lc, ld * 0.35);
    }
    // Mid depth layer — primary detail (original scale)
    {
      float n1 = warpedFbm(nUv + vec2(uTime * 0.03, -uTime * 0.02));
      float n2 = fbm(nUv * 2.8 - vec2(uTime * 0.05, uTime * 0.04));
      float n3 = ridgedFbm(nUv * 4.0 + vec2(-uTime * 0.04, uTime * 0.03));
      float density = pow(n1 * 0.55 + n2 * 0.45, 1.6);
      float wisps = pow(n3, 2.2);
      vec3 mc = mix(nebulaA, nebulaB, smoothstep(0.15, 0.7, n1));
      mc = mix(mc, nebulaC, smoothstep(0.55, 1.0, n2) * 0.9);
      mc = mix(mc, nebulaD, wisps * 0.6);
      mc *= 0.15 + density * 2.4;
      col = mix(col, mc, clamp(density * 0.7, 0.0, 1.0));
    }
    // Far depth layer — distant haze
    {
      vec2 nuv = nUv * 1.8;
      float fn1 = fbm(nuv * 1.2 + vec2(uTime * 0.02, -uTime * 0.015));
      float fn3 = ridgedFbm(nuv * 3.0 + vec2(-uTime * 0.03, uTime * 0.02));
      float fDensity = pow(fn1, 1.8);
      float fWisps = pow(fn3, 2.2);
      vec3 fc = mix(nebulaA, nebulaB, smoothstep(0.2, 0.75, fn1));
      fc = mix(fc, nebulaD, fWisps * 0.5);
      fc *= 0.1 + fDensity * 1.8;
      col = mix(col, fc, clamp(fDensity * 0.4, 0.0, 1.0));
    }
    col = mix(vec3(0.005, 0.005, 0.02), col, 0.92);

    vec4 sceneRgba = cosmicRaymarch(p, uTime);
    col = mix(col, sceneRgba.rgb, sceneRgba.a);

    col += cosmicComet(p, uTime, 0.13);
    col += cosmicComet(p, uTime + 2.7, 0.61);
    col += cosmicComet(p, uTime + 4.1, 0.84);

    float s1 = starsLayer(vUv * 2.0,        45.0, 0.975);
    float s2 = starsLayer(vUv * 2.0 + 17.0, 95.0, 0.985);
    float s3 = starsLayer(vUv * 2.0 + 91.0, 180.0, 0.992);
    float s4 = starsLayer(vUv * 2.0 + 53.0, 260.0, 0.996);
    col += vec3(0.9, 0.95, 1.0) *
           (s1 * 1.1 + s2 * 0.9 + s3 * 0.7 + s4 * 0.6);
    float drift = starsLayer(
      vUv * 2.0 + vec2(uTime * 0.04, uTime * 0.02), 60.0, 0.99);
    col += vec3(1.0, 0.85, 0.95) * drift * 0.8;

    // ---- Supernova every 22s ----
    {
      float cycle = 22.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      vec2 snPos = vec2(hash(vec2(k, 1.7)) * 1.4 - 0.7,
                       hash(vec2(k, 4.3)) * 1.4 - 0.7);
      vec2 d2 = p - snPos;
      float dSn = length(d2);
      float ang = atan(d2.y, d2.x);
      float flash = smoothstep(0.0, 0.25, local)
                  * smoothstep(6.0, 0.4, local);
      float core = smoothstep(0.06, 0.0, dSn) * 4.5;
      float bloom = smoothstep(0.7, 0.0, dSn) * 1.4;
      vec3 hotCol = mix(vec3(0.7, 0.85, 1.20),
                        vec3(1.00, 0.95, 0.80), smoothstep(0.0, 1.0, local));
      hotCol = mix(hotCol, vec3(1.00, 0.55, 0.30),
                   smoothstep(2.0, 6.0, local));
      col += hotCol * (core + bloom) * flash;
      float jetAng = hash(vec2(k, 13.7)) * 6.2832;
      vec2 jetDir = vec2(cos(jetAng), sin(jetAng));
      float along = dot(d2, jetDir);
      float across = dot(d2, vec2(-jetDir.y, jetDir.x));
      float jetR = smoothstep(0.0, 4.0, local) * 0.6;
      float jet = smoothstep(0.04, 0.0, abs(across))
                * smoothstep(jetR, jetR * 0.05, abs(along));
      jet *= smoothstep(7.0, 1.5, local);
      jet *= 0.4 + 0.6 * fbm(vec2(along * 30.0, uTime * 0.6));
      col += vec3(0.85, 0.95, 1.10) * jet * 0.9;
      float ringR = smoothstep(0.0, 6.0, local) * 0.65;
      float perturb = ridgedFbm(vec2(ang * 3.0 + k * 5.0, ringR * 8.0)) * 0.06;
      float frontDist = abs(dSn - (ringR + perturb));
      float width = 0.012 + smoothstep(0.0, 6.0, local) * 0.025;
      float shock = smoothstep(width, 0.0, frontDist);
      shock *= 0.5 + ridgedFbm(vec2(ang * 8.0, ringR * 22.0 + uTime * 0.3)) * 1.1;
      float shockFade = smoothstep(8.0, 1.5, local);
      col += vec3(1.0, 0.95, 1.0) * shock * shockFade * 1.4;
    }

    // ---- Meteor shower every 17s ----
    {
      float cycle = 17.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float burstEnv = smoothstep(0.0, 0.2, local)
                     * smoothstep(2.5, 0.2, local);
      if (burstEnv > 0.0) {
        float ang = hash(vec2(k, 9.1)) * 6.2832;
        vec2 mDir = vec2(cos(ang), sin(ang));
        vec2 mPerp = vec2(-mDir.y, mDir.x);
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          vec2 origin = vec2(hash(vec2(k, fi + 11.1)) * 2.0 - 1.0,
                             hash(vec2(k, fi + 23.7)) * 2.0 - 1.0);
          float speed = 1.6 + hash(vec2(k, fi + 4.4));
          vec2 pos = origin + mDir * (local * speed);
          vec2 dd = p - pos;
          float across2 = dot(dd, mPerp);
          float along2 = dot(dd, -mDir);
          float head = smoothstep(0.012, 0.0, length(dd));
          float tail = smoothstep(0.005, 0.0, abs(across2))
                     * smoothstep(0.30, 0.0, along2)
                     * step(0.0, along2);
          col += vec3(1.0, 0.9, 0.7) * (head * 1.8 + tail * 0.85) * burstEnv;
        }
      }
    }

    // ---- Rocket flyby every 13s ----
    {
      float cycle = 13.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float life = smoothstep(0.0, 0.3, local)
                 * smoothstep(cycle, cycle - 1.0, local);
      float ang = hash(vec2(k, 31.7)) * 6.2832;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 perp = vec2(-dir.y, dir.x);
      vec2 start = -dir * 1.6 + perp * (hash(vec2(k, 7.7)) - 0.5);
      vec2 pos = start + dir * local * 0.30;
      vec2 d = p - pos;
      float along = dot(d, -dir);
      float across = dot(d, perp);
      float hull = smoothstep(0.055, 0.038, abs(along))
                 * smoothstep(0.014, 0.0, abs(across));
      float wing = smoothstep(0.045, 0.0, abs(along + 0.005))
                 * smoothstep(0.005, 0.0, max(abs(across) - 0.030, 0.0));
      col += vec3(0.95, 0.97, 1.00) * (hull + wing) * 1.6 * life;
      float plumeAlong = along + 0.060;
      float plume = smoothstep(0.32, 0.0, plumeAlong) * step(0.0, plumeAlong)
                  * smoothstep(0.018, 0.0, abs(across));
      col += vec3(0.30, 0.65, 1.00) * plume * 1.4 * life;
      float plumeCore = plume * smoothstep(0.10, 0.0, plumeAlong);
      col += vec3(1.00, 0.95, 0.75) * plumeCore * 2.0 * life;
    }

    // ---- Wormhole every 27s ----
    {
      float cycle = 27.0;
      float k = floor(uTime / cycle);
      float local = uTime - k * cycle;
      float open = smoothstep(0.0, 2.0, local) * smoothstep(8.0, 5.0, local);
      if (open > 0.001) {
        vec2 wPos = vec2(hash(vec2(k, 71.3)) * 1.2 - 0.6,
                        hash(vec2(k, 88.9)) * 1.2 - 0.6);
        vec2 d = p - wPos;
        float dr = length(d);
        float ang = atan(d.y, d.x);
        float horizon = smoothstep(0.05, 0.045, dr);
        col *= 1.0 - horizon * open;
        float discMask = smoothstep(0.05, 0.06, dr)
                       * smoothstep(0.22, 0.10, dr);
        float swirl = pow(warpedFbm(vec2(ang * 4.0 + uTime * 2.0,
                                         dr * 25.0 - uTime * 1.5)), 1.6);
        vec3 discCol = mix(vec3(1.0, 0.55, 0.20),
                           vec3(0.55, 0.75, 1.20),
                           smoothstep(0.05, 0.22, dr));
        col += discCol * discMask * swirl * 1.8 * open;
        float arc = smoothstep(0.072, 0.060, dr) * smoothstep(0.045, 0.058, dr);
        col += vec3(1.0, 0.85, 0.55) * arc * (0.6 + 0.4 * cos(ang)) * open * 1.2;
      }
    }
  `,
};

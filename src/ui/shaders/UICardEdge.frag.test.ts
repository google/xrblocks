import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import * as EdgeConstants from '../constants/UICardEdgeConstants';
import {UICardEdgeFragmentShader} from './UICardEdge.frag';

const webgpuSource = readFileSync(
  resolve(import.meta.dirname, '../internal/WebGPUUIMaterials.ts'),
  'utf8'
);
const stripSpace = (text: string) => text.replace(/\s+/g, '');
const webgpuCode = stripSpace(webgpuSource);
const shaderCode = stripSpace(UICardEdgeFragmentShader);

const SHADER_CONSTANTS = [
  'EDGE_GLOW_RIM_WIDTH',
  'EDGE_GLOW_RIM_ALPHA',
  'EDGE_GLOW_FADE_ALPHA',
  'EDGE_GLOW_FADE_WIDTH',
  'EDGE_GLOW_FLAT_RADIUS',
  'EDGE_GLOW_RADIUS',
  'EDGE_GLOW_PRESSED_FADE_ALPHA',
  'EDGE_GLOW_PRESSED_FADE_LENGTH',
  'EDGE_GLOW_PRESSED_FLAT_RADIUS',
  'EDGE_GLOW_PRESSED_RADIUS',
  'RESIZE_CORNER_ARC_GAP',
  'RESIZE_CORNER_ARC_LENGTH',
  'RESIZE_CORNER_ARC_WIDTH',
  'RESIZE_CORNER_ARC_PRESSED_GAP',
  'RESIZE_CORNER_ARC_PRESSED_WIDTH',
];

describe('UICardEdge side glow', () => {
  it('uses the Android XR rim, fade, window and timing measurements', () => {
    expect(EdgeConstants).toMatchObject({
      EDGE_GLOW_RIM_WIDTH: 3,
      EDGE_GLOW_RIM_ALPHA: 1,
      EDGE_GLOW_FADE_ALPHA: 0.73,
      EDGE_GLOW_FADE_WIDTH: 53,
      EDGE_GLOW_FLAT_RADIUS: 74,
      EDGE_GLOW_RADIUS: 206,
      EDGE_GLOW_FADE_SECONDS: 0.1,
    });
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_FADE_LENGTH');
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_HALF_LENGTH');
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_FLAT_HALF_LENGTH');
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_LENGTH_SIGMA');
    expect(EdgeConstants).not.toHaveProperty('RESIZE_CORNER_ARC_FADE_SECONDS');
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_HANDOFF_FADE_SECONDS');
    expect(EdgeConstants).not.toHaveProperty('EDGE_HANDOFF_GAP_SECONDS');
  });

  it('uses the Android XR press measurements', () => {
    expect(EdgeConstants).toMatchObject({
      EDGE_GLOW_PRESSED_FLAT_RADIUS: 71,
      EDGE_GLOW_PRESSED_RADIUS: 163,
      EDGE_GLOW_PRESSED_FADE_ALPHA: 1,
      EDGE_GLOW_PRESSED_FADE_LENGTH: 42,
      EDGE_GLOW_PRESSED_FILL_COLOR: '#dbeeff',
      EDGE_GLOW_PRESSED_RIM_COLOR: '#eff9ff',
      EDGE_GLOW_PRESS_LENGTH_SECONDS: 0.07,
      EDGE_GLOW_PRESS_FILL_SECONDS: 0.3,
      EDGE_GLOW_RELEASE_SECONDS: 0.067,
      RESIZE_CORNER_ARC_WIDTH: 15,
      RESIZE_CORNER_ARC_GAP: 31,
      RESIZE_CORNER_ARC_LENGTH: 33,
      RESIZE_CORNER_ARC_PRESSED_WIDTH: 11.5,
      RESIZE_CORNER_ARC_PRESSED_GAP: 33.5,
      RESIZE_CORNER_ARC_PRESS_SECONDS: 0.04,
      RESIZE_CORNER_ARC_LEAVE_FADE_SECONDS: 0.14,
      RESIZE_CORNER_ARC_LEAVE_CUT_SECONDS: 0.1,
    });
  });

  it('draws a rim and inward fade windowed along the edge in GLSL', () => {
    const shader = UICardEdgeFragmentShader;
    for (const [name, value] of [
      ['EDGE_GLOW_RIM_WIDTH', '3.0'],
      ['EDGE_GLOW_RIM_ALPHA', '1.0'],
      ['EDGE_GLOW_FADE_ALPHA', '0.73'],
      ['EDGE_GLOW_FADE_WIDTH', '53.0'],
      ['EDGE_GLOW_FLAT_RADIUS', '74.0'],
      ['EDGE_GLOW_RADIUS', '206.0'],
      ['EDGE_GLOW_PRESSED_FADE_ALPHA', '1.0'],
      ['EDGE_GLOW_PRESSED_FADE_LENGTH', '42.0'],
      ['EDGE_GLOW_PRESSED_FLAT_RADIUS', '71.0'],
      ['EDGE_GLOW_PRESSED_RADIUS', '163.0'],
      ['RESIZE_CORNER_ARC_PRESSED_WIDTH', '11.5'],
      ['RESIZE_CORNER_ARC_PRESSED_GAP', '33.5'],
    ]) {
      expect(shader).toContain(`const float ${name} = ${value};`);
    }
    expect(shader).not.toContain('EDGE_GLOW_FADE_LENGTH ');
    expect(shader).not.toContain('EDGE_GLOW_LENGTH_SIGMA');
    expect(shader).not.toContain('HALF_LENGTH');
    for (const name of [
      'u_glow_press_length',
      'u_glow_press_fill',
      'u_glow_press_length_2',
      'u_glow_press_fill_2',
      'u_corner_press',
      'u_corner_press_2',
    ]) {
      expect(shader).toContain(`uniform float ${name};`);
    }
    expect(shader).toContain('uniform vec4 u_glow_pressed_rim_color;');
    expect(shader).toContain('uniform vec4 u_glow_pressed_fill_color;');
    for (const expression of [
      'float outerRadius = min(margin, min(halfSize.x, halfSize.y));',
      'vec2 a = abs(p);',
      'vec2 v = a - (innerHalfSize - innerRadius);',
      'vec2 n = min(v.x, v.y) > 0.0 ? normalize(v) : (v.x > v.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));',
      'vec2 center = halfSize - outerRadius;',
      'vec2 toLine = (halfSize - a) / max(n, vec2(0.0001));',
      'vec2 w = a - center;',
      'float b = dot(w, n);',
      'float toCircle = sqrt(max(0.0, b * b - dot(w, w) + outerRadius * outerRadius)) - b;',
      'float t = a.x + n.x * toLine.y <= center.x ? toLine.y : (a.y + n.y * toLine.x <= center.y ? toLine.x : toCircle);',
      'return (step(0.0, p) * 2.0 - 1.0) * (a + n * t);',
      'vec2 rimP = edgeRimPoint(p, innerHalfSize, innerRadius, halfSize, outerRadius);',
      'float dist = length(rimP - cursorP);',
      'float flatRadius = mix(EDGE_GLOW_FLAT_RADIUS, EDGE_GLOW_PRESSED_FLAT_RADIUS, press);',
      'float glowRadius = mix(EDGE_GLOW_RADIUS, EDGE_GLOW_PRESSED_RADIUS, press);',
      'return 1.0 - clamp((dist - flatRadius) / (glowRadius - flatRadius), 0.0, 1.0);',
      'float rimCoverage = smoothstep(-EDGE_GLOW_RIM_WIDTH - aa, -EDGE_GLOW_RIM_WIDTH, distToEdge);',
      'float rim = EDGE_GLOW_RIM_ALPHA * rimCoverage;',
      'float inward = max(0.0, -distToEdge - EDGE_GLOW_RIM_WIDTH);',
      'float hoverFade = max(0.0, 1.0 - inward / EDGE_GLOW_FADE_WIDTH);',
      'float fade = mix(EDGE_GLOW_FADE_ALPHA * hoverFade * hoverFade, EDGE_GLOW_PRESSED_FADE_ALPHA * exp(-inward / EDGE_GLOW_PRESSED_FADE_LENGTH), glowPressFill);',
      'float glowAlpha = glowWindow * max(rim, fade) * edgeBandMask;',
      'glowPressFill /= max(glowWeight, 0.001);',
      'vec4 glow = vec4(mix(mix(hoverRGB, u_glow_pressed_fill_color.rgb, glowPressFill), mix(hoverRGB, u_glow_pressed_rim_color.rgb, glowPressFill), rimCoverage), u_cursor_spotlight_color.a * glowAlpha);',
      'float halfAngle = min(0.25 * PI, 0.5 * RESIZE_CORNER_ARC_LENGTH / (innerRadius + RESIZE_CORNER_ARC_GAP));',
      'float radius = innerRadius + mix(RESIZE_CORNER_ARC_GAP, RESIZE_CORNER_ARC_PRESSED_GAP, press);',
      'float halfWidth = 0.5 * mix(RESIZE_CORNER_ARC_WIDTH, RESIZE_CORNER_ARC_PRESSED_WIDTH, press);',
      'return alpha * (1.0 - smoothstep(halfWidth - aa, halfWidth + aa, d));',
      'cornerArc(p, u_corner_sign, u_corner_alpha, u_corner_press, innerHalfSize, innerRadius, aa)',
      'cornerArc(p, u_corner_sign_2, u_corner_alpha_2, u_corner_press_2, innerHalfSize, innerRadius, aa)',
    ]) {
      expect(shaderCode).toContain(stripSpace(expression));
    }
    for (const [show, cursor, length, fill] of [
      [
        'u_show_glow',
        'u_cursor_uv',
        'u_glow_press_length',
        'u_glow_press_fill',
      ],
      [
        'u_show_glow_2',
        'u_cursor_uv_2',
        'u_glow_press_length_2',
        'u_glow_press_fill_2',
      ],
    ]) {
      expect(shaderCode).toContain(
        stripSpace(
          `if (${show} > 0.0) { float slotWindow = ${show} * edgeGlowWindow(p, ${cursor} * size - halfSize, innerHalfSize, innerRadius, halfSize, outerRadius, ${length}); glowWindow = max(glowWindow, slotWindow); glowWeight += slotWindow; glowPressFill += slotWindow * ${fill}; }`
        )
      );
    }
    for (const removed of [
      'along2',
      'cursorDist',
      'depth',
      'innerRadius + margin',
    ]) {
      expect(shader).not.toContain(removed);
    }
    expect(shader).not.toContain('u_show_glow > 0.5');
    expect(shader).not.toContain('u_show_glow_2 > 0.5');
    expect(shader).not.toContain('u_cursor_radius + u_cursor_spotlight_blur');
    expect(shader).not.toContain('-u_edge_width');
  });

  it('matches the GLSL edge in the WebGPU material', () => {
    for (const name of SHADER_CONSTANTS) {
      expect(webgpuSource).toMatch(new RegExp(`^\\s+${name},$`, 'm'));
    }
    expect(webgpuSource).not.toContain('EDGE_GLOW_FADE_LENGTH,');
    expect(webgpuSource).not.toContain('EDGE_GLOW_LENGTH_SIGMA');
    expect(webgpuSource).not.toContain('HALF_LENGTH');
    for (const expression of [
      'const outerRadius = min(margin, min(halfSize.x, halfSize.y));',
      'const a = abs(p) as unknown as V2;',
      'const v = a.sub(innerHalfSize.sub(innerRadius)) as unknown as V2;',
      'const n = select(min(v.x, v.y).greaterThan(0), normalize(v), select(v.x.greaterThan(v.y), vec2(1, 0), vec2(0, 1))) as unknown as V2;',
      'const center = halfSize.sub(outerRadius) as unknown as V2;',
      'const toLine = halfSize.sub(a).div(max(n, vec2(0.0001, 0.0001))) as unknown as V2;',
      'const w = a.sub(center);',
      'const b = dot(w, n);',
      'const toCircle = sqrt(max(0, b.mul(b).sub(dot(w, w)).add(outerRadius.mul(outerRadius)))).sub(b);',
      'const t = select(a.x.add(n.x.mul(toLine.y)).lessThanEqual(center.x), toLine.y, select(a.y.add(n.y.mul(toLine.x)).lessThanEqual(center.y), toLine.x, toCircle));',
      'return step(0, p).mul(2).sub(1).mul(a.add(n.mul(t)));',
      'const rimP = edgeRimPoint(p, innerHalfSize, innerRadius, halfSize, outerRadius) as V2;',
      'const dist = length(rimP.sub(cursorP));',
      'const flatRadius = mix(float(EDGE_GLOW_FLAT_RADIUS), float(EDGE_GLOW_PRESSED_FLAT_RADIUS), press);',
      'const glowRadius = mix(float(EDGE_GLOW_RADIUS), float(EDGE_GLOW_PRESSED_RADIUS), press);',
      'return float(1).sub(clamp(dist.sub(flatRadius).div(glowRadius.sub(flatRadius)), 0, 1));',
      'If(showGlow.greaterThan(0), () => { const slotWindow = showGlow.mul(edgeGlowWindow(p, cursorUv.mul(sizeValue).sub(halfSize), innerHalfSize, innerRadius, halfSize, outerRadius, glowPressLength) as Num).toVar(); glowWindow.assign(max(glowWindow, slotWindow)); glowWeight.addAssign(slotWindow); glowPressFill.addAssign(slotWindow.mul(glowPressFillValue)); });',
      'If(showGlow2.greaterThan(0), () => { const slotWindow = showGlow2.mul(edgeGlowWindow(p, cursorUv2.mul(sizeValue).sub(halfSize), innerHalfSize, innerRadius, halfSize, outerRadius, glowPressLength2) as Num).toVar(); glowWindow.assign(max(glowWindow, slotWindow)); glowWeight.addAssign(slotWindow); glowPressFill.addAssign(slotWindow.mul(glowPressFillValue2)); });',
      'glowPressFill.divAssign(max(glowWeight, 0.001));',
      'const rimCoverage = smoothstep(float(-EDGE_GLOW_RIM_WIDTH).sub(aa), -EDGE_GLOW_RIM_WIDTH, distToEdge);',
      'const rim = rimCoverage.mul(EDGE_GLOW_RIM_ALPHA);',
      'const inward = max(0, distToEdge.negate().sub(EDGE_GLOW_RIM_WIDTH));',
      'const hoverFade = max(0, float(1).sub(inward.div(EDGE_GLOW_FADE_WIDTH)));',
      'const fade = mix(hoverFade.mul(hoverFade).mul(EDGE_GLOW_FADE_ALPHA), exp(inward.negate().div(EDGE_GLOW_PRESSED_FADE_LENGTH)).mul(EDGE_GLOW_PRESSED_FADE_ALPHA), glowPressFill);',
      'const glowAlpha = glowWindow.mul(max(rim, fade)).mul(edgeBandMask);',
      'mix(mix(hoverRGB, pressedFillColor.rgb, glowPressFill), mix(hoverRGB, pressedRimColor.rgb, glowPressFill), rimCoverage)',
      'spotlightColor.a.mul(glowAlpha)',
      'const halfAngle = min(Math.PI / 4, float(0.5 * RESIZE_CORNER_ARC_LENGTH).div(innerRadius.add(RESIZE_CORNER_ARC_GAP)));',
      'const radius = innerRadius.add(mix(float(RESIZE_CORNER_ARC_GAP), float(RESIZE_CORNER_ARC_PRESSED_GAP), press));',
      'const halfWidth = mix(float(RESIZE_CORNER_ARC_WIDTH), float(RESIZE_CORNER_ARC_PRESSED_WIDTH), press).mul(0.5);',
      'result.assign(alpha.mul(float(1).sub(smoothstep(halfWidth.sub(aa), halfWidth.add(aa), d))));',
      'cornerArc(p, cornerSign, cornerAlpha, cornerPress, innerHalfSize, innerRadius, aa)',
      'cornerArc(p, cornerSign2, cornerAlpha2, cornerPress2, innerHalfSize, innerRadius, aa)',
    ]) {
      expect(webgpuCode).toContain(stripSpace(expression));
    }
    for (const removed of ['along2', 'cursorDist', 'innerRadius.add(margin)']) {
      expect(webgpuSource).not.toContain(removed);
    }
    expect(webgpuSource).not.toContain('showGlow.greaterThan(0.5)');
    expect(webgpuSource).not.toContain('showGlow2.greaterThan(0.5)');
    expect(webgpuSource).not.toContain('cursorRadius.add(spotlightBlur)');
    expect(webgpuSource).not.toContain('edgeWidth.negate()');
  });
});

/** Mirrors edgeRimPoint in both shaders, for the top-right quadrant. */
function rimPoint(
  p: readonly [number, number],
  innerHalfSize: readonly [number, number],
  innerRadius: number,
  halfSize: readonly [number, number],
  outerRadius: number
): [number, number] {
  const v = [
    p[0] - innerHalfSize[0] + innerRadius,
    p[1] - innerHalfSize[1] + innerRadius,
  ];
  const length = Math.hypot(v[0], v[1]);
  const n =
    Math.min(v[0], v[1]) > 0
      ? [v[0] / length, v[1] / length]
      : v[0] > v[1]
        ? [1, 0]
        : [0, 1];
  const center = [halfSize[0] - outerRadius, halfSize[1] - outerRadius];
  const toLine = [0, 1].map((k) => (halfSize[k] - p[k]) / Math.max(n[k], 1e-4));
  const w = [p[0] - center[0], p[1] - center[1]];
  const b = w[0] * n[0] + w[1] * n[1];
  const toCircle =
    Math.sqrt(
      Math.max(0, b * b - w[0] * w[0] - w[1] * w[1] + outerRadius ** 2)
    ) - b;
  const t =
    p[0] + n[0] * toLine[1] <= center[0]
      ? toLine[1]
      : p[1] + n[1] * toLine[0] <= center[1]
        ? toLine[0]
        : toCircle;
  return [p[0] + n[0] * t, p[1] + n[1] * t];
}

/** Mirrors edgeGlowWindow in both shaders. */
function glowWindow(distance: number, press: number): number {
  const flat =
    EdgeConstants.EDGE_GLOW_FLAT_RADIUS +
    (EdgeConstants.EDGE_GLOW_PRESSED_FLAT_RADIUS -
      EdgeConstants.EDGE_GLOW_FLAT_RADIUS) *
      press;
  const zero =
    EdgeConstants.EDGE_GLOW_RADIUS +
    (EdgeConstants.EDGE_GLOW_PRESSED_RADIUS - EdgeConstants.EDGE_GLOW_RADIUS) *
      press;
  return 1 - Math.min(1, Math.max(0, (distance - flat) / (zero - flat)));
}

describe('UICardEdge glow window', () => {
  const MM_PER_DP = 1.52;

  it('fits the Android XR straight-line window measurements', () => {
    // Hover: half strength at about 92 dp, 5% at about 131 dp.
    expect(glowWindow(92 * MM_PER_DP, 0)).toBeCloseTo(0.5, 1);
    expect(glowWindow(131 * MM_PER_DP, 0)).toBeCloseTo(0.05, 1);
    // Pressed: half strength at about 77 dp, 5% at about 104 dp.
    expect(glowWindow(77 * MM_PER_DP, 1)).toBeCloseTo(0.5, 1);
    expect(glowWindow(104 * MM_PER_DP, 1)).toBeCloseTo(0.05, 1);
  });

  // A 400x200 mm card with 36 mm corners and the 87 mm band, whose rim
  // corners are centred on the card's sharp corners.
  const INNER = [200, 100] as const;
  const OUTER = [287, 187] as const;
  const rim = (x: number, y: number) => rimPoint([x, y], INNER, 36, OUTER, 87);

  it('maps band pixels straight out from the card onto a rim centred on its sharp corners', () => {
    expect(rim(0, 150)).toEqual([0, 187]);
    expect(rim(250, 10)).toEqual([287, 10]);
    // Rim points map to themselves, round the corner too.
    const angle = Math.PI / 6;
    const onRim = [200 + 87 * Math.sin(angle), 100 + 87 * Math.cos(angle)];
    const [x, y] = rim(onRim[0], onRim[1]);
    expect(x).toBeCloseTo(onRim[0]);
    expect(y).toBeCloseTo(onRim[1]);
    expect(
      Math.hypot(...rim(250, 150).map((value, k) => value - INNER[k]))
    ).toBeCloseTo(87);
  });

  it("stays continuous beside the card's rounded corner", () => {
    // Just outside the 36 mm card corner, inside its sharp corner, either side
    // of the diagonal and either side of the card's straight edges.
    for (const [a, b] of [
      [rim(197.5, 97.49), rim(197.49, 97.5)],
      [rim(170, 100.01), rim(170, 99.99)],
      [rim(164, 101), rim(164.01, 101)],
    ]) {
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.1);
    }
  });

  it('wraps further round a corner than a contour distance would', () => {
    // Pointer on the top rim, 60 mm before the rim starts to curve.
    const cursor = [140, 187] as const;
    for (const press of [0, 1]) {
      let straightReach = 0;
      let contourReach = 0;
      for (let degrees = 0; degrees <= 90; degrees += 0.5) {
        const angle = (degrees * Math.PI) / 180;
        const point = [200 + 87 * Math.sin(angle), 100 + 87 * Math.cos(angle)];
        const straight = Math.hypot(point[0] - cursor[0], point[1] - cursor[1]);
        const contour = 200 - cursor[0] + 87 * angle;
        if (glowWindow(straight, press) >= 0.5) straightReach = degrees;
        if (glowWindow(contour, press) >= 0.5) contourReach = degrees;
      }
      expect(straightReach).toBeGreaterThan(contourReach);
    }
  });
});

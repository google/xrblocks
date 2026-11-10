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
  'EDGE_GLOW_FLAT_HALF_LENGTH',
  'EDGE_GLOW_HALF_LENGTH',
  'EDGE_GLOW_PRESSED_FADE_ALPHA',
  'EDGE_GLOW_PRESSED_FADE_LENGTH',
  'EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH',
  'EDGE_GLOW_PRESSED_HALF_LENGTH',
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
      EDGE_GLOW_FLAT_HALF_LENGTH: 87,
      EDGE_GLOW_HALF_LENGTH: 194,
      EDGE_GLOW_FADE_SECONDS: 0.09,
    });
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_FADE_LENGTH');
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_LENGTH_SIGMA');
    expect(EdgeConstants).not.toHaveProperty('RESIZE_CORNER_ARC_FADE_SECONDS');
  });

  it('uses the Android XR press measurements', () => {
    expect(EdgeConstants).toMatchObject({
      EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH: 75,
      EDGE_GLOW_PRESSED_HALF_LENGTH: 148,
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
    });
  });

  it('draws a rim and inward fade windowed along the edge in GLSL', () => {
    const shader = UICardEdgeFragmentShader;
    for (const [name, value] of [
      ['EDGE_GLOW_RIM_WIDTH', '3.0'],
      ['EDGE_GLOW_RIM_ALPHA', '1.0'],
      ['EDGE_GLOW_FADE_ALPHA', '0.73'],
      ['EDGE_GLOW_FADE_WIDTH', '53.0'],
      ['EDGE_GLOW_FLAT_HALF_LENGTH', '87.0'],
      ['EDGE_GLOW_HALF_LENGTH', '194.0'],
      ['EDGE_GLOW_PRESSED_FADE_ALPHA', '1.0'],
      ['EDGE_GLOW_PRESSED_FADE_LENGTH', '42.0'],
      ['EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH', '75.0'],
      ['EDGE_GLOW_PRESSED_HALF_LENGTH', '148.0'],
      ['RESIZE_CORNER_ARC_PRESSED_WIDTH', '11.5'],
      ['RESIZE_CORNER_ARC_PRESSED_GAP', '33.5'],
    ]) {
      expect(shader).toContain(`const float ${name} = ${value};`);
    }
    expect(shader).not.toContain('EDGE_GLOW_FADE_LENGTH ');
    expect(shader).not.toContain('EDGE_GLOW_LENGTH_SIGMA');
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
      'float across = distToEdge - sdRoundedBox(cursorP, halfSize, outerRadius);',
      'float along2 = max(0.0, dot(delta, delta) - across * across);',
      'float flatHalfLength = mix(EDGE_GLOW_FLAT_HALF_LENGTH, EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH, press);',
      'float halfLength = mix(EDGE_GLOW_HALF_LENGTH, EDGE_GLOW_PRESSED_HALF_LENGTH, press);',
      'return 1.0 - clamp((sqrt(along2) - flatHalfLength) / (halfLength - flatHalfLength), 0.0, 1.0);',
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
          `if (${show} > 0.0) { float slotWindow = ${show} * edgeGlowWindow(p, ${cursor} * size - halfSize, halfSize, outerRadius, distToEdge, ${length}); glowWindow = max(glowWindow, slotWindow); glowWeight += slotWindow; glowPressFill += slotWindow * ${fill}; }`
        )
      );
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
    for (const expression of [
      'const across = distToEdge.sub(sdRoundedBox(cursorP, halfSize, outerRadius) as Num);',
      'const along2 = max(0, dot(delta, delta).sub(across.mul(across)));',
      'const flatHalfLength = mix(float(EDGE_GLOW_FLAT_HALF_LENGTH), float(EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH), press);',
      'const halfLength = mix(float(EDGE_GLOW_HALF_LENGTH), float(EDGE_GLOW_PRESSED_HALF_LENGTH), press);',
      'return float(1).sub(clamp(sqrt(along2).sub(flatHalfLength).div(halfLength.sub(flatHalfLength)), 0, 1));',
      'If(showGlow.greaterThan(0), () => { const slotWindow = showGlow.mul(edgeGlowWindow(p, cursorUv.mul(sizeValue).sub(halfSize), halfSize, outerRadius, distToEdge, glowPressLength) as Num).toVar(); glowWindow.assign(max(glowWindow, slotWindow)); glowWeight.addAssign(slotWindow); glowPressFill.addAssign(slotWindow.mul(glowPressFillValue)); });',
      'If(showGlow2.greaterThan(0), () => { const slotWindow = showGlow2.mul(edgeGlowWindow(p, cursorUv2.mul(sizeValue).sub(halfSize), halfSize, outerRadius, distToEdge, glowPressLength2) as Num).toVar(); glowWindow.assign(max(glowWindow, slotWindow)); glowWeight.addAssign(slotWindow); glowPressFill.addAssign(slotWindow.mul(glowPressFillValue2)); });',
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
      'cornerArc(p, cornerSign, cornerAlpha, cornerPress, innerHalfSize, innerRadius, aa)',
      'cornerArc(p, cornerSign2, cornerAlpha2, cornerPress2, innerHalfSize, innerRadius, aa)',
    ]) {
      expect(webgpuCode).toContain(stripSpace(expression));
    }
    expect(webgpuSource).not.toContain('showGlow.greaterThan(0.5)');
    expect(webgpuSource).not.toContain('showGlow2.greaterThan(0.5)');
    expect(webgpuSource).not.toContain('cursorRadius.add(spotlightBlur)');
    expect(webgpuSource).not.toContain('edgeWidth.negate()');
  });
});

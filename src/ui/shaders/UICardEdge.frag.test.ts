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

describe('UICardEdge side glow', () => {
  it('uses the Android XR rim, fade, window and timing measurements', () => {
    expect(EdgeConstants).toMatchObject({
      EDGE_GLOW_RIM_WIDTH: 3,
      EDGE_GLOW_RIM_ALPHA: 1,
      EDGE_GLOW_FADE_ALPHA: 0.6,
      EDGE_GLOW_FADE_LENGTH: 17,
      EDGE_GLOW_FLAT_HALF_LENGTH: 87,
      EDGE_GLOW_HALF_LENGTH: 216,
      EDGE_GLOW_FADE_SECONDS: 0.09,
    });
    expect(EdgeConstants).not.toHaveProperty('EDGE_GLOW_LENGTH_SIGMA');
    expect(EdgeConstants).not.toHaveProperty('RESIZE_CORNER_ARC_FADE_SECONDS');
  });

  it('draws a rim and inward fade windowed along the edge in GLSL', () => {
    const shader = UICardEdgeFragmentShader;
    expect(shader).toContain('const float EDGE_GLOW_RIM_WIDTH = 3.0;');
    expect(shader).toContain('const float EDGE_GLOW_RIM_ALPHA = 1.0;');
    expect(shader).toContain('const float EDGE_GLOW_FADE_ALPHA = 0.6;');
    expect(shader).toContain('const float EDGE_GLOW_FADE_LENGTH = 17.0;');
    expect(shader).toContain('const float EDGE_GLOW_FLAT_HALF_LENGTH = 87.0;');
    expect(shader).toContain('const float EDGE_GLOW_HALF_LENGTH = 216.0;');
    expect(shader).not.toContain('EDGE_GLOW_LENGTH_SIGMA');
    expect(shader).toContain(
      'float across = distToEdge - sdRoundedBox(cursorP, halfSize, outerRadius);'
    );
    expect(shader).toContain(
      'float along2 = max(0.0, dot(delta, delta) - across * across);'
    );
    expect(stripSpace(shader)).toContain(
      stripSpace(
        'return 1.0 - clamp((sqrt(along2) - EDGE_GLOW_FLAT_HALF_LENGTH) / (EDGE_GLOW_HALF_LENGTH - EDGE_GLOW_FLAT_HALF_LENGTH), 0.0, 1.0);'
      )
    );
    for (const [show, cursor] of [
      ['u_show_glow', 'u_cursor_uv'],
      ['u_show_glow_2', 'u_cursor_uv_2'],
    ]) {
      expect(stripSpace(shader)).toContain(
        stripSpace(
          `if (${show} > 0.0) { glowWindow = max(glowWindow, ${show} * edgeGlowWindow(p, ${cursor} * size - halfSize, halfSize, outerRadius, distToEdge));`
        )
      );
    }
    expect(shader).not.toContain('u_show_glow > 0.5');
    expect(shader).not.toContain('u_show_glow_2 > 0.5');
    expect(stripSpace(shader)).toContain(
      stripSpace(
        'float rim = EDGE_GLOW_RIM_ALPHA * smoothstep(-EDGE_GLOW_RIM_WIDTH - aa, -EDGE_GLOW_RIM_WIDTH, distToEdge);'
      )
    );
    expect(stripSpace(shader)).toContain(
      stripSpace(
        'float fade = EDGE_GLOW_FADE_ALPHA * exp(-max(0.0, -distToEdge - EDGE_GLOW_RIM_WIDTH) / EDGE_GLOW_FADE_LENGTH);'
      )
    );
    expect(shader).toContain(
      'float glowAlpha = glowWindow * max(rim, fade) * edgeBandMask;'
    );
    expect(shader).not.toContain('u_cursor_radius + u_cursor_spotlight_blur');
    expect(shader).not.toContain('-u_edge_width');
  });

  it('matches the GLSL side glow in the WebGPU material', () => {
    for (const name of [
      'EDGE_GLOW_RIM_WIDTH',
      'EDGE_GLOW_RIM_ALPHA',
      'EDGE_GLOW_FADE_ALPHA',
      'EDGE_GLOW_FADE_LENGTH',
      'EDGE_GLOW_FLAT_HALF_LENGTH',
      'EDGE_GLOW_HALF_LENGTH',
    ]) {
      expect(webgpuSource).toMatch(new RegExp(`^\\s+${name},$`, 'm'));
    }
    expect(webgpuSource).not.toContain('EDGE_GLOW_LENGTH_SIGMA');
    for (const expression of [
      'const across = distToEdge.sub(sdRoundedBox(cursorP, halfSize, outerRadius) as Num);',
      'const along2 = max(0, dot(delta, delta).sub(across.mul(across)));',
      'return float(1).sub(clamp(sqrt(along2).sub(EDGE_GLOW_FLAT_HALF_LENGTH).div(EDGE_GLOW_HALF_LENGTH - EDGE_GLOW_FLAT_HALF_LENGTH), 0, 1));',
      'If(showGlow.greaterThan(0), () => { glowWindow.assign(max(glowWindow, showGlow.mul(edgeGlowWindow(p, cursorUv.mul(sizeValue).sub(halfSize), halfSize, outerRadius, distToEdge) as Num)));',
      'If(showGlow2.greaterThan(0), () => { glowWindow.assign(max(glowWindow, showGlow2.mul(edgeGlowWindow(p, cursorUv2.mul(sizeValue).sub(halfSize), halfSize, outerRadius, distToEdge) as Num)));',
      'smoothstep(float(-EDGE_GLOW_RIM_WIDTH).sub(aa), -EDGE_GLOW_RIM_WIDTH, distToEdge).mul(EDGE_GLOW_RIM_ALPHA)',
      'exp(max(0, distToEdge.negate().sub(EDGE_GLOW_RIM_WIDTH)).negate().div(EDGE_GLOW_FADE_LENGTH)).mul(EDGE_GLOW_FADE_ALPHA)',
      'const glowAlpha = glowWindow.mul(max(rim, fade)).mul(edgeBandMask);',
    ]) {
      expect(webgpuCode).toContain(stripSpace(expression));
    }
    expect(webgpuSource).not.toContain('showGlow.greaterThan(0.5)');
    expect(webgpuSource).not.toContain('showGlow2.greaterThan(0.5)');
    expect(webgpuSource).not.toContain('cursorRadius.add(spotlightBlur)');
    expect(webgpuSource).not.toContain('edgeWidth.negate()');
  });
});

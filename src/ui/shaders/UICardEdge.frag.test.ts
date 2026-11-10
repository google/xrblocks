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
  it('uses the Android XR rim and fade measurements', () => {
    expect(EdgeConstants).toMatchObject({
      EDGE_GLOW_RIM_WIDTH: 3,
      EDGE_GLOW_RIM_ALPHA: 0.8,
      EDGE_GLOW_FADE_ALPHA: 0.5,
      EDGE_GLOW_FADE_LENGTH: 17,
      EDGE_GLOW_LENGTH_SIGMA: 60,
    });
  });

  it('draws a rim and inward fade windowed along the edge in GLSL', () => {
    const shader = UICardEdgeFragmentShader;
    expect(shader).toContain('const float EDGE_GLOW_RIM_WIDTH = 3.0;');
    expect(shader).toContain('const float EDGE_GLOW_RIM_ALPHA = 0.8;');
    expect(shader).toContain('const float EDGE_GLOW_FADE_ALPHA = 0.5;');
    expect(shader).toContain('const float EDGE_GLOW_FADE_LENGTH = 17.0;');
    expect(shader).toContain('const float EDGE_GLOW_LENGTH_SIGMA = 60.0;');
    expect(shader).toContain(
      'float across = distToEdge - sdRoundedBox(cursorP, halfSize, outerRadius);'
    );
    expect(shader).toContain(
      'float along2 = max(0.0, dot(delta, delta) - across * across);'
    );
    expect(shader).toContain(
      'exp(-0.5 * along2 / (EDGE_GLOW_LENGTH_SIGMA * EDGE_GLOW_LENGTH_SIGMA))'
    );
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
      'EDGE_GLOW_LENGTH_SIGMA',
    ]) {
      expect(webgpuSource).toMatch(new RegExp(`^\\s+${name},$`, 'm'));
    }
    for (const expression of [
      'const across = distToEdge.sub(sdRoundedBox(cursorP, halfSize, outerRadius) as Num);',
      'const along2 = max(0, dot(delta, delta).sub(across.mul(across)));',
      'exp(along2.mul(-0.5).div(EDGE_GLOW_LENGTH_SIGMA * EDGE_GLOW_LENGTH_SIGMA))',
      'smoothstep(float(-EDGE_GLOW_RIM_WIDTH).sub(aa), -EDGE_GLOW_RIM_WIDTH, distToEdge).mul(EDGE_GLOW_RIM_ALPHA)',
      'exp(max(0, distToEdge.negate().sub(EDGE_GLOW_RIM_WIDTH)).negate().div(EDGE_GLOW_FADE_LENGTH)).mul(EDGE_GLOW_FADE_ALPHA)',
      'const glowAlpha = glowWindow.mul(max(rim, fade)).mul(edgeBandMask);',
    ]) {
      expect(webgpuCode).toContain(stripSpace(expression));
    }
    expect(webgpuSource).not.toContain('cursorRadius.add(spotlightBlur)');
    expect(webgpuSource).not.toContain('edgeWidth.negate()');
  });
});

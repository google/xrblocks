import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {StylizedFace} from './StylizedFace';
import {ZERO_VISEME} from './VisemeWeights';

describe('StylizedFace', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps open and vowel visemes to the mouth shape', () => {
    const m = new StylizedFace();
    m.setVisemes({...ZERO_VISEME, jawOpen: 1});
    expect(m.metrics.openHeight).toBeGreaterThan(0.6);
    m.setVisemes(ZERO_VISEME);
    const restW = m.metrics.width;
    m.setVisemes({...ZERO_VISEME, oo: 1});
    expect(m.metrics.width).toBeLessThan(restW);
    m.setVisemes({...ZERO_VISEME, ee: 1});
    expect(m.metrics.width).toBeGreaterThan(restW);
  });

  it('quad sits flush with the head sphere surface on local -Z and faces outward', () => {
    const m = new StylizedFace({headRadius: 0.12});
    expect(m.mesh.position.z).toBeLessThan(-0.12);
    expect(m.mesh.position.z).toBeGreaterThan(-0.13);
    // Rotated so the plane normal points along the head's -Z (face out)
    // instead of into the sphere.
    expect(m.mesh.rotation.y).toBeCloseTo(Math.PI, 5);
  });

  it('texture is marked dirty on a setVisemes call that changes the shape', () => {
    const m = new StylizedFace();
    const v0 = m.texture.version;
    m.setVisemes({...ZERO_VISEME, jawOpen: 0.5});
    expect(m.texture.version).toBeGreaterThan(v0);
  });

  it('skips redraw + texture upload when visemes are essentially unchanged', () => {
    const m = new StylizedFace({showEyes: false});
    const v = {...ZERO_VISEME, jawOpen: 0.5};
    m.setVisemes(v);
    const versionAfterFirst = m.texture.version;
    m.setVisemes(v);
    m.setVisemes({...v, jawOpen: 0.5005});
    expect(m.texture.version).toBe(versionAfterFirst);
    m.setVisemes({...v, jawOpen: 0.6});
    expect(m.texture.version).toBeGreaterThan(versionAfterFirst);
  });

  it('dispose() releases resources once', () => {
    const m = new StylizedFace();
    const geom = m.mesh.geometry;
    const mat = m.mesh.material;
    const tex = m.texture;
    let geomDisposed = false;
    let matDisposed = false;
    let texDisposed = false;
    geom.addEventListener('dispose', () => (geomDisposed = true));
    (
      mat as {addEventListener: (e: string, cb: () => void) => void}
    ).addEventListener('dispose', () => (matDisposed = true));
    tex.addEventListener('dispose', () => (texDisposed = true));
    let texDisposes = 0;
    tex.addEventListener('dispose', () => texDisposes++);
    m.dispose();
    expect(geomDisposed).toBe(true);
    expect(matDisposed).toBe(true);
    m.dispose();
    m.dispose();
    expect(texDisposed).toBe(true);
    expect(texDisposes).toBe(1);
  });
});

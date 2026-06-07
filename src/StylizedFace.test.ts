import {describe, it, expect} from 'vitest';

import {StylizedFace} from './StylizedFace';
import {ZERO_VISEME} from './VisemeWeights';

describe('StylizedFace', () => {
  it('extends Script (an Object3D) so it can be added under a head pivot', () => {
    const m = new StylizedFace();
    expect(m.isObject3D).toBe(true);
  });

  it('rest pose: openHeight is ~0 and width is ~1', () => {
    const m = new StylizedFace();
    m.setVisemes(ZERO_VISEME);
    expect(m.metrics.openHeight).toBeLessThan(0.02);
    expect(m.metrics.width).toBeGreaterThan(0.95);
    expect(m.metrics.width).toBeLessThan(1.05);
  });

  it('jawOpen drives openHeight upward', () => {
    const m = new StylizedFace();
    m.setVisemes({...ZERO_VISEME, jawOpen: 1});
    expect(m.metrics.openHeight).toBeGreaterThan(0.6);
  });

  it('oo narrows width', () => {
    const m = new StylizedFace();
    m.setVisemes(ZERO_VISEME);
    const restW = m.metrics.width;
    m.setVisemes({...ZERO_VISEME, oo: 1});
    expect(m.metrics.width).toBeLessThan(restW);
  });

  it('ee widens horizontal mouth', () => {
    const m = new StylizedFace();
    m.setVisemes(ZERO_VISEME);
    const restW = m.metrics.width;
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

  it('eyes default on: ellipse() called 3 times per redraw (mouth + 2 eyes)', () => {
    const ellipseCalls: number[][] = [];
    const fakeCtx = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'ellipse') {
            return (...args: number[]) => ellipseCalls.push(args);
          }
          return () => {};
        },
        set() {
          return true;
        },
      }
    );
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    (
      HTMLCanvasElement.prototype as unknown as {
        getContext: (t: string) => unknown;
      }
    ).getContext = (t: string) => (t === '2d' ? fakeCtx : null);
    try {
      ellipseCalls.length = 0;
      const m = new StylizedFace();
      void m;
      // Constructor calls drawIfDirty() once. With eyes on we
      // expect: 1 mouth ellipse + 2 eye ellipses (both inside one path).
      expect(ellipseCalls.length).toBe(3);
      ellipseCalls.length = 0;
      m.setVisemes({...ZERO_VISEME, jawOpen: 0.5});
      expect(ellipseCalls.length).toBe(3);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it('showEyes false: ellipse() only called for the mouth', () => {
    const ellipseCalls: number[][] = [];
    const fakeCtx = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'ellipse') {
            return (...args: number[]) => ellipseCalls.push(args);
          }
          return () => {};
        },
        set() {
          return true;
        },
      }
    );
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    (
      HTMLCanvasElement.prototype as unknown as {
        getContext: (t: string) => unknown;
      }
    ).getContext = (t: string) => (t === '2d' ? fakeCtx : null);
    try {
      ellipseCalls.length = 0;
      const m = new StylizedFace({showEyes: false});
      void m;
      expect(ellipseCalls.length).toBe(1);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it('eyes blink: scale returns to 1 between blinks, dips during a blink', () => {
    const m = new StylizedFace();
    type Internal = {
      currentBlinkScale: (now: number) => number;
      nextBlinkAt: number;
      blinkStartAt: number;
    };
    const inner = m as unknown as Internal;
    inner.nextBlinkAt = 1000;
    inner.blinkStartAt = -Infinity;

    expect(inner.currentBlinkScale(500)).toBeCloseTo(1, 5);
    expect(inner.currentBlinkScale(999)).toBeCloseTo(1, 5);
    expect(inner.currentBlinkScale(1000)).toBeCloseTo(1, 5);
    expect(inner.currentBlinkScale(1070)).toBeLessThan(0.1);
    expect(inner.currentBlinkScale(1200)).toBeCloseTo(1, 5);
    expect(inner.currentBlinkScale(1300)).toBeCloseTo(1, 5);
    inner.currentBlinkScale(1000 + 7000);
    expect(inner.blinkStartAt).toBeGreaterThan(1000);
  });

  it('update() advances the blink animation independently of setVisemes calls', () => {
    // The face must keep blinking even when nothing is driving its
    // mouth shape — that's the point of being a Script with its own
    // update() loop.
    const m = new StylizedFace();
    type Internal = {
      nextBlinkAt: number;
      blinkStartAt: number;
      lastDrawnBlinkScale: number;
    };
    const inner = m as unknown as Internal;
    inner.nextBlinkAt = performance.now() - 1;
    inner.blinkStartAt = -Infinity;
    const versionBefore = m.texture.version;
    m.update();
    // The blink schedule has been advanced and a redraw happened.
    expect(inner.blinkStartAt).toBeGreaterThan(-Infinity);
    expect(m.texture.version).toBeGreaterThanOrEqual(versionBefore);
  });

  it('dispose() releases texture, geometry, and material', () => {
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
    m.dispose();
    expect(geomDisposed).toBe(true);
    expect(matDisposed).toBe(true);
    expect(texDisposed).toBe(true);
  });

  it('dispose() is idempotent (xrblocks ScriptsManager + a host can both call it)', () => {
    const m = new StylizedFace();
    const tex = m.texture;
    let texDisposes = 0;
    tex.addEventListener('dispose', () => texDisposes++);
    m.dispose();
    m.dispose();
    m.dispose();
    expect(texDisposes).toBe(1);
  });
});

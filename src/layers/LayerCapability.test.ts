import {afterEach, describe, expect, it, vi} from 'vitest';

import {isLayerCapable, layerCapability} from './LayerCapability';

const session = {} as XRSession;

function bindingWithQuad() {
  return {createQuadLayer: () => ({})} as unknown as XRWebGLBinding;
}

describe('layerCapability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unsupported without a session', () => {
    expect(layerCapability(null, bindingWithQuad())).toBe('unsupported');
  });

  it('reports unsupported when the binding cannot make a quad layer', () => {
    // Chrome before 147 has a binding but no createQuadLayer on it.
    expect(layerCapability(session, {} as XRWebGLBinding)).toBe('unsupported');
  });

  it('uses the WebGL path when the binding offers quad layers', () => {
    expect(layerCapability(session, bindingWithQuad())).toBe('webgl');
  });

  it('prefers media layers when the platform has them', () => {
    // Cheaper: the compositor drives the video and the app never draws it.
    vi.stubGlobal('XRMediaBinding', function () {});
    expect(layerCapability(session, bindingWithQuad())).toBe('media');
  });

  it('takes webgl over media when asked to', () => {
    // Quest ships both bindings and would always pick media, which leaves the
    // webgl path with no hardware to run on. This override is what makes it
    // testable there.
    vi.stubGlobal('XRMediaBinding', function () {});
    expect(layerCapability(session, bindingWithQuad(), true)).toBe('webgl');
  });

  it('still reports media when webgl is asked for but unavailable', () => {
    vi.stubGlobal('XRMediaBinding', function () {});
    expect(layerCapability(session, {} as XRWebGLBinding, true)).toBe('media');
  });

  it('treats only unsupported as incapable', () => {
    expect(isLayerCapable('media')).toBe(true);
    expect(isLayerCapable('webgl')).toBe(true);
    expect(isLayerCapable('unsupported')).toBe(false);
  });
});

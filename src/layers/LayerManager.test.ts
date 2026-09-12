import {beforeEach, describe, expect, it, vi} from 'vitest';

import {LayerManager} from './LayerManager';

/** Minimal stand-in for a session, recording what gets submitted. */
function fakeSession() {
  return {
    updateRenderState: vi.fn(),
  } as unknown as XRSession & {updateRenderState: ReturnType<typeof vi.fn>};
}

const webglBinding = {
  createQuadLayer: () => ({}),
} as unknown as XRWebGLBinding;
describe('LayerManager', () => {
  const base = {} as XRLayer;
  const quad = {} as XRLayer;

  beforeEach(() => {
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
  });

  it('is unsupported until it has both a session and a base layer', () => {
    const manager = new LayerManager();
    expect(manager.isSupported()).toBe(false);

    manager.setSession(fakeSession(), webglBinding);
    expect(manager.isSupported()).toBe(false);

    manager.setBaseLayer(base);
    expect(manager.isSupported()).toBe(true);
  });

  it('hands back the binding and context the webgl path needs', () => {
    const manager = new LayerManager();
    const gl = {} as WebGL2RenderingContext;
    manager.setSession(fakeSession(), webglBinding, gl);

    expect(manager.getBinding()).toBe(webglBinding);
    expect(manager.getContext()).toBe(gl);
  });

  it('drops the binding and context when the session ends', () => {
    const manager = new LayerManager();
    manager.setSession(
      fakeSession(),
      webglBinding,
      {} as WebGL2RenderingContext
    );
    manager.setSession(null);

    expect(manager.getBinding()).toBeNull();
    expect(manager.getContext()).toBeNull();
  });

  it('re-reads the capability when the webgl path is forced', () => {
    (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding = function () {};
    const manager = new LayerManager();
    manager.setPreferWebGL(true);
    manager.setSession(fakeSession(), webglBinding);

    expect(manager.getCapability()).toBe('webgl');
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
  });

  it('refuses to add a layer before the base layer is known', () => {
    // Submitting without it would replace three.js's array and blank the scene.
    const manager = new LayerManager();
    manager.setSession(fakeSession(), webglBinding);

    expect(manager.add(quad)).toBe(false);
    expect(manager.getLayers()).toHaveLength(0);
  });

  it('always submits the base layer first', () => {
    const session = fakeSession();
    const manager = new LayerManager();
    manager.setSession(session, webglBinding);
    manager.setBaseLayer(base);

    manager.add(quad);

    expect(session.updateRenderState).toHaveBeenCalledWith({
      layers: [base, quad],
    });
  });

  it('does not add the same layer twice', () => {
    const session = fakeSession();
    const manager = new LayerManager();
    manager.setSession(session, webglBinding);
    manager.setBaseLayer(base);

    manager.add(quad);
    manager.add(quad);

    expect(manager.getLayers()).toHaveLength(1);
    expect(session.updateRenderState).toHaveBeenCalledTimes(1);
  });

  it('keeps the base layer when the last layer is removed', () => {
    const session = fakeSession();
    const manager = new LayerManager();
    manager.setSession(session, webglBinding);
    manager.setBaseLayer(base);
    manager.add(quad);

    expect(manager.remove(quad)).toBe(true);
    expect(session.updateRenderState).toHaveBeenLastCalledWith({
      layers: [base],
    });
  });

  it('reports removing something it never had', () => {
    const manager = new LayerManager();
    manager.setSession(fakeSession(), webglBinding);
    manager.setBaseLayer(base);

    expect(manager.remove(quad)).toBe(false);
  });

  it('drops everything when the session ends', () => {
    const manager = new LayerManager();
    manager.setSession(fakeSession(), webglBinding);
    manager.setBaseLayer(base);
    manager.add(quad);

    manager.setSession(null);

    expect(manager.getLayers()).toHaveLength(0);
    expect(manager.isSupported()).toBe(false);
  });

  it('stays inert on a platform without layers', () => {
    const manager = new LayerManager();
    manager.setSession(fakeSession(), {} as unknown as XRWebGLBinding);
    manager.setBaseLayer(base);

    expect(manager.getCapability()).toBe('unsupported');
    expect(manager.isSupported()).toBe(false);
  });
});

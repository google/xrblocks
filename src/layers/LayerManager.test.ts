import {expect, it} from 'vitest';
import {LayerManager} from './LayerManager';

const binding = {createQuadLayer() {}} as unknown as XRWebGLBinding;

it('keeps the base scene in the submitted stack and clears layers when the session ends', () => {
  let submitted: readonly XRLayer[] = [];
  const session = {
    updateRenderState(state: XRRenderStateInit) {
      submitted = state.layers!;
    },
  } as XRSession;
  const base = {} as XRLayer,
    quad = {} as XRLayer;
  const manager = new LayerManager();
  expect(manager.add(quad)).toBe(false);
  manager.setSession(session, binding);
  expect(manager.add(quad)).toBe(false);
  manager.setBaseLayer(base);
  expect(manager.add(quad)).toBe(true);
  manager.add(quad);
  expect(submitted).toEqual([base, quad]);
  manager.remove(quad);
  expect(submitted).toEqual([base]);
  manager.add(quad);
  manager.setSession(null);
  expect(manager.getLayers()).toEqual([]);
  expect(manager.isSupported()).toBe(false);
  expect(manager.add(quad)).toBe(false);
});

it('keeps accepted layers after a rejected submission and permits retry', () => {
  let reject = false;
  let submitted: readonly XRLayer[] = [];
  const session = {
    updateRenderState(state: XRRenderStateInit) {
      if (reject) throw new Error('Layer stack rejected');
      submitted = state.layers!;
    },
  } as XRSession;
  const base = {} as XRLayer,
    first = {} as XRLayer,
    next = {} as XRLayer;
  const manager = new LayerManager();
  manager.setSession(session, binding);
  manager.setBaseLayer(base);
  manager.add(first);
  reject = true;
  expect(() => manager.add(next)).toThrow('Layer stack rejected');
  expect(manager.getLayers()).toEqual([first]);
  expect(submitted).toEqual([base, first]);
  reject = false;
  manager.add(next);
  expect(submitted).toEqual([base, first, next]);
});

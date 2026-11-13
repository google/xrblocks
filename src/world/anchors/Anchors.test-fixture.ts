import * as THREE from 'three';
import {vi} from 'vitest';
import {RendererHolder} from '../../core/RendererTypes';
import {XRReferenceSpaceCache} from '../../core/components/XRReferenceSpaceCache';
import {WorldOptions} from '../WorldOptions';
import {AnchorManager} from './AnchorManager';
import {LocalStorageAnchorStore} from './LocalStorageAnchorStore';

export function transform(x = 1, y = 2, z = 3) {
  const matrix = new THREE.Matrix4().makeTranslation(x, y, z).toArray();
  return {
    position: {x, y, z, w: 1},
    orientation: {x: 0, y: 0, z: 0, w: 1},
    matrix,
  } as unknown as XRRigidTransform;
}
export function store(key = 'world.anchor-tests', cap = 8) {
  return new LocalStorageAnchorStore(key, cap, localStorage);
}
export function simulated(storage = store()) {
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  options.anchors.simulatorFallback = true;
  const manager = new AnchorManager(storage);
  manager.init({options});
  manager.update();
  return manager;
}

/** Only native XR APIs are substituted. Manager, cache, store, and math are real. */
export async function platform(
  capability: 'persistent' | 'session-only' | 'unsupported' = 'persistent',
  storage = store()
) {
  let id = 0;
  const held = new Set<string>();
  const spaces = new Map<XRReferenceSpaceType, XRReferenceSpace>();
  const anchor = (uuid: string) => ({
    anchorSpace: {},
    delete: vi.fn(),
    requestPersistentHandle: async () => {
      held.add(uuid);
      return uuid;
    },
  });
  const session = Object.assign(new EventTarget(), {
    requestReferenceSpace: async (type: XRReferenceSpaceType) => {
      const space = {} as XRReferenceSpace;
      spaces.set(type, space);
      return space;
    },
    restorePersistentAnchor:
      capability === 'persistent'
        ? vi.fn(async (uuid: string) => {
            if (uuid === 'bad') throw new Error('cannot localize');
            return anchor(uuid);
          })
        : undefined,
    deletePersistentAnchor: vi.fn(async (uuid: string) => {
      held.delete(uuid);
    }),
    get persistentAnchors() {
      return [...held];
    },
  });
  Object.defineProperty(session, 'persistentAnchors', {get: () => [...held]});
  const frame = {
    session,
    createAnchor:
      capability !== 'unsupported'
        ? vi.fn(async (_pose: XRRigidTransform, _space: XRSpace) =>
            anchor(`native-${id++}`)
          )
        : undefined,
    getPose: vi.fn((_from: XRSpace, _to: XRSpace) => ({
      transform: transform(),
    })),
  } as unknown as XRFrame;
  let live: XRFrame | null = frame;
  const renderer = {
    xr: {
      getSession: () => session,
      getFrame: () => live,
      getReferenceSpace: () => spaces.get('bounded-floor'),
    },
  };
  const cache = new XRReferenceSpaceCache();
  cache.onXRSessionStart(session as unknown as XRSession);
  await Promise.resolve();
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  const manager = new AnchorManager(storage);
  manager.init({
    options,
    rendererHolder: new RendererHolder(renderer as never),
    xrReferenceSpaceCache: cache,
  });
  manager.update(0, frame);
  return {
    manager,
    frame,
    session,
    held,
    spaces,
    cache,
    storage,
    live(value: boolean) {
      live = value ? frame : null;
    },
    tick() {
      live = frame;
      manager.update(0, frame);
      live = null;
    },
  };
}

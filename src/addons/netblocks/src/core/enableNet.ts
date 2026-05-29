import * as xb from 'xrblocks';

import {NetCore} from './NetCore';

/**
 * Internal Script that drives `NetCore.update()` on every frame. We hide
 * it behind `enableNet()` rather than making `NetCore` itself a Script
 * to keep NetCore's type surface (and the addon's emitted .d.ts) free of
 * the deep xrblocks/three Object3D inheritance graph.
 */
class NetCoreScript extends xb.Script {
  constructor(public netCore: NetCore) {
    super();
    this.name = 'NetCore';
  }

  update(time?: number, frame?: XRFrame): void {
    this.netCore.update(time, frame);
  }
}

declare module 'xrblocks' {
  interface Core {
    /** Set by `enableNet()`; undefined until then. */
    net?: NetCore;
  }
}

/**
 * Register the netblocks addon with the running xrblocks core. Idempotent —
 * calling it again returns the existing NetCore. Must be called after
 * `xb.init()` so `xb.core.scene` and `xb.core.scriptsManager` are ready.
 *
 * After this call:
 * - `xb.core.net` holds the NetCore instance.
 * - A small Script wrapper is added to `xb.core.scene`, so the per-frame
 *   `NetCore.update()` runs automatically via the standard xrblocks
 *   scripts manager.
 *
 * You can `joinRoom()` on the returned instance whenever you're ready.
 */
export function enableNet(): NetCore {
  if (!xb.core) {
    throw new Error(
      '[netblocks] enableNet() must be called after xb.init() — ' +
        'xb.core is not initialised yet.'
    );
  }
  if (xb.core.net) return xb.core.net;
  const net = new NetCore(xb.core.scene);
  const driver = new NetCoreScript(net);
  xb.core.scene.add(driver);
  void xb.core.scriptsManager.initScript(driver);
  xb.core.net = net;
  return net;
}

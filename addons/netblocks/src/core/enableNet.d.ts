import { NetCore } from './NetCore';
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
export declare function enableNet(): NetCore;

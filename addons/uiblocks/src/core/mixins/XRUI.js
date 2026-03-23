import { ScriptMixin } from 'xrblocks';

/**
 * A mixin that injects `ScriptMixin` capabilities into a `THREE.Object3D` base class.
 *
 * It automatically handles frame updates by accessing `xrblocks`'s `getDeltaTime()`,
 * and forwards the delta time to both the `ScriptMixin`'s internal update cycle
 * and an optional `onUpdate` callback hook on the instance.
 *
 * @typeParam TBase - The base class type extending `THREE.Object3D`.
 * @param Base - The target base class to extend.
 * @returns A new class extending `ScriptMixin(Base)` with custom update hooks.
 */
function XRUI(Base) {
    /**
     * Mixed class wrapping ScriptMixin interface hooks.
     */
    class Mixed extends ScriptMixin(Base) {
        /**
         * Core update loop called per frame.
         * Propagates the frame tick downstream to `onUpdate` hooks.
         */
        update() {
            super.update();
            if (this.onUpdate) {
                this.onUpdate();
            }
        }
    }
    return Mixed;
}

export { XRUI };

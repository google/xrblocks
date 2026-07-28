import {SimulatorUserMode} from './SimulatorUserMode.js';

/**
 * Identical to SimulatorUserMode for camera movement and click-raycast
 * behavior (WASDQE navigation, plain left-click = raycast) -- it exists as
 * its own SimulatorMode purely so an addon (e.g. a scene editor) can key
 * off `simulatorMode === SimulatorMode.EDITOR` to decide whether to show
 * its own UI, without changing how the user navigates or clicks.
 */
export class SimulatorEditorMode extends SimulatorUserMode {}

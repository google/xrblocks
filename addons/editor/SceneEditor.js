import * as xb from 'xrblocks';
import { CommandHistory } from './CommandHistory.js';
import { HierarchyPanel } from './HierarchyPanel.js';
import { ModelPickerPanel } from './ModelPickerPanel.js';
import { SceneManager } from './SceneManager.js';
import { ScenePanel } from './ScenePanel.js';
import { SelectionManager } from './SelectionManager.js';
import { injectEditorStyles } from './styles.js';
import { TransformGizmo } from './TransformGizmo.js';
import { TransformInspectorPanel } from './TransformInspectorPanel.js';
import './dom.js';
import 'three';
import './SceneManifest.js';

/**
 * Public entry point for the scene editor addon: a multi-object
 * translate/rotate/scale gizmo scene editor with a model picker, an
 * outliner (label/visibility/lock), undo/redo, and simulator manifest
 * export/import. Desktop mouse in the simulator only -- permanently out
 * of scope for real XR controllers (all hit-testing gates on
 * `event.target === xb.core.input.mouseController`, which a real XR
 * controller never satisfies).
 *
 * Usage: `xb.add(new SceneEditor({}))`. Every dependency (SceneManager,
 * SelectionManager, TransformGizmo, CommandHistory, and all four UI
 * panels) is constructed and wired together internally as children of
 * this Script -- the framework auto-discovers nested scripts via
 * `scene.traverse()`, so a single `xb.add()` on this object is enough.
 * Every panel injects its own DOM/CSS at runtime, so no markup is
 * required in the consuming app's index.html.
 */
class SceneEditor extends xb.Script {
    constructor({ modelsDir = './Models/', scenesDir = './Scenes/', } = {}) {
        super();
        /** True from onXRSessionStarted() until onXRSessionEnded(). A hard,
         * independent cutoff on top of the simulatorMode check below --
         * xb.core.simulatorRunning turns out to never reset to false once a
         * real XR session starts, so it can't be trusted alone to mean "not in
         * XR" (see update()). */
        this.inRealXRSession = false;
        injectEditorStyles();
        this.root = document.createElement('div');
        this.root.id = 'xrblocks-editor-root';
        document.body.appendChild(this.root);
        this.leftColumn = document.createElement('div');
        this.leftColumn.id = 'xrblocks-editor-left-column';
        this.root.appendChild(this.leftColumn);
        this.commandHistory = new CommandHistory();
        this.sceneManager = new SceneManager({
            modelsDir,
            commandHistory: this.commandHistory,
        });
        this.selectionManager = new SelectionManager(this.sceneManager);
        this.modelPickerPanel = new ModelPickerPanel(this.sceneManager, {
            parent: this.leftColumn,
        });
        this.transformGizmo = new TransformGizmo(this.selectionManager, this.commandHistory);
        // SelectionManager.onSelectStart defers to the gizmo's own scoped
        // handle raycast before running its whole-scene one -- see the
        // comment there for why.
        this.selectionManager.transformGizmo = this.transformGizmo;
        this.transformInspectorPanel = new TransformInspectorPanel(this.selectionManager, this.sceneManager, this.commandHistory, { parent: this.root });
        this.scenePanel = new ScenePanel(this.sceneManager, this.selectionManager, {
            scenesDir,
            parent: this.root,
        });
        this.hierarchyPanel = new HierarchyPanel(this.sceneManager, this.selectionManager, {
            parent: this.leftColumn,
        });
        this.sceneManager.onEnvironmentChange = () => {
            this.selectionManager.clearSelection();
            this.commandHistory.clearHistory();
        };
        this.add(this.commandHistory);
        this.add(this.sceneManager);
        this.add(this.selectionManager);
        this.add(this.modelPickerPanel);
        this.add(this.transformGizmo);
        this.add(this.transformInspectorPanel);
        this.add(this.scenePanel);
        this.add(this.hierarchyPanel);
    }
    /** Editor chrome (2D panels, gizmo, selection highlights, keyboard
     * shortcuts) is visible/interactive only while the simulator is
     * running with its interaction mode set to Editor, and no real XR
     * session is active -- everywhere else (other simulator modes, or a
     * real headset), it goes fully inert without discarding state, so
     * switching back to Editor mode restores exactly where you left off.
     * Simulator-owned models are untouched by this -- they are environment
     * content, not editor chrome, and render normally even in a real headset. */
    update() {
        const active = xb.core.simulatorRunning &&
            xb.core.simulator.controls.simulatorMode === xb.SimulatorMode.EDITOR &&
            !this.inRealXRSession;
        this.selectionManager.editorActive = active;
        this.commandHistory.editorActive = active;
        this.root.style.display = active ? '' : 'none';
    }
    /** Hard safety net: force the editor inert the instant a real XR
     * session begins, regardless of whatever simulator mode was last
     * selected. Also clears the selection outright (unlike the ordinary
     * mode-based inactive state) since "resume editing later" isn't a
     * meaningful concept once you've left the desktop/simulator context
     * entirely -- re-entering only happens via the simulator again, where
     * starting with no selection is the safe default. */
    onXRSessionStarted() {
        this.inRealXRSession = true;
        this.selectionManager.clearSelection();
    }
    onXRSessionEnded() {
        this.inRealXRSession = false;
    }
    dispose() {
        this.root.remove();
    }
}

export { SceneEditor };

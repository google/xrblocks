import * as xb from 'xrblocks';

import {CommandHistory} from './CommandHistory';
import {HierarchyPanel} from './HierarchyPanel';
import {ModelPickerPanel} from './ModelPickerPanel';
import {SceneManager} from './SceneManager';
import {ScenePanel} from './ScenePanel';
import {SelectionManager} from './SelectionManager';
import {injectEditorStyles} from './styles';
import {TransformGizmo} from './TransformGizmo';
import {TransformInspectorPanel} from './TransformInspectorPanel';

export interface SceneEditorOptions {
  /** Directory (relative to the page) to load .glb/.gltf files from.
   * Defaults to './Models/' -- create a Models/ folder next to your
   * index.html and it works with no further configuration. */
  modelsDir?: string;
  /** Directory (relative to the page) to read/save scene .json files.
   * Defaults to './Scenes/', same convention as modelsDir. */
  scenesDir?: string;
}

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
export class SceneEditor extends xb.Script {
  commandHistory: CommandHistory;
  sceneManager: SceneManager;
  selectionManager: SelectionManager;
  transformGizmo: TransformGizmo;
  modelPickerPanel: ModelPickerPanel;
  transformInspectorPanel: TransformInspectorPanel;
  scenePanel: ScenePanel;
  hierarchyPanel: HierarchyPanel;

  /** Wraps every panel's own root element -- a single element Slice C's
   * visibility gating (Editor-mode scoping + XR safety net) can toggle to
   * show/hide the whole editor UI at once. */
  root: HTMLDivElement;
  /** Holds the model picker + hierarchy panels, stacked in normal
   * document flow so the hierarchy panel stays docked directly under the
   * picker regardless of the picker's actual (content-dependent) height,
   * instead of each being independently pinned to a viewport edge. */
  leftColumn: HTMLDivElement;

  /** True from onXRSessionStarted() until onXRSessionEnded(). A hard,
   * independent cutoff on top of the simulatorMode check below --
   * xb.core.simulatorRunning turns out to never reset to false once a
   * real XR session starts, so it can't be trusted alone to mean "not in
   * XR" (see update()). */
  inRealXRSession = false;

  constructor({
    modelsDir = './Models/',
    scenesDir = './Scenes/',
  }: SceneEditorOptions = {}) {
    super();

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
    this.transformGizmo = new TransformGizmo(
      this.selectionManager,
      this.commandHistory
    );
    // SelectionManager.onSelectStart defers to the gizmo's own scoped
    // handle raycast before running its whole-scene one -- see the
    // comment there for why.
    this.selectionManager.transformGizmo = this.transformGizmo;
    this.transformInspectorPanel = new TransformInspectorPanel(
      this.selectionManager,
      this.sceneManager,
      this.commandHistory,
      {parent: this.root}
    );
    this.scenePanel = new ScenePanel(this.sceneManager, this.selectionManager, {
      scenesDir,
      parent: this.root,
    });
    this.hierarchyPanel = new HierarchyPanel(
      this.sceneManager,
      this.selectionManager,
      {
        parent: this.leftColumn,
      }
    );
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
  override update() {
    const active =
      xb.core.simulatorRunning &&
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
  override onXRSessionStarted() {
    this.inRealXRSession = true;
    this.selectionManager.clearSelection();
  }

  override onXRSessionEnded() {
    this.inRealXRSession = false;
  }

  override dispose() {
    this.root.remove();
  }
}

import * as xb from 'xrblocks';

const MAX_HISTORY = 50;

export interface Command {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

/**
 * Undo/redo command stack. Each entry is \{undo, redo\}; redo is never
 * called at push time (the action has already happened by then) -- it
 * only runs if the entry is later undone and then redone. Ctrl+Z /
 * Ctrl+Shift+Z wired here via onKeyDown, guarded against firing while an
 * inspector <input> has focus (same guard SelectionManager uses for its
 * tool-mode shortcuts), so it doesn't fight the browser's native
 * in-field undo.
 */
export class CommandHistory extends xb.Script {
  undoStack: Command[] = [];
  redoStack: Command[] = [];
  /** Set every frame by SceneEditor -- see SelectionManager.editorActive
   * for the same pattern and why. Keeps Ctrl+Z from firing as a global
   * page-wide shortcut while the user is just browsing in a non-Editor
   * simulator mode. */
  editorActive = true;

  push(command: Command) {
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Combines several \{undo, redo\} entries into a single stack entry, so
   * one Ctrl+Z reverts all of them together (e.g. a group gizmo drag or a
   * multi-object delete). Sub-commands undo in reverse order, redo in
   * forward order. No-op entries should be filtered out by the caller
   * before calling this. */
  pushBatch(commands: Array<Command | undefined | null>) {
    const valid = commands.filter((command): command is Command => !!command);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      this.push(valid[0]);
      return;
    }
    this.push({
      undo: async () => {
        for (let i = valid.length - 1; i >= 0; i--) await valid[i].undo();
      },
      redo: async () => {
        for (const command of valid) await command.redo();
      },
    });
  }

  clearHistory() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  async undo() {
    const command = this.undoStack.pop();
    if (!command) return;
    await command.undo();
    this.redoStack.push(command);
  }

  async redo() {
    const command = this.redoStack.pop();
    if (!command) return;
    await command.redo();
    this.undoStack.push(command);
  }

  override onKeyDown(event: KeyboardEvent) {
    if (!this.editorActive) return;
    const targetTag = (event.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.code !== xb.Keycodes.Z_CODE) return;

    event.preventDefault();
    if (event.shiftKey) {
      this.redo();
    } else {
      this.undo();
    }
  }
}

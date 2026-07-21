import * as xb from 'xrblocks';
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
export declare class CommandHistory extends xb.Script {
    undoStack: Command[];
    redoStack: Command[];
    /** Set every frame by SceneEditor -- see SelectionManager.editorActive
     * for the same pattern and why. Keeps Ctrl+Z from firing as a global
     * page-wide shortcut while the user is just browsing in a non-Editor
     * simulator mode. */
    editorActive: boolean;
    push(command: Command): void;
    /** Combines several \{undo, redo\} entries into a single stack entry, so
     * one Ctrl+Z reverts all of them together (e.g. a group gizmo drag or a
     * multi-object delete). Sub-commands undo in reverse order, redo in
     * forward order. No-op entries should be filtered out by the caller
     * before calling this. */
    pushBatch(commands: Array<Command | undefined | null>): void;
    clearHistory(): void;
    undo(): Promise<void>;
    redo(): Promise<void>;
    onKeyDown(event: KeyboardEvent): void;
}

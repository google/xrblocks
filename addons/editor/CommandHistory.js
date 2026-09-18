import * as xb from 'xrblocks';

const MAX_HISTORY = 50;
/**
 * Undo/redo command stack. Each entry is \{undo, redo\}; redo is never
 * called at push time (the action has already happened by then) -- it
 * only runs if the entry is later undone and then redone. Ctrl+Z /
 * Ctrl+Shift+Z wired here via onKeyDown, guarded against firing while an
 * inspector <input> has focus (same guard SelectionManager uses for its
 * tool-mode shortcuts), so it doesn't fight the browser's native
 * in-field undo.
 *
 * Undo/redo requests run in order and move entries only after success.
 * A new edit or reset invalidates queued requests and pending stack
 * transfers; it does not roll back command side effects or partial batches.
 */
class CommandHistory extends xb.Script {
    constructor() {
        super(...arguments);
        this.undoStack = [];
        this.redoStack = [];
        this.pending = Promise.resolve();
        this.generation = 0;
        /** Set every frame by SceneEditor -- see SelectionManager.editorActive
         * for the same pattern and why. Keeps Ctrl+Z from firing as a global
         * page-wide shortcut while the user is just browsing in a non-Editor
         * simulator mode. */
        this.editorActive = true;
    }
    push(command) {
        this.generation++;
        this.undoStack.push(command);
        if (this.undoStack.length > MAX_HISTORY)
            this.undoStack.shift();
        this.redoStack.length = 0;
    }
    /** Combines several \{undo, redo\} entries into a single stack entry, so
     * one Ctrl+Z reverts all of them together (e.g. a group gizmo drag or a
     * multi-object delete). Sub-commands undo in reverse order, redo in
     * forward order. No-op entries should be filtered out by the caller
     * before calling this. */
    pushBatch(commands) {
        const valid = commands.filter((command) => !!command);
        if (valid.length === 0)
            return;
        if (valid.length === 1) {
            this.push(valid[0]);
            return;
        }
        this.push({
            undo: async () => {
                for (let i = valid.length - 1; i >= 0; i--)
                    await valid[i].undo();
            },
            redo: async () => {
                for (const command of valid)
                    await command.redo();
            },
        });
    }
    clearHistory() {
        this.generation++;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }
    undo() {
        return this.runCommand('undo');
    }
    redo() {
        return this.runCommand('redo');
    }
    runCommand(direction) {
        const generation = this.generation;
        const operation = this.pending.then(async () => {
            if (generation !== this.generation)
                return;
            const source = direction === 'undo' ? this.undoStack : this.redoStack;
            const target = direction === 'undo' ? this.redoStack : this.undoStack;
            const command = source.at(-1);
            if (!command)
                return;
            await command[direction]();
            if (generation !== this.generation || source.at(-1) !== command)
                return;
            source.pop();
            target.push(command);
        });
        // Recover the queue tail, but return the original rejection to the caller.
        this.pending = operation.then(() => { }, () => { });
        return operation;
    }
    onKeyDown(event) {
        if (!this.editorActive)
            return;
        const targetTag = event.target?.tagName;
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA')
            return;
        if (!event.ctrlKey && !event.metaKey)
            return;
        if (event.code !== xb.Keycodes.Z_CODE)
            return;
        event.preventDefault();
        const direction = event.shiftKey ? 'redo' : 'undo';
        void this[direction]().catch((error) => {
            console.error(`[CommandHistory] Failed to ${direction}:`, error);
        });
    }
}

export { CommandHistory };

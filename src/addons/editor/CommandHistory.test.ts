import {afterEach, describe, expect, it, vi} from 'vitest';

import {CommandHistory, type Command} from './CommandHistory';

vi.mock('xrblocks', async () => ({
  ...(await import('../../core/Script')),
  ...(await import('../../utils/Keycodes')),
}));

function command() {
  return {
    undo: vi.fn<Command['undo']>(),
    redo: vi.fn<Command['redo']>(),
  };
}

function shortcut(history: CommandHistory, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey,
    cancelable: true,
  });
  history.onKeyDown(event);
  expect(event.defaultPrevented).toBe(true);
}

afterEach(() => vi.restoreAllMocks());

describe('CommandHistory async operations', () => {
  it.each(['undo', 'redo'] as const)(
    'keeps both stacks intact when async %s rejects and allows retry',
    async (direction) => {
      const history = new CommandHistory();
      const older = command();
      const current = command();
      const newer = command();
      history.push(older);
      history.push(current);
      history.push(newer);
      await history.undo();
      if (direction === 'redo') await history.undo();
      const undoBefore = [...history.undoStack];
      const redoBefore = [...history.redoStack];
      const pending = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      current[direction].mockImplementationOnce(() => {
        started.resolve();
        return pending.promise;
      });

      const operation = history[direction]();
      const error = new Error(`${direction} failed`);
      const rejection = expect(operation).rejects.toBe(error);
      await started.promise;
      pending.reject(error);
      await rejection;

      expect(history.undoStack).toEqual(undoBefore);
      expect(history.redoStack).toEqual(redoBefore);
      await history[direction]();
      expect(history.undoStack).toEqual(
        direction === 'undo' ? [older] : [older, current]
      );
      expect(history.redoStack).toEqual(
        direction === 'undo' ? [newer, current] : [newer]
      );
    }
  );

  it.each(['undo', 'redo'] as const)(
    'keeps a command when synchronous %s throws',
    async (direction) => {
      const history = new CommandHistory();
      const current = command();
      history.push(current);
      if (direction === 'redo') await history.undo();
      current[direction].mockImplementationOnce(() => {
        throw new Error('command failed');
      });

      await expect(history[direction]()).rejects.toThrow('command failed');

      expect(history.undoStack).toEqual(direction === 'undo' ? [current] : []);
      expect(history.redoStack).toEqual(direction === 'redo' ? [current] : []);
    }
  );

  it('serializes repeated Ctrl+Z before a following Ctrl+Shift+Z', async () => {
    const history = new CommandHistory();
    const older = command();
    const newer = command();
    const pending = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const calls: string[] = [];
    older.undo.mockImplementation(() => {
      calls.push('undo older');
    });
    older.redo.mockImplementation(() => {
      calls.push('redo older');
    });
    newer.undo.mockImplementation(async () => {
      calls.push('undo newer started');
      started.resolve();
      await pending.promise;
      calls.push('undo newer finished');
    });
    history.push(older);
    history.push(newer);
    const undo = vi.spyOn(history, 'undo');
    const redo = vi.spyOn(history, 'redo');

    shortcut(history);
    await started.promise;
    shortcut(history);
    shortcut(history, true);
    pending.resolve();
    await Promise.all([
      ...undo.mock.results.map((result) => result.value),
      ...redo.mock.results.map((result) => result.value),
    ]);

    expect(calls).toEqual([
      'undo newer started',
      'undo newer finished',
      'undo older',
      'redo older',
    ]);
    expect(history.undoStack).toEqual([older]);
    expect(history.redoStack).toEqual([newer]);
  });

  it('queues undo behind an in-flight redo', async () => {
    const history = new CommandHistory();
    const current = command();
    history.push(current);
    await history.undo();
    current.undo.mockClear();
    const pending = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    current.redo.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });

    const redo = history.redo();
    await started.promise;
    const undo = history.undo();
    pending.resolve();
    await Promise.all([redo, undo]);

    expect(current.undo).toHaveBeenCalledOnce();
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([current]);
  });

  it('continues queued work after rejection without skipping the failed command', async () => {
    const history = new CommandHistory();
    const older = command();
    const current = command();
    history.push(older);
    history.push(current);
    current.undo.mockRejectedValueOnce(new Error('retry me'));

    const failed = history.undo();
    const retry = history.undo();
    await expect(failed).rejects.toThrow('retry me');
    await retry;

    expect(older.undo).not.toHaveBeenCalled();
    expect(current.undo).toHaveBeenCalledTimes(2);
    expect(history.undoStack).toEqual([older]);
    expect(history.redoStack).toEqual([current]);
  });

  it.each(['undo', 'redo'] as const)(
    'does not apply stale %s stack transfers or queued requests after a new edit',
    async (direction) => {
      const history = new CommandHistory();
      const current = command();
      const newer = command();
      history.push(current);
      if (direction === 'redo') await history.undo();
      const pending = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      current[direction].mockImplementationOnce(() => {
        started.resolve();
        return pending.promise;
      });

      const active = history[direction]();
      await started.promise;
      const queued = history.undo();
      history.push(newer);
      const undoAfterEdit = [...history.undoStack];
      pending.resolve();
      await Promise.all([active, queued]);

      expect(history.undoStack).toEqual(undoAfterEdit);
      expect(history.redoStack).toEqual([]);
      expect(newer.undo).not.toHaveBeenCalled();
      await history.undo();
      expect(newer.undo).toHaveBeenCalledOnce();
      expect(history.redoStack).toEqual([newer]);
    }
  );

  it.each(['undo', 'redo'] as const)(
    'keeps cleared stacks empty after pending %s completes',
    async (direction) => {
      const history = new CommandHistory();
      const current = command();
      history.push(current);
      if (direction === 'redo') await history.undo();
      const pending = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      current[direction].mockImplementationOnce(() => {
        started.resolve();
        return pending.promise;
      });

      const active = history[direction]();
      await started.promise;
      history.clearHistory();
      pending.resolve();
      await active;

      expect(history.undoStack).toEqual([]);
      expect(history.redoStack).toEqual([]);
    }
  );

  it.each(['undo', 'redo'] as const)(
    'does not restore cleared history or run old queued %s requests in a new scene',
    async (direction) => {
      const history = new CommandHistory();
      const current = command();
      const nextScene = command();
      history.push(current);
      if (direction === 'redo') await history.undo();
      const pending = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      current[direction].mockImplementationOnce(() => {
        started.resolve();
        return pending.promise;
      });

      const active = history[direction]();
      await started.promise;
      const queued = history.undo();
      history.clearHistory();
      history.push(nextScene);
      pending.resolve();
      await Promise.all([active, queued]);

      expect(history.undoStack).toEqual([nextScene]);
      expect(history.redoStack).toEqual([]);
      expect(nextScene.undo).not.toHaveBeenCalled();
    }
  );

  it.each(['undo', 'redo'] as const)(
    'logs keyboard %s rejection while retaining the command',
    async (direction) => {
      const history = new CommandHistory();
      const current = command();
      history.push(current);
      if (direction === 'redo') await history.undo();
      const error = new Error('keyboard command failed');
      current[direction].mockRejectedValueOnce(error);
      const operation = vi.spyOn(history, direction);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});

      shortcut(history, direction === 'redo');
      await expect(operation.mock.results[0].value).rejects.toBe(error);

      expect(log).toHaveBeenCalledExactlyOnceWith(
        `[CommandHistory] Failed to ${direction}:`,
        error
      );
      expect(history.undoStack).toEqual(direction === 'undo' ? [current] : []);
      expect(history.redoStack).toEqual(direction === 'redo' ? [current] : []);
    }
  );
});

describe('CommandHistory existing behavior', () => {
  it('does nothing for empty histories', async () => {
    const history = new CommandHistory();
    await history.undo();
    await history.redo();
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });

  it('records completed actions without executing them and limits history to 50', async () => {
    const history = new CommandHistory();
    const entries = Array.from({length: 51}, command);
    for (const entry of entries) history.push(entry);
    expect(history.undoStack).toEqual(entries.slice(1));
    for (const entry of entries) {
      expect(entry.undo).not.toHaveBeenCalled();
      expect(entry.redo).not.toHaveBeenCalled();
    }
    await history.undo();
    history.push(command());
    expect(history.redoStack).toEqual([]);
  });

  it('undoes batches in reverse order and redoes them in forward order', async () => {
    const history = new CommandHistory();
    const calls: string[] = [];
    const entries = [0, 1].map((index) => ({
      undo: async () => {
        calls.push(`undo ${index}`);
      },
      redo: async () => {
        calls.push(`redo ${index}`);
      },
    }));
    history.pushBatch([null, ...entries, undefined]);
    await history.undo();
    await history.redo();
    expect(calls).toEqual(['undo 1', 'undo 0', 'redo 0', 'redo 1']);
    expect(history.undoStack).toHaveLength(1);
  });

  it('ignores keyboard shortcuts when inactive or an input has focus', async () => {
    const history = new CommandHistory();
    const entry = command();
    history.push(entry);
    const event = new KeyboardEvent('keydown', {
      code: 'KeyZ',
      ctrlKey: true,
      cancelable: true,
    });
    history.editorActive = false;
    history.onKeyDown(event);
    history.editorActive = true;
    for (const tag of ['input', 'textarea']) {
      const input = document.createElement(tag);
      input.addEventListener('keydown', (event) => history.onKeyDown(event));
      input.dispatchEvent(event);
    }
    await Promise.resolve();
    expect(event.defaultPrevented).toBe(false);
    expect(entry.undo).not.toHaveBeenCalled();
    expect(history.undoStack).toEqual([entry]);
  });
});

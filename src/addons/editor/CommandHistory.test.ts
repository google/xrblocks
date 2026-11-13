import {afterEach, expect, it, vi} from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {CommandHistory} from './CommandHistory';
afterEach(() => {
  vi.restoreAllMocks();
});

it('undoes and redoes dependent edits in order', async () => {
  const history = new CommandHistory();
  const objects = ['chair', 'table'];
  history.pushBatch([
    {
      undo: () => {
        expect(objects.pop()).toBe('table');
      },
      redo: () => {
        objects.push('table');
      },
    },
    {
      undo: () => {
        expect(objects.pop()).toBe('chair');
      },
      redo: () => {
        objects.push('chair');
      },
    },
  ]);
  // A batch undoes its last edit first, then reconstructs the original order.
  objects.splice(0, 2, 'table', 'chair');
  await history.undo();
  expect(objects).toEqual([]);
  await history.redo();
  expect(objects).toEqual(['table', 'chair']);
});

it('serializes pending undo work and keeps a failed command available for retry', async () => {
  const history = new CommandHistory();
  let value = 2;
  let fail = true;
  const gate = Promise.withResolvers<void>();
  history.push({
    undo: () => {
      value = 0;
    },
    redo: () => {
      value = 1;
    },
  });
  history.push({
    undo: async () => {
      await gate.promise;
      if (fail) throw new Error('unavailable');
      value = 1;
    },
    redo: () => {
      value = 2;
    },
  });
  const active = history.undo();
  const rejected = expect(active).rejects.toThrow('unavailable');
  gate.resolve();
  await rejected;
  expect(value).toBe(2);
  fail = false;
  await history.undo();
  expect(value).toBe(1);
  const first = history.undo();
  const second = history.redo();
  await Promise.all([first, second]);
  expect(value).toBe(1);
});

it.each(['edit', 'clear'] as const)(
  'does not transfer stale work after a new %s',
  async (action) => {
    const history = new CommandHistory();
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    let value = 'old';
    history.push({
      undo: async () => {
        entered.resolve();
        await gate.promise;
      },
      redo: () => {
        value = 'stale';
      },
    });
    const active = history.undo();
    await entered.promise;
    const queued = history.redo();
    if (action === 'clear') history.clearHistory();
    else
      history.push({
        undo: () => {
          value = 'new edit undone';
        },
        redo: () => {
          value = 'new';
        },
      });
    gate.resolve();
    await Promise.all([active, queued]);
    await history.redo();
    expect(value).toBe('old');
    await history.undo();
    expect(value).toBe(action === 'clear' ? 'old' : 'new edit undone');
  }
);

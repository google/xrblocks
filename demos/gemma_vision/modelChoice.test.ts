import {describe, expect, it, vi} from 'vitest';

import {
  createModelChoice,
  MODEL_CHOICE_KEY,
  pickDefaultModel,
} from './modelChoice.js';
import {toSmolVLMMessages} from './modelAdapters.js';

const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

describe('default model choice', () => {
  it('uses Gemma on capable desktops', () => {
    expect(pickDefaultModel({deviceMemory: 8, userAgent: DESKTOP})).toBe(
      'gemma'
    );
    expect(pickDefaultModel()).toBe('gemma');
  });

  it.each([
    'Mozilla/5.0 (Linux; Android 14; SM-I610) AppleWebKit/537.36 Chrome/154.0 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 OculusBrowser/40.0 Chrome/154.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  ])('uses Lite on phones and headsets: %s', (userAgent) => {
    expect(pickDefaultModel({deviceMemory: 8, userAgent})).toBe('lite');
  });

  it('uses Lite when the device reports less than 8 GB', () => {
    expect(pickDefaultModel({deviceMemory: 4, userAgent: DESKTOP})).toBe(
      'lite'
    );
  });

  it('prefers a valid saved choice and ignores unknown ones', () => {
    expect(
      pickDefaultModel({stored: 'gemma', deviceMemory: 2, userAgent: 'Android'})
    ).toBe('gemma');
    expect(pickDefaultModel({stored: 'lite', userAgent: DESKTOP})).toBe('lite');
    expect(pickDefaultModel({stored: 'huge', userAgent: DESKTOP})).toBe(
      'gemma'
    );
    expect(pickDefaultModel({stored: 'toString', userAgent: DESKTOP})).toBe(
      'gemma'
    );
  });
});

describe('persisted model choice', () => {
  function memoryStorage(initial?: string) {
    const values = new Map<string, string>();
    if (initial) values.set(MODEL_CHOICE_KEY, initial);
    return {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
  }

  it('reads and saves the choice under one key', () => {
    const storage = memoryStorage('lite');
    const choice = createModelChoice({
      storage,
      navigator: {userAgent: DESKTOP},
    });
    expect(choice.initial).toBe('lite');
    choice.save('gemma');
    expect(storage.setItem).toHaveBeenCalledWith(MODEL_CHOICE_KEY, 'gemma');
    expect(
      createModelChoice({storage, navigator: {userAgent: DESKTOP}}).initial
    ).toBe('gemma');
  });

  it('falls back to device defaults when storage is blocked', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError');
      }),
    };
    const choice = createModelChoice({
      storage,
      navigator: {deviceMemory: 2, userAgent: DESKTOP},
    });
    expect(choice.initial).toBe('lite');
    expect(() => choice.save('gemma')).not.toThrow();
    expect(createModelChoice({storage: null, navigator: {}}).initial).toBe(
      'gemma'
    );
  });
});

describe('SmolVLM prompt shape', () => {
  it('wraps string contents as typed text parts and keeps image parts', () => {
    expect(
      toSmolVLMMessages([
        {role: 'user', content: [{type: 'image'}, {type: 'text', text: 'Q1'}]},
        {role: 'assistant', content: 'A1'},
        {role: 'user', content: 'Q2'},
      ])
    ).toEqual([
      {role: 'user', content: [{type: 'image'}, {type: 'text', text: 'Q1'}]},
      {role: 'assistant', content: [{type: 'text', text: 'A1'}]},
      {role: 'user', content: [{type: 'text', text: 'Q2'}]},
    ]);
  });
});

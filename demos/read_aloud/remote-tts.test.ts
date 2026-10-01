import {afterEach, describe, expect, it, vi} from 'vitest';

import {RemoteTts, splitSentences} from './remote-tts.js';

describe('splitSentences', () => {
  it('splits on sentence ends and paragraphs', () => {
    expect(
      splitSentences(
        'First one. Second one! Third\n\nNew paragraph without end'
      )
    ).toEqual([
      'First one.',
      'Second one!',
      'Third',
      'New paragraph without end',
    ]);
  });

  it('returns nothing for blank input', () => {
    expect(splitSentences('  \n\n ')).toEqual([]);
  });
});

describe('RemoteTts', () => {
  afterEach(() => vi.unstubAllGlobals());

  function jsonResponse(data: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
      ...init,
    });
  }

  it('connects and describes the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          tts: {engine: 'matcha-tts/litert', threads: 8, steps: 4},
          ocr: {ollamaAvailable: true},
        })
      )
    );
    const tts = new RemoteTts('http://localhost:8790/', {} as AudioContext);
    await tts.connect();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8790/health',
      expect.objectContaining({signal: expect.any(AbortSignal)})
    );
    expect(tts.describe()).toBe('matcha-tts/litert · 8 threads · 4 steps');
    expect(tts.ollamaAvailable).toBe(true);
  });

  it('decodes audio and pipelines sentence requests', async () => {
    const decoded = {duration: 1};
    const audioContext = {
      decodeAudioData: vi.fn().mockResolvedValue(decoded),
    } as unknown as AudioContext;
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const {text} = JSON.parse(init.body);
      if (text.startsWith('Silent')) {
        return jsonResponse(
          {error: 'nothing pronounceable'},
          {
            headers: {'Content-Type': 'application/json', 'X-Chunks': '0'},
          }
        );
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'Content-Type': 'audio/wav',
          'X-Chunks': '1',
          'X-Timings': JSON.stringify({decoder: 12}),
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const tts = new RemoteTts('http://localhost:8790', audioContext);
    const results = [];
    for await (const item of tts.speak('One here. Silent ###. Three here.')) {
      results.push(item);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results.map((r) => r.index)).toEqual([0, 2]);
    expect(results[0]).toMatchObject({
      buffer: decoded,
      count: 3,
      timings: {decoder: 12},
    });
  });

  it('surfaces server errors from JSON bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({error: 'Ollama unreachable'}, {status: 502})
        )
    );
    const tts = new RemoteTts('http://localhost:8790', {} as AudioContext);
    await expect(tts.ocr('abc')).rejects.toThrow('Ollama unreachable');
  });
});

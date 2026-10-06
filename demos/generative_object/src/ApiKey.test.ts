import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {resolveApiKey} from './ApiKey.js';

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = `
    <div id="keyOverlay" style="display: none">
      <input id="keyInput" type="password">
      <button id="keySave">save and start</button>
    </div>`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('prototype Gemini key resolution', () => {
  it('prefers the consumed URL key without another navigation or fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    window.localStorage.setItem('gemini-api-key', 'stored-fixture');
    const url = window.location.href;
    expect(await resolveApiKey(' url-fixture ')).toBe('url-fixture');
    expect(window.localStorage.getItem('gemini-api-key')).toBe('url-fixture');
    expect(window.location.href).toBe(url);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses a saved key without putting it in the address bar', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    window.localStorage.setItem('gemini-api-key', 'saved-fixture');
    const url = window.location.href;
    expect(await resolveApiKey()).toBe('saved-fixture');
    expect(window.location.href).toBe(url);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the SDK gemini.apiKey schema from a demo-local file', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({gemini: {apiKey: 'local-fixture'}}))
      );
    vi.stubGlobal('fetch', fetch);
    expect(await resolveApiKey()).toBe('local-fixture');
    expect(fetch).toHaveBeenCalledExactlyOnceWith('./keys.json', {
      cache: 'no-store',
    });
    expect(document.getElementById('keyOverlay')!.style.display).toBe('none');
  });

  it('tries the repository-root SDK keys file after a missing local file', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {status: 404}))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            gemini: {apiKey: 'root-fixture'},
          })
        )
      );
    vi.stubGlobal('fetch', fetch);
    expect(await resolveApiKey()).toBe('root-fixture');
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      './keys.json',
      '../../keys.json',
    ]);
  });

  it.each([
    {key: 'obsolete-schema-fixture'},
    {gemini: {apiKey: 123}},
    {gemini: {apiKey: '   '}},
  ])(
    'reports an invalid local schema and tries the root file: %j',
    async (data) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify(data)))
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                gemini: {apiKey: 'root-fixture'},
              })
            )
          )
      );
      expect(await resolveApiKey()).toBe('root-fixture');
      expect(warning).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('./keys.json')
      );
    }
  );

  it('waits for password entry, saves without navigating, and removes handlers', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, {status: 404}));
    vi.stubGlobal('fetch', fetch);
    const input = document.querySelector('input')!;
    const save = document.querySelector('button')!;
    const url = window.location.href;
    let resolved = false;
    const pending = resolveApiKey().then((key) => {
      resolved = true;
      return key;
    });
    await vi.waitFor(() =>
      expect(document.getElementById('keyOverlay')!.style.display).toBe('flex')
    );
    expect(resolved).toBe(false);
    save.click();
    expect(resolved).toBe(false);
    expect(input.validationMessage).toBe('Enter a Gemini API key.');

    input.value = ' typed-fixture ';
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
    expect(await pending).toBe('typed-fixture');
    expect(window.localStorage.getItem('gemini-api-key')).toBe('typed-fixture');
    expect(window.location.href).toBe(url);
    expect(input.value).toBe('');
    expect(document.getElementById('keyOverlay')!.style.display).toBe('none');
    input.value = 'late-fixture';
    save.click();
    expect(window.localStorage.getItem('gemini-api-key')).toBe('typed-fixture');
  });

  it('still accepts an in-memory key when browser storage is blocked', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(await resolveApiKey('memory-fixture')).toBe('memory-fixture');
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.stringify(warning.mock.calls)).not.toContain('memory-fixture');
  });

  it('reports file failures without logging a response containing credentials', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('credential-fixture'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              gemini: {apiKey: 'root-fixture'},
            })
          )
        )
    );
    expect(await resolveApiKey()).toBe('root-fixture');
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      'credential-fixture'
    );
  });
});

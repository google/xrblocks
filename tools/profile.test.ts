// @vitest-environment node

import {rm} from 'node:fs/promises';
import {PassThrough} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Cdp} from './profile-cdp.js';
import {cleanupProfile, parseOptions} from './profile.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  rm: vi.fn(),
}));

describe('profiler arguments', () => {
  const base = [
    '--chrome',
    '/path with spaces/chrome',
    'http://127.0.0.1:8080/',
    'http://127.0.0.1:8081/',
  ];

  it('accepts URLs and a Chrome path without changing either URL', () => {
    const options = parseOptions(base);
    expect(options.before).toBe(base[2]);
    expect(options.after).toBe(base[3]);
    expect(options.chrome).toBe(base[1]);
    expect(options.runs).toBe(5);
    expect(options.durationMs).toBe(8000);
    expect(options.warmupMs).toBe(3000);
    expect(options.eventNames).toEqual([]);
  });

  it('keeps depth instrumentation opt-in and deduplicates selected events', () => {
    const options = parseOptions([
      ...base,
      '--depth',
      '--event=webgl:getParameter',
      '--event=Layout',
      '--chrome-arg=--headless=new',
      '--warmup=0',
    ]);
    expect(options.depth).toBe(true);
    expect(options.eventNames).toEqual([
      'webgl:getBufferSubData',
      'webgl:getParameter',
      'webgl:clientWaitSync',
      'Layout',
    ]);
    expect(options.chromeArgs).toEqual(['--headless=new']);
    expect(options.warmupMs).toBe(0);
  });

  it.each([
    ['--runs=0'],
    ['--runs=1.5'],
    ['--duration=0'],
    ['--duration=Infinity'],
    ['--duration=3000000'],
    ['--warmup=-1'],
    ['--timeout=0'],
    ['--event='],
    ['--ready='],
    ['--chrome-arg=--user-data-dir=/tmp/existing-profile'],
    ['--chrome-arg=--remote-debugging-port=9222'],
    ['--chrome-arg=about:blank'],
  ])('rejects invalid configuration: %s', (option) => {
    expect(() => parseOptions([...base, option])).toThrow();
  });

  it('rejects missing arguments and non-HTTP URLs', () => {
    expect(() => parseOptions(['--chrome=chrome'])).toThrow();
    expect(() => parseOptions(base.slice(2))).toThrow(/chrome/i);
    expect(() =>
      parseOptions(['--chrome=chrome', 'file:///tmp/a', base[3]])
    ).toThrow(/HTTP/i);
  });

  it('prints help without requiring a browser or URLs', () => {
    expect(parseOptions(['--help']).help).toBe(true);
  });
});

describe('CDP pipe client', () => {
  const clients: Cdp[] = [];
  function client() {
    const input = new PassThrough();
    const output = new PassThrough();
    const cdp = new Cdp(input, output, 100);
    clients.push(cdp);
    return {cdp, input, output};
  }

  afterEach(() => {
    for (const cdp of clients.splice(0)) cdp.fail(new Error('Test cleanup.'));
    vi.useRealTimers();
  });

  it('frames commands and accepts fragmented UTF-8 replies', async () => {
    const {cdp, input, output} = client();
    const response = cdp.send('Browser.getVersion');
    expect(input.read().toString()).toBe(
      '{"id":1,"method":"Browser.getVersion","params":{}}\0'
    );
    const reply = Buffer.from('{"id":1,"result":{"text":"caf\u00e9"}}\0');
    const split = reply.indexOf(Buffer.from('\u00e9')) + 1;
    output.write(reply.subarray(0, split));
    output.write(reply.subarray(split));
    await expect(response).resolves.toEqual({text: 'caf\u00e9'});
  });

  it('routes responses by ID and events by page session', async () => {
    const {cdp, output} = client();
    const one = cdp.send('One');
    const two = cdp.send('Two');
    const loaded = cdp.waitFor('Page.loadEventFired', 'page');
    output.write(
      '{"id":2,"result":{"n":2}}\0' +
        '{"method":"Page.loadEventFired","sessionId":"other","params":{"timestamp":1}}\0' +
        '{"id":1,"result":{"n":1}}\0' +
        '{"method":"Page.loadEventFired","sessionId":"page","params":{"timestamp":2}}\0'
    );
    await expect(one).resolves.toEqual({n: 1});
    await expect(two).resolves.toEqual({n: 2});
    await expect(loaded).resolves.toEqual({timestamp: 2});
  });

  it('surfaces protocol errors with the command name', async () => {
    const {cdp, output} = client();
    const response = cdp.send('Tracing.start');
    output.write('{"id":1,"error":{"message":"Unsupported config"}}\0');
    await expect(response).rejects.toThrow('Tracing.start: Unsupported config');
  });

  it('bounds waits instead of hanging on a missing response', async () => {
    vi.useFakeTimers();
    const {cdp} = client();
    const response = cdp.send('Runtime.evaluate');
    const assertion = expect(response).rejects.toThrow(
      'Timed out waiting for Runtime.evaluate'
    );
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(cdp.pending.size).toBe(0);
  });

  it('rejects all pending work and future commands on pipe failure', async () => {
    const {cdp, output} = client();
    const response = cdp.send('One');
    const event = cdp.waitFor('Tracing.tracingComplete');
    const assertions = [
      expect(response).rejects.toThrow(/JSON/),
      expect(event).rejects.toThrow(/JSON/),
    ];
    output.write('not JSON\0');
    await Promise.all(assertions);
    await expect(cdp.send('Two')).rejects.toThrow(/JSON/);
  });
});

describe('temporary profile cleanup', () => {
  afterEach(() => vi.mocked(rm).mockReset());

  it('retries transient filesystem failures and tolerates an absent profile', async () => {
    vi.mocked(rm).mockResolvedValueOnce(undefined);
    await cleanupProfile('/tmp/test-profile', undefined);
    expect(rm).toHaveBeenCalledWith('/tmp/test-profile', {
      recursive: true,
      force: true,
      maxRetries: 5,
    });
  });

  it('preserves the sampling failure when cleanup also fails', async () => {
    const sampleError = new Error('Pair 1 (before): Page returned HTTP 404.');
    const removalError = new Error('EBUSY: profile is still locked');
    vi.mocked(rm).mockRejectedValueOnce(removalError);
    await expect(
      cleanupProfile('/tmp/test-profile', sampleError)
    ).rejects.toMatchObject({
      message: `${sampleError.message}\nCould not remove temporary Chrome profile /tmp/test-profile: ${removalError.message}`,
      errors: [sampleError, removalError],
    });
  });

  it('surfaces failed cleanup rather than silently leaking a profile', async () => {
    const removalError = new Error('EPERM');
    vi.mocked(rm).mockRejectedValueOnce(removalError);
    await expect(
      cleanupProfile('/tmp/test-profile', undefined)
    ).rejects.toMatchObject({
      message:
        'Could not remove temporary Chrome profile /tmp/test-profile: EPERM',
      cause: removalError,
    });
  });
});

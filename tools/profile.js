import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir, mkdtemp, open, readFile, rm, writeFile} from 'node:fs/promises';
import {arch, platform, release, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {Cdp} from './profile-cdp.js';
import {renderHtmlReport} from './profile-html.js';
import {
  analyzeTrace,
  comparisonRows,
  printComparison,
  runOrder,
} from './profile-report.js';

const DEPTH_EVENTS = [
  'webgl:getBufferSubData',
  'webgl:getParameter',
  'webgl:clientWaitSync',
];
const HELP = `Usage: node tools/profile.js --chrome <executable> <before-url> <after-url> [options]

Compare two HTTP(S) pages in fresh, isolated Chrome profiles.
Requires Node.js 22+ and an installed Chrome/Chromium. No npm dependencies.

  --runs <n>          Number of pairs (default: 5; alternating AB, BA order)
  --duration <s>      Measurement window (default: 8)
  --warmup <s>        Warm-up after readiness (default: 3)
  --timeout <s>       Startup, readiness and CDP timeout (default: 30)
  --ready <expr>      JS readiness expression (default: document.readyState === "complete")
  --out <directory>   New output directory (default: .cache/xrblocks-profile-<timestamp>)
  --depth            Instrument getBufferSubData, getParameter and clientWaitSync
  --event <name>     Additional exact trace event name (repeatable, main thread only)
  --chrome-arg <arg> Extra Chrome flag (repeatable; use --chrome-arg=--flag)
  --help, -h         Show this help

Headed Chrome is the default. Use --chrome-arg=--headless=new for headless runs.
Chrome's default frame pacing is preserved; no numeric FPS cap is set.
For an uncapped throughput run, add --chrome-arg=--disable-frame-rate-limit.
Depth instrumentation adds overhead. rAF callbacks/s is not displayed FPS.
Raw traces can contain URLs and page data; keep results private.
Each completed comparison also writes a self-contained report.html beside summary.json.
See tools/README.md for metric definitions and an XR Blocks example.`;

export function parseOptions(args) {
  const {values, positionals} = parseArgs({
    args,
    allowPositionals: true,
    options: {
      chrome: {type: 'string'},
      runs: {type: 'string', default: '5'},
      duration: {type: 'string', default: '8'},
      warmup: {type: 'string', default: '3'},
      timeout: {type: 'string', default: '30'},
      ready: {type: 'string', default: 'document.readyState === "complete"'},
      out: {type: 'string'},
      depth: {type: 'boolean', default: false},
      event: {type: 'string', multiple: true, default: []},
      'chrome-arg': {type: 'string', multiple: true, default: []},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) return {help: true};
  if (!values.chrome?.trim()) throw new Error('--chrome is required.');
  if (positionals.length !== 2) {
    throw new Error('Supply exactly two URLs: before, then after.');
  }
  for (const url of positionals) {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) {
      throw new Error('Only HTTP(S) URLs are supported.');
    }
  }
  const numbers = Object.fromEntries(
    ['runs', 'duration', 'warmup', 'timeout'].map((name) => {
      const value = Number(values[name]);
      if (
        !values[name].trim() ||
        !Number.isFinite(value) ||
        (name === 'warmup' ? value < 0 : value <= 0)
      ) {
        throw new Error(`Invalid --${name}: ${values[name]}.`);
      }
      return [name, value];
    })
  );
  if (!Number.isSafeInteger(numbers.runs)) {
    throw new Error('--runs must be a positive integer.');
  }
  if (
    (numbers.duration + numbers.timeout) * 1000 > 2147483647 ||
    numbers.warmup * 1000 > 2147483647
  ) {
    throw new Error('Requested time exceeds the Node.js timer limit.');
  }
  if (!values.ready.trim() || values.event.some((name) => !name.trim())) {
    throw new Error('--ready and --event must not be empty.');
  }
  for (const arg of values['chrome-arg']) {
    if (
      !arg.startsWith('--') ||
      /^--(?:user-data-dir|profile-directory|remote-debugging[^=]*)(?:=|$)/.test(
        arg
      )
    ) {
      throw new Error(`Chrome flag would bypass profile isolation: ${arg}.`);
    }
  }
  return {
    chrome: values.chrome,
    before: positionals[0],
    after: positionals[1],
    runs: numbers.runs,
    durationMs: numbers.duration * 1000,
    warmupMs: numbers.warmup * 1000,
    timeoutMs: numbers.timeout * 1000,
    ready: values.ready,
    out: resolve(values.out ?? `.cache/xrblocks-profile-${Date.now()}`),
    depth: values.depth,
    eventNames: [
      ...new Set([...(values.depth ? DEPTH_EVENTS : []), ...values.event]),
    ],
    chromeArgs: values['chrome-arg'],
  };
}

// These functions are serialized into the page, so they must be self-contained.
function installPageProbe(key, depth) {
  if (window !== window.top) return;
  const state = {active: false, contexts: new Set()};
  Object.defineProperty(globalThis, key, {value: state});
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const context = original.apply(this, args);
    if (
      context &&
      ['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])
    ) {
      state.contexts.add(context);
    }
    return context;
  };
  if (!depth) return;
  for (const type of [
    globalThis.WebGLRenderingContext,
    globalThis.WebGL2RenderingContext,
  ]) {
    for (const method of [
      'getBufferSubData',
      'getParameter',
      'clientWaitSync',
    ]) {
      const native = type?.prototype[method];
      if (!native) continue;
      type.prototype[method] = function (...args) {
        if (!state.active) return native.apply(this, args);
        const start = performance.now();
        try {
          return native.apply(this, args);
        } finally {
          const name = `webgl:${method}`;
          // Use the same reduced-precision clock at both ends of the measure.
          performance.measure(name, {start, end: performance.now()});
          performance.clearMeasures(name);
        }
      };
    }
  }
}

function readRenderers(key) {
  return [...globalThis[key].contexts].map((gl) => {
    if (gl.isContextLost())
      throw new Error('A captured WebGL context was lost.');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl.getParameter(
        extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER
      ),
      vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
      unmasked: Boolean(extension),
    };
  });
}

function measurePage(key, prefix, durationMs) {
  return new Promise((resolve) => {
    const state = globalThis[key];
    let rafCallbacks = 0;
    let hidden = document.visibilityState !== 'visible';
    const onVisibility = () => {
      hidden ||= document.visibilityState !== 'visible';
    };
    document.addEventListener('visibilitychange', onVisibility);
    let frameId;
    const frame = () => {
      rafCallbacks++;
      frameId = requestAnimationFrame(frame);
    };
    performance.mark(`${prefix}:start`);
    state.active = true;
    frameId = requestAnimationFrame(frame);
    setTimeout(() => {
      state.active = false;
      cancelAnimationFrame(frameId);
      performance.mark(`${prefix}:end`);
      document.removeEventListener('visibilitychange', onVisibility);
      resolve({
        rafCallbacks,
        hidden,
        url: location.href,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        },
      });
    }, durationMs);
  });
}

async function saveTrace(cdp, completion, path) {
  if (!completion.stream)
    throw new Error('Chrome did not return a trace stream.');
  const file = await open(path, 'wx', 0o600);
  try {
    for (;;) {
      const chunk = await cdp.send('IO.read', {handle: completion.stream});
      await file.writeFile(
        chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data
      );
      if (chunk.eof) break;
    }
  } finally {
    await file.close();
  }
  await cdp.send('IO.close', {handle: completion.stream});
  if (completion.dataLossOccurred) {
    throw new Error(`Chrome lost trace data; partial trace saved to ${path}.`);
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function cleanupProfile(profile, sampleError) {
  try {
    await rm(profile, {recursive: true, force: true, maxRetries: 5});
  } catch (error) {
    const message = `Could not remove temporary Chrome profile ${profile}: ${error.message}`;
    if (sampleError) {
      throw new AggregateError(
        [sampleError, error],
        `${sampleError.message}\n${message}`
      );
    }
    throw new Error(message, {cause: error});
  }
}

async function sample(options, run, signal) {
  signal.throwIfAborted();
  const profile = await mkdtemp(join(tmpdir(), 'xrblocks-profile-'));
  const chromeArgs = [
    `--user-data-dir=${profile}`,
    '--remote-debugging-pipe',
    '--no-startup-window',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-background-networking',
    ...options.chromeArgs,
  ];
  const chrome = spawn(options.chrome, chromeArgs, {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => chrome.once('close', resolve));
  const cdp = new Cdp(chrome.stdio[3], chrome.stdio[4], options.timeoutMs);
  let stderr = '';
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (data) => {
    stderr = (stderr + data).slice(-8192);
  });
  chrome.on('error', (error) => cdp.fail(error));
  chrome.on('exit', (code, signal) =>
    cdp.fail(new Error(`Chrome exited (${signal ?? code}).`))
  );
  const abort = () => cdp.fail(signal.reason);
  signal.addEventListener('abort', abort, {once: true});
  let sampleError;

  try {
    const browser = await cdp.send('Browser.getVersion');
    const {targetId} = await cdp.send('Target.createTarget', {
      url: 'about:blank',
    });
    const {sessionId} = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    const evaluate = async (expression, timeoutMs = options.timeoutMs) => {
      const result = await cdp.send(
        'Runtime.evaluate',
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
        timeoutMs
      );
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text
        );
      }
      return result.result.value;
    };
    const pageErrors = [];
    const documents = new Map();
    cdp.onEvent = (method, params, source) => {
      if (source !== sessionId) return;
      if (method === 'Runtime.exceptionThrown') {
        pageErrors.push(
          params.exceptionDetails.exception?.description ??
            params.exceptionDetails.text
        );
      }
      if (method === 'Network.responseReceived' && params.type === 'Document') {
        documents.set(params.frameId, params.response.status);
      }
    };
    const checkErrors = () => {
      if (pageErrors.length) {
        throw new Error(`Page threw an exception:\n${pageErrors.join('\n')}`);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const key = `__xrblocksProfile_${randomUUID()}`;
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${installPageProbe})(${JSON.stringify(key)}, ${options.depth})`,
    });
    const [, navigation] = await Promise.all([
      cdp.waitFor('Page.loadEventFired', sessionId),
      send('Page.navigate', {url: options[run.side]}).then((result) => {
        if (result.errorText || result.isDownload) {
          throw new Error(
            `Navigation failed: ${result.errorText ?? 'download'}.`
          );
        }
        return result;
      }),
    ]);
    await send('Network.disable');
    const httpStatus = documents.get(navigation.frameId);
    if (httpStatus >= 400) throw new Error(`Page returned HTTP ${httpStatus}.`);
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      checkErrors();
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw new Error(`Readiness timed out: ${options.ready}`);
      if (
        await evaluate(
          `(async () => Boolean(await (${options.ready})))()`,
          remaining
        )
      )
        break;
      await delay(100, undefined, {signal});
    }
    await delay(options.warmupMs, undefined, {signal});
    checkErrors();
    const initialRenderers = await evaluate(
      `(${readRenderers})(${JSON.stringify(key)})`
    );
    const prefix = `xrblocks-profile:${randomUUID()}`;
    await cdp.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      streamFormat: 'json',
      traceConfig: {
        recordMode: 'recordUntilFull',
        includedCategories: [
          'toplevel',
          'blink.user_timing',
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
        ],
        excludedCategories: ['*'],
      },
    });
    const measured = await evaluate(
      `(${measurePage})(${JSON.stringify(key)}, ${JSON.stringify(prefix)}, ${options.durationMs})`,
      options.durationMs + options.timeoutMs
    );
    const [completion] = await Promise.all([
      cdp.waitFor('Tracing.tracingComplete'),
      cdp.send('Tracing.end'),
    ]);
    const traceFile = `${run.pair}-${run.side}.trace.json`;
    const trace = await saveTrace(
      cdp,
      completion,
      join(options.out, traceFile)
    );
    checkErrors();
    if (measured.hidden)
      throw new Error('Page became hidden during measurement.');
    const report = analyzeTrace(trace, prefix, options.eventNames);
    const renderers = await evaluate(
      `(${readRenderers})(${JSON.stringify(key)})`
    );
    const warnings = [...report.warnings];
    if (JSON.stringify(renderers) !== JSON.stringify(initialRenderers)) {
      warnings.push(
        'WebGL contexts changed during measurement; check readiness and warm-up.'
      );
    }
    if (!renderers.length || renderers.some((renderer) => !renderer.unmasked)) {
      warnings.push(
        'Actual WebGL renderer is unverified (no captured context or unmasked renderer).'
      );
    }
    if (
      renderers.some(({renderer}) =>
        /swiftshader|llvmpipe|software|basic render driver/i.test(renderer)
      )
    ) {
      warnings.push(
        'Software WebGL renderer detected; these are not hardware GPU results.'
      );
    }
    if (!measured.rafCallbacks)
      warnings.push('No animation-frame callbacks occurred.');
    return {
      ...run,
      browser,
      renderers,
      measured,
      httpStatus,
      durationMs: report.durationMs,
      metrics: {
        'Window (ms)': report.durationMs,
        'rAF callbacks/s': (measured.rafCallbacks * 1000) / report.durationMs,
        ...report.metrics,
      },
      traceFile,
      warnings,
    };
  } catch (error) {
    const failure = signal.aborted ? signal.reason : error;
    sampleError = new Error(
      `Pair ${run.pair} (${run.side}): ${failure.message}${stderr && !signal.aborted ? `\nChrome stderr:\n${stderr}` : ''}`,
      {cause: failure}
    );
    throw sampleError;
  } finally {
    signal.removeEventListener('abort', abort);
    cdp.fail(new Error('Closing profiler Chrome instance.'));
    if (chrome.exitCode === null && chrome.signalCode === null)
      chrome.kill('SIGTERM');
    const forceKill = setTimeout(() => chrome.kill('SIGKILL'), 5000);
    await closed;
    clearTimeout(forceKill);
    await cleanupProfile(profile, sampleError);
  }
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  await mkdir(dirname(options.out), {recursive: true});
  await mkdir(options.out, {mode: 0o700});
  console.log(`Saving local results to ${options.out}`);
  const environment = {
    node: process.version,
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    viewport: {width: 1280, height: 720, dpr: 1},
    startedAt: new Date().toISOString(),
  };
  await writeJson(join(options.out, 'run.json'), {options, environment});
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Profiling interrupted.'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const samples = [];
    for (const run of runOrder(options.runs)) {
      console.log(
        `Pair ${run.pair}/${options.runs}: ${run.side} ${options[run.side]}`
      );
      const result = await sample(options, run, controller.signal);
      await writeJson(
        join(options.out, `${run.pair}-${run.side}.json`),
        result
      );
      samples.push(result);
      for (const warning of result.warnings)
        console.warn(`Warning: ${warning}`);
      console.log(
        `Renderer: ${result.renderers.map((r) => r.renderer).join('; ') || 'unverified'}`
      );
    }
    const warnings = [...new Set(samples.flatMap((sample) => sample.warnings))];
    if (options.runs === 1)
      warnings.push('Only one pair; sample SD is unavailable.');
    const rendererSets = samples.map((s) =>
      JSON.stringify([...new Set(s.renderers.map((r) => r.renderer))].sort())
    );
    if (
      new Set(rendererSets).size > 1 ||
      new Set(samples.map((s) => s.browser.product)).size > 1
    ) {
      warnings.push(
        'Renderer or Chrome version changed between samples; the comparison is confounded.'
      );
    }
    for (const name of options.eventNames) {
      if (options.depth && DEPTH_EVENTS.includes(name)) continue;
      if (samples.every((s) => s.metrics[`${name} (calls)`] === 0)) {
        warnings.push(
          `"${name}" was never observed; zero does not prove no calls (check Chrome event names/categories).`
        );
      }
    }
    const rows = comparisonRows(samples);
    const summary = {
      options,
      environment,
      samples,
      rows,
      warnings,
    };
    await writeJson(join(options.out, 'summary.json'), summary);
    const reportPath = join(options.out, 'report.html');
    await writeFile(reportPath, renderHtmlReport(summary), {
      flag: 'wx',
      mode: 0o600,
    });
    printComparison(rows);
    for (const warning of warnings) console.warn(`Warning: ${warning}`);
    console.log(`HTML report: ${reportPath}`);
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

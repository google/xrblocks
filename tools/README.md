# Chrome profiling

`profile.js` compares two running HTTP(S) pages using Chrome's DevTools Protocol. It is a manual developer tool for investigations such as [#505](https://github.com/google/xrblocks/pull/505), not an SDK feature, an XR-device benchmark, or a CI performance gate. The runner works with ordinary web pages; the optional depth counters are specific to WebGL.

## Run a comparison

Use Node.js 22 or later and an installed Chrome or Chromium executable. The profiler and its sibling modules use only Node built-ins, so they do not require `npm install`. Building and serving the application being measured is separate.

Serve the before and after applications at separate URLs. From this checkout, run:

```sh
node tools/profile.js \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "http://127.0.0.1:8080/" \
  "http://127.0.0.1:8081/" \
  --runs 5 --warmup 3 --duration 8 \
  --out .cache/profile-comparison
```

On Linux, pass the installed executable path, such as `/usr/bin/google-chrome`. On Windows, pass the full path to `chrome.exe`. No browser is downloaded, and the profiler does not attach to your existing browser.

Each sample starts a fresh Chrome process with a temporary profile and a 1280 by 720 CSS-pixel viewport at device scale factor 1. The profiler waits for page load, then for `--ready`, then for the warm-up interval. The default readiness expression is `document.readyState === "complete"`; use an application-specific condition when scene loading or other initialization continues after page load.

Pairs alternate `before, after`, then `after, before`, and so on. This interleaves the variants and counterbalances order rather than running all baselines first. It reduces some drift and ordering effects but cannot eliminate thermal, power, scheduling, or background-work noise.

Chrome opens a window by default. For headless runs, add `--chrome-arg=--headless=new`. Additional Chrome flags are repeatable, for example `--chrome-arg=--force_high_performance_gpu`. That flag is only a platform-dependent hint; the recorded renderer string, not the launch flag, tells you which WebGL backend was observed. Profile and debugging overrides are rejected to preserve isolation.

## Frame pacing and FPS caps

By default, the profiler leaves Chrome's frame limiter and GPU vsync alone. Animation callbacks are typically paced by the display refresh rate, not a fixed 60 FPS cap imposed by this tool. Headless Chrome can use different pacing. If both variants already reach that limit, an optimization can increase main-thread headroom without increasing callback rate.

Use the default pacing for representative desktop behavior and headroom comparisons. For a separate uncapped throughput investigation, add these flags to the comparison command:

```sh
--chrome-arg=--disable-frame-rate-limit \
--chrome-arg=--disable-background-timer-throttling \
--chrome-arg=--disable-renderer-backgrounding
```

In [current Chromium](https://github.com/chromium/chromium/blob/main/components/viz/common/switches.cc), `--disable-frame-rate-limit` also implies `--disable-gpu-vsync`; the latter flag alone is not a substitute for removing the scheduler's frame limit. This does not guarantee an unlimited callback rate: application logic, the platform, and CPU/GPU throughput can still limit it. The profiler has no numeric `--fps` setting and does not override application-level render caps.

The other two flags disable background timer throttling and renderer-process backgrounding. They are benchmark controls, not guarantees against every kind of scheduling or window-occlusion throttling. Keep a headed profiling window visible and unminimized; the profiler still rejects a measurement if the document becomes hidden.

The same supplied flags are used for both variants and recorded in the output. Do not mix default-paced and uncapped samples in a comparison. An uncapped, faster variant may execute more frames and calls within the same window, so higher total call time or less idle time does not by itself indicate a regression. The reported callback rate remains a throughput proxy, not displayed FPS or an application render count.

Keep the display refresh rate, Chrome version, headed/headless mode, renderer, scene, viewport, and device scale factor comparable. Keep power and thermal conditions stable, avoid unrelated CPU/GPU-heavy work, and do not open DevTools on the measured page. Repeat overall throughput runs without `--depth`, since its per-call instrumentation changes the workload.

## XR Blocks depth example

Build each SDK revision and serve its checkout separately. For example, after the build, `npm run serve` serves a checkout on port 8080; `./node_modules/.bin/http-server --cors -c-1 -a 127.0.0.1 -p 8081` serves the other checkout on port 8081.

```sh
node tools/profile.js \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "http://127.0.0.1:8080/samples/advanced/portals/?xrAutomation=1&debug=1" \
  "http://127.0.0.1:8081/samples/advanced/portals/?xrAutomation=1&debug=1" \
  --ready 'window.xb?.core.simulatorRunning === true' \
  --warmup 5 --duration 8 --runs 5 \
  --depth \
  --out .cache/portals-depth
```

The current Portals sample imports its checkout's local SDK bundle. Older revisions may use `demos/portals/` instead. The two URLs do not need identical paths, but they should run the same scene, assets, settings, viewport, and workload. The profiler does not build revisions, rewrite importmaps, or drive camera movement.

`xrAutomation=1` starts the simulator; `debug=1` exposes `window.xb` and `window.xbReady`. See the [simulator manual](../docs/docs/manual/Simulator.mdx). Simulator startup is not proof that every application asset has finished loading. Increase warm-up or use a more specific readiness expression when needed.

`--depth` wraps `getBufferSubData`, `getParameter`, and `clientWaitSync` on the main document's WebGL prototypes. During the measurement window, it records User Timing measures named `webgl:getBufferSubData`, `webgl:getParameter`, and `webgl:clientWaitSync`. These measures are included in the raw trace and summarized as time and call counts.

This instrumentation is off by default. Wrapping calls, reading clocks, and emitting trace events add overhead, particularly for frequent short calls. Keep the flag identical for both variants and repeat the comparison without it when assessing overall performance. These measurements should not be treated as reproducing the historical numbers in #505.

## Read the results

The table reports the mean and sample standard deviation for each side and for the per-pair difference, `after - before`. The paired difference is calculated within each pair, not from the execution order. Standard deviation describes sample spread, not a confidence interval or statistical significance. A single pair has no sample standard deviation and prints `n/a`.

| Metric               | Meaning                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window (ms)          | Actual interval between the page's trace markers. A busy page can run longer than the requested duration.                                                                                                                                                               |
| rAF callbacks/s      | Rate of an added `requestAnimationFrame` observer. This is not the application's render count, presented FPS, or headset frame rate.                                                                                                                                    |
| Main-thread idle (%) | Fraction of the marked interval not covered by renderer-main-thread `RunTask` or `ThreadControllerImpl::RunTask` spans. Overlapping spans are unioned. A blocking task counts as busy even while waiting for the GPU. Missing task events produce `n/a`, not 100% idle. |
| Event (ms)           | Wall time covered by matching duration spans on the marked thread, clipped to the measured interval and unioned to avoid double counting. This is not GPU execution time or CPU utilization.                                                                            |
| Event (calls)        | Number of matching duration spans that start inside the interval, including zero-duration User Timing measures. These only correspond to API calls for the instrumented depth events.                                                                                   |

For idle percentages, the paired delta is in percentage points. Other deltas retain the row's units. Event totals cover the actual window, so inspect window lengths before comparing totals. The depth timers use the page's reduced-precision `performance.now()` clock; very short calls can have zero recorded duration.

Use `--event Layout`, or repeat `--event` with other exact duration-event names, to inspect additional work. Captured categories are `toplevel`, `blink.user_timing`, `devtools.timeline`, and `disabled-by-default-devtools.timeline`. Event names and availability vary by Chrome version. An arbitrary event that never appears generates a warning; zero does not prove that the corresponding work never happened.

The output directory must not already exist. By default it is created under the git-ignored `.cache/` directory. Results include:

| File                       | Contents                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `run.json`                 | Input URLs, options, requested viewport, Node version, and OS metadata.                                                            |
| `<pair>-<side>.trace.json` | Raw Chrome trace, including the measurement markers. Load it locally in Chrome's trace viewer or DevTools Performance panel.       |
| `<pair>-<side>.json`       | That sample's Chrome version, observed renderers, actual URL and viewport, metrics, warnings, and trace filename.                  |
| `summary.json`             | Completed samples, aggregate statistics, and comparison warnings. Written only after every sample succeeds.                        |
| `report.html`              | Self-contained comparison tables, mean bar charts, warnings, run settings, and relative links to each sample's trace and metadata. |

Every completed comparison generates `report.html` automatically and prints its path. Open that file directly in a browser; no web server, JavaScript, package install, or external assets are needed. The report automatically follows your system's light or dark color preference. Frame-limiter flags, headed/headless mode, and depth instrumentation are shown prominently. Charts use a separate zero-based scale for each metric and show means, not confidence intervals or pass/fail judgments.

Keep the report beside the JSON and trace files so its relative links continue to work. The report contains the same URLs and environment details as the summary, so treat it as private too.

HTTP errors, uncaught page exceptions, timeouts, hidden pages, lost WebGL contexts, invalid measurement markers, and reported trace data loss fail the run rather than producing a successful comparison. Already saved files remain available for diagnosis. Ctrl+C stops the run and cleans up the profiler's own browser and temporary profile.

Temporary-profile removal retries transient filesystem failures. If cleanup still fails, the command reports the profile path and any original sampling error; it does not silently leave the profile behind or report a completed comparison.

## Limits and privacy

The renderer probe observes WebGL contexts obtained through the main document's HTML canvases. It does not identify WebGPU, worker or offscreen contexts, or iframe renderers. Missing unmasked renderer information is reported as unverified. SwiftShader and other recognizable software renderers produce warnings, as do differing renderer sets or Chrome versions across samples.

Fresh profiles intentionally exclude your cookies, logins, extensions, service workers, and disk cache. Caches can still warm within a sample. CDN resources, random scenes, adaptive quality, lazy loading, and non-reproducible camera paths can make the inputs differ. Keep Chrome version, launch flags, power conditions, background load, and readiness comparable; repeat the entire experiment before drawing conclusions.

Tracing itself affects performance. Headless and headed behavior can differ. This tool measures one desktop page's renderer thread, not end-to-end GPU performance or real WebXR-device behavior. It does not set automatic pass/fail performance thresholds.

Trace files and metadata can contain URLs, query parameters, resource names, and page data. Avoid API keys or credentials in profiling URLs, keep output private, and inspect it before sharing. The profiler writes files locally and never uploads them; the pages it visits still make their normal network requests.

import {formatStats} from './profile-report.js';

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ENTITIES[character]);
}

function formatValue(value) {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function artifactLink(file, label, className = '') {
  return `<a class="${escapeHtml(className)}" href="./${escapeHtml(encodeURIComponent(file))}" download>${escapeHtml(label)}</a>`;
}

function renderChart(row, index) {
  const maximum = Math.max(row.before?.mean ?? 0, row.after?.mean ?? 0) || 1;
  const bars = [
    ['Before', 'before', row.before],
    ['After', 'after', row.after],
  ].map(([label, className, stats]) => {
    const width = stats ? Math.round((stats.mean / maximum) * 10000) / 100 : 0;
    return `<div class="bar-row">
      <span>${label}</span>
      <div class="track" aria-hidden="true">${stats ? `<div class="bar ${className}" style="width:${width}%"></div>` : ''}</div>
      <span class="value">${formatValue(stats?.mean)}</span>
    </div>`;
  });
  return `<article class="chart" aria-labelledby="chart-${index}">
    <h3 id="chart-${index}">${escapeHtml(row.metric)}</h3>
    ${bars.join('\n')}
  </article>`;
}

function renderSample(sample) {
  const renderer =
    sample.renderers
      .map((value) => `${value.renderer}${value.unmasked ? '' : ' (masked)'}`)
      .join('; ') || 'unverified';
  const warnings = sample.warnings.length
    ? `<details><summary>Warnings (${sample.warnings.length})</summary><ul>${sample.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></details>`
    : '';
  return `<tr>
    <th scope="row">Pair ${escapeHtml(sample.pair)} / ${escapeHtml(sample.side)}
      <small class="url">${escapeHtml(sample.measured.url)}</small>
    </th>
    <td class="numeric">${formatValue(sample.durationMs)}</td>
    <td class="numeric">${formatValue(sample.metrics['rAF callbacks/s'])}</td>
    <td class="numeric">${formatValue(sample.metrics['Main-thread idle (%)'])}</td>
    <td>${escapeHtml(renderer)}<small>${escapeHtml(sample.browser.product)}</small></td>
    <td class="artifacts">
      ${artifactLink(sample.traceFile, 'Trace', 'trace')}
      ${artifactLink(`${sample.pair}-${sample.side}.json`, 'Sample JSON')}
      ${warnings}
    </td>
  </tr>`;
}

export function renderHtmlReport({
  options,
  environment,
  samples,
  rows,
  warnings,
}) {
  const hasFlag = (name) =>
    options.chromeArgs.some((argument) => argument.split('=')[0] === name);
  const pacing = hasFlag('--disable-frame-rate-limit')
    ? 'Frame limiter disabled (requested)'
    : 'Chrome frame limiter unchanged';
  const comparison = rows
    .map(
      (row) => `<tr>
    <th scope="row">${escapeHtml(row.metric)}</th>
    <td class="numeric">${escapeHtml(formatStats(row.before))}</td>
    <td class="numeric">${escapeHtml(formatStats(row.after))}</td>
    <td class="numeric">${escapeHtml(formatStats(row.delta))}</td>
  </tr>`
    )
    .join('\n');
  const warningSection = warnings.length
    ? `<section id="warnings" class="warning" aria-labelledby="warning-title">
        <h2 id="warning-title">Run warnings</h2>
        <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
      </section>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>XR Blocks Chrome profile</title>
  <style>
    :root {
      color-scheme: light dark;
      --text: #182133;
      --page: #f4f6fb;
      --surface: #ffffff;
      --muted: #536179;
      --link: #244db1;
      --focus: #2563eb;
      --border: #dce3ee;
      --divider: #e7ebf3;
      --header: #eaf0f9;
      --track: #edf0f6;
      --before: #2563eb;
      --after: #7c3aed;
      --warning-border: #e5c77d;
      --warning-bg: #fff7df;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--page);
      line-height: 1.55;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --text: #e6edf3;
        --page: #0d1117;
        --surface: #161b22;
        --muted: #9da9b7;
        --link: #91bfff;
        --focus: #8db8ff;
        --border: #303b4c;
        --divider: #263244;
        --header: #202c3d;
        --track: #293549;
        --before: #60a5fa;
        --after: #a78bfa;
        --warning-border: #79652c;
        --warning-bg: #302810;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 40px 24px; }
    main { max-width: 1160px; margin: auto; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 36px; letter-spacing: -1px; margin-bottom: 8px; }
    h2 { font-size: 21px; margin-bottom: 10px; }
    h3 { font-size: 15px; margin-bottom: 18px; overflow-wrap: anywhere; }
    header, section { margin-bottom: 28px; }
    header { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    .eyebrow { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 2px; }
    .muted, small { color: var(--muted); }
    small { display: block; margin-top: 6px; font-weight: 400; }
    a { color: var(--link); text-underline-offset: 3px; }
    a:focus-visible, summary:focus-visible, [tabindex]:focus-visible {
      outline: 3px solid var(--focus); outline-offset: 4px;
    }
    .downloads, .badges { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .button, .badge { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
    .button { font-size: 14px; font-weight: 600; text-decoration: none; }
    .badge { font-size: 13px; }
    .badges { margin-bottom: 20px; }
    .sources, .charts { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
    .source, .chart, .note, #settings {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px;
    }
    .source h2 { font-size: 14px; }
    .source p { margin-bottom: 0; }
    .url { overflow-wrap: anywhere; white-space: normal; }
    code, pre, .numeric, .value { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    code { font-size: 13px; }
    .warning { border: 1px solid var(--warning-border); background: var(--warning-bg); border-radius: 12px; padding: 20px; }
    .warning h2 { font-size: 17px; }
    .warning ul, .warning li:last-child { margin-bottom: 0; }
    li { margin-bottom: 6px; overflow-wrap: anywhere; }
    .note { font-size: 14px; color: var(--muted); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 14px 16px; text-align: left; vertical-align: top; }
    thead { background: var(--header); }
    tbody tr + tr { border-top: 1px solid var(--divider); }
    tbody th { font-weight: 500; min-width: 190px; overflow-wrap: anywhere; }
    .numeric { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .chart { min-width: 0; }
    .bar-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 72px; gap: 10px; align-items: center; font-size: 12px; margin: 10px 0; }
    .track { background: var(--track); height: 12px; border-radius: 3px; overflow: hidden; }
    .bar { height: 100%; }
    .before { background: var(--before); }
    .after { background: var(--after); }
    .value { text-align: right; }
    .artifacts { min-width: 140px; }
    .artifacts a { display: block; margin-bottom: 6px; }
    #samples td { min-width: 120px; }
    #samples th { max-width: 280px; }
    details { margin-top: 12px; }
    summary { cursor: pointer; font-weight: 600; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 420px; overflow: auto; font-size: 12px; }
    footer { color: var(--muted); font-size: 13px; }
    @media (max-width: 600px) {
      body { padding: 24px 12px; }
      h1 { font-size: 28px; }
    }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <p class="eyebrow">XR BLOCKS / LOCAL PROFILER</p>
      <h1>Before / after profile</h1>
      <p class="muted">${escapeHtml(environment.startedAt)} &middot; ${escapeHtml(environment.platform)} / ${escapeHtml(environment.arch)}</p>
    </div>
    <nav class="downloads" aria-label="Report files">
      ${artifactLink('summary.json', 'Summary JSON', 'button')}
      ${artifactLink('run.json', 'Run settings', 'button')}
    </nav>
  </header>

  <div class="badges" aria-label="Measurement configuration">
    <span class="badge">${escapeHtml(options.runs)} ${options.runs === 1 ? 'pair' : 'pairs'} / ${samples.length} samples</span>
    <span class="badge">${pacing}</span>
    <span class="badge">${hasFlag('--headless') ? 'Headless' : 'Headed'}</span>
    <span class="badge">Depth instrumentation ${options.depth ? 'on' : 'off'}</span>
  </div>
  <section class="sources" aria-label="Compared pages">
    <article class="source"><h2>Before</h2><p class="url"><code>${escapeHtml(options.before)}</code></p></article>
    <article class="source"><h2>After</h2><p class="url"><code>${escapeHtml(options.after)}</code></p></article>
  </section>
  ${warningSection}
  <p class="note">rAF callbacks are not displayed FPS, and main-thread wall time is not GPU execution time.
    No numeric FPS cap is imposed by the profiler. Uncapped runs can do more work per window.
    Depth instrumentation adds overhead; compare the same flags and workloads.</p>

  <section aria-labelledby="comparison-title">
    <h2 id="comparison-title">Comparison</h2>
    <p class="muted">Mean +/- sample standard deviation. Paired deltas use each matched pair, in the row's units
      (percentage points for idle). These are not confidence intervals or pass/fail verdicts. Missing data is n/a, not zero.</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Comparison statistics">
      <table id="comparison">
        <thead><tr><th scope="col">Metric</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Paired delta (after - before)</th></tr></thead>
        <tbody>${comparison}</tbody>
      </table>
    </div>
  </section>
  <section aria-labelledby="charts-title">
    <h2 id="charts-title">Means at a glance</h2>
    <p class="muted">Each chart has its own scale starting at zero. Bars show means only; see the table for sample spread.
      Bar lengths are not comparable across different metrics.</p>
    <div class="charts">${rows.map(renderChart).join('\n')}</div>
  </section>
  <section aria-labelledby="samples-title">
    <h2 id="samples-title">Individual samples</h2>
    <p class="muted">Actual execution order, observed renderer and Chrome version. Raw traces and sample metadata stay beside this report.</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Individual sample results">
      <table id="samples">
        <thead><tr><th scope="col">Run / final URL</th><th scope="col">Window (ms)</th><th scope="col">rAF callbacks/s</th><th scope="col">Idle (%)</th><th scope="col">Renderer</th><th scope="col">Files</th></tr></thead>
        <tbody>${samples.map(renderSample).join('\n')}</tbody>
      </table>
    </div>
  </section>
  <section id="settings" aria-labelledby="settings-title">
    <h2 id="settings-title">Run configuration</h2>
    <p class="muted">Requested timing, viewport, readiness expression and exact Chrome flags, plus the recorded host environment.</p>
    <details><summary>Show configuration</summary><pre tabindex="0">${escapeHtml(JSON.stringify({options, environment}, null, 2))}</pre></details>
  </section>
  <footer>Generated locally. No JavaScript, external assets or server required.
    This report contains URLs and environment details; treat it as private, just like the JSON and raw traces.
    Keep the files together to preserve the relative download links.</footer>
</main>
</body>
</html>
`;
}

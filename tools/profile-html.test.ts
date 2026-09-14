// @vitest-environment jsdom

import {describe, expect, it} from 'vitest';
import {renderHtmlReport} from './profile-html.js';
import {comparisonRows, runOrder} from './profile-report.js';

function makeSummary() {
  const chromeArgs: string[] = [];
  const warnings: string[] = [];
  const samples = runOrder(2).map(({pair, side}) => {
    const metrics: Record<string, number | null> = {
      'Window (ms)': 1000,
      'rAF callbacks/s': side === 'before' ? 60 : 65,
      'Main-thread idle (%)': side === 'before' ? 70 : 80,
      'Readback (ms)': side === 'before' ? 20 : 10,
    };
    return {
      pair,
      side,
      browser: {product: 'Chrome/152.0'},
      renderers: [
        {renderer: 'ANGLE (Test GPU)', vendor: 'Test', unmasked: true},
      ],
      measured: {
        url: `http://127.0.0.1/${side}`,
        viewport: {width: 1280, height: 720, dpr: 1},
      },
      durationMs: 1000,
      metrics,
      traceFile: `${pair}-${side}.trace.json`,
      warnings: [],
    };
  });
  return {
    options: {
      chrome: '/path/to/chrome',
      before: 'http://127.0.0.1:8080/?a=1&b=2',
      after: 'http://127.0.0.1:8081/',
      runs: 2,
      warmupMs: 3000,
      durationMs: 1000,
      ready: 'document.readyState === "complete"',
      chromeArgs,
      depth: false,
    },
    environment: {
      startedAt: '2026-09-12T12:00:00.000Z',
      platform: 'darwin',
      arch: 'arm64',
      osRelease: '25.0',
      node: 'v22.0.0',
      viewport: {width: 1280, height: 720, dpr: 1},
    },
    samples,
    rows: comparisonRows(samples),
    warnings,
  };
}

const readReport = (summary = makeSummary()) =>
  new DOMParser().parseFromString(renderHtmlReport(summary), 'text/html');

describe('static HTML profile report', () => {
  it('renders the existing comparison statistics and per-metric charts', () => {
    const summary = makeSummary();
    const original = structuredClone(summary);
    const page = readReport(summary);
    const rows = [...page.querySelectorAll('#comparison tbody tr')];
    expect(rows).toHaveLength(summary.rows.length);
    const readback = rows.find(
      (row) => row.querySelector('th')?.textContent === 'Readback (ms)'
    );
    expect(readback?.textContent).toContain('20.00 +/- 0.00');
    expect(readback?.textContent).toContain('10.00 +/- 0.00');
    expect(readback?.textContent).toContain('-10.00 +/- 0.00');
    expect(page.querySelectorAll('.chart')).toHaveLength(summary.rows.length);
    expect(page.querySelector('.chart h3')?.textContent).toBe('Window (ms)');
    expect(page.body.textContent).toContain('not displayed FPS');
    expect(page.body.textContent).toContain('not confidence intervals');
    expect(summary).toEqual(original);
  });

  it('includes local trace and JSON links in the actual sample order', () => {
    const page = readReport();
    expect(page.querySelector('a[href="./summary.json"]')).not.toBeNull();
    expect(page.querySelector('a[href="./run.json"]')).not.toBeNull();
    const links = [...page.querySelectorAll('#samples a.trace')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      './1-before.trace.json',
      './1-after.trace.json',
      './2-after.trace.json',
      './2-before.trace.json',
    ]);
    expect(page.querySelector('a[href="./2-before.json"]')).not.toBeNull();
  });

  it('makes frame pacing, instrumentation and run settings visible', () => {
    const summary = makeSummary();
    summary.options.chromeArgs = [
      '--headless=new',
      '--disable-frame-rate-limit',
      '--disable-renderer-backgrounding',
    ];
    summary.options.depth = true;
    const page = readReport(summary);
    expect(page.body.textContent).toContain(
      'Frame limiter disabled (requested)'
    );
    expect(page.body.textContent).toContain('Headless');
    expect(page.body.textContent).toContain('Depth instrumentation on');
    expect(page.body.textContent).toContain('Chrome/152.0');
    expect(page.body.textContent).toContain('ANGLE (Test GPU)');
    expect(page.querySelector('#settings pre')?.textContent).toContain(
      '--disable-renderer-backgrounding'
    );
    expect(readReport().body.textContent).toContain(
      'Chrome frame limiter unchanged'
    );
  });

  it('shows warnings prominently without assigning a pass/fail verdict', () => {
    const summary = makeSummary();
    summary.warnings = [
      'Software WebGL renderer detected.',
      'Only one pair; sample SD is unavailable.',
    ];
    const page = readReport(summary);
    expect(page.querySelectorAll('#warnings li')).toHaveLength(2);
    expect(page.querySelector('#warnings')?.textContent).toContain(
      'Software WebGL'
    );
  });

  it('keeps missing data, zero means and single-sample SD distinct', () => {
    const summary = makeSummary();
    summary.options.runs = 1;
    summary.samples = summary.samples.slice(0, 2);
    for (const sample of summary.samples) {
      sample.metrics = {'Zero (ms)': 0, 'Unknown (%)': null};
      sample.renderers = [];
    }
    summary.rows = comparisonRows(summary.samples);
    const page = readReport(summary);
    const rows = page.querySelectorAll('#comparison tbody tr');
    expect(rows[0].textContent).toContain('0.00 +/- n/a');
    expect(rows[1].querySelector('td')?.textContent).toBe('n/a');
    expect(page.body.textContent).toContain('unverified');
    expect(page.querySelectorAll('.chart .bar')).toHaveLength(2);
    for (const bar of page.querySelectorAll<HTMLElement>('.bar')) {
      expect(bar.style.width).toBe('0%');
    }
    expect(page.documentElement.outerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('escapes metadata, URLs, metric names and warnings as text', () => {
    const summary = makeSummary();
    const payload = `"</td><img src="https://example.invalid/pixel" onerror="alert(1)"><script>alert('x')</script>`;
    summary.options.before = `https://example.invalid/?q=${payload}`;
    summary.options.ready = payload;
    summary.options.chromeArgs = [`--custom=${payload}`];
    summary.warnings = [payload];
    summary.rows[0].metric = payload;
    summary.samples[0].browser.product = payload;
    summary.samples[0].renderers[0].renderer = payload;
    summary.samples[0].traceFile = `javascript:${payload}`;
    const page = readReport(summary);
    expect(
      page.querySelectorAll('script, img, iframe, form, base')
    ).toHaveLength(0);
    expect(page.body.textContent).toContain(payload);
    expect(page.querySelector('a.trace')?.getAttribute('href')).toBe(
      `./${encodeURIComponent(summary.samples[0].traceFile)}`
    );
    for (const link of page.querySelectorAll('a')) {
      expect(link.getAttribute('href')).toMatch(/^\.\//);
      expect(link.getAttribute('onclick')).toBeNull();
    }
  });

  it('is self-contained, script-free and usable without a web server', () => {
    const html = renderHtmlReport(makeSummary());
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(html).toMatch(/^<!doctype html>/i);
    expect(page.documentElement.lang).toBe('en');
    expect(page.querySelector('meta[name="viewport"]')).not.toBeNull();
    expect(page.querySelectorAll('script, link, [src]')).toHaveLength(0);
    expect(page.querySelector('style')?.textContent).not.toMatch(
      /@import|url\s*\(/i
    );
    const policy = page.querySelector(
      'meta[http-equiv="Content-Security-Policy"]'
    );
    expect(policy?.getAttribute('content')).toContain("default-src 'none'");
    expect(policy?.getAttribute('content')).toContain("base-uri 'none'");
    expect(page.querySelector('#settings details')).not.toBeNull();
  });

  it('provides light and dark palettes for every theme color without scripts', () => {
    const page = readReport();
    const css = page.querySelector('style')?.textContent ?? '';
    expect(css).toContain('color-scheme: light dark');
    const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
    expect(dark).toBeDefined();
    const colors = [...css.matchAll(/var\((--[\w-]+)\)/g)].map(
      (match) => match[1]
    );
    expect(colors.length).toBeGreaterThan(0);
    for (const color of new Set(colors)) {
      const declaration = new RegExp(`${color}: #[0-9a-f]{6};`);
      expect(light).toMatch(declaration);
      expect(dark).toMatch(declaration);
    }
    expect(page.querySelectorAll('script')).toHaveLength(0);
  });
});

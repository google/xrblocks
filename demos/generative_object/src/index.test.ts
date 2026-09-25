// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const html = readFileSync('demos/generative_object/index.html', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};

function importMap(): Record<string, string> {
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  return (JSON.parse(match![1]) as {imports: Record<string, string>}).imports;
}

interface StubWindow {
  location: {href: string};
  history: {state: null; replaceState(state: null, title: '', url: URL): void};
  generativeObjectUrlKey?: string | null;
}

/** Runs the page's inline key-stripping script against a stub window. */
function runKeyStripping(search: string) {
  const replaced: string[] = [];
  const stub: StubWindow = {
    location: {href: `https://example.test/demos/generative_object/${search}`},
    history: {
      state: null,
      replaceState: (_state, _title, url) => replaced.push(url.href),
    },
  };
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  new Function('window', script)(stub);
  return {key: stub.generativeObjectUrlKey, replaced};
}

describe('generative object page', () => {
  it('sends only the origin as referrer, so website-restricted keys work', () => {
    expect(html).toContain('<meta name="referrer" content="strict-origin" />');
  });

  it('strips legacy key parameters before any resource loads', () => {
    const strip = html.indexOf('<script>');
    expect(strip).toBeGreaterThan(html.indexOf('<meta name="referrer"'));
    expect(strip).toBeLessThan(html.indexOf('<link'));
    expect(strip).toBeLessThan(html.indexOf('<script type="importmap">'));
  });

  it('hands a legacy ?key= to startup and removes it from the address bar', () => {
    const page = runKeyStripping('?key=url-fixture&geminiKey=other&view=1');
    expect(page.key).toBe('url-fixture');
    expect(page.replaced).toEqual([
      'https://example.test/demos/generative_object/?view=1',
    ]);
  });

  it('also accepts ?geminiKey=', () => {
    const page = runKeyStripping('?geminiKey=gemini-fixture');
    expect(page.key).toBe('gemini-fixture');
    expect(page.replaced).toEqual([
      'https://example.test/demos/generative_object/',
    ]);
  });

  it('leaves the address alone without a key', () => {
    const page = runKeyStripping('?view=1');
    expect(page.key).toBeNull();
    expect(page.replaced).toEqual([]);
  });

  it('loads the three.js version the SDK is built against', () => {
    const three = packageJson.peerDependencies.three.replace(/^\^/, '');
    const imports = importMap();
    for (const name of ['three', 'three/', 'three/addons/']) {
      expect(imports[name]).toContain(`three@${three}/`);
    }
  });

  it('pins the Gemini client to the version the SDK is built against', () => {
    const genai = packageJson.devDependencies['@google/genai'].replace(
      /^\^/,
      ''
    );
    expect(importMap()['@google/genai']).toContain(`@google/genai@${genai}/`);
  });
});

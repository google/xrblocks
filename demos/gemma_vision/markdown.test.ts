// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
import {markdownText} from './markdown.js';

afterEach(() => vi.unstubAllGlobals());

describe('Gemma vision Markdown display text', () => {
  it('separates uppercase headings without changing code or URL case', () => {
    expect(
      markdownText(
        '# Hello *world*\n\nFirst paragraph.\n\n## Use `getValue()` at https://Example.com/Path\n\nLast paragraph.'
      )
    ).toBe(
      'HELLO WORLD\n\nFirst paragraph.\n\nUSE getValue() AT https://Example.com/Path\n\nLast paragraph.'
    );
  });

  it('projects nested emphasis and escaped delimiters', () => {
    expect(
      markdownText(
        '**Strong and *nested***, __bold__, _soft_, and ~~old~~. \\*literal\\*'
      )
    ).toBe('Strong and nested, bold, soft, and old. *literal*');
  });

  it('formats nested lists with ordered starts and hanging indentation', () => {
    expect(
      markdownText('- Parent\n  3. Third\n     - Deep\n  4. Fourth\n- Last')
    ).toBe('• Parent\n  3) Third\n     • Deep\n  4) Fourth\n• Last');
    expect(
      markdownText('- First line\n  continuation\n\n  Paragraph two.\n- Next')
    ).toBe('• First line\n  continuation\n  Paragraph two.\n• Next');
  });

  it.each(['```js', '~~~js'])('preserves literal %s fenced code', (fence) => {
    const code =
      'const value = `Hi ${name}`;\nconst power = 2 ** 3;\n// # Title, [x](url)';
    expect(markdownText(`${fence}\n${code}\n${fence.slice(0, 3)}`)).toBe(
      `Code (js)\n${code
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')}`
    );
  });

  it('preserves code indentation and internal blank lines', () => {
    expect(markdownText('```\nif (ready) {\n  run();\n\n}\n```')).toBe(
      'Code\n    if (ready) {\n      run();\n    \n    }'
    );
  });

  it('preserves inline code and decodes lexer escaping exactly once', () => {
    expect(
      markdownText(
        'Use `2 ** 3`, `[x](url)`, `` `Hi ${name}` ``, and `a < b && value === "&amp;"`.'
      )
    ).toBe(
      'Use 2 ** 3, [x](url), `Hi ${name}`, and a < b && value === "&amp;".'
    );
    expect(markdownText('`<img src=x onerror=alert(1)>`')).toBe(
      '<img src=x onerror=alert(1)>'
    );
  });

  it('renders link labels and image alternatives with no network or DOM use', () => {
    const fetch = vi.fn();
    const Image = vi.fn();
    const createElement = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('Image', Image);
    vi.stubGlobal('document', {createElement});
    expect(
      markdownText(
        '[**Docs**](https://Example.com/private) and ![Small `image.png`](https://example.com/tracker.png).'
      )
    ).toBe('Docs and Small image.png.');
    expect(fetch).not.toHaveBeenCalled();
    expect(Image).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('leaves bare URLs as inert case-sensitive text', () => {
    expect(
      markdownText(
        '## Visit <https://Example.com/Path?a=One&b=Two>\n\nhttps://Example.com/a_b?q=One-Two.'
      )
    ).toBe(
      'VISIT https://Example.com/Path?a=One&b=Two\n\nhttps://Example.com/a_b?q=One-Two.'
    );
    expect(
      markdownText('## [https://Example.com/Path](https://Example.com/Path)')
    ).toBe('https://Example.com/Path');
  });

  it('formats references, blockquotes and line breaks', () => {
    expect(
      markdownText(
        '> Read [guide][ref].\n>\n> Next  \n> line.\n\n[ref]: https://example.com'
      )
    ).toBe('│ Read guide.\n│ \n│ Next\n│ line.');
  });

  it('strips raw HTML and never emits an unsafe link destination', () => {
    expect(
      markdownText(
        '<script>alert("bad")</script>\n\n<img src=x onerror=alert(1)>\n\n[Safe **label**](javascript:alert(1)) and <b>plain</b>.'
      )
    ).toBe('Safe label and plain.');
  });

  it('projects tables into readable text', () => {
    expect(
      markdownText('| Text | English |\n| --- | --- |\n| 出口 | Exit |')
    ).toBe('Text | English\n出口 | Exit');
  });

  it.each([
    ['', ''],
    ['#', ''],
    ['## ', ''],
    ['## Par', 'PAR'],
    ['**', ''],
    ['***', ''],
    ['**Par', 'Par'],
    ['**Par*', 'Par'],
    ['_Par', 'Par'],
    ['Hello **', 'Hello'],
    ['Hello **bold', 'Hello bold'],
    ['Hello *soft', 'Hello soft'],
    ['`', ''],
    ['Use `value', 'Use value'],
    ['Use `2 ** 3', 'Use 2 ** 3'],
    ['Use `const s = "**Hi**"; <b>x</b>', 'Use const s = "**Hi**"; <b>x</b>'],
    ['```', ''],
    ['```j', ''],
    ['```js\n', ''],
    ['```ts\nconst n = 2 ** 3;', 'Code (ts)\n    const n = 2 ** 3;'],
    ['[', ''],
    ['[Par', 'Par'],
    ['[Par]', 'Par'],
    ['[Par](', 'Par'],
    ['[Par](https://Example.com/Pa', 'Par'],
    ['[**Par**](https://Example.com/Pa', 'Par'],
    ['See [Par', 'See Par'],
    ['![Par](https://Example.com/Pa', 'Par'],
    ['-', ''],
    ['- ', ''],
    ['1.', ''],
    ['1. ', ''],
    ['**東京', '東京'],
    ['[café 🚉](https://exam', 'café 🚉'],
  ])('cleans incomplete streaming fragment %j', (source, expected) => {
    expect(markdownText(source)).toBe(expected);
  });

  it.each([
    'Plain text.\nA second line.\n\nA new paragraph.',
    '東京駅 — 出口\ncafé déjà vu • Straße\nمرحبا بالعالم\n🚉 你好',
    'A well-known, on-device SDK costs -5; 2 * 3 = 6 and 2 ** 3 = 8.',
    'snake_case and foo_bar_baz; x_y; a_b.',
    'https://Example.com/a_b?name=One-Two&value=2*3',
    'The array[0] holds values [1, 2].',
    'A #hashtag is not a heading; C# is a language.',
  ])('preserves ordinary prose and OCR %j', (source) => {
    expect(markdownText(source)).toBe(source);
  });
});

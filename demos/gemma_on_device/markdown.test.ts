// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {markdownText} from './markdown.js';

describe('Gemma Markdown display text', () => {
  it('separates and uppercases headings without changing code or URL case', () => {
    expect(
      markdownText(
        '# Hello *world*\n\nFirst paragraph.\n\n## Use `getValue()` at https://Example.com/Path\n\nLast paragraph.'
      )
    ).toBe(
      'HELLO WORLD\n\nFirst paragraph.\n\nUSE getValue() AT https://Example.com/Path\n\nLast paragraph.'
    );
  });

  it('uses real lexer rules for nested emphasis and escaped delimiters', () => {
    expect(
      markdownText(
        '**Strong and *nested***, __bold__, _soft_, and ~~old~~. \\*literal\\*'
      )
    ).toBe('Strong and nested, bold, soft, and old. *literal*');
  });

  it.each(['**', '*', '~~'])(
    'preserves %s prose casing, code and URLs',
    (delimiter) => {
      expect(
        markdownText(
          `Before ${delimiter}Use \`getValue()\` at https://Example.com/Path or [https://Example.com/Other](https://Example.com/Other)${delimiter} after.`
        )
      ).toBe(
        'Before Use getValue() at https://Example.com/Path or https://Example.com/Other after.'
      );
    }
  );

  it('formats nested mixed lists with hanging indentation and ordered starts', () => {
    expect(
      markdownText('- Parent\n  3. Third\n     - Deep\n  4. Fourth\n- Last')
    ).toBe('• Parent\n  3) Third\n     • Deep\n  4) Fourth\n• Last');
  });

  it('keeps list continuations and paragraphs readable', () => {
    expect(
      markdownText('- First line\n  continuation\n\n  Paragraph two.\n- Next')
    ).toBe('• First line\n  continuation\n  Paragraph two.\n• Next');
  });

  it.each(['```js', '~~~js'])(
    'preserves literal Markdown and template backticks in %s code',
    (fence) => {
      const code =
        'const value = `Hi ${name}`;\nconst power = 2 ** 3;\n// # Title, **bold**, [x](url), - item';
      expect(markdownText(`${fence}\n${code}\n${fence.slice(0, 3)}`)).toBe(
        `Code (js)\n${code
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')}`
      );
    }
  );

  it('renders unclosed fenced code as code, not partial prose', () => {
    expect(markdownText('```ts\nconst n = 2 ** 3;\n// ## heading')).toBe(
      'Code (ts)\n    const n = 2 ** 3;\n    // ## heading'
    );
  });

  it('preserves code indentation and internal blank lines', () => {
    expect(markdownText('```\nif (ready) {\n  run();\n\n}\n```')).toBe(
      'Code\n    if (ready) {\n      run();\n    \n    }'
    );
  });

  it('preserves inline code, including Markdown-looking operators and backticks', () => {
    expect(
      markdownText(
        'Use `2 ** 3`, `# title`, `[x](url)`, and `` `Hi ${name}` ``.'
      )
    ).toBe('Use 2 ** 3, # title, [x](url), and `Hi ${name}`.');
  });

  it('uses link labels and leaves bare URLs as inert, case-sensitive text', () => {
    expect(
      markdownText(
        '[**Docs**](https://Example.com/Path "title"), <https://Example.com/Path>, https://Example.com/a_b?q=One-Two.'
      )
    ).toBe(
      'Docs, https://Example.com/Path, https://Example.com/a_b?q=One-Two.'
    );
  });

  it('formats reference links, image labels, blockquotes and breaks', () => {
    expect(
      markdownText(
        '> Read [guide][ref].\n>\n> Next  \n> line.\n\n![A cat](cat.png)\n\n[ref]: https://example.com'
      )
    ).toBe('│ Read guide.\n│ \n│ Next\n│ line.\n\nA cat');
  });

  it('does not turn HTML or unsafe link targets into active markup', () => {
    const source =
      '<script>alert("bad")</script>\n\n<img src=x onerror=alert(1)>\n\n[Safe **label**](javascript:alert(1)) and <b>plain</b>.';
    expect(markdownText(source)).toBe('Safe label and plain.');
  });

  it('leaves code containing HTML literal rather than filtering its contents', () => {
    expect(markdownText('`<img src=x onerror=alert(1)>`')).toBe(
      '<img src=x onerror=alert(1)>'
    );
  });

  it('decodes lexer escaping exactly once for literal code contents', () => {
    expect(markdownText('`a < b && value === "&amp;"`')).toBe(
      'a < b && value === "&amp;"'
    );
  });

  it('preserves raw URL case and ampersands inside headings', () => {
    expect(
      markdownText('## Visit <https://Example.com/Path?a=One&b=Two>')
    ).toBe('VISIT https://Example.com/Path?a=One&b=Two');
  });

  it('preserves a URL used as an explicit link label in a heading', () => {
    expect(
      markdownText('## [https://Example.com/Path](https://Example.com/Path)')
    ).toBe('https://Example.com/Path');
  });

  it('projects image alternative text through the same inline rules', () => {
    expect(markdownText('![**Small** `image.png`](image.png)')).toBe(
      'Small image.png'
    );
  });

  it('preserves the rest of unfinished inline code verbatim', () => {
    expect(markdownText('Use `const s = "**Hi**"; <b>x</b>')).toBe(
      'Use const s = "**Hi**"; <b>x</b>'
    );
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
    ['```', ''],
    ['```j', ''],
    ['```js\n', ''],
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
  ])('cleans incomplete streaming fragment %j', (source, expected) => {
    expect(markdownText(source)).toBe(expected);
  });

  it.each([
    'Plain text.\nA second line.\n\nA new paragraph.',
    'A well-known, on-device SDK costs -5; 2 * 3 = 6 and 2 ** 3 = 8.',
    'snake_case and foo_bar_baz; x_y; a_b.',
    'https://Example.com/a_b?name=One-Two&value=2*3',
    'The array[0] holds values [1, 2].',
    'A #hashtag is not a heading; C# is a language.',
  ])('preserves ordinary prose %j', (source) => {
    expect(markdownText(source)).toBe(source);
  });
});

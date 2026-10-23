import {marked} from 'marked';

/**
 * Demo-only Markdown projection for a single UIText string, never HTML.
 * Adapted from the XR Blocks Gemma on-device demo in google/xrblocks#634
 * under this repository's Apache-2.0 license.
 *
 * Emphasis preserves prose casing without rich font styling. Links show labels,
 * not actionable destinations. Unmatched link openers are streaming syntax.
 * @param {string} source Complete or incrementally streamed Markdown.
 * @returns {string} Display text; assign only to text surfaces, never innerHTML.
 */
export function markdownText(source) {
  return blocks(marked.lexer(source));
}

function blocks(tokens, separator = '\n\n') {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'heading':
          return inline(token.tokens, true).trim();
        case 'paragraph':
        case 'text':
          if (/^\s*(?:[-+*]|\d+[.)])\s*$/.test(token.text)) return '';
          return inline(
            token.tokens ?? marked.Lexer.lexInline(token.text)
          ).trim();
        case 'code':
          return token.text
            ? `Code${token.lang ? ` (${token.lang})` : ''}\n${indent(token.text, '    ')}`
            : '';
        case 'blockquote':
          return indent(blocks(token.tokens), '│ ');
        case 'list':
          return token.items
            .map((item, index) => {
              const text = blocks(item.tokens, '\n');
              if (!text) return '';
              const prefix = token.ordered ? `${token.start + index}) ` : '• ';
              return (
                prefix + text.replace(/\n/g, `\n${' '.repeat(prefix.length)}`)
              );
            })
            .filter(Boolean)
            .join('\n');
        case 'table':
          return [token.header, ...token.rows]
            .map((row) => row.map((cell) => inline(cell.tokens)).join(' | '))
            .join('\n');
        default:
          // Ignore raw HTML, definitions, whitespace and thematic-rule tokens.
          return '';
      }
    })
    .filter(Boolean)
    .join(separator);
}

function indent(text, prefix) {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function inline(tokens, uppercase = false) {
  let result = '';
  const prose = (text) => (uppercase ? text.toUpperCase() : text);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    switch (token.type) {
      case 'text': {
        // Completed code, links and escapes do not need delimiter cleanup.
        const raw = token.raw;
        if (/[`[]/.test(raw)) {
          const tail = tokens
            .slice(index)
            .map((part) => part.raw)
            .join('');
          const code = /`+/.exec(raw);
          const link = /!?\[([^\]\n]*)(?:\](?:\([^)]*)?)?$/.exec(tail);
          const partialLink =
            link &&
            link.index < raw.length &&
            (link.index === 0 || /\s/.test(tail[link.index - 1]));
          if (partialLink && (!code || link.index < code.index)) {
            result += prose(partialEmphasis(tail.slice(0, link.index)));
            result += inline(marked.Lexer.lexInline(link[1]), uppercase);
            return result;
          }
          if (code) {
            result += prose(partialEmphasis(raw.slice(0, code.index)));
            // An unfinished code span owns the remaining literal text, even
            // where the lexer found emphasis or HTML before its closing tick.
            return result + tail.slice(code.index + code[0].length);
          }
        }
        result += prose(partialEmphasis(raw));
        break;
      }
      case 'strong':
      case 'em':
      case 'del':
        result += inline(token.tokens, uppercase);
        break;
      case 'link':
        // Preserve URL casing even inside uppercase headings.
        result += token.raw.startsWith('[')
          ? inline(token.tokens, uppercase && token.text !== token.href)
          : token.raw.startsWith('<')
            ? token.raw.slice(1, -1)
            : token.raw;
        break;
      case 'image':
        result += inline(marked.Lexer.lexInline(token.text), uppercase);
        break;
      case 'codespan':
        result += token.text.replace(
          /&(amp|lt|gt|quot|#39);/g,
          (_, entity) =>
            ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"})[entity]
        );
        break;
      case 'escape':
        result += prose(token.raw.slice(1));
        break;
      case 'br':
        result += '\n';
        break;
    }
  }
  return result;
}

function partialEmphasis(text) {
  return text.replace(
    /(^|[\s([{])(?:\*{1,3}|_{1,3}|~~)(?![*_~])(?=\S|$)/g,
    '$1'
  );
}

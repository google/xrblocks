import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_ALLOWED_EXTERNAL_PATTERNS = [/^three$/, /^three\/addons\/.+/];

const DEFAULT_ENTRY_FILES = [
  'build/xrblocks.js',
  'build/xrblocks.min.js',
  'build/internal/Simulator.js',
  'build/internal/Simulator.min.js',
];

/**
 * Extracts static module specifiers (`import ... from '...'`, `import '...'`,
 * and `export ... from '...'`) from an ESM bundle file.
 *
 * Rolldown hoists static imports to the top of each chunk (immediately after
 * any leading banner comments).
 * @param {string} source
 * @returns {string[]}
 */
export function extractStaticImports(source) {
  const specifiers = [];
  let index = 0;

  const skipTrivia = () => {
    while (index < source.length) {
      const ch = source[index];
      if (
        ch === ' ' ||
        ch === '\t' ||
        ch === '\r' ||
        ch === '\n' ||
        ch === ';'
      ) {
        index++;
        continue;
      }
      if (source.startsWith('//', index)) {
        const newline = source.indexOf('\n', index + 2);
        index = newline === -1 ? source.length : newline + 1;
        continue;
      }
      if (source.startsWith('/*', index)) {
        const end = source.indexOf('*/', index + 2);
        index = end === -1 ? source.length : end + 2;
        continue;
      }
      break;
    }
  };

  const importPattern =
    /(?:import\s*(?:[\w$*{}\s,]+\s*from\s*)?|export\s*(?:[\w$*{}\s,]+\s*from\s*))(['"])([^'"]+)\1/y;

  while (index < source.length) {
    skipTrivia();
    const isImport = source.startsWith('import', index);
    const isExport = source.startsWith('export', index);
    if (!isImport && !isExport) break;

    if (isImport) {
      // Dynamic `import(...)` is not a static import declaration.
      const afterImport = source.slice(index + 'import'.length).trimStart();
      if (afterImport.startsWith('(') || afterImport.startsWith('.')) break;
    }

    importPattern.lastIndex = index;
    const match = importPattern.exec(source);
    if (!match) break;
    specifiers.push(match[2]);
    index = importPattern.lastIndex;
  }

  return specifiers;
}

/**
 * Checks whether a bare/external module specifier is allowed in the core static
 * import graph.
 * @param {string} specifier
 * @param {RegExp[]} allowedPatterns
 * @returns {boolean}
 */
export function isAllowedExternalSpecifier(
  specifier,
  allowedPatterns = DEFAULT_ALLOWED_EXTERNAL_PATTERNS
) {
  return allowedPatterns.some((pattern) => pattern.test(specifier));
}

/**
 * Walks the static import graph from the given entry files and returns any
 * disallowed external imports along with their import chains.
 * @param {{
 *   rootDir?: string,
 *   entryFiles?: string[],
 *   allowedPatterns?: RegExp[],
 * }} [options]
 * @returns {{
 *   checkedFiles: string[],
 *   violations: Array<{specifier: string, chain: string[]}>,
 * }}
 */
export function checkBundleStaticImports(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const entryFiles = options.entryFiles ?? DEFAULT_ENTRY_FILES;
  const allowedPatterns =
    options.allowedPatterns ?? DEFAULT_ALLOWED_EXTERNAL_PATTERNS;

  const visited = new Set();
  const violations = [];

  /**
   * @param {string} relFile
   * @param {string[]} chain
   */
  const visit = (relFile, chain) => {
    const normalizedRel = relFile.split(path.sep).join('/');
    const absFile = path.resolve(rootDir, normalizedRel);
    if (!fs.existsSync(absFile)) {
      throw new Error(
        `Bundle file not found: ${normalizedRel} (imported via ${chain.join(' -> ')})`
      );
    }
    if (visited.has(normalizedRel)) return;
    visited.add(normalizedRel);

    const source = fs.readFileSync(absFile, 'utf8');
    const imports = extractStaticImports(source);
    for (const specifier of imports) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const nextAbs = path.resolve(path.dirname(absFile), specifier);
        const nextRel = path.relative(rootDir, nextAbs);
        visit(nextRel, [...chain, normalizedRel]);
      } else if (!isAllowedExternalSpecifier(specifier, allowedPatterns)) {
        violations.push({
          specifier,
          chain: [...chain, normalizedRel, specifier],
        });
      }
    }
  };

  for (const entry of entryFiles) {
    visit(entry, []);
  }

  return {
    checkedFiles: [...visited],
    violations,
  };
}

function main() {
  const {checkedFiles, violations} = checkBundleStaticImports();
  if (violations.length > 0) {
    console.error(
      'Disallowed static external imports found in the core SDK bundle:'
    );
    for (const violation of violations) {
      console.error(
        `  - "${violation.specifier}": ${violation.chain.join(' -> ')}`
      );
    }
    process.exit(1);
  }
  console.log(
    `Verified static imports across ${checkedFiles.length} bundle chunks.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}

/**
 * Model Context Protocol server for XR Blocks.
 *
 * Exposes the `xb-*` skills and the SDK's public API surface to any MCP-capable
 * agent, so a coding agent can look up how to do something and check that a
 * symbol actually exists before emitting it.
 *
 * The motivation is the failure mode called out in AGENTS.md: hallucinated or
 * inconsistent APIs are the single biggest cause of broken generated apps. An
 * agent with no grounding invents plausible-looking calls; this gives it a way
 * to check.
 *
 * Run with:
 *
 *   npx --package=xrblocks xrblocks-mcp
 *
 * or point an MCP client at this file directly. Speaks JSON-RPC 2.0 over
 * stdio, which is the MCP stdio transport, with no runtime dependencies so it
 * adds nothing to an app's install.
 */
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

// Versions we will echo back if a client asks for one of them, oldest first.
// The tool surface is the same in each; only the handshake differs.
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
// What we answer with when the client asks for something we do not know. The
// newest we speak, since replying with the oldest can make a modern client
// disconnect even though both sides would have agreed on a later one.
const PROTOCOL_VERSION =
  SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1];
const SERVER_NAME = 'xrblocks';

// src/addons/mcp/server/index.js -> package root
const PACKAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const SKILLS_DIR = join(PACKAGE_ROOT, 'skills');
const TYPES_FILE = join(PACKAGE_ROOT, 'build', 'xrblocks.d.ts');

/**
 * Reads the `name` and `description` out of a SKILL.md YAML frontmatter block.
 *
 * Deliberately hand-rolled rather than pulling in a YAML parser: the block is
 * two known keys, and a dependency here would be paid by every consumer of the
 * SDK, which has one runtime dependency today.
 *
 * @param {string} text - Full SKILL.md contents.
 * @returns {{name: string|null, description: string}} Parsed fields.
 */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {name: null, description: ''};
  const block = match[1];

  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : null;

  // `description` is usually a folded block scalar (`description: >-`) with
  // indented continuation lines.
  let description = '';
  const descMatch = block.match(
    /^description:\s*(>-|>|\|-|\|)?[ \t]*\r?\n?([\s\S]*)$/m
  );
  if (descMatch) {
    if (descMatch[1]) {
      const body = [];
      for (const line of descMatch[2].split(/\r?\n/)) {
        if (/^\S/.test(line)) break; // a non-indented line starts the next key
        body.push(line.trim());
      }
      description = body.join(' ').trim();
    } else {
      description = (descMatch[2].split(/\r?\n/)[0] || '').trim();
    }
  }
  return {name, description};
}

/**
 * Loads every skill in the package.
 *
 * @returns {Array<{name: string, description: string, path: string}>} Skills.
 */
export function loadSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  const skills = [];
  for (const entry of readdirSync(SKILLS_DIR, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const file = join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const {name, description} = parseFrontmatter(readFileSync(file, 'utf8'));
    skills.push({name: name || entry.name, description, path: file});
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

let cachedSymbols = null;
let cachedMtime = 0;

/**
 * Reads the names the package actually exports.
 *
 * The generated bundle contains every declaration rollup pulled in, including
 * internal helpers and `sdk_`-prefixed aliases, so the declarations alone are a
 * much wider set than the public surface. The trailing `export {...}` and
 * `export type {...}` statements are the authoritative list, so the index is
 * filtered against them. Without this the tool confirms internal names as real
 * APIs, which is the failure it exists to prevent.
 *
 * @param {string} text - Contents of the .d.ts bundle.
 * @returns {Set<string>} Exported names.
 */
export function parseExportedNames(text) {
  const names = new Set();
  // Only top-level statements; the ones nested in `declare namespace sdk` are
  // indented and re-export the internal aliases.
  for (const match of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const entry = part.trim();
      if (!entry) continue;
      // `sdk_Reticle as Reticle` is exported under the alias.
      const as = entry.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      names.add(as ? as[1] : entry);
    }
  }
  return names;
}

/**
 * Indexes the public API symbols in a set of type definitions.
 *
 * Kept separate from reading the file so it can be tested against a fixture:
 * `build/xrblocks.d.ts` is generated and is not present in a fresh clone.
 *
 * The barrel at `src/xrblocks.ts` is almost entirely `export * from`, so it
 * names nothing itself. The generated `.d.ts` is the only place the real
 * surface is enumerated.
 *
 * Indexes members as well as top-level declarations, because much of the API
 * an app actually calls is methods on a class rather than free functions:
 * `enableDepth()` is a method on `Options`, not a top-level export, and an
 * index that missed it would tell an agent a real API does not exist.
 *
 * @param {string} source - Contents of a .d.ts bundle.
 * @returns {Array<{name: string, kind: string, owner: string|null, signature: string}>} Symbols.
 */
export function indexSymbols(source) {
  const symbols = [];

  const exported = parseExportedNames(source);

  const topLevel =
    /^(?:export\s+)?(?:declare\s+)?(abstract class|class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
  // Indented members: methods, properties, getters, enum values. `protected`
  // and `private` members are deliberately excluded, since an app cannot call
  // them and reporting them invites exactly the wrong code.
  const member =
    /^\s+(?:(?:public|readonly|static|abstract|get|set)\s+)*([A-Za-z_$][\w$]*)\s*[(<:?,=]/;
  const nonPublic = /^\s+(?:private|protected|#)/;

  const seen = new Set();
  let owner = null;
  let depth = 0;
  // Depth at which a private/protected member started, so its nested shape is
  // skipped too. -1 means nothing is being suppressed.
  let suppressed = -1;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const top = line.match(topLevel);
    if (top) {
      const [, kind, name] = top;
      // A `type X = {` alias and an `enum X {` both own members worth indexing,
      // not just classes and interfaces.
      const ownsMembers =
        /class|interface|enum/.test(kind) ||
        (kind === 'type' && /\{\s*$/.test(line));
      owner = ownsMembers && exported.has(name) ? name : null;
      depth = 0;
      if (!exported.has(name)) continue;
      const key = `${kind}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        symbols.push({
          name,
          kind,
          owner: null,
          signature: line.trim().replace(/\s+/g, ' '),
        });
      }
      continue;
    }

    if (owner) {
      // Track nesting so a private member's inline shape can be skipped.
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      if (/^\}/.test(line.trim()) && depth === 0) {
        owner = null;
        suppressed = -1;
        continue;
      }
      if (suppressed < 0 && nonPublic.test(line)) suppressed = depth;

      // Index at any depth, not just direct members: option bags and returned
      // shapes are written inline in the declarations, so fields like
      // `new ModelViewer({raycastToChildren})` or `getSessionState().toolCount`
      // only exist nested inside a signature.
      if (suppressed < 0) {
        const mem = line.match(member);
        if (mem && !mem[1].startsWith('_')) {
          const name = mem[1];
          const key = `member:${owner}.${name}`;
          if (!seen.has(key)) {
            seen.add(key);
            symbols.push({
              name,
              kind: 'member',
              owner,
              signature: `${owner}.${line.trim().replace(/\s+/g, ' ')}`,
            });
          }
        }
      }
      depth += opens - closes;
      if (depth < 0) depth = 0;
      // The private member's shape has closed, so resume indexing.
      if (suppressed >= 0 && depth <= suppressed) suppressed = -1;
    }
  }
  return symbols;
}

/**
 * Loads the public API symbols from the built type definitions.
 *
 * Re-indexes when the file changes, so building the SDK while a client holds
 * the server open does not leave a freshly added API reported as fake.
 *
 * @returns {Array<{name: string, kind: string, owner: string|null, signature: string}>} Symbols.
 */
export function loadSymbols() {
  if (!existsSync(TYPES_FILE)) return [];
  const mtime = statSync(TYPES_FILE).mtimeMs;
  if (cachedSymbols && cachedMtime === mtime) return cachedSymbols;
  cachedSymbols = indexSymbols(readFileSync(TYPES_FILE, 'utf8'));
  cachedMtime = mtime;
  return cachedSymbols;
}

/**
 * Shortens a skill description for the listing.
 * `list_skills` is the tool an agent calls first, so its whole output lands in
 * the context window before any real work starts. The full descriptions run to
 * a thousand characters each and mostly enumerate covered APIs, which only
 * matters once a skill has been chosen. Keeping the leading sentences answers
 * "is this the one I want", and `get_skill` still returns everything.
 *
 * @param {string} description - Full frontmatter description.
 * @param {number} maxLength - Soft character budget.
 * @returns {string} A shortened description.
 */
export function summarize(description, maxLength = 220) {
  const text = (description || '').trim();
  if (!text) return '(no description)';
  if (text.length <= maxLength) return text;

  // Prefer cutting on a sentence boundary so the result reads as prose. Avoid
  // splitting on the dot in an API name like `xb.core.sound`.
  let out = '';
  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z(`])/)) {
    if (out && (out + ' ' + sentence).length > maxLength) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  if (!out) out = text.slice(0, maxLength).replace(/\s+\S*$/, '');
  return out.length < text.length ? `${out} …` : out;
}

export const TOOLS = [
  {
    name: 'list_skills',
    description:
      'List every XR Blocks skill with its description. Each description says what the skill covers and when to use it. Call this first to find which skill matches the task, then call get_skill for the full content.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'get_skill',
    description:
      'Return the full text of one XR Blocks skill, including its worked code examples and the APIs it covers. Use a name from list_skills, for example xb-build-app.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'Skill name, e.g. xb-build-app.'},
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_api',
    description:
      "Search the XR Blocks public API surface for a symbol. Use this to confirm a class, function, or option actually exists before writing code that calls it, rather than guessing. Returns matching declarations from the SDK's type definitions.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Symbol name or fragment, e.g. enableDepth or Reticle.',
        },
        limit: {type: 'number', description: 'Max results, default 25.'},
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

/**
 * Runs a tool and returns its text result.
 *
 * @param {string} name - Tool name.
 * @param {object} args - Tool arguments.
 * @returns {{text: string, isError?: boolean}} Result payload.
 */
export function callTool(name, args = {}) {
  if (name === 'list_skills') {
    const skills = loadSkills();
    if (!skills.length) {
      return {text: `No skills found under ${SKILLS_DIR}.`, isError: true};
    }
    const body = skills
      .map((s) => `## ${s.name}\n${summarize(s.description)}`)
      .join('\n\n');
    return {
      text:
        `${skills.length} XR Blocks skills. Descriptions are shortened here; ` +
        `call get_skill for the full text and code examples.\n\n${body}`,
    };
  }

  if (name === 'get_skill') {
    const wanted = String(args.name || '').trim();
    if (!wanted) {
      return {text: 'Missing required argument: name.', isError: true};
    }
    const skills = loadSkills();
    const skill = skills.find((s) => s.name === wanted);
    if (!skill) {
      return {
        text:
          `No skill named "${wanted}". Available: ` +
          skills.map((s) => s.name).join(', '),
        isError: true,
      };
    }
    return {text: readFileSync(skill.path, 'utf8')};
  }

  if (name === 'search_api') {
    const query = String(args.query || '').trim();
    if (!query) {
      return {text: 'Missing required argument: query.', isError: true};
    }
    const symbols = loadSymbols();
    if (!symbols.length) {
      return {
        text:
          `No type definitions found at ${TYPES_FILE}. Run "npm run build:sdk" ` +
          `so the API surface can be searched.`,
        isError: true,
      };
    }
    const needle = query.toLowerCase();
    const limit = Number(args.limit) > 0 ? Number(args.limit) : 25;
    const exact = [];
    const partial = [];
    for (const s of symbols) {
      const lower = s.name.toLowerCase();
      if (lower === needle) exact.push(s);
      else if (lower.includes(needle)) partial.push(s);
    }
    const hits = [...exact, ...partial].slice(0, limit);
    if (!hits.length) {
      return {
        text:
          `No XR Blocks API matches "${query}". It is likely not a real symbol, ` +
          `so do not call it. Use list_skills to find the right area instead.`,
      };
    }
    return {
      text:
        `${hits.length} match(es) for "${query}":\n\n` +
        hits.map((s) => `${s.kind} ${s.name}\n    ${s.signature}`).join('\n'),
    };
  }

  return {text: `Unknown tool: ${name}`, isError: true};
}

/** @returns {string} The package version, or 0.0.0 if it cannot be read. */
function readVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Writes one JSON-RPC message to stdout.
 *
 * @param {object} msg - Message to send.
 */
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

/**
 * Handles a single JSON-RPC message.
 *
 * @param {unknown} req - Parsed message.
 * @param {(msg: object) => void} write - Where to write the response. Defaults
 *   to stdout; tests pass a collector.
 */
export function handle(req, write = send) {
  // A message with no `id` property is a notification and must never be
  // answered, whatever its method. An explicit `id: null` is a request, and is
  // answered with a null id.
  const isNotification =
    typeof req === 'object' && req !== null && !Object.hasOwn(req, 'id');

  if (typeof req !== 'object' || req === null || Array.isArray(req)) {
    write({
      jsonrpc: '2.0',
      id: null,
      error: {code: -32600, message: 'Invalid Request'},
    });
    return;
  }

  const {id, method, params} = req;

  if (typeof method !== 'string') {
    if (isNotification) return;
    write({
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32600,
        message: 'Invalid Request: method must be a string',
      },
    });
    return;
  }

  if (isNotification) return;

  if (method === 'initialize') {
    // Echo the client's version when we speak it, otherwise answer with ours
    // and let the client decide whether it can continue.
    const asked = params?.protocolVersion;
    const version = SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
      ? asked
      : PROTOCOL_VERSION;
    write({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: version,
        capabilities: {tools: {}},
        serverInfo: {name: SERVER_NAME, version: readVersion()},
      },
    });
    return;
  }

  if (method === 'ping') {
    write({jsonrpc: '2.0', id, result: {}});
    return;
  }

  if (method === 'tools/list') {
    write({jsonrpc: '2.0', id, result: {tools: TOOLS}});
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    if (!TOOLS.some((t) => t.name === toolName)) {
      write({
        jsonrpc: '2.0',
        id,
        error: {code: -32602, message: `Unknown tool: ${toolName}`},
      });
      return;
    }
    let result;
    try {
      result = callTool(toolName, params?.arguments || {});
    } catch (err) {
      result = {text: `Tool ${toolName} failed: ${err.message}`, isError: true};
    }
    write({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{type: 'text', text: result.text}],
        isError: !!result.isError,
      },
    });
    return;
  }

  write({
    jsonrpc: '2.0',
    id,
    error: {code: -32601, message: `Method not found: ${method}`},
  });
}

/** Starts reading JSON-RPC messages from stdin. */
export function serve() {
  const rl = createInterface({input: process.stdin});
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      send({
        jsonrpc: '2.0',
        id: null,
        error: {code: -32700, message: 'Parse error'},
      });
      return;
    }
    try {
      handle(req);
    } catch (err) {
      // One bad message must not take the transport down with it.
      send({
        jsonrpc: '2.0',
        id: null,
        error: {code: -32603, message: `Internal error: ${err.message}`},
      });
    }
  });
}

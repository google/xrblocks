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
 *   npx xrblocks-mcp
 *
 * or point an MCP client at this file directly. Speaks JSON-RPC 2.0 over
 * stdio, which is the MCP stdio transport, with no runtime dependencies so it
 * adds nothing to an app's install.
 */
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const PROTOCOL_VERSION = '2024-11-05';
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

/**
 * Extracts the declared public symbols from the built type definitions.
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
 * @returns {Array<{name: string, kind: string, owner: string|null, signature: string}>} Symbols.
 */
export function loadSymbols() {
  if (cachedSymbols) return cachedSymbols;
  cachedSymbols = [];
  if (!existsSync(TYPES_FILE)) return cachedSymbols;

  const topLevel =
    /^(?:export\s+)?(?:declare\s+)?(abstract class|class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
  // Indented members: methods, properties, getters. Skips private/# members.
  const member =
    /^\s+(?:(?:public|protected|readonly|static|abstract|get|set)\s+)*([A-Za-z_$][\w$]*)\s*[(<:?]/;

  const seen = new Set();
  let owner = null;
  let depth = 0;

  for (const raw of readFileSync(TYPES_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const top = line.match(topLevel);
    if (top) {
      const [, kind, name] = top;
      owner = /class|interface/.test(kind) ? name : null;
      depth = 0;
      const key = `${kind}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        cachedSymbols.push({
          name,
          kind,
          owner: null,
          signature: line.trim().replace(/\s+/g, ' '),
        });
      }
      continue;
    }

    if (owner) {
      // Track nesting so we only take direct members of the type.
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      if (/^\}/.test(line.trim()) && depth === 0) {
        owner = null;
        continue;
      }
      if (depth === 0) {
        const mem = line.match(member);
        if (mem && !mem[1].startsWith('_')) {
          const name = mem[1];
          const key = `member:${owner}.${name}`;
          if (!seen.has(key)) {
            seen.add(key);
            cachedSymbols.push({
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
    }
  }
  return cachedSymbols;
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
      'Return the full text of one XR Blocks skill, including its worked code examples and the APIs it covers. Use a name from list_skills, for example xb-depth.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'Skill name, e.g. xb-depth.'},
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
      .map((s) => `## ${s.name}\n${s.description || '(no description)'}`)
      .join('\n\n');
    return {text: `${skills.length} XR Blocks skills:\n\n${body}`};
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
 * Handles a single JSON-RPC request.
 *
 * @param {object} req - Parsed request.
 */
export function handle(req) {
  const {id, method, params} = req;
  // Notifications carry no id and must not be answered.
  const isNotification = id === undefined || id === null;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {tools: {}},
        serverInfo: {name: SERVER_NAME, version: readVersion()},
      },
    });
    return;
  }

  if (method === 'tools/list') {
    send({jsonrpc: '2.0', id, result: {tools: TOOLS}});
    return;
  }

  if (method === 'tools/call') {
    let result;
    try {
      result = callTool(params?.name, params?.arguments || {});
    } catch (err) {
      result = {
        text: `Tool ${params?.name} failed: ${err.message}`,
        isError: true,
      };
    }
    send({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{type: 'text', text: result.text}],
        isError: !!result.isError,
      },
    });
    return;
  }

  if (isNotification) return;

  send({
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
      return; // Not one of our messages; ignore rather than kill the transport.
    }
    handle(req);
  });
}

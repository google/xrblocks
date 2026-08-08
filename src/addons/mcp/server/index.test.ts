import {describe, expect, it} from 'vitest';

import {
  callTool,
  handle,
  loadSkills,
  loadSymbols,
  parseExportedNames,
  parseFrontmatter,
  summarize,
  TOOLS,
} from './index.js';

/** Collects what the server would write, instead of hitting stdout. */
function exchange(message: unknown) {
  const sent: Array<Record<string, unknown>> = [];
  handle(message, (msg: Record<string, unknown>) => sent.push(msg));
  return sent;
}

describe('JSON-RPC transport', () => {
  it('answers initialize with the version the client asked for', () => {
    const [res] = exchange({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {protocolVersion: '2025-06-18'},
    });
    expect((res.result as Record<string, unknown>).protocolVersion).toBe(
      '2025-06-18'
    );
  });

  it('falls back to the newest version it speaks when the client asks for an unknown one', () => {
    const [res] = exchange({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {protocolVersion: '1999-01-01'},
    });
    // Answering with the oldest can make a modern client hang up even though
    // both sides would have agreed on a later version.
    expect((res.result as Record<string, unknown>).protocolVersion).toBe(
      '2025-06-18'
    );
  });

  it('never answers a notification', () => {
    // No id means notification, whatever the method.
    expect(exchange({jsonrpc: '2.0', method: 'tools/list'})).toHaveLength(0);
    expect(
      exchange({jsonrpc: '2.0', method: 'notifications/initialized'})
    ).toHaveLength(0);
  });

  it('answers ping, which clients use as a health check', () => {
    const [res] = exchange({jsonrpc: '2.0', id: 7, method: 'ping'});
    expect(res).toEqual({jsonrpc: '2.0', id: 7, result: {}});
  });

  it('rejects a non-object message instead of throwing', () => {
    for (const bad of [null, 42, 'hello', []]) {
      const [res] = exchange(bad);
      expect((res.error as Record<string, unknown>).code).toBe(-32600);
    }
  });

  it('reports an unknown method as -32601', () => {
    const [res] = exchange({jsonrpc: '2.0', id: 2, method: 'resources/list'});
    expect((res.error as Record<string, unknown>).code).toBe(-32601);
  });

  it('reports an unknown tool as -32602', () => {
    const [res] = exchange({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {name: 'no_such_tool', arguments: {}},
    });
    expect((res.error as Record<string, unknown>).code).toBe(-32602);
  });

  it('wraps a tool result in the MCP content envelope', () => {
    const [res] = exchange({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {name: 'list_skills', arguments: {}},
    });
    const result = res.result as {
      content: Array<{type: string; text: string}>;
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('xb-depth');
  });
});

describe('parseExportedNames', () => {
  it('takes the alias rather than the internal name', () => {
    const names = parseExportedNames(
      'export { sdk_Reticle as Reticle, Core };'
    );
    expect(names.has('Reticle')).toBe(true);
    expect(names.has('sdk_Reticle')).toBe(false);
    expect(names.has('Core')).toBe(true);
  });

  it('reads type-only exports too', () => {
    const names = parseExportedNames('export type { DepthOptions };');
    expect(names.has('DepthOptions')).toBe(true);
  });

  it('ignores the indented re-exports inside the namespace block', () => {
    const names = parseExportedNames(
      '    export type { sdk_Foo as Foo };\nexport { Bar };'
    );
    expect(names.has('Bar')).toBe(true);
    expect(names.has('Foo')).toBe(false);
  });
});

describe('summarize', () => {
  it('leaves a short description alone', () => {
    expect(summarize('Add depth sensing.')).toBe('Add depth sensing.');
  });

  it('cuts on a sentence boundary and marks the elision', () => {
    const text =
      'Add depth sensing to an app. Use for occlusion and physics colliders. ' +
      'Covers enableDepth(), the DepthOptions presets, colliderUpdateFps, and ' +
      'showReticleOnDepthMesh, plus a great deal of further detail that only ' +
      'matters once the skill has actually been chosen by the agent.';
    const short = summarize(text);

    expect(short.length).toBeLessThan(text.length);
    expect(short).toContain('Add depth sensing to an app.');
    expect(short.endsWith('…')).toBe(true);
  });

  it('does not split on the dot inside an API name', () => {
    const text =
      'Play audio via xb.core.sound in an app and do a number of other ' +
      'things too, described at considerable length for the listing case.';

    expect(summarize(text, 40)).not.toMatch(/xb\.$/);
  });

  it('handles an empty description', () => {
    expect(summarize('')).toBe('(no description)');
  });
});

describe('parseFrontmatter', () => {
  it('reads a folded description block', () => {
    const {name, description} = parseFrontmatter(
      [
        '---',
        'name: xb-depth',
        'description: >-',
        '  Add WebXR depth sensing to an app so virtual content is occluded',
        '  by real geometry.',
        'other: value',
        '---',
        '',
        '# Body',
      ].join('\n')
    );

    expect(name).toBe('xb-depth');
    expect(description).toBe(
      'Add WebXR depth sensing to an app so virtual content is occluded by real geometry.'
    );
  });

  it('stops the description at the next key', () => {
    const {description} = parseFrontmatter(
      ['---', 'description: >-', '  First line.', 'name: xb-thing', '---'].join(
        '\n'
      )
    );

    expect(description).toBe('First line.');
  });

  it('survives a file with no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading')).toEqual({
      name: null,
      description: '',
    });
  });
});

describe('loadSkills', () => {
  it('finds the skills that ship with the package', () => {
    const skills = loadSkills();

    expect(skills.length).toBeGreaterThan(10);
    for (const skill of skills) {
      expect(skill.name).toMatch(/^xb-/);
      expect(skill.description.length).toBeGreaterThan(0);
    }
  });
});

describe('loadSymbols', () => {
  it('indexes class members, not just top-level declarations', () => {
    // enableDepth() is a method on Options rather than a free function. An
    // index that only saw top-level declarations would report a real API as
    // missing, which is worse than not answering at all.
    const symbols = loadSymbols();
    const enableDepth = symbols.find((s) => s.name === 'enableDepth');

    expect(enableDepth).toBeDefined();
    expect(enableDepth.kind).toBe('member');
    expect(enableDepth.owner).toBe('Options');
  });

  it('indexes top-level classes', () => {
    const symbols = loadSymbols();

    expect(symbols.find((s) => s.name === 'Options')).toBeDefined();
  });

  it('leaves out declarations the package does not export', () => {
    // The generated bundle carries every declaration rollup pulled in,
    // including internal helpers and sdk_-prefixed aliases. Reporting those as
    // real APIs is the exact failure this tool exists to prevent.
    const names = new Set(loadSymbols().map((s) => s.name));

    expect(names.has('sdk_Reticle')).toBe(false);
    expect(names.has('musicLibrary')).toBe(false);
    // The alias target is the real public name and must survive.
    expect(names.has('Reticle')).toBe(true);
  });

  it('leaves out protected members, which an app cannot call', () => {
    const symbols = loadSymbols();

    expect(
      symbols.find((s) => s.owner === 'Gemini' && s.name === 'queryOnce')
    ).toBeUndefined();
  });

  it('indexes members of exported type aliases and enums', () => {
    const symbols = loadSymbols();
    const find = (name: string) => symbols.find((s) => s.name === name);

    // Property on an exported `type X = {...}` alias.
    expect(find('hideSimulatorUi')).toBeDefined();
    // Value on an exported enum.
    expect(find('POINTER_LOCK')).toBeDefined();
  });

  it('indexes fields of inline option bags and returned shapes', () => {
    // These are written inline inside a signature rather than as their own
    // type, but they are what an app actually passes and reads:
    // `new ModelViewer({raycastToChildren})`, `getSessionState().toolCount`.
    const names = new Set(loadSymbols().map((s) => s.name));

    expect(names.has('raycastToChildren')).toBe(true);
    expect(names.has('toolCount')).toBe(true);
  });

  it('does not index a protected field that has no public counterpart', () => {
    const symbols = loadSymbols();

    expect(
      symbols.find((s) => s.owner === 'ModelViewer' && s.name === 'controlBar')
    ).toBeUndefined();
  });
});

describe('search_api', () => {
  it('finds a real API', () => {
    const {text, isError} = callTool('search_api', {query: 'enableDepth'});

    expect(isError).toBeFalsy();
    expect(text).toContain('enableDepth');
  });

  it('tells the caller a hallucinated API does not exist', () => {
    // These are APIs a model actually invented when generating xrblocks code
    // without grounding, which is the failure this tool exists to catch.
    for (const fake of ['createXRScene', 'useGesture', 'playGesture']) {
      const {text} = callTool('search_api', {query: fake});
      expect(text).toContain('No XR Blocks API matches');
    }
  });

  it('is case insensitive', () => {
    expect(callTool('search_api', {query: 'enabledepth'}).text).toContain(
      'enableDepth'
    );
  });

  it('reports a missing query rather than returning everything', () => {
    const {isError} = callTool('search_api', {query: '  '});

    expect(isError).toBe(true);
  });

  it('honours the result limit', () => {
    const {text} = callTool('search_api', {query: 'enable', limit: 3});

    expect(text).toMatch(/^3 match\(es\)/);
  });
});

describe('get_skill', () => {
  it('returns the full text of a skill', () => {
    const {text, isError} = callTool('get_skill', {name: 'xb-depth'});

    expect(isError).toBeFalsy();
    expect(text).toContain('name: xb-depth');
  });

  it('lists the alternatives when the name is wrong', () => {
    const {text, isError} = callTool('get_skill', {name: 'xb-not-a-skill'});

    expect(isError).toBe(true);
    expect(text).toContain('xb-depth');
  });
});

describe('list_skills', () => {
  it('includes every skill', () => {
    const {text} = callTool('list_skills');
    const skills = loadSkills();

    expect(text).toContain(`${skills.length} XR Blocks skills`);
    expect(text).toContain('xb-depth');
  });

  it('stays small enough to be the first call an agent makes', () => {
    // The full descriptions total roughly 3k tokens, which is a lot to spend
    // before any work starts. get_skill still returns everything.
    const {text} = callTool('list_skills');

    expect(text.length).toBeLessThan(8000);
    expect(text).toContain('call get_skill for the full text');
  });
});

describe('tool declarations', () => {
  it('declares a schema for every tool', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      'get_skill',
      'list_skills',
      'search_api',
    ]);
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('reports an unknown tool rather than throwing', () => {
    const {isError} = callTool('nope', {});

    expect(isError).toBe(true);
  });
});

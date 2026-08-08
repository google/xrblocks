import {describe, expect, it} from 'vitest';

import {
  callTool,
  loadSkills,
  loadSymbols,
  parseFrontmatter,
  summarize,
  TOOLS,
} from './index.js';

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

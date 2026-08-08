import {describe, expect, it} from 'vitest';

import {callTool, loadSkills, parseFrontmatter, TOOLS} from './index.js';

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
});

describe('tool declarations', () => {
  it('declares a schema for every tool', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      'get_skill',
      'list_skills',
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

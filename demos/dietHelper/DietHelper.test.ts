import 'xrblocks/addons/testing/setup';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';

import {DietHelper} from './DietHelper.js';

const html = readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8');

function modelSelect() {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const select = doc.getElementById(
    'dietHelperModelSelect'
  ) as HTMLSelectElement;
  document.body.replaceChildren(document.adoptNode(select));
  return select;
}

function bind(select: HTMLSelectElement) {
  const helper = {dom: {modelSelect: select}, applySelectedModel() {}};
  DietHelper.prototype.bindModelSelector.call(helper);
}

describe('DietHelper model picker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores a saved model that is still offered', () => {
    localStorage.setItem('dietHelper.geminiModel', 'gemini-2.5-flash');
    const select = modelSelect();

    bind(select);

    expect(select.value).toBe('gemini-2.5-flash');
  });

  it('keeps the first model when the saved one is no longer offered', () => {
    localStorage.setItem('dietHelper.geminiModel', 'gemini-2.0-flash');
    const select = modelSelect();

    bind(select);

    expect(select.value).toBe(select.options[0].value);
  });
});

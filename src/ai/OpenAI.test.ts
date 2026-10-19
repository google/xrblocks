import {beforeEach, describe, expect, it, vi} from 'vitest';

import {OpenAIOptions} from './AIOptions';
import {OpenAI} from './OpenAI';

const {create} = vi.hoisted(() => ({create: vi.fn()}));

vi.mock('openai', () => ({
  default: class {
    chat = {completions: {create}};
  },
}));

describe('OpenAI', () => {
  beforeEach(() => {
    create.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('queries chat completions with the default model', async () => {
    create.mockResolvedValue({choices: [{message: {content: 'hi'}}]});
    const openai = new OpenAI(
      Object.assign(new OpenAIOptions(), {apiKey: 'test-key'})
    );
    await openai.init();

    expect(await openai.query({prompt: 'Hello'})).toEqual({text: 'hi'});
    expect(create).toHaveBeenCalledWith({
      messages: [{role: 'user', content: 'Hello'}],
      model: new OpenAIOptions().model,
    });
  });
});

import {afterEach, expect, it, vi} from 'vitest';
import {AI} from './AI';
import {AIOptions} from './AIOptions';

const {create} = vi.hoisted(() => ({create: vi.fn()}));
vi.mock('openai', () => ({
  default: class {
    chat = {completions: {create}};
  },
}));
afterEach(() => {
  create.mockReset();
  vi.restoreAllMocks();
});

it('queries OpenAI through AI and rejects unsupported image generation', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const ai = new AI();
  await expect(ai.generate('a tree')).rejects.toThrow(/not available/);
  const options = new AIOptions();
  options.enabled = options.openai.enabled = true;
  options.model = 'openai';
  options.openai.apiKey = 'test-key';
  options.openai.model = 'custom-chat-model';
  try {
    await ai.init({aiOptions: options});
    create.mockResolvedValue({choices: [{message: {content: 'Hello'}}]});
    expect(await ai.query({prompt: 'Hi'})).toEqual({text: 'Hello'});
    expect(create).toHaveBeenCalledWith({
      model: 'custom-chat-model',
      messages: [{role: 'user', content: 'Hi'}],
    });
    await expect(ai.generate('a tree')).rejects.toThrow(/does not support/);
  } finally {
    ai.dispose();
  }
});

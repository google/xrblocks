import {buildMessages} from './conversation.js';

/** SmolVLM tiles images into 512 px views; 1024 px keeps it to four tiles. */
const SMOLVLM_TILED_EDGE = 1024;

/**
 * Convert shared conversation messages to SmolVLM's template shape, where every
 * message content is a list of typed parts.
 * @param {ReturnType<typeof buildMessages>} messages
 */
export function toSmolVLMMessages(messages) {
  return messages.map(({role, content}) => ({
    role,
    content:
      typeof content === 'string' ? [{type: 'text', text: content}] : content,
  }));
}

/**
 * Model-family specifics behind one interface: tokenizer, model class,
 * processor for an image budget, prompt template and processor call.
 */
export const ADAPTERS = Object.freeze({
  gemma4: Object.freeze({
    modelClass: (tf) => tf.Gemma4ForConditionalGeneration,
    createTokenizer: (tf, assets) =>
      new tf.GemmaTokenizer(assets.tokenizerJSON, assets.tokenizerConfig),
    createProcessor(tf, {tokenizer, assets}, imageBudget) {
      const config = {
        ...assets.processorConfig,
        image_seq_length: imageBudget,
        image_processor: {
          ...assets.processorConfig.image_processor,
          image_seq_length: imageBudget,
          max_soft_tokens: imageBudget,
        },
      };
      return new tf.Gemma4Processor(
        config,
        {
          tokenizer,
          image_processor: new tf.Gemma4ImageProcessor(config.image_processor),
        },
        assets.chatTemplate
      );
    },
    prompt: (processor, history, question) =>
      processor.apply_chat_template(buildMessages(history, question), {
        tokenize: false,
        add_generation_prompt: true,
        enable_thinking: false,
      }),
    process: (processor, prompt, image) =>
      processor(prompt, image, null, {add_special_tokens: false}),
  }),
  smolvlm: Object.freeze({
    modelClass: (tf) => tf.Idefics3ForConditionalGeneration,
    createTokenizer: (tf, assets) =>
      new tf.GPT2Tokenizer(assets.tokenizerJSON, assets.tokenizerConfig),
    createProcessor(tf, {tokenizer, assets}, imageBudget) {
      const imageProcessor = new tf.Idefics3ImageProcessor({
        ...assets.imageProcessorConfig,
        do_image_splitting: imageBudget > 64,
        size: {longest_edge: SMOLVLM_TILED_EDGE},
      });
      return new tf.Idefics3Processor(
        assets.processorConfig,
        {tokenizer, image_processor: imageProcessor},
        assets.chatTemplate.chat_template
      );
    },
    prompt: (processor, history, question) =>
      processor.apply_chat_template(
        toSmolVLMMessages(buildMessages(history, question)),
        {tokenize: false, add_generation_prompt: true}
      ),
    process: (processor, prompt, image) => processor(prompt, image),
  }),
});

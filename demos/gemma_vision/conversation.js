export const MAX_PROMPT_LENGTH = 2000;
export const MAX_NEW_TOKENS = 128;
export const MAX_CONTEXT_TOKENS = 4096;

export const PRESETS = [
  {
    id: 'describe',
    label: 'What am I looking at?',
    prompt: 'What am I looking at? Describe the image in two short sentences.',
  },
  {
    id: 'read',
    label: 'Read the text',
    prompt:
      'Read and transcribe the text visible in the image. Return only the text, without a preface or explanation.',
  },
  {
    id: 'translate',
    label: 'Translate the text to English',
    prompt:
      'Translate the text visible in the image to English. Return only the translated text, without a preface or explanation.',
  },
];

/**
 * @param {string} question User-entered question.
 * @returns {string} Trimmed, nonempty question within the character limit.
 */
export function validateQuestion(question) {
  if (typeof question !== 'string' || !question.trim()) {
    throw new TypeError('Enter a question about the captured image.');
  }
  const text = question.trim();
  if (text.length > MAX_PROMPT_LENGTH) {
    throw new RangeError(
      `Questions must be at most ${MAX_PROMPT_LENGTH} characters.`
    );
  }
  return text;
}

/**
 * Build Gemma chat-template messages with one original image placeholder.
 * The runtime owns history: append only completed answers and clear it when the
 * image changes. Image content is user data, never a system instruction.
 * @param {Array<{question: string, answer: string}>} history Completed pairs.
 * @param {string} question Next question.
 * @returns {Array<{role: string, content: string | Array<{type: string, text?: string}>}>}
 */
export function buildMessages(history, question) {
  const text = validateQuestion(question);
  if (!Array.isArray(history)) {
    throw new TypeError('Conversation history must contain completed pairs.');
  }
  const messages = [];
  const addQuestion = (value) => {
    messages.push({
      role: 'user',
      content: messages.length
        ? value
        : [{type: 'image'}, {type: 'text', text: value}],
    });
  };
  for (const pair of history) {
    if (!pair || typeof pair.answer !== 'string' || !pair.answer.trim()) {
      throw new TypeError('Conversation history must contain completed pairs.');
    }
    addQuestion(validateQuestion(pair.question));
    messages.push({role: 'assistant', content: pair.answer});
  }
  addQuestion(text);
  return messages;
}

/**
 * Check the actual tokenized input after image expansion, without truncating
 * image-token spans. The generation output reservation is always included.
 * @param {number} inputTokens Expanded input token count.
 * @returns {void}
 */
export function assertContextBudget(inputTokens) {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) {
    throw new RangeError('Input token count must be a nonnegative integer.');
  }
  if (inputTokens + MAX_NEW_TOKENS > MAX_CONTEXT_TOKENS) {
    throw new RangeError(
      'Context budget exceeded. Clear the conversation or capture a new image.'
    );
  }
}

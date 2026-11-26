import {setDefaultBaseUrls} from '@google/genai';
import type {ChildProcess} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {startTestServer, stopTestServer} from 'test-server-sdk';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {AI} from './AI';
import {AIOptions} from './AIOptions';

// Sends the real requests @google/genai builds for xrblocks to Gemini traffic
// recorded from the API in test/gemini. A request the recording does not match,
// such as a new API version or body shape, fails here without an API key.
// After changing a request, record again with your own key:
//   GEMINI_API_KEY=... npm run test:gemini:record
const RECORD = process.env.GEMINI_RECORD === '1';
// Vitest runs from the repository root.
const ROOT = resolve('test/gemini');
// A 16x16 red PNG.
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR42mO8IyfHQApgYiARjGoY1TB0NAAAjEsBOPY5fDQAAAAASUVORK5CYII=';

let server: ChildProcess | undefined;
let ai: AI;

beforeAll(async () => {
  if (RECORD && !process.env.GEMINI_API_KEY) {
    throw new Error('Set GEMINI_API_KEY to record Gemini traffic.');
  }
  const recordingDir = resolve(ROOT, 'recordings');
  mkdirSync(recordingDir, {recursive: true});
  server = await startTestServer({
    configPath: resolve(ROOT, 'test-server.yml'),
    recordingDir,
    mode: RECORD ? 'record' : 'replay',
    // A missing recording still shows in the failing request's error.
    onStdOut: () => {},
  });
  setDefaultBaseUrls({geminiUrl: 'http://localhost:1453'});
  const options = new AIOptions();
  options.enabled = options.gemini.enabled = true;
  // Replays never reach Google, so any key works there.
  options.gemini.apiKey = process.env.GEMINI_API_KEY || 'replay';
  ai = new AI();
  await ai.init({aiOptions: options});
}, 60_000);

afterAll(async () => {
  ai?.dispose();
  if (server) await stopTestServer(server);
});

function text(reply: Awaited<ReturnType<AI['query']>>) {
  return typeof reply === 'string' ? reply : reply?.text;
}

describe('Gemini requests against recorded API traffic', () => {
  it('answers a text prompt', async () => {
    const reply = await ai.query({prompt: 'Reply with one word: hello.'});
    expect(text(reply)?.trim()).toBeTruthy();
  }, 60_000);

  it('answers about an image sent with a text prompt', async () => {
    const reply = await ai.query({
      type: 'multiPart',
      parts: [
        {inlineData: {mimeType: 'image/png', data: RED_PNG}},
        {text: 'What color is this image? Answer in one word.'},
      ],
    });
    expect(text(reply)?.trim()).toBeTruthy();
  }, 60_000);
});

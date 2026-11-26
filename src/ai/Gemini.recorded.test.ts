import {setDefaultBaseUrls} from '@google/genai';
import type {ChildProcess} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {startTestServer, stopTestServer} from 'test-server-sdk';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {Tool} from '../agent/Tool';
import type {XRDeviceCamera} from '../camera/XRDeviceCamera';
import {GeminiDetectorBackend} from '../world/objects/backends/GeminiDetectorBackend';
import type {CameraSnapshot} from '../world/objects/ObjectDetector';
import {WorldOptions} from '../world/WorldOptions';
import {AI} from './AI';
import {AIOptions} from './AIOptions';

// Sends the real requests @google/genai builds for xrblocks to Gemini traffic
// recorded from the API in test/gemini. A request the recording does not match,
// such as a new API version or body shape, fails here without an API key.
// After changing a request, record again with your own key:
//   GEMINI_API_KEY=... npm run test:gemini:record
const RECORD = process.env.GEMINI_RECORD === '1';
// Replays never reach Google, so any key works there.
const API_KEY = (RECORD && process.env.GEMINI_API_KEY) || 'replay-key';
// Vitest runs from the repository root.
const ROOT = resolve('test/gemini');
// A 16x16 red PNG.
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR42mO8IyfHQApgYiARjGoY1TB0NAAAjEsBOPY5fDQAAAAASUVORK5CYII=';
// A 64x64 red circle on white, for the object detector.
const RED_CIRCLE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAp0lEQVR42u3ZwQ3AIAwEwauE/otKL0kDiQQEzGEWUcDOC2Hr3vwIAAAAAAAAAADADHCV8nqtAV/RszGKTx/L0ML6IQYtTB/CkEP9H4NM6rsN8qnvMxwGmF3fYZBbfavhGEBkfZMBAIAIQHx9vQEAAAAAAMwH8BIDAMCPzAGw/aeeuZAHYPvRYobhbobxeoYFR5IVU4YlX5I1a6pFNwAAAAAAAADgFMADZNh3i+S0WuMAAAAASUVORK5CYII=';

let server: ChildProcess | undefined;
let options: AIOptions;
let ai: AI;

// detect() is protected; this calls it without a camera or depth mesh.
class RecordedDetector extends GeminiDetectorBackend<unknown> {
  detectSnapshot(snapshot: CameraSnapshot) {
    return this.detect(snapshot);
  }
}

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
    // Live sends the key in its WebSocket URL. test-server swaps these values
    // for REDACTED in both modes, so URLs match and the key is never saved.
    env: {TEST_SERVER_SECRETS: API_KEY},
    // A missing HTTP recording still shows in the failing request's error.
    onStdOut: () => {},
  });
  setDefaultBaseUrls({geminiUrl: 'http://localhost:1453'});
  options = new AIOptions();
  options.enabled = options.gemini.enabled = true;
  options.gemini.apiKey = API_KEY;
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

  it('answers about an image sent on its own', async () => {
    const reply = await ai.query({
      type: 'base64',
      base64: RED_PNG,
      mimeType: 'image/png',
    });
    expect(text(reply)?.trim()).toBeTruthy();
  }, 60_000);

  it('returns the tool call the model asks for', async () => {
    const weather = new Tool({
      name: 'get_weather',
      description: 'Gets the current weather in a city.',
      parameters: {
        type: 'OBJECT',
        properties: {city: {type: 'STRING'}},
        required: ['city'],
      },
    });
    const config = options.gemini.config;
    options.gemini.config = {tools: [weather.toInteractions()]};
    try {
      const reply = await ai.query({prompt: 'What is the weather in Paris?'});
      expect(reply).toMatchObject({
        toolCall: {name: 'get_weather', args: {city: 'Paris'}},
      });
    } finally {
      options.gemini.config = config;
    }
  }, 60_000);

  it('finds objects with the Gemini detector backend', async () => {
    const detector = new RecordedDetector({
      options: new WorldOptions(),
      ai,
      aiOptions: options,
      deviceCamera: {} as XRDeviceCamera,
    });
    // A failed request also returns no objects, so expect at least one.
    const objects = await detector.detectSnapshot({
      base64: `data:image/png;base64,${RED_CIRCLE_PNG}`,
    });
    expect(objects.length).toBeGreaterThan(0);
  }, 60_000);

  it('answers a text turn in a Live session', async () => {
    const transcript: string[] = [];
    const turnComplete = new Promise<void>((resolve, reject) => {
      ai.setLiveCallbacks({
        onmessage: (message) => {
          const content = message.serverContent;
          if (content?.outputTranscription?.text) {
            transcript.push(content.outputTranscription.text);
          }
          if (content?.turnComplete) resolve();
        },
        onclose: (event) =>
          reject(
            new Error(`Live session closed: ${event.code} ${event.reason}`)
          ),
      });
    });
    await Promise.all([
      turnComplete,
      ai
        .startLiveSession()
        .then(() =>
          ai.sendRealtimeInput({text: 'Reply with one word: hello.'})
        ),
    ]);
    await ai.stopLiveSession();
    expect(transcript.join('').trim()).toBeTruthy();
  }, 60_000);
});

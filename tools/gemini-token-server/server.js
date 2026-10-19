import {createServer} from 'node:http';
import {GoogleGenAI} from '@google/genai';
import {GEMINI_DEFAULT_LIVE_MODEL} from '../../src/ai/AIOptions.ts';

const {GEMINI_API_KEY} = process.env;
if (!GEMINI_API_KEY) {
  throw new Error('Set GEMINI_API_KEY in the server environment.');
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://127.0.0.1:8080';
const liveModel = process.env.GEMINI_LIVE_MODEL ?? GEMINI_DEFAULT_LIVE_MODEL;
const client = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {apiVersion: 'v1alpha'},
});

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && origin !== allowedOrigin) {
    response.writeHead(403).end();
    return;
  }

  if (origin === allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type'
    );
    response.setHeader('Access-Control-Max-Age', '600');
    response.setHeader('Vary', 'Origin');
  }

  if (request.method === 'OPTIONS') {
    if (origin !== allowedOrigin) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(204).end();
    return;
  }

  if (
    request.method !== 'POST' ||
    new URL(request.url ?? '/', 'http://localhost').pathname !==
      '/api/gemini-live-token'
  ) {
    response.writeHead(404).end();
    return;
  }

  try {
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {model: liveModel},
        lockAdditionalFields: [],
      },
    });
    if (!token.name) throw new Error('Gemini returned an unnamed auth token.');

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    });
    response.end(
      JSON.stringify({token: token.name, expireTime: token.expireTime})
    );
  } catch (error) {
    console.error('Failed to create Gemini Live token:', error);
    response.writeHead(502, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify({error: 'Could not create Gemini Live token'}));
  }
});

server.listen(port, host, () => {
  console.log(`Gemini token server listening on http://${host}:${port}`);
});

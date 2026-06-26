#!/usr/bin/env node

import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const url = process.env.REMOTE_CONTROL_URL || 'ws://127.0.0.1:8791';
const sessionId = process.env.REMOTE_CONTROL_SESSION || 'default';
const command = process.argv[2] || 'observe';
const extraJson =
  command === 'tool' || command === 'call-tool'
    ? process.argv[4]
    : process.argv[3];

if (typeof WebSocket === 'undefined') {
  console.error(
    'This helper requires Node 24+ with the built-in WebSocket API.'
  );
  process.exit(1);
}

const request = createRequest(command, extraJson);
const ws = new WebSocket(url);
let sent = false;

const timeout = setTimeout(() => {
  console.error(`Timed out waiting for remote-control response from ${url}`);
  try {
    ws.close();
  } catch {
    // ignore
  }
  process.exit(1);
}, 8000);

ws.addEventListener('open', () => {
  ws.send(
    JSON.stringify({
      type: 'hello',
      role: 'client',
      sessionId,
      protocolVersion: 1,
      client: 'xrblocks-remote-control-smoke-cli',
    })
  );
});

ws.addEventListener('message', async (event) => {
  const message = JSON.parse(await messageDataToString(event.data));

  if (message.type === 'simulatorReady' && !sent) {
    sent = true;
    ws.send(JSON.stringify(request));
    return;
  }

  if (message.type === 'response' && message.id === request.id) {
    clearTimeout(timeout);
    await saveReturnedImages(message, command);
    console.log(JSON.stringify(message, null, 2));
    ws.close();
  }
});

ws.addEventListener('error', () => {
  clearTimeout(timeout);
  console.error(`Failed to connect to ${url}`);
  process.exit(1);
});

function createRequest(name, jsonArg) {
  const id = `smoke-${Date.now()}`;
  const args = jsonArg ? JSON.parse(jsonArg) : undefined;

  switch (name) {
    case 'tool':
    case 'call-tool': {
      const toolName = process.argv[3];
      if (!toolName) {
        console.error(
          'Usage: node samples/remote_control/send.mjs tool <toolName> [jsonArgs]'
        );
        process.exit(1);
      }
      return {
        id,
        type: 'callTool',
        name: toolName,
        args: args || {},
      };
    }
    case 'observe':
    case 'get-camera':
      return {
        id,
        type: 'callTool',
        name: 'getCamera',
        args: args || {screenshot: true, overlayOnCamera: true},
      };
    case 'step-forward':
      return {
        id,
        type: 'callTool',
        name: 'step',
        args: {
          durationMs: 250,
          control: {
            locomotion: {move: [0, 0, -0.25]},
          },
        },
      };
    case 'get-hands':
      return {
        id,
        type: 'callTool',
        name: 'getHands',
        args: args || {},
      };
    case 'get-state':
      return {
        id,
        type: 'callTool',
        name: 'getSimulatorState',
        args: args || {},
      };
    case 'screenshot':
      return {
        id,
        type: 'callTool',
        name: 'getScreenshot',
        args: args || {overlayOnCamera: true},
      };
    case 'get-cube':
      return {
        id,
        type: 'callTool',
        name: 'getCubeState',
        args: args || {},
      };
    case 'nudge-cube':
      return {
        id,
        type: 'callTool',
        name: 'nudgeCube',
        args: args || {},
      };
    case 'reset-cube':
      return {
        id,
        type: 'callTool',
        name: 'resetCube',
        args: args || {},
      };
    default:
      console.error(
        [
          `Unknown command: ${name}`,
          '',
          'Usage:',
          '  node samples/remote_control/send.mjs observe',
          '  node samples/remote_control/send.mjs get-camera \'{"screenshot":true}\'',
          '  node samples/remote_control/send.mjs step-forward',
          '  node samples/remote_control/send.mjs get-hands',
          '  node samples/remote_control/send.mjs get-state',
          '  node samples/remote_control/send.mjs screenshot',
          '  node samples/remote_control/send.mjs tool getCamera \'{"screenshot":true}\'',
          '  node samples/remote_control/send.mjs get-cube',
          '  node samples/remote_control/send.mjs nudge-cube',
          '  node samples/remote_control/send.mjs nudge-cube \'{"dx":0.25}\'',
          '  node samples/remote_control/send.mjs reset-cube',
        ].join('\n')
      );
      process.exit(1);
  }
}

async function saveReturnedImages(message, commandName) {
  if (!message.ok || message.result === undefined) return;
  const savedFiles = [];
  message.result = await replaceImageDataUrls(
    message.result,
    savedFiles,
    commandName
  );
  if (savedFiles.length > 0) {
    message.downloadedFiles = savedFiles;
  }
}

async function replaceImageDataUrls(value, savedFiles, commandName) {
  if (typeof value === 'string' && value.startsWith('data:image/')) {
    const file = await saveDataUrl(value, commandName, savedFiles.length);
    savedFiles.push(file);
    return file.path;
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => replaceImageDataUrls(item, savedFiles, commandName))
    );
  }

  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [
        key,
        await replaceImageDataUrls(item, savedFiles, commandName),
      ])
    );
    return Object.fromEntries(entries);
  }

  return value;
}

async function saveDataUrl(dataUrl, commandName, index) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Unsupported image data URL.');
  }
  const [, mimeType, base64] = match;
  const extension = imageExtension(mimeType);
  const dir = path.join(tmpdir(), 'xrblocks-remote-control');
  await mkdir(dir, {recursive: true});
  const safeCommand = commandName.replace(/[^a-zA-Z0-9_-]/g, '-');
  const filePath = path.join(
    dir,
    `${safeCommand}-${Date.now()}-${index}.${extension}`
  );
  const bytes = Buffer.from(base64, 'base64');
  await writeFile(filePath, bytes);
  return {
    path: filePath,
    mimeType,
    sizeBytes: bytes.byteLength,
  };
}

function imageExtension(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return mimeType.split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '') || 'img';
  }
}

async function messageDataToString(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  if (data instanceof Blob) return data.text();
  return String(data);
}

import type {IncomingMessage} from 'node:http';
import {expect, it} from 'vitest';
import WebSocket from 'ws';
import {createRelayServer} from './relay.js';

it('accepts CLI, loopback and configured origins, and rejects an untrusted origin', async () => {
  const server = createRelayServer({
    port: 0,
    host: '127.0.0.1',
    allowedOrigins: 'https://trusted.example.com',
    quiet: true,
  });
  const sockets = new Set<WebSocket>();
  try {
    await new Promise<void>((resolve, reject) => {
      server.wss.once('listening', resolve);
      server.wss.once('error', reject);
    });
    const address = server.wss.address() as {port: number};
    for (const [origin, expected] of [
      [undefined, 101],
      ['http://localhost:8080', 101],
      ['https://trusted.example.com', 101],
      ['https://evil.example.com', 403],
    ] as const) {
      const status = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${address.port}`, {
          headers: origin ? {Origin: origin} : {},
        });
        sockets.add(socket);
        socket.once('open', () => {
          socket.close();
          resolve(101);
        });
        socket.once(
          'unexpected-response',
          (_request: unknown, response: IncomingMessage) => {
            response.resume();
            socket.terminate();
            resolve(response.statusCode!);
          }
        );
        socket.once('error', (error: Error) => {
          if (expected !== 403) reject(error);
        });
      });
      expect(status, String(origin)).toBe(expected);
    }
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
});

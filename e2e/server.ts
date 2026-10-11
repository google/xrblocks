import {createServer, type Server} from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {extname, join, normalize, sep} from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

export type StaticServer = {
  url: string;
  close(): Promise<void>;
};

/**
 * Serves the repository root on an ephemeral port (bind port 0). Used by the
 * E2E suite so parallel runs never collide on a fixed port.
 */
export function startStaticServer(root: string): Promise<StaticServer> {
  const server: Server = createServer((request, response) => {
    const requestPath = decodeURIComponent(
      (request.url ?? '/').split('?')[0] ?? '/'
    );
    const relative = normalize(requestPath).replace(/^([/\\])+/, '');
    const filePath = join(root, relative);
    // Refuse traversal outside the served root.
    if (!filePath.startsWith(root + sep) && filePath !== root) {
      response.writeHead(403).end();
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type':
        MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        resolve({
          url: `http://127.0.0.1:${address.port}`,
          close: () =>
            new Promise<void>((done) => {
              server.close(() => done());
            }),
        });
        return;
      }
      reject(new Error('Static server failed to report its address.'));
    });
  });
}

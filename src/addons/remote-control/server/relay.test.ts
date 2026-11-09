import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import WebSocket from 'ws';
import {
  createRelayServer,
  isOriginAllowed,
  parseAllowedOrigins,
} from './relay.js';

describe('remote-control relay origin verification', () => {
  describe('parseAllowedOrigins', () => {
    it('returns an empty set for undefined, null, or empty values', () => {
      expect(parseAllowedOrigins(undefined).size).toBe(0);
      expect(parseAllowedOrigins(null).size).toBe(0);
      expect(parseAllowedOrigins('').size).toBe(0);
    });

    it('passes through an existing Set', () => {
      const set = new Set(['https://a.com']);
      expect(parseAllowedOrigins(set)).toBe(set);
    });

    it('parses arrays and comma-separated strings with trimming', () => {
      expect(
        Array.from(parseAllowedOrigins(' https://a.com, https://b.com '))
      ).toEqual(['https://a.com', 'https://b.com']);
      expect(
        Array.from(parseAllowedOrigins(['https://a.com', ' https://b.com ']))
      ).toEqual(['https://a.com', 'https://b.com']);
    });
  });

  describe('isOriginAllowed', () => {
    it('allows non-browser clients where Origin is omitted', () => {
      expect(isOriginAllowed(undefined, '127.0.0.1:8791')).toBe(true);
      expect(isOriginAllowed('', '127.0.0.1:8791')).toBe(true);
      expect(isOriginAllowed(null, '127.0.0.1:8791')).toBe(true);
    });

    it('allows loopback origins regardless of port', () => {
      expect(isOriginAllowed('http://localhost', 'localhost:8791')).toBe(true);
      expect(isOriginAllowed('http://localhost:8080', 'localhost:8791')).toBe(
        true
      );
      expect(isOriginAllowed('http://127.0.0.1:3000', '127.0.0.1:8791')).toBe(
        true
      );
      expect(isOriginAllowed('http://[::1]:5173', '[::1]:8791')).toBe(true);
    });

    it('allows origins matching the request Host header', () => {
      expect(
        isOriginAllowed('https://mydev.internal:443', 'mydev.internal:443')
      ).toBe(true);
      expect(
        isOriginAllowed('http://staging.internal:8080', 'staging.internal:8791')
      ).toBe(true);
    });

    it('allows explicitly allowlisted origins', () => {
      const allowed = 'https://demo.example.com,https://test.example.com';
      expect(
        isOriginAllowed('https://demo.example.com', '127.0.0.1:8791', allowed)
      ).toBe(true);
      expect(
        isOriginAllowed('https://test.example.com', '127.0.0.1:8791', allowed)
      ).toBe(true);
      expect(
        isOriginAllowed('https://other.example.com', '127.0.0.1:8791', allowed)
      ).toBe(false);
    });

    it('rejects untrusted third-party origins (CSWSH prevention)', () => {
      expect(
        isOriginAllowed('https://evil.example.com', '127.0.0.1:8791')
      ).toBe(false);
      expect(isOriginAllowed('https://attacker.com', 'localhost:8791')).toBe(
        false
      );
      expect(
        isOriginAllowed('http://malicious.local', 'victim.internal:8791')
      ).toBe(false);
    });

    it('rejects invalid or non-URL origin strings', () => {
      expect(isOriginAllowed('null', 'localhost:8791')).toBe(false);
      expect(isOriginAllowed('javascript:void(0)', 'localhost:8791')).toBe(
        false
      );
      expect(isOriginAllowed('not-a-valid-url', 'localhost:8791')).toBe(false);
    });
  });

  describe('WebSocketServer live upgrade verification', () => {
    let server: Awaited<ReturnType<typeof createRelayServer>>;
    let port: number;

    beforeEach(async () => {
      server = createRelayServer({
        port: 0,
        host: '127.0.0.1',
        allowedOrigins: 'https://trusted.example.com',
        quiet: true,
      });

      await new Promise<void>((resolve) => {
        server.wss.on('listening', () => {
          const addr = server.wss.address();
          if (typeof addr === 'object' && addr !== null) {
            port = addr.port;
          }
          resolve();
        });
      });
    });

    afterEach(async () => {
      await server.close();
    });

    function connectWithOrigin(
      origin?: string
    ): Promise<{status: 'connected' | 'rejected'; statusCode?: number}> {
      return new Promise((resolve) => {
        const headers: Record<string, string> = {};
        if (origin !== undefined) {
          headers['Origin'] = origin;
        }

        const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
          headers,
        });

        ws.on('open', () => {
          ws.close();
          resolve({status: 'connected'});
        });

        ws.on('unexpected-response', (_req, res) => {
          resolve({status: 'rejected', statusCode: res.statusCode});
        });

        ws.on('error', () => {
          // If rejected during upgrade, unexpected-response or error fires
        });
      });
    }

    it('accepts connections with no Origin (CLI clients)', async () => {
      const res = await connectWithOrigin(undefined);
      expect(res.status).toBe('connected');
    });

    it('accepts connections from loopback origin (local browser)', async () => {
      const res = await connectWithOrigin('http://localhost:8080');
      expect(res.status).toBe('connected');
    });

    it('accepts connections from configured allowed origins', async () => {
      const res = await connectWithOrigin('https://trusted.example.com');
      expect(res.status).toBe('connected');
    });

    it('rejects connections from untrusted cross-origin sites with 403 Forbidden', async () => {
      const res = await connectWithOrigin('https://evil.example.com');
      expect(res.status).toBe('rejected');
      expect(res.statusCode).toBe(403);
    });
  });
});

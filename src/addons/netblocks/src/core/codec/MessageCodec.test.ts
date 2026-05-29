import {describe, it, expect} from 'vitest';

import {MAX_MESSAGE_BYTES} from '../constants/NetConstants';

import {
  encodeMessage,
  decodeMessage,
  makeHello,
  HelloMessage,
  NetObjectSnapshotMessage,
  PoseMessage,
} from './MessageCodec';

describe('MessageCodec', () => {
  describe('encodeMessage / decodeMessage', () => {
    it('round-trips a hello message', () => {
      const msg: HelloMessage = {
        type: 'hello',
        protocol: 1,
        displayName: 'Alice',
        capabilities: {pose: true, voice: true, netobject: true},
        from: 'peer-A',
        ts: 12345,
      };
      const decoded = decodeMessage(encodeMessage(msg));
      expect(decoded).toEqual(msg);
    });

    it('round-trips a pose message', () => {
      const msg: PoseMessage = {
        type: 'pose',
        data: 'AAECAwQF', // arbitrary base64
        from: 'peer-B',
      };
      const decoded = decodeMessage(encodeMessage(msg));
      expect(decoded).toEqual(msg);
    });

    it('round-trips a netobject.snapshot message', () => {
      const msg: NetObjectSnapshotMessage = {
        type: 'netobject.snapshot',
        from: 'peer-A',
        to: 'peer-B',
        objects: [
          {
            id: 'cube-1',
            xform: [1, 2, 3, 0, 0, 0, 1, 1, 1, 1],
            ownerId: 'peer-A',
            state: {color: 'red'},
          },
          {
            id: 'cube-2',
            xform: [4, 5, 6, 0, 0, 0, 1, 1, 1, 1],
            ownerId: '',
          },
        ],
      };
      const decoded = decodeMessage(encodeMessage(msg));
      expect(decoded).toEqual(msg);
    });

    it('decodes from a string directly', () => {
      const json = '{"type":"ping","nonce":42}';
      const decoded = decodeMessage(json);
      expect(decoded.type).toBe('ping');
    });

    it('decodes from an ArrayBuffer', () => {
      const bytes = encodeMessage({type: 'ping', nonce: 7});
      const buf = bytes.slice().buffer; // detach to a real ArrayBuffer
      const decoded = decodeMessage(buf);
      expect(decoded.type).toBe('ping');
    });

    it('throws when the payload exceeds MAX_MESSAGE_BYTES', () => {
      // Build a Uint8Array just over the cap; content doesn't matter — the
      // size check fires before JSON parsing.
      const bytes = new Uint8Array(MAX_MESSAGE_BYTES + 1);
      expect(() => decodeMessage(bytes)).toThrow(/MAX_MESSAGE_BYTES/);
    });

    it('throws on oversized strings too', () => {
      const big = 'a'.repeat(MAX_MESSAGE_BYTES + 1);
      expect(() => decodeMessage(big)).toThrow(/MAX_MESSAGE_BYTES/);
    });

    it('throws on oversized ArrayBuffer too', () => {
      const buf = new ArrayBuffer(MAX_MESSAGE_BYTES + 1);
      expect(() => decodeMessage(buf)).toThrow(/MAX_MESSAGE_BYTES/);
    });

    it('throws on malformed JSON', () => {
      expect(() => decodeMessage('{not valid json')).toThrow();
    });

    it('round-trips an unknown message type without throwing (forward-compat)', () => {
      // The codec deliberately doesn't validate `type`; NetSession's switch
      // ignores unknown types so newer peers can ship message types older
      // peers don't recognise without crashing them.
      const json = '{"type":"future.feature","x":1}';
      const decoded = decodeMessage(json);
      expect(decoded.type).toBe('future.feature');
    });

    it('accepts payloads at exactly the limit', () => {
      // A valid JSON 'ping' padded with whitespace up to the cap.
      const base = '{"type":"ping","nonce":1}';
      const padded = base + ' '.repeat(MAX_MESSAGE_BYTES - base.length);
      expect(padded.length).toBe(MAX_MESSAGE_BYTES);
      const decoded = decodeMessage(padded);
      expect(decoded.type).toBe('ping');
    });
  });

  describe('makeHello', () => {
    it('builds a HelloMessage with the current protocol version', () => {
      const caps = {pose: true, voice: false, netobject: true};
      const hello = makeHello('Bob', caps);
      expect(hello.type).toBe('hello');
      expect(hello.protocol).toBe(1);
      expect(hello.displayName).toBe('Bob');
      expect(hello.capabilities).toEqual(caps);
    });

    it('allows undefined displayName', () => {
      const hello = makeHello(undefined, {
        pose: false,
        voice: false,
        netobject: false,
      });
      expect(hello.displayName).toBeUndefined();
    });
  });
});

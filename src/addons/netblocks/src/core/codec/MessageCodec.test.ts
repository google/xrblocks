import {describe, it, expect} from 'vitest';

import {MAX_MESSAGE_BYTES} from '../constants/NetConstants';

import {encodeMessage, decodeMessage, HelloMessage} from './MessageCodec';

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

    it('throws when the payload exceeds MAX_MESSAGE_BYTES', () => {
      // Build a Uint8Array just over the cap; content doesn't matter — the
      // size check fires before JSON parsing.
      const bytes = new Uint8Array(MAX_MESSAGE_BYTES + 1);
      expect(() => decodeMessage(bytes)).toThrow(/MAX_MESSAGE_BYTES/);
    });

    it('throws on malformed JSON', () => {
      expect(() => decodeMessage('{not valid json')).toThrow();
    });
  });
});

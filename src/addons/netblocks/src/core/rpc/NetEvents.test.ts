import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {NetSession} from '../NetSession';
import {Transport} from '../transport/Transport';

it('delivers broadcast and directed events, supports unsubscribe, and isolates failed handlers', async () => {
  const wires: Wire[] = [];
  class Wire extends Transport {
    name = 'memory';
    isOpen = false;
    constructor(readonly localPeerId: string) {
      super();
      wires.push(this);
    }
    get remotePeerIds() {
      return new Set(
        wires
          .filter((wire) => wire !== this && wire.isOpen)
          .map((wire) => wire.localPeerId)
      );
    }
    async connect() {
      this.isOpen = true;
    }
    close() {
      this.isOpen = false;
    }
    send(data: Uint8Array, target?: string) {
      for (const wire of wires)
        if (
          wire !== this &&
          wire.isOpen &&
          (!target || target === wire.localPeerId)
        )
          wire.emitMessage(this.localPeerId, data);
    }
  }
  const sessions = ['a', 'b', 'c'].map(
    (id) => new NetSession(new Wire(id), new THREE.Group())
  );
  const received: string[] = [];
  const off = sessions[1].events.on('chat', (value, from) => {
    received.push(`b:${from}:${value}`);
  });
  sessions[2].events.on('chat', () => {
    throw new Error('handler failed');
  });
  sessions[2].events.on('chat', (value, from) => {
    received.push(`c:${from}:${value}`);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const session of sessions) await session.open('room');
    sessions[0].events.emit('chat', 'hello');
    expect(received).toEqual(['b:a:hello', 'c:a:hello']);
    off();
    sessions[0].events.emitTo('c', 'chat', 'direct');
    expect(received).toEqual(['b:a:hello', 'c:a:hello', 'c:a:direct']);
    sessions[0].events.emit('chat', 'again');
    expect(received.at(-1)).toBe('c:a:again');
    expect(received.filter((value) => value.startsWith('b:'))).toHaveLength(1);
  } finally {
    for (const session of sessions) session.close();
    vi.restoreAllMocks();
  }
});

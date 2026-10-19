import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NetEvents} from '../netblocks/src/core/rpc/NetEvents';
import type {
  NetMessage,
  RpcMessage,
} from '../netblocks/src/core/codec/MessageCodec';
import {RoomcraftClock, readMotionClock} from './RoomcraftClock';

class ClockSession extends EventTarget {
  isOpen = true;
  users = new Map<string, unknown>();
  events: NetEvents;
  constructor(
    readonly localPeerId: string,
    send: (message: NetMessage) => void
  ) {
    super();
    this.events = new NetEvents(send);
  }
}

function harness() {
  let time = 10_000;
  const peers = new Map<string, ReturnType<typeof add>>();
  const packets: Array<{to: string; message: RpcMessage}> = [];
  function advance(milliseconds: number) {
    time += milliseconds;
    vi.advanceTimersByTime(milliseconds);
  }
  function add(id: string, skew: number, initialTime = 0) {
    const session = new ClockSession(id, (message) => {
      if (message.type !== 'rpc') throw new Error('Expected a clock RPC');
      for (const peer of peers.keys()) {
        if (peer === id || (message.to && peer !== message.to)) continue;
        packets.push({to: peer, message: {...message, from: id}});
      }
    });
    const errors = vi.fn();
    const changed = vi.fn();
    const now = () => time + skew;
    const clock = new RoomcraftClock(session, {
      epoch: `epoch-${id}`,
      now,
      initialTime,
      onError: errors,
      onChange: changed,
    });
    for (const [other, value] of peers) {
      session.users.set(other, {});
      value.session.users.set(id, {});
    }
    const peer = {session, clock, errors, changed, now};
    peers.set(id, peer);
    clocks.push(clock);
    clock.start();
    return peer;
  }
  function deliver(delay = 0) {
    const packet = packets.shift();
    if (!packet) throw new Error('No queued clock packet.');
    advance(delay);
    peers.get(packet.to)?.session.events._dispatch(packet.message);
    return packet;
  }
  function flush() {
    for (let count = 0; packets.length && count < 100; count++) deliver();
    expect(packets).toHaveLength(0);
  }
  return {add, advance, deliver, flush, peers, packets};
}

const clocks: RoomcraftClock[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  clocks.splice(0).forEach((clock) => clock.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared Roomcraft motion clock', () => {
  it('reconciles newer election terms without allowing unrelated scene epochs', () => {
    const network = harness();
    const a = network.add('a', 90_000);
    const b = network.add('b', 9_000_000);
    const before = a.clock.snapshot();
    a.clock.reconcile({...b.clock.snapshot(), term: 20}, a.now());
    expect(a.clock.snapshot()).toEqual(before);
    b.clock.adopt({...before, authority: 'b', term: 1}, b.now());
    a.clock.reconcile(b.clock.snapshot(), a.now());
    network.flush();
    expect(a.clock.state).toMatchObject({authority: 'b', synchronized: true});
    expect(a.clock.snapshot().term).toBe(1);
    expect(a.clock.read()).toBeCloseTo(b.clock.read(), 8);
  });

  it('catches up elections missed while a joining peer stages its scene', () => {
    const network = harness();
    const a = network.add('a', 0);
    const b = network.add('b', 80_000);
    const c = network.add('c', 500_000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    c.clock.adopt(a.clock.snapshot(), c.now());
    network.flush();
    const saved = a.clock.snapshot();
    const d = network.add('d', 900_000);
    for (const [departed, remaining] of [
      [a, [b, c, d]],
      [b, [c, d]],
    ] as const) {
      departed.clock.dispose();
      network.peers.delete(departed.session.localPeerId);
      for (const peer of remaining) {
        peer.session.users.delete(departed.session.localPeerId);
        peer.session.dispatchEvent(
          new CustomEvent('user-leave', {
            detail: {
              user: {peerId: departed.session.localPeerId},
            },
          })
        );
      }
      network.flush();
    }
    expect(c.clock.snapshot().term).toBe(2);
    d.clock.adopt(saved, d.now());
    network.flush();
    expect(d.clock.state.synchronized).toBe(true);
    expect(d.clock.snapshot().term).toBe(2);
    expect(d.clock.read()).toBeCloseTo(c.clock.read(), 8);
  });

  it('follows a correlated redirect from a peer that is no longer authoritative', () => {
    const network = harness();
    const z = network.add('z', 1000);
    const a = network.add('a', 80_000);
    a.clock.adopt(z.clock.snapshot(), a.now());
    network.flush();
    const c = network.add('c', 900_000);
    c.clock.adopt({...z.clock.snapshot(), authority: 'a'}, c.now());
    network.flush();
    expect(c.clock.state.authority).toBe('z');
    expect(c.clock.state.synchronized).toBe(true);
  });

  it('lets a reachable authority acknowledge a newer election term', () => {
    const network = harness();
    const a = network.add('a', 0);
    const b = network.add('b', 10_000);
    b.clock.adopt({...a.clock.snapshot(), term: 3}, b.now());
    network.flush();
    expect(a.clock.snapshot().term).toBe(3);
    expect(b.clock.state.synchronized).toBe(true);
  });

  it('aligns a delayed peer despite unrelated monotonic origins and wall-clock skew', () => {
    const network = harness();
    const a = network.add('a', 90_000);
    network.advance(7000);
    vi.spyOn(Date, 'now').mockReturnValue(-1_000_000_000);
    const b = network.add('b', 9_000_000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    expect(b.clock.pending).toBe(true);
    network.deliver(20);
    network.deliver(20);
    expect(b.clock.read()).toBeCloseTo(a.clock.read(), 8);
    expect(b.clock.state).toEqual({
      authority: 'a',
      synchronized: true,
      uncertaintyMs: 20,
    });
    // No frame updates are needed, including when a browser tab is backgrounded.
    network.advance(3000);
    expect(b.clock.read()).toBeCloseTo(a.clock.read(), 8);
  });

  it('accounts for a snapshot waiting behind an asynchronous scene import', () => {
    const network = harness();
    const a = network.add('a', 1000);
    const b = network.add('b', 200_000);
    const snapshot = a.clock.snapshot();
    const receivedAt = b.now();
    network.advance(3500);
    b.clock.adopt(snapshot, receivedAt);
    expect(b.clock.read()).toBeCloseTo(a.clock.read(), 8);
    network.flush();
    expect(b.clock.pending).toBe(false);
  });

  it('keeps the low-delay sample rather than adopting a noisier asymmetric round trip', () => {
    const network = harness();
    const a = network.add('a', 1000);
    const b = network.add('b', 9000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    network.deliver(10);
    network.deliver(10);
    network.advance(150);
    network.deliver(90);
    network.deliver(10);
    expect(b.clock.state.uncertaintyMs).toBe(10);
    expect(b.clock.read()).toBeCloseTo(a.clock.read(), 8);
  });

  it('does not restart the timeline when a content replacement carries the same epoch', () => {
    const network = harness();
    const a = network.add('a', 0);
    const b = network.add('b', 400_000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    network.flush();
    const oldSnapshot = a.clock.snapshot();
    network.advance(1000);
    b.clock.adopt(oldSnapshot, b.now());
    expect(b.clock.read()).toBeCloseTo(a.clock.read(), 8);
    expect(b.clock.state.synchronized).toBe(true);
  });

  it('elects a remaining authority without resetting elapsed time', () => {
    const network = harness();
    const a = network.add('a', 900);
    const b = network.add('b', 80_000);
    const c = network.add('c', 5_000_000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    c.clock.adopt(a.clock.snapshot(), c.now());
    network.flush();
    network.advance(3000);
    network.flush();
    const before = b.clock.read();
    a.clock.dispose();
    network.peers.delete('a');
    for (const peer of [b, c]) {
      peer.session.users.delete('a');
      peer.session.dispatchEvent(
        new CustomEvent('user-leave', {detail: {user: {peerId: 'a'}}})
      );
    }
    network.flush();
    expect(b.clock.state.authority).toBe('b');
    expect(c.clock.state.authority).toBe('b');
    expect(b.clock.read()).toBe(before);
    expect(c.clock.read()).toBeCloseTo(before, 8);
  });

  it('reports an unanswered clock without claiming synchronized timing', () => {
    const network = harness();
    const a = network.add('a', 0);
    const b = network.add('b', 100_000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    network.advance(8001);
    expect(b.errors).toHaveBeenCalledOnce();
    expect(b.clock.state.synchronized).toBe(false);
    expect(b.clock.pending).toBe(false);
    b.clock.resync();
    expect(b.clock.pending).toBe(true);
    network.flush();
    expect(b.clock.state.synchronized).toBe(true);
  });

  it('ignores stale responses after an epoch change and stops timers/listeners on disposal', () => {
    const network = harness();
    const a = network.add('a', 100);
    const b = network.add('b', 100_000);
    b.clock.adopt(a.clock.snapshot(), b.now());
    network.deliver(5);
    const stale = network.packets.shift()!;
    b.clock.adopt(
      {...a.clock.snapshot(), epoch: 'replacement', elapsed: 20},
      b.now()
    );
    b.session.events._dispatch(stale.message);
    expect(b.clock.read()).toBe(20);
    expect(b.clock.state.synchronized).toBe(false);
    b.clock.dispose();
    const count = network.packets.length;
    network.advance(60_000);
    expect(network.packets).toHaveLength(count);
    expect(b.errors).not.toHaveBeenCalled();
  });

  it('validates snapshot time and preserves the current timeline on invalid input', () => {
    const network = harness();
    const a = network.add('a', 0, 12);
    expect(() =>
      readMotionClock({...a.clock.snapshot(), elapsed: Infinity})
    ).toThrow();
    expect(() =>
      a.clock.adopt(
        {...a.clock.snapshot(), epoch: 'invalid', elapsed: Number.MAX_VALUE},
        a.now()
      )
    ).toThrow();
    expect(a.clock.read()).toBe(12);
  });
});

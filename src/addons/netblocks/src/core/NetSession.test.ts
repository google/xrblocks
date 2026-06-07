import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

// NetSession imports `xrblocks` only to read `xb.core.sound.listener` inside
// open(). The real module instantiates a Core (and AudioContext) at import
// time, which jsdom can't satisfy — and we never call open() here anyway.
// `RemoteUserAvatar` also reaches into `xb.StylizedFace` in its
// constructor, so stub that with a bare Object3D.
vi.mock('xrblocks', async () => {
  const T = await import('three');
  return {
    core: undefined,
    StylizedFace: class extends T.Object3D {
      dispose() {}
    },
  };
});

import {
  decodeMessage,
  encodeMessage,
  HelloMessage,
  NetMessage,
  NetObjectMessage,
  NetObjectSnapshotMessage,
} from './codec/MessageCodec';
import {NET_PROTOCOL_VERSION} from './constants/NetConstants';
import {NetSession} from './NetSession';
import {NetObject} from './objects/NetObject';
import {Transport} from './transport/Transport';

class FakeTransport extends Transport {
  readonly name = 'fake';
  localPeerId = 'local-peer';
  isOpen = true;
  remotePeerIds: ReadonlySet<string> = new Set();
  sent: Array<{payload: Uint8Array; to?: string}> = [];

  async connect() {
    // no-op
  }
  close() {
    this.isOpen = false;
  }
  send(payload: Uint8Array, targetPeerId?: string) {
    this.sent.push({payload, to: targetPeerId});
  }

  // Test helper.
  receive(fromPeerId: string, msg: NetMessage) {
    this.emitMessage(fromPeerId, encodeMessage({...msg, from: fromPeerId}));
  }
}

function decodeSent(sent: Array<{payload: Uint8Array; to?: string}>) {
  return sent.map((s) => ({to: s.to, msg: decodeMessage(s.payload)}));
}

describe('NetSession hello handler', () => {
  it('replies with a netobject.snapshot of dirty NetObjects, targeted at the joiner', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    const dirty = new NetObject({id: 'cube-1'});
    dirty.position.set(1, 2, 3);
    dirty._dirty = true;
    const pristine = new NetObject({id: 'cube-2'});
    session.netObjects.add(dirty);
    session.netObjects.add(pristine);

    transport.sent.length = 0;
    transport.receive('joiner', {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      capabilities: {pose: true, voice: true, netobject: true},
      displayName: 'Joiner',
    } as HelloMessage);

    const decoded = decodeSent(transport.sent);
    const snapshot = decoded.find(
      (d) => d.msg.type === 'netobject.snapshot'
    ) as {to?: string; msg: NetObjectSnapshotMessage} | undefined;

    expect(snapshot).toBeDefined();
    expect(snapshot!.to).toBe('joiner');
    expect(snapshot!.msg.objects.map((o) => o.id)).toEqual(['cube-1']);
    expect(snapshot!.msg.objects[0].xform.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('does not send a snapshot when no NetObjects are dirty', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    session.netObjects.add(new NetObject({id: 'cube-1'}));

    transport.sent.length = 0;
    transport.receive('joiner', {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      capabilities: {pose: true, voice: true, netobject: true},
    } as HelloMessage);

    const types = decodeSent(transport.sent).map((d) => d.msg.type);
    expect(types).not.toContain('netobject.snapshot');
  });

  it('always replies with a welcome to the joiner', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');

    transport.sent.length = 0;
    transport.receive('joiner', {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      capabilities: {pose: true, voice: true, netobject: true},
    } as HelloMessage);

    const welcome = decodeSent(transport.sent).find(
      (d) => d.msg.type === 'welcome'
    );
    expect(welcome).toBeDefined();
    expect(welcome!.to).toBe('joiner');
  });
});

describe('NetSession late-join state-reset regression', () => {
  it('joiner adopts a snapshot for an auto-owned NetObject it has never moved', async () => {
    // Joiner side. We're "local-peer", we just constructed a NetObject which
    // is auto-owned (ownerId === localPeerId) and pristine. An existing peer
    // sends us a snapshot. We should *apply* it (xform + ownerId) — the old
    // skip-if-I-own guard caused us to discard the snapshot and stay at
    // constructor defaults.
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    const local = new NetObject({id: 'cube-1', ownerId: 'local-peer'});
    session.netObjects.add(local);
    expect(local._dirty).toBe(false);

    transport.receive('existing-peer', {
      type: 'netobject.snapshot',
      objects: [
        {
          id: 'cube-1',
          xform: [5, 6, 7, 0, 0, 0, 1, 1, 1, 1],
          ownerId: 'existing-peer',
        },
      ],
    } as NetObjectSnapshotMessage);

    expect(local.position.toArray()).toEqual([5, 6, 7]);
    expect(local.ownerId).toBe('existing-peer');
  });

  it('dirty owner does not yield to a lex-smaller silent broadcaster', async () => {
    // Existing peer side. We own and have moved cube-1 (`_dirty=true`). A
    // lex-smaller joiner ("aaa") starts broadcasting netobject updates with
    // their constructor defaults before our snapshot reaches them. The old
    // tiebreak handed ownership to "aaa" and snapped us to defaults; the
    // new one keeps our authoritative state.
    const transport = new FakeTransport();
    transport.localPeerId = 'zzz';
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    const owned = new NetObject({id: 'cube-1', ownerId: 'zzz'});
    owned.position.set(1, 2, 3);
    owned._dirty = true;
    session.netObjects.add(owned);

    transport.receive('aaa', {
      type: 'netobject',
      id: 'cube-1',
      xform: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    } as NetObjectMessage);

    expect(owned.ownerId).toBe('zzz');
    expect(owned.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('NetSession close ordering', () => {
  // Regression: close() previously sent the session `bye` BEFORE
  // calling voice.disable(). voice.disable() then broadcasts
  // `netblocks/voice-state=false` and per-peer voice `bye` signals.
  // On the remote, the session bye would remove the user first, and
  // the trailing voice messages would land in `_onMessage` where any
  // message from an unknown peer creates a fresh `NetUser` — leaving
  // a ghost avatar behind for the peer that just left.
  it('emits the session bye AFTER voice disable so remotes never resurrect a ghost user', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    // Force voice into the enabled state without going through
    // navigator.mediaDevices (jsdom doesn't have it). disable() still
    // runs its full broadcast path because `wasEnabled` is true.
    (session.voice as unknown as {_enabled: boolean})._enabled = true;
    // Plant a peer connection so voice.disable() emits a voice bye too.
    (
      session.voice as unknown as {
        _peers: Map<
          string,
          {
            pc: {close: () => void; getSenders: () => unknown[]};
            isOfferer: boolean;
          }
        >;
      }
    )._peers.set('peer-x', {
      pc: {close: () => {}, getSenders: () => []},
      isOfferer: false,
    });
    transport.sent.length = 0;

    session.close();

    const decoded = decodeSent(transport.sent);
    const byeIdx = decoded.findIndex(
      (d) => d.msg.type === 'bye' && d.to === undefined
    );
    const voiceByeIdx = decoded.findIndex(
      (d) =>
        d.msg.type === 'voice' &&
        (d.msg as {signal: {kind: string}}).signal.kind === 'bye'
    );
    expect(byeIdx).toBeGreaterThanOrEqual(0);
    expect(voiceByeIdx).toBeGreaterThanOrEqual(0);
    // Voice bye must precede the session bye so the remote sees voice
    // cleanup against the still-known sender, not against an
    // already-removed user.
    expect(voiceByeIdx).toBeLessThan(byeIdx);
  });

  // Regression: WebRTC peers only detect a closed peer via ICE
  // failure, which takes 15–30s — long enough that the departed
  // avatar reads as a frozen ghost in the room. Opening a session
  // now registers a `pagehide` listener that calls `close()` so the
  // session-level `bye` goes out over the data channel and the
  // remote tears down immediately.
  it('open() registers a pagehide handler that closes the session', async () => {
    const added: Array<{type: string; listener: EventListener}> = [];
    const removed: Array<{type: string; listener: EventListener}> = [];
    const origAdd = window.addEventListener.bind(window);
    const origRemove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, listener: EventListener) => {
      added.push({type, listener});
      return origAdd(type, listener);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListener) => {
      removed.push({type, listener});
      return origRemove(type, listener);
    }) as typeof window.removeEventListener;
    try {
      const transport = new FakeTransport();
      const session = new NetSession(transport, new THREE.Group());
      await session.open('room');
      const ph = added.find((a) => a.type === 'pagehide');
      expect(ph).toBeDefined();

      // Trigger pagehide; session should close (and the transport
      // should observe the call).
      const closeSpy = vi.spyOn(transport, 'close');
      ph!.listener(new Event('pagehide'));
      expect(closeSpy).toHaveBeenCalled();
      // close() must remove its own pagehide listener so a re-opened
      // session in the same window doesn't fire stale handlers.
      expect(
        removed.find(
          (r) => r.type === 'pagehide' && r.listener === ph!.listener
        )
      ).toBeDefined();
    } finally {
      window.addEventListener = origAdd;
      window.removeEventListener = origRemove;
    }
  });
});

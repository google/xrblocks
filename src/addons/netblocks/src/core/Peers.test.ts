import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

vi.mock('xrblocks', async () => {
  const T = await import('three');
  return {
    core: undefined,
    // RemoteUserAvatar constructs `new xb.StylizedFace()` in its
    // constructor; stub it with a bare Object3D so the test scaffolding
    // doesn't need a real canvas/WebGL pipeline.
    StylizedFace: class extends T.Object3D {
      dispose() {}
    },
  };
});

import {encodeMessage, HelloMessage, NetMessage} from './codec/MessageCodec';
import {NET_PROTOCOL_VERSION} from './constants/NetConstants';
import {NetCore} from './NetCore';
import {Transport} from './transport/Transport';

class FakeTransport extends Transport {
  readonly name = 'fake';
  localPeerId = 'local-peer';
  isOpen = true;
  remotePeerIds: ReadonlySet<string> = new Set();
  async connect() {}
  close() {
    this.isOpen = false;
  }
  send() {}
  receive(fromPeerId: string, msg: NetMessage) {
    this.emitMessage(fromPeerId, encodeMessage({...msg, from: fromPeerId}));
  }
  fakePeerJoin(peerId: string) {
    this.emitPeerJoin(peerId);
  }
  fakePeerLeave(peerId: string) {
    this.emitPeerLeave(peerId);
  }
}

function helloFrom(_peerId: string, displayName?: string): NetMessage {
  return {
    type: 'hello',
    protocol: NET_PROTOCOL_VERSION,
    displayName,
    capabilities: {pose: true, voice: false, netobject: true},
  } satisfies HelloMessage;
}

describe('Peers facade', () => {
  let net: NetCore;
  let root: THREE.Object3D;

  beforeEach(() => {
    root = new THREE.Object3D();
    net = new NetCore(root);
  });

  it('list() is empty before joinRoom and after leaveRoom', () => {
    expect(net.peers.list()).toEqual([]);
    expect(net.peers.remoteUsers).toEqual([]);
    expect(net.user.peerId).toBeUndefined();
  });

  it('subscriptions registered before joinRoom fire on remote join', async () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    net.peers.on('join', onJoin);
    net.peers.on('leave', onLeave);

    const transport = new FakeTransport();
    await net.joinRoom('room', {transport, displayName: 'Alice'});

    transport.fakePeerJoin('peer-a');
    transport.receive('peer-a', helloFrom('peer-a', 'Bob'));

    expect(onJoin).toHaveBeenCalledTimes(1);
    const user = onJoin.mock.calls[0][0];
    expect(user.peerId).toBe('peer-a');
    expect(user.displayName).toBe('Bob');
    expect(net.peers.list().map((u) => u.peerId)).toEqual(['peer-a']);

    expect(net.user.peerId).toBe('local-peer');
    expect(net.user.displayName).toBe('Alice');

    transport.fakePeerLeave('peer-a');
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(net.peers.list()).toEqual([]);
  });

  it('off() unsubscribes', async () => {
    const onJoin = vi.fn();
    const dispose = net.peers.on('join', onJoin);

    const transport = new FakeTransport();
    await net.joinRoom('room', {transport});

    dispose();
    transport.fakePeerJoin('peer-x');
    transport.receive('peer-x', helloFrom('peer-x'));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('subscriptions persist across rejoin', async () => {
    const onJoin = vi.fn();
    net.peers.on('join', onJoin);

    const t1 = new FakeTransport();
    await net.joinRoom('room1', {transport: t1});
    net.leaveRoom();

    const t2 = new FakeTransport();
    await net.joinRoom('room2', {transport: t2});
    t2.fakePeerJoin('peer-r');
    t2.receive('peer-r', helloFrom('peer-r', 'Rejoin'));

    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin.mock.calls[0][0].peerId).toBe('peer-r');
  });

  it('net.send broadcasts via session.events', async () => {
    const transport = new FakeTransport();
    await net.joinRoom('room', {transport});
    const sendSpy = vi.spyOn(transport, 'send');
    net.send('chat', {text: 'hi'});
    expect(sendSpy).toHaveBeenCalled();
  });

  it('net.send throws before joinRoom', () => {
    expect(() => net.send('chat', 'hi')).toThrow(/joinRoom/);
  });

  it('propagates role from local opts and remote hello', async () => {
    const transport = new FakeTransport();
    await net.joinRoom('room', {transport, role: 'agent'});
    expect(net.user.role).toBe('agent');

    transport.fakePeerJoin('peer-d');
    transport.receive('peer-d', {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      displayName: 'TV',
      role: 'device',
      capabilities: {pose: true, voice: false, netobject: true},
    });
    const remote = net.peers.list()[0];
    expect(remote.role).toBe('device');
  });
});

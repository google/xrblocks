vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

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
});

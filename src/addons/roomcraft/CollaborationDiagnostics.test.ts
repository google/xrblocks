import {describe, expect, it, vi, afterEach} from 'vitest';
// @ts-expect-error The diagnostic view is an executable demo JavaScript module.
import {CollaborationDiagnostics} from '../../../demos/roomcraft/CollaborationDiagnostics.js';

function context() {
  return {
    mode: 'Virtual world',
    roomId: 'roomcraft:shared:BCDF',
    transport: 'webrtc',
    session: 1,
    localPeerId: 'peer-a',
    peers: ['peer-b'],
    channelPeers: ['peer-b'],
    transportOpen: true,
    status: 'ready',
    pending: 0,
    roomStatus: 'ready',
    authoring: false,
    configuring: false,
    transcription: 'idle',
    visible: true,
    inXR: false,
    secureContext: true,
    objects: [{id: 'pet-cat', parts: Array.from({length: 17}, () => ({}))}],
    selectedId: 'pet-cat',
    bridge: {
      status: 'ready',
      revision: {counter: 4, peerId: 'peer-a'},
      queuedLayouts: 0,
      applyingLayout: false,
      unpublishedLayout: false,
      waitingForSnapshot: false,
      waitingForObjects: false,
      discovering: false,
      heldObjects: 0,
      messages: {sent: 2, received: 3},
      lastMessage: {direction: 'receive', topic: 'sync-state'},
    },
    clock: {authority: 'peer-a', synchronized: true, uncertaintyMs: 5},
    microphone: {enabled: false, muted: true},
    playbackMuted: false,
    errorOperation: '',
    displayName: 'Do not export this name',
    prompt: 'Do not export this prompt',
    url: 'https://example.test/?key=private-query',
    error: new Error('Do not export raw provider errors or URLs'),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('local collaboration diagnostics', () => {
  it('exports only metadata, with no scene recipes, names, prompts, URLs or raw errors', () => {
    const log = new CollaborationDiagnostics();
    const source = context();
    source.objects[0].parts[0] = {secret: 'private-geometry'};
    log.capture(source);
    const report = log.report();
    expect(report.current).toMatchObject({
      mode: 'Virtual world',
      roomId: 'roomcraft:shared:BCDF',
      scene: {objectIds: ['pet-cat'], objects: 1, parts: 17},
      bridge: {revision: {counter: 4, peerId: 'peer-a'}},
    });
    const text = JSON.stringify(report);
    for (const value of [
      'Do not export',
      'private-query',
      'private-geometry',
      'example.test',
    ])
      expect(text).not.toContain(value);
    source.bridge.revision.counter = 99;
    report.current.scene.objectIds.length = 0;
    expect(log.report().current.bridge.revision.counter).toBe(4);
    expect(log.report().current.scene.objectIds).toEqual(['pet-cat']);
  });

  it('retains at most 64 timestamped transitions and ignores unchanged snapshots', () => {
    let time = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    const log = new CollaborationDiagnostics();
    const source = context();
    log.capture(source);
    time += 1000;
    log.capture(source);
    expect(log.report().events).toHaveLength(1);
    for (let i = 0; i < 100; i++) {
      source.pending = i;
      time += 10;
      log.capture(source);
    }
    const events = log.report().events;
    expect(events).toHaveLength(64);
    expect(events[63].state.pending).toBe(99);
    expect(events[63].elapsedMs).toBe(2000);
    expect(log.summary).toContain('Virtual world');
    expect(log.summary).toContain('roomcraft:shared:BCDF');
  });
});

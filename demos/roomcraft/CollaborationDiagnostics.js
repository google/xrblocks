const MAX_EVENTS = 64;
const MAX_IDS = 64;

function identifier(value) {
  return typeof value === 'string' &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_.:-]*$/.test(value)
    ? value
    : '[omitted]';
}

function identifiers(values) {
  return [...values].slice(0, MAX_IDS).map(identifier).sort();
}

function operation(value) {
  return typeof value === 'string' &&
    /^(?:(?:publish|receive) (?:layout|selection|sync-request|sync-state|sync-error|objects-request|objects-state)|request sync|catch up transforms|motion clock|manipulate|transport|connection|configuration|room|playback|copy room code|sync)$/.test(
      value
    )
    ? value
    : value
      ? 'other'
      : null;
}

function bridgeState(value) {
  if (!value) return null;
  return {
    protocol: value.protocol,
    status: value.status,
    revision: {
      counter: value.revision.counter,
      peerId: identifier(value.revision.peerId),
    },
    queuedLayouts: value.queuedLayouts,
    applyingLayout: value.applyingLayout,
    unpublishedLayout: value.unpublishedLayout,
    waitingForSnapshot: value.waitingForSnapshot,
    waitingForObjects: value.waitingForObjects,
    discovering: value.discovering,
    seedLocalScene: value.seedLocalScene,
    heldObjects: value.heldObjects,
    messages: {sent: value.messages.sent, received: value.messages.received},
    lastMessage: value.lastMessage
      ? {
          direction: value.lastMessage.direction,
          topic: identifier(value.lastMessage.topic),
        }
      : null,
  };
}

/** Bounded, in-memory state transitions. Raw text, payloads and page URLs are never captured. */
export class CollaborationDiagnostics {
  constructor() {
    this.startedAt = performance.now();
    this.events = [];
    this.current = null;
    this.lastKey = '';
  }

  capture(source) {
    const objects = source.objects ?? [];
    const state = {
      mode: source.mode,
      roomId: identifier(source.roomId),
      transport: source.transport,
      session: source.session,
      localPeerId: identifier(source.localPeerId),
      peers: identifiers(source.peers),
      channelPeers: identifiers(source.channelPeers),
      transportOpen: source.transportOpen,
      status: source.status,
      pending: source.pending,
      activity: {
        scene: source.roomStatus,
        authoring: source.authoring,
        configuring: source.configuring,
        transcription: ['idle', 'recording', 'transcribing'].includes(
          source.transcription
        )
          ? source.transcription
          : 'other',
        visible: source.visible,
        inXR: source.inXR,
        secureContext: source.secureContext,
      },
      scene: {
        objects: objects.length,
        parts: objects.reduce(
          (count, object) => count + (object.parts?.length ?? 0),
          0
        ),
        objectIds: identifiers(objects.map((object) => object.id)),
        selectedId: source.selectedId ? identifier(source.selectedId) : null,
      },
      bridge: bridgeState(source.bridge),
      clock: source.clock
        ? {
            authority: identifier(source.clock.authority),
            synchronized: source.clock.synchronized,
            uncertaintyMs:
              source.clock.uncertaintyMs === undefined
                ? null
                : Math.round(source.clock.uncertaintyMs),
          }
        : null,
      microphone: {
        enabled: source.microphone.enabled,
        muted: source.microphone.muted,
      },
      playbackMuted: source.playbackMuted,
      errorOperation: operation(source.errorOperation),
    };
    const key = JSON.stringify(state);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.current = state;
    this.events.push({
      elapsedMs: Math.max(0, Math.round(performance.now() - this.startedAt)),
      state,
    });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  get summary() {
    const state = this.current;
    if (!state) return 'No diagnostics captured.';
    const sync = state.bridge;
    const brief = (value) =>
      value.length > 64 ? `${value.slice(0, 61)}...` : value;
    const waits =
      [
        sync?.waitingForSnapshot && 'scene snapshot',
        sync?.waitingForObjects && 'object catch-up',
        sync?.applyingLayout && 'scene import',
        sync?.unpublishedLayout && 'unsent edit',
        sync?.discovering && 'discovery',
      ]
        .filter(Boolean)
        .join(', ') || 'none';
    return [
      `View: ${state.mode} | ${state.transport}`,
      `Room: ${brief(state.roomId) || 'not joined'}`,
      `This peer: ${brief(state.localPeerId) || 'not joined'}`,
      `Other peers: ${state.peers.length} | channels: ${state.channelPeers.length}`,
      `Scene: ${state.scene.objects} objects / ${state.scene.parts} parts`,
      `Sync: ${state.status} / ${state.pending} pending`,
      `Waiting: ${brief(waits)}`,
      `Clock: ${state.clock ? (state.clock.synchronized ? 'synchronized' : 'not synchronized') : 'not started'}`,
      `Activity: ${state.activity.visible ? 'visible' : 'hidden'} / ${state.activity.scene}${state.errorOperation ? ` | error: ${state.errorOperation}` : ''}`,
    ].join('\n');
  }

  get recent() {
    return this.events
      .slice(-8)
      .map(
        ({elapsedMs, state}) =>
          `${(elapsedMs / 1000).toFixed(1)}s | ${state.status} | peers ${state.peers.length} | objects ${state.scene.objects} | pending ${state.pending}${state.bridge?.lastMessage ? ` | ${state.bridge.lastMessage.direction} ${state.bridge.lastMessage.topic}` : ''}${state.errorOperation ? ` | error ${state.errorOperation}` : ''}`
      )
      .join('\n');
  }

  report() {
    return structuredClone({
      format: 'roomcraft-local-diagnostics',
      version: 1,
      current: this.current,
      events: this.events,
    });
  }
}

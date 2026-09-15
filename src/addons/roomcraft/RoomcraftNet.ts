import * as THREE from 'three';
import {Interaction, Script, type ManipulationEvent} from 'xrblocks';
import type {
  NetObject,
  NetObjectClaim,
  NetSession,
  UserEventDetail,
} from '../netblocks/src/index';

import type {Roomcraft} from './Roomcraft';
import {RoomcraftClock, readMotionClock} from './RoomcraftClock';
import {readSceneId, readSceneLayout} from './ScenePlan';
import {
  compareRevision,
  objectStates,
  peerId,
  record,
  revision,
  sequence,
  transform,
  type RoomcraftRevision,
  type RoomcraftSnapshot,
} from './RoomcraftNetProtocol';

const PREFIX = 'roomcraft:';
const MAX_PENDING_LAYOUTS = 64;
const SYNC_TIMEOUT_MS = 8000;
const SYNC_RETRY_MS = 1000;
const MAX_SYNC_ERROR_LENGTH = 512;
const DISCOVERY_MS = 300;
const activeSessions = new WeakSet<NetSession>();
const continuation = new WeakMap<
  Roomcraft,
  {
    elapsed: number;
    at: number;
    epoch: string;
    authority: string;
    peerId: string;
    term: number;
    revision: RoomcraftRevision;
    clock: number;
    fingerprint: string;
    roomId?: string;
    unpublished: boolean;
    claims: Map<string, NetObjectClaim>;
  }
>();

export type RoomcraftNetStatus = 'ready' | 'syncing' | 'error' | 'closed';

/** Local inspection metadata only; no scene contents, prompts or message payloads. */
export interface RoomcraftNetDiagnostics {
  protocol: 2;
  status: RoomcraftNetStatus;
  revision: {counter: number; peerId: string};
  queuedLayouts: number;
  applyingLayout: boolean;
  unpublishedLayout: boolean;
  waitingForSnapshot: boolean;
  waitingForObjects: boolean;
  discovering: boolean;
  seedLocalScene: boolean;
  heldObjects: number;
  /** Send counts describe local transport submissions, not delivery acknowledgements. */
  messages: {sent: number; received: number};
  lastMessage?: {direction: 'send' | 'receive'; topic: string};
}

export interface RoomcraftNetEventMap extends THREE.Object3DEventMap {
  statuschange: {status: RoomcraftNetStatus; pendingCount: number};
  error: {error: Error; operation: string; peerId?: string};
  selectionchange: {peerId: string; id: string | null};
  diagnosticschange: {direction: 'send' | 'receive'; topic: string};
}

interface PendingLayout {
  snapshot: RoomcraftSnapshot;
  from: string;
  allowEqual: boolean;
  receivedAt: number;
}

interface TrackedBinding extends NetObject {
  version: number;
  lastXform?: number[];
}

/**
 * Opt-in co-authoring of one Roomcraft scene in an open netblocks session.
 * Add this Script after initializing the room and joining the session.
 * Peers import validated layouts, never invoke the room's AI planner.
 */
export class RoomcraftNet extends Script<RoomcraftNetEventMap> {
  static dependencies = {interaction: Interaction};

  private api?: typeof import('../netblocks/src/index');
  private interaction?: Pick<Interaction, 'cancelObject'>;
  private rootBinding?: NetObject;
  private motionClock?: RoomcraftClock;
  private previousMotionSource?: () => number;
  private readonly bindings = new Map<string, TrackedBinding>();
  private createBinding?: (
    id: string,
    object: THREE.Object3D
  ) => TrackedBinding;
  private readonly held = new Set<string>();
  private readonly selections = new Map<string, string | null>();
  private readonly selectionSequences = new Map<string, number>();
  private readonly outlines = new Map<string, THREE.Box3Helper>();
  private readonly cleanups: Array<() => void> = [];
  private readonly queue: PendingLayout[] = [];
  private readonly lifetime = new AbortController();
  private currentRevision: RoomcraftRevision;
  private clock = 0;
  private selectionSequence = 0;
  private syncSequence = 0;
  private requestPrefix = '';
  private syncId = '';
  private readonly syncResponders = new Set<string>();
  private readonly readySyncPeers = new Set<string>();
  private readonly pendingSyncReplies = new Map<string, string>();
  private syncTimer?: ReturnType<typeof setTimeout>;
  private syncRetryTimer?: ReturnType<typeof setTimeout>;
  private bootstrapTimer?: ReturnType<typeof setTimeout>;
  private catchupTimer?: ReturnType<typeof setTimeout>;
  private bootstrapping = true;
  private bootstrapResponse = false;
  private awaitingSync = false;
  private catchup?: {
    id: string;
    from: string;
    revision: RoomcraftRevision;
    baseline: Map<string, string>;
  };
  private applying = false;
  private suppressChanges = 0;
  private initialized = false;
  private registered = false;
  private disposed = false;
  private currentStatus: RoomcraftNetStatus = 'ready';
  private unpublished = false;
  private failureOperation?: string;
  private readonly messageCounts = {sent: 0, received: 0};
  private lastMessage?: RoomcraftNetDiagnostics['lastMessage'];

  constructor(
    readonly room: Roomcraft,
    readonly session: NetSession,
    private readonly options: {
      roomId?: string;
      /** True for Start, false for Join; omission uses automatic discovery. */
      seedLocalScene?: boolean;
    } = {}
  ) {
    super();
    if (
      options.seedLocalScene !== undefined &&
      typeof options.seedLocalScene !== 'boolean'
    ) {
      throw new Error('seedLocalScene must be a boolean.');
    }
    this.name = 'RoomcraftNet';
    this.currentRevision = {counter: 0, peerId: session.localPeerId};
  }

  get status(): RoomcraftNetStatus {
    return this.currentStatus;
  }

  get pendingCount(): number {
    if (this.disposed) return 0;
    return (
      this.queue.length +
      Number(
        this.applying ||
          this.unpublished ||
          this.awaitingSync ||
          this.bootstrapping ||
          !!this.catchup ||
          !!this.motionClock?.pending
      )
    );
  }

  /** Detached peer selections; receiving one never changes local selection. */
  get remoteSelections(): ReadonlyMap<string, string | null> {
    return new Map(this.selections);
  }

  /** Estimated shared playback timing; uncertainty is based on network round trips. */
  get motionClockState() {
    return this.motionClock?.state;
  }

  /** A detached diagnostic snapshot. Reading it does not send data or change the scene. */
  get diagnostics(): RoomcraftNetDiagnostics {
    return {
      protocol: 2,
      status: this.status,
      revision: {...this.currentRevision},
      queuedLayouts: this.queue.length,
      applyingLayout: this.applying,
      unpublishedLayout: this.unpublished,
      waitingForSnapshot: this.awaitingSync,
      waitingForObjects: !!this.catchup,
      discovering: this.bootstrapping,
      seedLocalScene: this.options.seedLocalScene !== false,
      heldObjects: this.held.size,
      messages: {...this.messageCounts},
      ...(this.lastMessage ? {lastMessage: {...this.lastMessage}} : {}),
    };
  }

  /** Matching roster/outline colors, distinct for the first eight room peers. */
  getPeerColor(id: string): number {
    const palette = this.api?.AVATAR_PALETTE;
    if (!palette)
      throw new Error('Initialize RoomcraftNet before reading colors.');
    const peers = [
      this.session.localPeerId,
      ...this.session.users.keys(),
    ].sort();
    const index = peers.indexOf(id);
    if (index < 0) throw new Error(`Unknown Roomcraft peer "${id}".`);
    return palette[index % palette.length];
  }

  override async init({
    interaction,
  }: {
    interaction: Pick<Interaction, 'cancelObject'>;
  }): Promise<void> {
    if (this.disposed) throw new Error('RoomcraftNet has been disposed.');
    if (this.initialized) return;
    if (!this.session.isOpen)
      throw new Error('Join a room before initializing RoomcraftNet.');
    // Keep the normal Roomcraft entry free of eager networking dependencies.
    this.api = await import('../netblocks/src/index');
    if (this.disposed) return;
    if (activeSessions.has(this.session)) {
      throw new Error(
        'A Roomcraft bridge is already registered in this session.'
      );
    }
    activeSessions.add(this.session);
    this.registered = true;
    this.requestPrefix = this.api.makeId(12);
    this.interaction = interaction;
    this.rootBinding = new this.api.NetObject({object: this.room});
    class Binding extends this.api.NetObject {
      version = 0;
      lastXform?: number[];
      override setTargetXform(xform: number[]): void {
        super.setTargetXform(xform);
        this.version++;
        this.lastXform = [...xform];
      }
      override snapToXform(xform: number[]): void {
        super.snapToXform(xform);
        this.version++;
        this.lastXform = [...xform];
      }
    }
    this.createBinding = (id, object) =>
      new Binding({id, object, automaticSnapshots: false});
    try {
      this.reconcile();
      const saved = continuation.get(this.room);
      const carried = saved?.roomId === this.options.roomId ? saved : undefined;
      if (carried) {
        for (const [id, claim] of carried.claims) {
          const binding = this.bindings.get(id);
          if (binding) binding.claim = {...claim};
        }
        this.clock = carried.clock;
        this.currentRevision = {...carried.revision};
        this.unpublished = carried.unpublished;
        if (carried.fingerprint !== this.fingerprint()) {
          this.currentRevision = {
            counter: sequence(Math.max(this.clock, 1) + 1),
            peerId: this.session.localPeerId,
          };
          this.clock = this.currentRevision.counter;
          this.unpublished = true;
        }
      }
      if (
        this.options.seedLocalScene === true &&
        this.currentRevision.counter === 0
      ) {
        this.currentRevision = {...this.currentRevision, counter: 1};
        this.clock = Math.max(this.clock, 1);
      }
      this.motionClock = new RoomcraftClock(this.session, {
        epoch: carried?.epoch ?? this.api.makeId(),
        authority: carried
          ? carried.authority === carried.peerId
            ? this.session.localPeerId
            : carried.authority
          : undefined,
        term: carried?.term,
        initialTime: carried
          ? carried.elapsed + (performance.now() - carried.at) / 1000
          : 0,
        onChange: () =>
          this.refreshStatus(
            !this.unpublished &&
              this.failureOperation === 'motion clock' &&
              this.motionClock?.state.synchronized === true
          ),
        onError: (error) => this.fail(error, 'motion clock'),
      });
      this.previousMotionSource = this.room.motionTimeSource;
      this.room.setMotionTimeSource(this.motionClock.read);
      this.motionClock.start();
      const change = () => this.guard('publish layout', () => this.onChange());
      const select = ({id}: {id: string | null}) =>
        this.guard('publish selection', () => this.sendSelection(id));
      const manipulate = ({
        id,
        event,
      }: {
        id: string;
        event: ManipulationEvent;
      }) => this.guard('manipulate', () => this.onManipulation(id, event));
      const status = () => void this.drain();
      this.room.addEventListener('change', change);
      this.room.addEventListener('selectionchange', select);
      this.room.addEventListener('manipulationchange', manipulate);
      this.room.addEventListener('statuschange', status);
      this.cleanups.push(() => {
        this.room.removeEventListener('change', change);
        this.room.removeEventListener('selectionchange', select);
        this.room.removeEventListener('manipulationchange', manipulate);
        this.room.removeEventListener('statuschange', status);
      });
      this.on('layout', (value, from) => this.receiveLayout(value, from));
      this.on('selection', (value, from) => this.receiveSelection(value, from));
      this.on('sync-request', (value, from) => {
        const id = peerId(record(value).id);
        // An unseeded joiner has no authoritative scene to offer another joiner.
        if (
          this.options.seedLocalScene === false &&
          this.currentRevision.counter === 0
        )
          return;
        if (this.applying || this.queue.length) {
          if (
            !this.pendingSyncReplies.has(from) &&
            this.pendingSyncReplies.size >= MAX_PENDING_LAYOUTS
          ) {
            throw new Error(
              'Too many pending scene snapshot requests. Wait for the scene, then retry.'
            );
          }
          this.pendingSyncReplies.set(from, id);
          return;
        }
        this.replySnapshot(id, from);
      });
      this.on('sync-state', (value, from) => {
        const data = record(value);
        if (data.id !== this.syncId || this.syncResponders.has(from)) return;
        try {
          if (
            this.options.seedLocalScene === false &&
            revision(record(data.snapshot).revision).counter === 0
          )
            return;
          this.receiveSelection(data.selection, from);
          this.receiveLayout(data.snapshot, from, true);
        } catch (error) {
          this.syncResponders.add(from);
          this.stopWaitingForSnapshot();
          this.bootstrapping = false;
          clearTimeout(this.bootstrapTimer);
          throw error;
        }
        this.syncResponders.add(from);
        this.bootstrapResponse = true;
        this.stopWaitingForSnapshot();
        if (!this.applying && !this.queue.length) this.finishBootstrap();
        this.refreshStatus();
      });
      this.on('sync-error', (value, from) => {
        const data = record(value);
        if (data.id !== this.syncId || this.syncResponders.has(from)) return;
        if (
          typeof data.reason !== 'string' ||
          !data.reason.trim() ||
          data.reason.length > MAX_SYNC_ERROR_LENGTH
        )
          throw new Error('Invalid scene snapshot error response.');
        this.syncResponders.add(from);
        this.stopWaitingForSnapshot();
        this.bootstrapping = false;
        clearTimeout(this.bootstrapTimer);
        this.fail(
          new Error(`Peer "${from}" could not send its scene: ${data.reason}`),
          'request sync',
          from
        );
      });
      this.on('objects-request', (value, from) => {
        const data = record(value);
        const id = peerId(data.id);
        const requested = revision(data.revision);
        if (
          this.options.seedLocalScene === false &&
          this.currentRevision.counter === 0
        )
          return;
        if (compareRevision(requested, this.currentRevision) !== 0) {
          this.send('layout', this.snapshot(), from);
          return;
        }
        this.send(
          'objects-state',
          {
            id,
            revision: this.currentRevision,
            objects: this.objectSnapshot(),
          },
          from
        );
      });
      this.on('objects-state', (value, from) =>
        this.receiveObjects(value, from)
      );
      const join = () => this.resync();
      const leave = (event: Event) => {
        const id = (event as CustomEvent<UserEventDetail>).detail.user.peerId;
        this.pendingSyncReplies.delete(id);
        this.selections.delete(id);
        this.selectionSequences.delete(id);
        this.removeOutline(id);
        this.dispatchEvent({type: 'selectionchange', peerId: id, id: null});
        if (this.catchup?.from === id) {
          this.catchup = undefined;
          clearTimeout(this.catchupTimer);
          this.guard('catch up transforms', () => this.requestObjects(id));
        }
      };
      const close = () => this.dispose();
      const transportError = (event: Event) =>
        this.fail(
          (event as CustomEvent<{error: Error}>).detail.error,
          'transport'
        );
      this.session.addEventListener('user-join', join);
      this.session.addEventListener('user-leave', leave);
      this.session.addEventListener('close', close);
      this.session.transport.addEventListener('error', transportError);
      this.cleanups.push(() => {
        this.session.removeEventListener('user-join', join);
        this.session.removeEventListener('user-leave', leave);
        this.session.removeEventListener('close', close);
        this.session.transport.removeEventListener('error', transportError);
      });
      this.initialized = true;
      this.bootstrapTimer = setTimeout(() => {
        if (!this.bootstrapping || this.disposed) return;
        if (
          !this.session.users.size &&
          !this.session.transport.remotePeerIds.size &&
          (this.options.seedLocalScene !== false ||
            this.currentRevision.counter > 0)
        ) {
          this.finishBootstrap();
        } else {
          this.resync();
        }
      }, DISCOVERY_MS);
      this.resync();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Request current content and ownership without asking any peer to run AI. */
  resync(): void {
    this.guard('request sync', () => {
      this.assertReady();
      this.stopWaitingForSnapshot();
      clearTimeout(this.catchupTimer);
      this.catchup = undefined;
      this.syncId = `${this.requestPrefix}:${++this.syncSequence}`;
      this.syncResponders.clear();
      this.readySyncPeers.clear();
      if (this.unpublished) this.publishLocal();
      this.awaitingSync =
        this.session.users.size > 0 ||
        (this.options.seedLocalScene === false &&
          this.currentRevision.counter === 0);
      if (this.awaitingSync) {
        this.syncTimer = setTimeout(() => {
          this.stopWaitingForSnapshot();
          this.bootstrapping = false;
          clearTimeout(this.bootstrapTimer);
          this.fail(
            new Error(
              'No scene snapshot arrived. Retry sync when a peer is ready.'
            ),
            'request sync'
          );
        }, SYNC_TIMEOUT_MS);
      }
      this.sendSnapshotRequest();
      this.sendSelection(this.room.selectedId);
      this.motionClock?.resync();
      this.refreshStatus(true);
    });
  }

  private stopWaitingForSnapshot(): void {
    this.awaitingSync = false;
    clearTimeout(this.syncTimer);
    clearTimeout(this.syncRetryTimer);
  }

  private replySnapshot(id: string, from: string): void {
    try {
      this.send(
        'sync-state',
        {
          id,
          snapshot: this.snapshot(),
          selection: {
            id: this.room.selectedId,
            sequence: this.selectionSequence,
          },
        },
        from
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send(
        'sync-error',
        {
          id,
          reason: (message.trim() || 'Scene snapshot failed.').slice(
            0,
            MAX_SYNC_ERROR_LENGTH
          ),
        },
        from
      );
      throw error;
    }
    // A transport hello can precede the remote bridge's subscriptions.
    if (this.awaitingSync && !this.readySyncPeers.has(from)) {
      this.readySyncPeers.add(from);
      this.send('sync-request', {id: this.syncId}, from);
    }
  }

  private sendSnapshotRequest(): void {
    const id = this.syncId;
    try {
      this.send('sync-request', {id});
    } catch (error) {
      this.stopWaitingForSnapshot();
      throw error;
    }
    if (!this.awaitingSync || id !== this.syncId) return;
    this.syncRetryTimer = setTimeout(() => {
      if (!this.disposed && this.awaitingSync && id === this.syncId)
        this.guard('request sync', () => this.sendSnapshotRequest());
    }, SYNC_RETRY_MS);
  }

  override update(): void {
    if (!this.initialized || this.disposed) return;
    for (const id of this.held) {
      const binding = this.bindings.get(id);
      if (binding?.ownerId === this.session.localPeerId) continue;
      this.held.delete(id);
      const owner = this.room.getObject(id);
      if (owner) {
        this.suppressChanges++;
        try {
          this.interaction?.cancelObject(owner, 'disabled');
        } finally {
          this.suppressChanges--;
        }
      }
    }
    this.updateOutlines();
    void this.drain();
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    if (this.registered) activeSessions.delete(this.session);
    this.stopWaitingForSnapshot();
    clearTimeout(this.bootstrapTimer);
    clearTimeout(this.catchupTimer);
    if (this.motionClock) {
      if (this.initialized) {
        const motion = this.motionClock.snapshot();
        const claims = new Map<string, NetObjectClaim>();
        for (const [id, binding] of this.bindings) {
          if (binding.claim) claims.set(id, {...binding.claim});
        }
        continuation.set(this.room, {
          elapsed: motion.elapsed,
          at: performance.now(),
          epoch: motion.epoch,
          authority: motion.authority,
          peerId: this.session.localPeerId,
          term: motion.term,
          revision: {...this.currentRevision},
          clock: this.clock,
          fingerprint: this.fingerprint(),
          roomId: this.options.roomId,
          unpublished: this.unpublished,
          claims,
        });
      }
      this.motionClock.dispose();
      if (this.room.motionTimeSource === this.motionClock.read) {
        this.room.setMotionTimeSource(this.previousMotionSource);
      }
      this.motionClock = undefined;
    }
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    for (const binding of this.bindings.values()) {
      if (this.session.isOpen && binding.isOwnedBy(this.session.localPeerId)) {
        this.session.release(binding);
      }
      if (this.session.netObjects.get(binding.netId) === binding) {
        this.session.netObjects.remove(binding);
      }
    }
    this.bindings.clear();
    this.held.clear();
    this.queue.length = 0;
    this.pendingSyncReplies.clear();
    this.catchup = undefined;
    this.awaitingSync = false;
    this.selections.clear();
    this.selectionSequences.clear();
    for (const id of this.outlines.keys()) this.removeOutline(id);
    this.setStatus('closed');
  }

  private onChange(): void {
    if (this.disposed || this.suppressChanges) return;
    this.reconcile();
    if (this.applying) return;
    const next = {
      counter: sequence(Math.max(this.clock, 1) + 1),
      peerId: this.session.localPeerId,
    };
    this.currentRevision = next;
    this.clock = next.counter;
    this.unpublished = true;
    this.publishLocal();
    this.finishBootstrap();
    this.catchup = undefined;
    this.refreshStatus(true);
  }

  private publishLocal(): void {
    this.send('layout', this.snapshot());
    this.unpublished = false;
  }

  private onManipulation(id: string, event: ManipulationEvent): void {
    if (this.disposed) return;
    const binding = this.bindings.get(id);
    if (!binding) return;
    if (event.phase === 'start') {
      if (this.applying) {
        event.preventDefault();
        return;
      }
      if (!event.defaultPrevented) {
        this.session.claim(binding);
        this.held.add(id);
      }
    } else if (event.phase === 'end' || event.phase === 'cancel') {
      if (this.held.delete(id)) this.session.release(binding);
    }
  }

  private reconcile(): void {
    if (!this.api) throw new Error('RoomcraftNet has not initialized.');
    const layout = this.room.layout;
    const ids = new Set(layout.objects.map((object) => object.id));
    for (const [id, binding] of this.bindings) {
      if (ids.has(id) && binding.object === this.room.getObject(id)) continue;
      if (this.session.netObjects.get(binding.netId) === binding) {
        if (binding.isOwnedBy(this.session.localPeerId))
          this.session.release(binding);
        this.session.netObjects.remove(binding);
      }
      this.bindings.delete(id);
      this.held.delete(id);
    }
    for (const {id} of layout.objects) {
      const object = this.room.getObject(id);
      if (!object) throw new Error(`Missing Roomcraft owner "${id}".`);
      let binding = this.bindings.get(id);
      if (!binding) {
        const netId = `${PREFIX}object:${id}`;
        if (this.session.netObjects.has(netId)) {
          throw new Error(
            `Network object ID "${netId}" is already registered.`
          );
        }
        binding = this.createBinding!(netId, object);
        this.bindings.set(id, binding);
        this.session.netObjects.add(binding);
      } else if (!this.applying) {
        binding.snapToXform(binding.toXform());
      }
    }
  }

  private objectSnapshot() {
    return [...this.bindings].map(([id, binding]) => ({
      id,
      ownerId: binding.ownerId,
      ...(binding.claim ? {claim: {...binding.claim}} : {}),
      xform: binding.toXform(),
    }));
  }

  private fingerprint(): string {
    return JSON.stringify([this.room.layout, this.rootBinding?.toXform()]);
  }

  private snapshot(stamp = this.currentRevision): RoomcraftSnapshot {
    if (!this.rootBinding || !this.motionClock)
      throw new Error('RoomcraftNet has not initialized.');
    return {
      version: 2,
      revision: {...stamp},
      layout: readSceneLayout(this.room.layout, this.room.catalog),
      root: transform(this.rootBinding.toXform()),
      objects: this.objectSnapshot(),
      motion: this.motionClock.snapshot(),
    };
  }

  private receiveLayout(
    value: unknown,
    from: string,
    allowEqual = false
  ): void {
    const data = record(value);
    if (data.version !== 2)
      throw new Error(
        'Unsupported Roomcraft network version. Reload all peers to the same build.'
      );
    const stamp = revision(data.revision);
    if (this.options.seedLocalScene === false && stamp.counter === 0) return;
    const motion = readMotionClock(data.motion);
    this.motionClock?.reconcile(motion, performance.now());
    const order = compareRevision(stamp, this.currentRevision);
    if (order < 0 || (order === 0 && !allowEqual)) return;
    const layout = readSceneLayout(data.layout, this.room.catalog);
    const snapshot: RoomcraftSnapshot = {
      version: 2,
      revision: stamp,
      layout,
      root: transform(data.root),
      objects: objectStates(
        data.objects,
        layout.objects.map(({id}) => id)
      ),
      motion,
    };
    for (const state of snapshot.objects) {
      const object = layout.objects.find(({id}) => id === state.id)!;
      if (
        state.xform
          .slice(0, 3)
          .some((value, index) => value !== object.position[index]) ||
        state.xform
          .slice(7)
          .some((value, index) => value !== object.scale[index])
      ) {
        throw new Error(
          'Roomcraft snapshot transforms do not match its validated layout.'
        );
      }
    }
    if (this.queue.length >= MAX_PENDING_LAYOUTS) {
      throw new Error(
        'Too many pending Roomcraft edits. Wait for the room, then retry sync.'
      );
    }
    this.clock = Math.max(this.clock, stamp.counter);
    this.queue.push({
      snapshot,
      from,
      allowEqual,
      receivedAt: performance.now(),
    });
    this.refreshStatus();
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (
      !this.initialized ||
      this.disposed ||
      this.applying ||
      this.room.busy ||
      this.held.size ||
      !this.queue.length
    )
      return;
    this.applying = true;
    this.refreshStatus();
    let catchupFrom: string | undefined;
    try {
      while (
        this.queue.length &&
        !this.disposed &&
        !this.room.busy &&
        !this.held.size
      ) {
        const pending = this.queue.shift()!;
        const {snapshot, from, allowEqual} = pending;
        const order = compareRevision(snapshot.revision, this.currentRevision);
        if (order < 0 || (order === 0 && !allowEqual)) continue;
        try {
          const before = new Map(
            [...this.bindings].map(([id, binding]) => [
              id,
              {
                binding,
                version: binding.version,
                ownerId: binding.ownerId,
                claim: JSON.stringify(binding.claim),
                xform: binding.toXform(),
              },
            ])
          );
          await this.room.applyLayout(snapshot.layout, {
            signal: this.lifetime.signal,
          });
          if (this.disposed) return;
          this.rootBinding!.snapToXform(snapshot.root);
          for (const state of snapshot.objects) {
            const binding = this.bindings.get(state.id)!;
            const previous = before.get(state.id);
            if (
              previous?.binding === binding &&
              (binding.version !== previous.version ||
                binding.ownerId !== previous.ownerId ||
                (binding.ownerId !== '' &&
                  JSON.stringify(binding.claim) !== previous.claim))
            ) {
              binding.snapToXform(
                binding.version !== previous.version && binding.lastXform
                  ? binding.lastXform
                  : previous.xform
              );
            } else {
              const ownerId =
                state.ownerId && this.session.users.has(state.ownerId)
                  ? state.ownerId
                  : '';
              const ownershipAccepted =
                this.session.netObjects.applyOwnershipSnapshot(
                  binding.netId,
                  ownerId,
                  state.claim
                );
              // A released claim can stay newer while the scene's LWW placement advances.
              if (ownershipAccepted || (order > 0 && !binding.ownerId)) {
                binding.snapToXform(state.xform);
              } else if (previous) {
                binding.snapToXform(previous.xform);
              }
            }
          }
          this.currentRevision = snapshot.revision;
          this.unpublished = false;
          this.motionClock!.adopt(snapshot.motion, pending.receivedAt);
          catchupFrom = from;
          this.bootstrapResponse = true;
          this.setStatus('syncing');
        } catch (error) {
          if (!this.disposed) this.fail(error, 'apply layout', from);
        }
      }
    } finally {
      this.applying = false;
      if (!this.disposed) {
        if (!this.queue.length && this.bootstrapResponse)
          this.finishBootstrap();
        const peer = catchupFrom;
        if (peer) {
          this.guard('catch up transforms', () => this.requestObjects(peer));
        }
        if (!this.queue.length) {
          for (const [from, id] of this.pendingSyncReplies) {
            this.pendingSyncReplies.delete(from);
            this.guard(
              'receive sync-request',
              () => this.replySnapshot(id, from),
              from
            );
          }
        }
        this.refreshStatus();
      }
    }
  }

  private requestObjects(from: string): void {
    clearTimeout(this.catchupTimer);
    if (!this.session.users.has(from)) {
      const alternate = this.session.users.keys().next().value;
      if (!alternate) {
        this.catchup = undefined;
        throw new Error(
          'The peer left before transform catch-up. Retry sync after a peer rejoins.'
        );
      }
      from = alternate;
    }
    const id = `${this.requestPrefix}:${++this.syncSequence}`;
    this.catchup = {
      id,
      from,
      revision: {...this.currentRevision},
      baseline: new Map(
        [...this.bindings].map(([key, binding]) => [
          key,
          JSON.stringify([
            binding.ownerId,
            binding.claim,
            binding.toXform(),
            binding.version,
          ]),
        ])
      ),
    };
    this.catchupTimer = setTimeout(() => {
      this.catchup = undefined;
      this.fail(
        new Error('Transform catch-up did not arrive. Retry sync.'),
        'catch up transforms',
        from
      );
    }, SYNC_TIMEOUT_MS);
    this.refreshStatus();
    this.send('objects-request', {id, revision: this.currentRevision}, from);
  }

  private receiveObjects(value: unknown, from: string): void {
    const data = record(value);
    const pending = this.catchup;
    if (!pending || data.id !== pending.id || from !== pending.from) return;
    const stamp = revision(data.revision);
    if (
      compareRevision(stamp, this.currentRevision) === 0 &&
      compareRevision(stamp, pending.revision) !== 0
    ) {
      this.requestObjects(from);
      return;
    }
    if (
      compareRevision(stamp, this.currentRevision) !== 0 ||
      compareRevision(stamp, pending.revision) !== 0
    )
      return;
    const states = objectStates(data.objects, [...this.bindings.keys()]);
    for (const state of states) {
      const binding = this.bindings.get(state.id)!;
      if (
        this.held.has(state.id) ||
        pending.baseline.get(state.id) !==
          JSON.stringify([
            binding.ownerId,
            binding.claim,
            binding.toXform(),
            binding.version,
          ])
      )
        continue;
      if (
        this.session.netObjects.applyOwnershipSnapshot(
          binding.netId,
          state.ownerId && this.session.users.has(state.ownerId)
            ? state.ownerId
            : '',
          state.claim
        )
      )
        binding.snapToXform(state.xform);
    }
    this.catchup = undefined;
    clearTimeout(this.catchupTimer);
    this.refreshStatus(true);
  }

  private finishBootstrap(): void {
    if (!this.bootstrapping) return;
    if (
      this.options.seedLocalScene === false &&
      this.currentRevision.counter === 0
    )
      return;
    this.bootstrapping = false;
    clearTimeout(this.bootstrapTimer);
    if (this.currentRevision.counter === 0) {
      this.currentRevision = {...this.currentRevision, counter: 1};
    }
    this.clock = Math.max(this.clock, this.currentRevision.counter);
    this.refreshStatus();
  }

  private sendSelection(id: string | null): void {
    this.send('selection', {id, sequence: ++this.selectionSequence});
  }

  private receiveSelection(value: unknown, from: string): void {
    const data = record(value);
    const counter = sequence(data.sequence);
    const id = data.id === null ? null : readSceneId(data.id);
    if (counter <= (this.selectionSequences.get(from) ?? -1)) return;
    this.selectionSequences.set(from, counter);
    this.selections.set(from, id);
    this.dispatchEvent({type: 'selectionchange', peerId: from, id});
  }

  private updateOutlines(): void {
    this.updateWorldMatrix(true, false);
    const inverse = this.matrixWorld.clone().invert();
    for (const [peer, id] of this.selections) {
      if (!id || !this.room.getObject(id) || !this.session.users.has(peer)) {
        this.removeOutline(peer);
        continue;
      }
      let outline = this.outlines.get(peer);
      const color = this.getPeerColor(peer);
      if (!outline) {
        outline = new THREE.Box3Helper(new THREE.Box3(), color);
        outline.name = `Roomcraft selection: ${peer}`;
        outline.xb = {pointerEvents: 'none'};
        outline.renderOrder = 1000;
        this.outlines.set(peer, outline);
        this.add(outline);
      }
      if (!(outline.material instanceof THREE.LineBasicMaterial)) {
        throw new Error('Roomcraft selection outline needs a line material.');
      }
      outline.material.depthTest = false;
      outline.material.color.setHex(color);
      const peers = [...this.session.users.keys()].sort();
      outline.box
        .copy(this.room.getWorldBounds(id))
        .expandByScalar(0.012 + peers.indexOf(peer) * 0.008)
        .applyMatrix4(inverse);
      outline.visible = !outline.box.isEmpty();
    }
  }

  private removeOutline(peer: string): void {
    const outline = this.outlines.get(peer);
    if (!outline) return;
    outline.removeFromParent();
    outline.geometry.dispose();
    const materials = Array.isArray(outline.material)
      ? outline.material
      : [outline.material];
    for (const material of materials) material.dispose();
    this.outlines.delete(peer);
  }

  private on(
    topic: string,
    handler: (value: unknown, from: string) => void
  ): void {
    this.cleanups.push(
      this.session.events.on(PREFIX + topic, (value, from) => {
        if (this.disposed || from === this.session.localPeerId) return;
        this.recordMessage('receive', topic);
        this.guard(`receive ${topic}`, () => handler(value, from), from);
      })
    );
  }

  private send(topic: string, payload: unknown, to?: string): void {
    if (!this.api || !this.session.isOpen || !this.session.transport.isOpen)
      throw new Error('Roomcraft network session is closed.');
    const name = PREFIX + topic;
    const bytes = this.api.encodeMessage({
      type: 'rpc',
      topic: name,
      payload,
      from: this.session.localPeerId,
      ts: Number.MAX_VALUE,
      ...(to ? {to} : {}),
    });
    if (bytes.byteLength > this.api.MAX_MESSAGE_BYTES) {
      throw new Error(
        'This scene exceeds the 60 KB collaboration message limit. Use a smaller scene.'
      );
    }
    if (to) this.session.events.emitTo(to, name, payload);
    else this.session.events.emit(name, payload);
    this.recordMessage('send', topic);
  }

  private recordMessage(direction: 'send' | 'receive', topic: string): void {
    if (direction === 'send') this.messageCounts.sent++;
    else this.messageCounts.received++;
    this.lastMessage = {direction, topic};
    if (!this.disposed)
      this.dispatchEvent({type: 'diagnosticschange', direction, topic});
  }

  private assertReady(): void {
    if (!this.initialized || this.disposed || !this.session.isOpen) {
      throw new Error('Initialize RoomcraftNet in an open session first.');
    }
  }

  private guard(operation: string, action: () => void, peer?: string): void {
    try {
      action();
    } catch (error) {
      this.fail(error, operation, peer);
    }
  }

  private fail(cause: unknown, operation: string, peer?: string): void {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    this.failureOperation = operation;
    console.error(`[roomcraft:net] ${operation}`, error);
    if (!this.disposed) this.setStatus('error');
    this.dispatchEvent({type: 'error', error, operation, peerId: peer});
  }

  private refreshStatus(clearError = false): void {
    if (this.disposed) return;
    if (this.currentStatus === 'error' && !clearError) return;
    this.setStatus(this.pendingCount ? 'syncing' : 'ready');
  }

  private setStatus(status: RoomcraftNetStatus): void {
    this.currentStatus = status;
    if (status === 'ready') this.failureOperation = undefined;
    this.dispatchEvent({
      type: 'statuschange',
      status,
      pendingCount: this.pendingCount,
    });
  }
}

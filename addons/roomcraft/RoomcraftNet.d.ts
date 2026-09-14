import * as THREE from 'three';
import { Interaction, Script } from 'xrblocks';
import type { NetSession } from '../netblocks/src/index';
import type { Roomcraft } from './Roomcraft';
export type RoomcraftNetStatus = 'ready' | 'syncing' | 'error' | 'closed';
/** Local inspection metadata only; no scene contents, prompts or message payloads. */
export interface RoomcraftNetDiagnostics {
    protocol: 2;
    status: RoomcraftNetStatus;
    revision: {
        counter: number;
        peerId: string;
    };
    queuedLayouts: number;
    applyingLayout: boolean;
    unpublishedLayout: boolean;
    waitingForSnapshot: boolean;
    waitingForObjects: boolean;
    discovering: boolean;
    seedLocalScene: boolean;
    heldObjects: number;
    /** Send counts describe local transport submissions, not delivery acknowledgements. */
    messages: {
        sent: number;
        received: number;
    };
    lastMessage?: {
        direction: 'send' | 'receive';
        topic: string;
    };
}
export interface RoomcraftNetEventMap extends THREE.Object3DEventMap {
    statuschange: {
        status: RoomcraftNetStatus;
        pendingCount: number;
    };
    error: {
        error: Error;
        operation: string;
        peerId?: string;
    };
    selectionchange: {
        peerId: string;
        id: string | null;
    };
    diagnosticschange: {
        direction: 'send' | 'receive';
        topic: string;
    };
}
/**
 * Opt-in co-authoring of one Roomcraft scene in an open netblocks session.
 * Add this Script after initializing the room and joining the session.
 * Peers import validated layouts, never invoke the room's AI planner.
 */
export declare class RoomcraftNet extends Script<RoomcraftNetEventMap> {
    readonly room: Roomcraft;
    readonly session: NetSession;
    private readonly options;
    static dependencies: {
        interaction: typeof Interaction;
    };
    private api?;
    private interaction?;
    private rootBinding?;
    private motionClock?;
    private previousMotionSource?;
    private readonly bindings;
    private createBinding?;
    private readonly held;
    private readonly selections;
    private readonly selectionSequences;
    private readonly outlines;
    private readonly cleanups;
    private readonly queue;
    private readonly lifetime;
    private currentRevision;
    private clock;
    private selectionSequence;
    private syncSequence;
    private requestPrefix;
    private syncId;
    private readonly syncResponders;
    private readonly readySyncPeers;
    private readonly pendingSyncReplies;
    private syncTimer?;
    private syncRetryTimer?;
    private bootstrapTimer?;
    private catchupTimer?;
    private bootstrapping;
    private bootstrapResponse;
    private awaitingSync;
    private catchup?;
    private applying;
    private suppressChanges;
    private initialized;
    private registered;
    private disposed;
    private currentStatus;
    private unpublished;
    private failureOperation?;
    private readonly messageCounts;
    private lastMessage?;
    constructor(room: Roomcraft, session: NetSession, options?: {
        roomId?: string;
        /** True for Start, false for Join; omission uses automatic discovery. */
        seedLocalScene?: boolean;
    });
    get status(): RoomcraftNetStatus;
    get pendingCount(): number;
    /** Detached peer selections; receiving one never changes local selection. */
    get remoteSelections(): ReadonlyMap<string, string | null>;
    /** Estimated shared playback timing; uncertainty is based on network round trips. */
    get motionClockState(): import("./RoomcraftClock").RoomcraftMotionClockState | undefined;
    /** A detached diagnostic snapshot. Reading it does not send data or change the scene. */
    get diagnostics(): RoomcraftNetDiagnostics;
    /** Matching roster/outline colors, distinct for the first eight room peers. */
    getPeerColor(id: string): number;
    init({ interaction, }: {
        interaction: Pick<Interaction, 'cancelObject'>;
    }): Promise<void>;
    /** Request current content and ownership without asking any peer to run AI. */
    resync(): void;
    private stopWaitingForSnapshot;
    private replySnapshot;
    private sendSnapshotRequest;
    update(): void;
    dispose(): void;
    private onChange;
    private publishLocal;
    private onManipulation;
    private reconcile;
    private objectSnapshot;
    private fingerprint;
    private snapshot;
    private receiveLayout;
    private drain;
    private requestObjects;
    private receiveObjects;
    private finishBootstrap;
    private sendSelection;
    private receiveSelection;
    private updateOutlines;
    private removeOutline;
    private on;
    private send;
    private recordMessage;
    private assertReady;
    private guard;
    private fail;
    private refreshStatus;
    private setStatus;
}

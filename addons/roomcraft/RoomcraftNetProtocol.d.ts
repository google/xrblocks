import type { SceneLayout } from './SceneTypes';
import type { MotionClockSnapshot } from './RoomcraftClock';
export interface RoomcraftRevision {
    counter: number;
    peerId: string;
}
export interface RoomcraftObjectState {
    id: string;
    ownerId: string;
    xform: number[];
    claim?: RoomcraftRevision;
}
export interface RoomcraftSnapshot {
    version: 2;
    revision: RoomcraftRevision;
    layout: SceneLayout;
    root: number[];
    objects: RoomcraftObjectState[];
    motion: MotionClockSnapshot;
}
export declare function record(value: unknown): Record<string, unknown>;
export declare function peerId(value: unknown, allowEmpty?: boolean): string;
export declare function sequence(value: unknown): number;
export declare function revision(value: unknown): RoomcraftRevision;
export declare function compareRevision(a: RoomcraftRevision, b: RoomcraftRevision): number;
export declare function transform(value: unknown): number[];
export declare function objectStates(value: unknown, ids: readonly string[]): RoomcraftObjectState[];

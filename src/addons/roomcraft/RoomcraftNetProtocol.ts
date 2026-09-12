import type {SceneLayout} from './SceneTypes';
import type {MotionClockSnapshot} from './RoomcraftClock';

export interface RoomcraftRevision {
  counter: number;
  peerId: string;
}

export interface RoomcraftObjectState {
  id: string;
  ownerId: string;
  xform: number[];
}

export interface RoomcraftSnapshot {
  version: 2;
  revision: RoomcraftRevision;
  layout: SceneLayout;
  root: number[];
  objects: RoomcraftObjectState[];
  motion: MotionClockSnapshot;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Roomcraft network data must be an object.');
  }
  return value as Record<string, unknown>;
}

export function peerId(value: unknown, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && !value) ||
    value.length > 128
  ) {
    throw new Error('Invalid Roomcraft network peer ID.');
  }
  return value;
}

export function sequence(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Invalid Roomcraft network sequence.');
  }
  return value;
}

export function revision(value: unknown): RoomcraftRevision {
  const data = record(value);
  return {counter: sequence(data.counter), peerId: peerId(data.peerId)};
}

export function compareRevision(
  a: RoomcraftRevision,
  b: RoomcraftRevision
): number {
  return (
    a.counter - b.counter ||
    (a.peerId === b.peerId ? 0 : a.peerId > b.peerId ? 1 : -1)
  );
}

export function transform(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 10 ||
    !value.every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry)
    ) ||
    value.slice(7).some((entry) => entry <= 0) ||
    Math.abs(Math.hypot(...value.slice(3, 7)) - 1) > 0.001
  ) {
    throw new Error('Invalid Roomcraft network transform.');
  }
  return [...value];
}

export function objectStates(
  value: unknown,
  ids: readonly string[]
): RoomcraftObjectState[] {
  if (!Array.isArray(value) || value.length !== ids.length) {
    throw new Error('Roomcraft snapshot must describe every object transform.');
  }
  const remaining = new Set(ids);
  return value.map((entry) => {
    const data = record(entry);
    if (typeof data.id !== 'string' || !remaining.delete(data.id)) {
      throw new Error('Invalid or duplicate Roomcraft snapshot object ID.');
    }
    return {
      id: data.id,
      ownerId: peerId(data.ownerId, true),
      xform: transform(data.xform),
    };
  });
}

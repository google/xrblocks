import {AnchorStore} from './AnchorStore';
import {AnchorRecord} from './AnchorTypes';

/** The subset of the `Storage` API this store depends on. */
export interface AnchorStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Resolves the default backing storage.
 *
 * `localStorage` throws on access in some privacy modes rather than merely
 * being absent, so this never lets that reach the caller.
 *
 * @returns Browser local storage, or undefined when it cannot be used.
 */
function defaultStorage(): AnchorStorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Persists anchor handles in browser local storage.
 *
 * Every operation degrades to a no-op rather than throwing: a missing or full
 * store should cost the caller its persistence, not its session.
 */
export class LocalStorageAnchorStore implements AnchorStore {
  private readonly storage?: AnchorStorageLike;

  /**
   * @param key - Storage key to read and write.
   * @param maxRecords - Cap on saved records; oldest are evicted first.
   * @param storage - Backing storage. Omit to use `localStorage`; pass `null`
   *     to disable persistence entirely. `null` is distinct from omission so
   *     callers can opt out explicitly instead of relying on a default.
   */
  constructor(
    private readonly key: string,
    private readonly maxRecords: number,
    storage?: AnchorStorageLike | null
  ) {
    this.storage =
      storage === undefined ? defaultStorage() : (storage ?? undefined);
  }

  /**
   * Reads every saved record.
   * @returns Saved records, oldest first, or an empty array.
   */
  load(): AnchorRecord[] {
    if (!this.storage) return [];
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      console.warn('[anchors] could not read stored anchors', error);
      return [];
    }
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn('[anchors] stored anchors were not a list; ignoring');
        return [];
      }
      return parsed.filter(isAnchorRecord);
    } catch (error) {
      console.warn('[anchors] stored anchors were unreadable', error);
      return [];
    }
  }

  /**
   * Saves a record, replacing any existing entry with the same uuid.
   * @param record - The record to save.
   */
  save(record: AnchorRecord): void {
    const records = this.load();
    const index = records.findIndex((r) => r.uuid === record.uuid);
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    // Only trim when growing, so re-saving an existing handle never evicts.
    if (index < 0 && records.length > this.maxRecords) {
      records.sort((a, b) => a.createdAt - b.createdAt);
      records.splice(0, records.length - this.maxRecords);
    }
    this.write(records);
  }

  /**
   * Removes a single record.
   * @param uuid - Handle of the record to remove.
   */
  remove(uuid: string): void {
    this.write(this.load().filter((r) => r.uuid !== uuid));
  }

  /** Removes every saved record. */
  clear(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.key);
    } catch (error) {
      console.warn('[anchors] could not clear stored anchors', error);
    }
  }

  private write(records: AnchorRecord[]): void {
    if (!this.storage) {
      console.warn('[anchors] no storage available; anchors will not persist');
      return;
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(records));
    } catch (error) {
      console.warn('[anchors] could not save anchors', error);
    }
  }
}

/**
 * Narrows an unknown parsed value to a usable record.
 * @param value - Candidate parsed from storage.
 * @returns Whether the value is a usable record.
 */
function isAnchorRecord(value: unknown): value is AnchorRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AnchorRecord>;
  return (
    typeof candidate.uuid === 'string' &&
    candidate.uuid.length > 0 &&
    typeof candidate.label === 'string'
  );
}

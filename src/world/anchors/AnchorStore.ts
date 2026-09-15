import {AnchorRecord} from './AnchorTypes';

/**
 * Storage for persistent anchor handles.
 *
 * Behind an interface so the persistence rules can be unit tested without a
 * browser, and so an app can swap in its own backing store.
 */
export interface AnchorStore {
  /**
   * Reads every saved record, oldest first.
   * @returns Saved records, or an empty array when nothing is stored.
   */
  load(): AnchorRecord[];

  /**
   * Saves a record, replacing any existing entry with the same uuid.
   * @param record - The record to save.
   * @returns Whether the record was actually committed. Callers must not tell
   *     a user their anchor was saved when storage quietly refused it.
   */
  save(record: AnchorRecord): boolean;

  /**
   * Removes a single record.
   * @param uuid - Handle of the record to remove.
   */
  remove(uuid: string): void;

  /** Removes every saved record. */
  clear(): void;
}

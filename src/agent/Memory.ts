export interface MemoryEntry {
  role: 'user'|'ai'|'tool';
  content: string;
}

/**
 * Manages the agent's memory, including short-term, long-term, and working
 * memory.
 */
export class Memory {
  private shortTermMemory: MemoryEntry[] = [];

  /**
   * Adds a new entry to the short-term memory.
   * @param entry - The memory entry to add.
   */
  addShortTerm(entry: MemoryEntry): void {
    this.shortTermMemory.push(entry);
  }

  /**
   * Retrieves the short-term memory.
   * @returns An array of all short-term memory entries.
   */
  getShortTerm(): MemoryEntry[] {
    return [...this.shortTermMemory];
  }

  /**
   * Clears all memory components.
   */
  clear(): void {
    this.shortTermMemory.length = 0;
  }
}

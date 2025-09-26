export interface MemoryEntry {
    role: 'user' | 'ai' | 'tool';
    content: string;
}
/**
 * Manages the agent's memory, including short-term, long-term, and working
 * memory.
 */
export declare class Memory {
    private shortTermMemory;
    /**
     * Adds a new entry to the short-term memory.
     * @param entry - The memory entry to add.
     */
    addShortTerm(entry: MemoryEntry): void;
    /**
     * Retrieves the short-term memory.
     * @returns An array of all short-term memory entries.
     */
    getShortTerm(): MemoryEntry[];
    /**
     * Clears all memory components.
     */
    clear(): void;
}

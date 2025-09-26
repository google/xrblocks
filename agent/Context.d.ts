import { Memory } from './Memory';
import { Tool } from './Tool';
/**
 * Builds the context to be sent to the AI for reasoning.
 */
export declare class Context {
    private instructions;
    constructor(instructions?: string);
    get instruction(): string;
    /**
     * Constructs a formatted prompt from memory and available tools.
     * @param memory - The agent's memory.
     * @param tools - The list of available tools.
     * @returns A string representing the full context for the AI.
     */
    build(memory: Memory, tools: Tool[]): string;
    private formatEntry;
}

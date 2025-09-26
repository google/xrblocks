import {Memory, MemoryEntry} from './Memory';
import {Tool} from './Tool';

/**
 * Builds the context to be sent to the AI for reasoning.
 */
export class Context {
  private instructions: string;

  constructor(instructions = 'You are a helpful assistant.') {
    this.instructions = instructions;
  }

  get instruction(): string {
    return this.instructions;
  }

  /**
   * Constructs a formatted prompt from memory and available tools.
   * @param memory - The agent's memory.
   * @param tools - The list of available tools.
   * @returns A string representing the full context for the AI.
   */
  build(memory: Memory, tools: Tool[]): string {
    const history = memory.getShortTerm();
    const formattedHistory =
        history.map(entry => this.formatEntry(entry)).join('\n');

    const toolDescriptions =
        tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');

    return `${this.instructions} You have access to the following tools: ${
        toolDescriptions}
        Current Conversation history: ${
        formattedHistory}. You should reply to the user or call a tool as needed.`;
  }

  private formatEntry(entry: MemoryEntry): string {
    switch (entry.role) {
      case 'user':
        return `User: ${entry.content}`;
      case 'ai':
        return `AI: ${entry.content}`;
      case 'tool':
        return `Tool Output: ${entry.content}`;
    }
  }
}

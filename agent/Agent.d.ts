import { AI } from '../ai/AI';
import { Context } from './Context';
import { Memory } from './Memory';
import { Tool } from './Tool';
/**
 * An agent that can use an AI to reason and execute tools.
 */
export declare class Agent {
    static dependencies: {};
    ai: AI;
    tools: Tool[];
    memory: Memory;
    contextBuilder: Context;
    constructor(ai: AI, tools?: Tool[], instruction?: string);
    /**
     * Starts the agent's reasoning loop with an initial prompt.
     * @param prompt - The initial prompt from the user.
     * @returns The final text response from the agent.
     */
    start(prompt: string): Promise<string>;
    /**
     * The main reasoning and action loop of the agent for non-live mode.
     * It repeatedly builds context, queries the AI, and executes tools
     * until a final text response is generated.
     */
    private run;
    findTool(name: string): Tool | undefined;
}

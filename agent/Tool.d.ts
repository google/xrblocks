import type * as GoogleGenAITypes from '@google/genai';
export interface ToolCall {
    name: string;
    args: unknown;
}
export type ToolSchema = Omit<GoogleGenAITypes.Schema, 'type' | 'properties'> & {
    properties?: Record<string, ToolSchema>;
    type?: keyof typeof GoogleGenAITypes.Type;
};
export type ToolOptions = {
    /** The name of the tool. */
    name: string;
    /** A description of what the tool does. */
    description: string;
    /** The parameters of the tool */
    parameters?: ToolSchema;
    /** A callback to execute when the tool is triggered */
    onTriggered?: (args: unknown) => unknown;
};
/**
 * A base class for tools that the agent can use.
 */
export declare class Tool {
    name: string;
    description?: string;
    parameters?: ToolSchema;
    onTriggered?: (args: unknown) => unknown;
    /**
     * @param options - The options for the tool.
     */
    constructor(options: ToolOptions);
    /**
     * Executes the tool's action.
     * @param args - The arguments for the tool.
     * @returns The result of the tool's action.
     */
    execute(args: unknown): unknown;
    /**
     * Returns a JSON representation of the tool.
     * @returns A valid FunctionDeclaration object.
     */
    toJSON(): GoogleGenAITypes.FunctionDeclaration;
}

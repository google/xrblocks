import type * as GoogleGenAITypes from '@google/genai';

export interface ToolCall {
  name: string;
  args: unknown;
}

/**
 * Standardized result type for tool execution.
 * @typeParam T - The type of data returned on success.
 */
export interface ToolResult<T = unknown> {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error message if execution failed */
  error?: string;
  /** Additional metadata about the execution */
  metadata?: Record<string, unknown>;
}

// Identical to GoogleGenAITypes.Schema but replaces the Type enum with actual
// strings so tools don't need to import the types from @google/genai.
export type ToolSchema = Omit<GoogleGenAITypes.Schema, 'type'|'properties'>&{
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
  onTriggered?: (args: unknown) => unknown | Promise<unknown>;
};

/**
 * A base class for tools that the agent can use.
 */
export class Tool {
  name: string;
  description?: string;
  parameters?: ToolSchema;
  onTriggered?: (args: unknown) => unknown;

  /**
   * @param options - The options for the tool.
   */
  constructor(options: ToolOptions) {
    this.name = options.name;
    this.description = options.description;
    this.parameters = options.parameters || {};
    this.onTriggered = options.onTriggered;
  }

  /**
   * Executes the tool's action with standardized error handling.
   * @param args - The arguments for the tool.
   * @returns A promise that resolves with a ToolResult containing success/error information.
   */
  async execute(args: unknown): Promise<ToolResult> {
    try {
      if (this.onTriggered) {
        const result = await Promise.resolve(this.onTriggered(args));
        return {
          success: true,
          data: result,
          metadata: {executedAt: Date.now(), toolName: this.name}
        };
      }
      throw new Error(
          'The execute method must be implemented by a subclass or onTriggered must be provided.');
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {executedAt: Date.now(), toolName: this.name}
      };
    }
  }

  /**
   * Returns a JSON representation of the tool.
   * @returns A valid FunctionDeclaration object.
   */
  toJSON(): GoogleGenAITypes.FunctionDeclaration {
    const result: GoogleGenAITypes.FunctionDeclaration = {name: this.name};
    if (this.description) {
      result.description = this.description;
    }
    if (this.parameters) {
      result.parameters = this.parameters as GoogleGenAITypes.Schema;
    }
    return result;
  }
}

import type * as GoogleGenAITypes from '@google/genai';

export interface ToolCall {
  name: string;
  args: unknown;
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
  onTriggered?: (args: unknown) => unknown;
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
   * Executes the tool's action.
   * @param args - The arguments for the tool.
   * @returns The result of the tool's action.
   */
  execute(args: unknown): unknown {
    if (this.onTriggered) {
      return this.onTriggered(args);
    }
    throw new Error(
        'The execute method must be implemented by a subclass or onTriggered must be provided.');
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
    if (this.parameters && this.parameters.required) {
      result.parameters = this.parameters as GoogleGenAITypes.Schema;
    }
    return result;
  }
}

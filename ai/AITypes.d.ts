import type { ToolCall } from '../agent/Tool';
export interface GeminiResponse {
    toolCall?: ToolCall;
    text?: string | null;
}

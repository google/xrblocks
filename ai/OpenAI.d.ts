import type OpenAIType from 'openai';
import { OpenAIOptions } from './AIOptions';
import { BaseAIModel } from './BaseAIModel';
export declare class OpenAI extends BaseAIModel {
    protected options: OpenAIOptions;
    openai?: OpenAIType;
    constructor(options: OpenAIOptions);
    init(): Promise<void>;
    isAvailable(): boolean;
    query(input: {
        prompt: string;
    }, _tools?: never[]): Promise<{
        text: string;
    } | null>;
    generate(): Promise<void>;
}

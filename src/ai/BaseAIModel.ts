import {GeminiResponse} from './AITypes';

export abstract class BaseAIModel {
  constructor() {}

  abstract init(): Promise<void>;

  abstract isAvailable(): boolean;

  abstract query(_input: object, _tools: []):
      Promise<GeminiResponse|string|null>;
}

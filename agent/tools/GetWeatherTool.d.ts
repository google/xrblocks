import { Tool } from '../Tool';
export interface GetWeatherArgs {
    latitude: number;
    longitude: number;
}
export type GetWeatherToolResults = {
    error?: string;
    temperature?: number;
    weathercode?: number;
};
/**
 * A tool that gets the current weather for a specific location.
 */
export declare class GetWeatherTool extends Tool {
    constructor();
    /**
     * Executes the tool's action.
     * @param args - The arguments for the tool.
     * @returns A promise that resolves with the weather information.
     */
    execute(args: GetWeatherArgs): Promise<GetWeatherToolResults>;
}

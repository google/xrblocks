import {Tool} from '../Tool';

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
export class GetWeatherTool extends Tool {
  constructor() {
    super({
      name: 'get_weather',
      description: 'Gets the current weather for a specific location.',
      parameters: {
        type: 'OBJECT',
        properties: {
          location: {
            type: 'STRING',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: 'STRING',
            enum: ['celsius', 'fahrenheit'],
          },
        },
        required: ['location'],
      }
    });
  }

  /**
   * Executes the tool's action.
   * @param args - The arguments for the tool.
   * @returns A promise that resolves with the weather information.
   */
  override async execute(args: GetWeatherArgs): Promise<GetWeatherToolResults> {
    if (!args.latitude || !args.longitude) {
      args.latitude = 37.7749;  // Default to San Francisco
      args.longitude = -122.4194;
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${
        args.latitude}&longitude=${
        args.longitude}&current=weather_code,temperature_2m&temperature_unit=fahrenheit`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        return {
          temperature: data.current.temperature_2m,
          weathercode: data.current.weather_code,
        };
      } else {
        return {
          error: 'Could not retrieve weather for the specified location.'
        };
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
      return {
        error: 'There was an error fetching the weather.'
      };
    }
  }
}

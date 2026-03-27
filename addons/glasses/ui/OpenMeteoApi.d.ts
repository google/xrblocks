export declare class OpenMeteoApi {
    apikey?: string;
    constructor({ apikey }?: {
        apikey?: string;
    });
    getForecastApiUrl(params?: {}): string;
    fetchWeather(latitude: number, longitude: number): Promise<any>;
}

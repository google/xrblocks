//#region src/addons/glasses/ui/OpenMeteoApi.d.ts
export declare class OpenMeteoApi {
  apikey?: string;
  constructor({ apikey }?: {
    apikey?: string;
  });
  getForecastApiUrl(params?: {}): string;
  fetchWeather(latitude: number, longitude: number): Promise<any>;
}
//#endregion
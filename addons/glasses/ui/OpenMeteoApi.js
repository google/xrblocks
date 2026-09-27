//#region src/addons/glasses/ui/OpenMeteoApi.ts
const FREE_API_URL = "https://api.open-meteo.com/";
const PAID_API_URL = "https://customer-api.open-meteo.com/";
var OpenMeteoApi = class {
	constructor({ apikey = void 0 } = {}) {
		this.apikey = apikey;
	}
	getForecastApiUrl(params = {}) {
		const forecastApiUrl = (this.apikey ? PAID_API_URL : FREE_API_URL) + "v1/forecast";
		if (this.apikey) params = {
			...params,
			apikey: this.apikey
		};
		return forecastApiUrl + "?" + new URLSearchParams(params).toString();
	}
	async fetchWeather(latitude, longitude) {
		const params = {
			latitude,
			longitude,
			current: "weather_code,temperature_2m",
			temperature_unit: "fahrenheit"
		};
		return (await (await fetch(this.getForecastApiUrl(params))).json()).current;
	}
};
//#endregion
export { OpenMeteoApi };

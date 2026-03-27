const FREE_API_URL = 'https://api.open-meteo.com/';
const PAID_API_URL = 'https://customer-api.open-meteo.com/';
class OpenMeteoApi {
    constructor({ apikey = undefined } = {}) {
        this.apikey = apikey;
    }
    getForecastApiUrl(params = {}) {
        const baseUrl = this.apikey ? PAID_API_URL : FREE_API_URL;
        const forecastApiUrl = baseUrl + 'v1/forecast';
        if (this.apikey) {
            // Add apikey to the params.
            params = { ...params, apikey: this.apikey };
        }
        return forecastApiUrl + '?' + new URLSearchParams(params).toString();
    }
    async fetchWeather(latitude, longitude) {
        const params = {
            latitude,
            longitude,
            current: 'weather_code,temperature_2m',
            temperature_unit: 'fahrenheit',
        };
        const response = await fetch(this.getForecastApiUrl(params));
        const data = await response.json();
        return data.current;
    }
}

export { OpenMeteoApi };

import { contentDefaults, Container, Text, abortableEffect } from '@pmndrs/uikit';
import { Signal, computed } from '@preact/signals-core';
import { OpenMeteoApi } from './OpenMeteoApi.js';
import { WeatherIcon } from './WeatherIcon.js';
import './MaterialSymbolsIcon.js';
import './utils.js';
import './WeatherIconMapping.js';

const DEGREE_SYMBOL = '\xB0';
const DEFAULT_WEATHER_UPDATE_INTERVAL_MINUTES = 15;
const weatherDefaults = {
    ...contentDefaults,
    updateIntervalMinutes: DEFAULT_WEATHER_UPDATE_INTERVAL_MINUTES,
};
class Weather extends Container {
    constructor(inputProperties, initialClasses, config) {
        super(inputProperties, initialClasses, {
            defaults: weatherDefaults,
            defaultOverrides: {
                gapColumn: 4,
                ...config?.defaultOverrides,
            },
            ...config,
        });
        this.name = 'Weather';
        this.api = new OpenMeteoApi();
        this.lastWeatherUpdateAttemptTime = null;
        this.wmoCode = new Signal(-1);
        this.locationPermissionReceived = new Signal(false);
        this.temperature = new Signal(undefined);
        const weatherIcon = new WeatherIcon({
            wmoCode: this.wmoCode,
            showLocationDisabledIcon: computed(() => {
                return !this.locationPermissionReceived.value;
            }),
            width: 32,
            display: computed(() => {
                return this.wmoCode.value !== -1 ? 'flex' : 'none';
            }),
        });
        this.add(weatherIcon);
        const weatherDegrees = new Text({
            text: computed(() => {
                return this.temperature.value === undefined
                    ? '??'
                    : this.temperature.value.toFixed(0) + DEGREE_SYMBOL;
            }),
            fontSize: 24,
            display: computed(() => {
                return this.wmoCode.value !== -1 ? 'flex' : 'none';
            }),
        });
        weatherDegrees.name = 'Temperature Degrees Text';
        this.add(weatherDegrees);
        abortableEffect(() => {
            const fn = this.updateWeather.bind(this);
            const root = this.root.value;
            root.onFrameSet.add(fn);
            return () => root.onFrameSet.delete(fn);
        }, this.abortSignal);
    }
    updateWeather() {
        if (this.lastWeatherUpdateAttemptTime != null &&
            performance.now() - this.lastWeatherUpdateAttemptTime <
                1000 * 60 * this.properties.signal.updateIntervalMinutes.value) {
            return;
        }
        this.lastWeatherUpdateAttemptTime = performance.now();
        this.updateCurrentWeather();
    }
    async updateCurrentWeather() {
        if (!('geolocation' in navigator)) {
            throw new Error('Geolocation is not supported by this browser.');
        }
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        }).catch((e) => {
            this.locationPermissionReceived.value = false;
            throw e;
        });
        this.locationPermissionReceived.value = true;
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const currentWeather = await this.api.fetchWeather(latitude, longitude);
        this.temperature.value = currentWeather.temperature_2m;
        this.wmoCode.value = currentWeather.weather_code;
    }
}

export { Weather, weatherDefaults };

import {
  abortableEffect,
  BaseOutProperties,
  Container,
  contentDefaults,
  InProperties,
  RenderContext,
  Text,
  WithSignal,
} from '@pmndrs/uikit';
import {computed, Signal} from '@preact/signals-core';

import {OpenMeteoApi} from './OpenMeteoApi';
import {WeatherIcon} from './WeatherIcon';

const DEGREE_SYMBOL = '\xB0';
const DEFAULT_WEATHER_UPDATE_INTERVAL_MINUTES = 15;

export const weatherDefaults = {
  ...contentDefaults,
  updateIntervalMinutes: DEFAULT_WEATHER_UPDATE_INTERVAL_MINUTES,
};

export type WeatherOutProperties = typeof weatherDefaults & BaseOutProperties;
export type WeatherProperties = InProperties<WeatherOutProperties>;

export class Weather<
  OutProperties extends WeatherOutProperties = WeatherOutProperties,
> extends Container<OutProperties> {
  name = 'Weather';
  private api = new OpenMeteoApi();
  private lastWeatherUpdateAttemptTime: number | null = null;
  private wmoCode = new Signal(-1);
  private locationPermissionReceived = new Signal(false);
  private temperature = new Signal<number | undefined>(undefined);

  constructor(
    inputProperties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<OutProperties>;
      defaults?: WithSignal<OutProperties>;
    }
  ) {
    super(inputProperties, initialClasses, {
      defaults: weatherDefaults as OutProperties,
      defaultOverrides: {
        gapColumn: 4,
        ...config?.defaultOverrides,
      } as InProperties<OutProperties>,
      ...config,
    });

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

  private updateWeather() {
    if (
      this.lastWeatherUpdateAttemptTime != null &&
      performance.now() - this.lastWeatherUpdateAttemptTime <
        1000 * 60 * this.properties.signal.updateIntervalMinutes.value
    ) {
      return;
    }
    this.lastWeatherUpdateAttemptTime = performance.now();
    this.updateCurrentWeather();
  }

  async updateCurrentWeather() {
    if (!('geolocation' in navigator)) {
      throw new Error('Geolocation is not supported by this browser.');
    }
    const position = await new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      }
    ).catch((e) => {
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

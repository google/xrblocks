import { Container } from '@pmndrs/uikit';
import { signal } from '@preact/signals-core';
import { Clock } from './Clock.js';
import { Weather } from './Weather.js';
import './OpenMeteoApi.js';
import './WeatherIcon.js';
import './MaterialSymbolsIcon.js';
import './utils.js';
import './WeatherIconMapping.js';

class SystemBar extends Container {
    constructor(properties, initialClasses, config) {
        const height = signal(56);
        const alignItems = signal('center');
        const justifyContent = signal('center');
        const gap = signal(16);
        const fontWeight = signal('semi-bold');
        const color = signal('white');
        const fontSize = signal(24);
        const lineHeight = signal('5px');
        super(properties, initialClasses, {
            ...config,
            defaultOverrides: {
                height,
                alignItems,
                justifyContent,
                gap,
                fontWeight,
                color,
                fontSize,
                lineHeight,
                ...config?.defaultOverrides,
            },
        });
        this.name = 'System Bar';
        this.clock = new Clock();
        this.weather = new Weather();
        this.add(this.clock);
        this.add(this.weather);
    }
}

export { SystemBar };

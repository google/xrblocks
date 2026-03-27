import { computed } from '@preact/signals-core';
import { MaterialSymbolsIcon } from './MaterialSymbolsIcon.js';
import { extractValue } from './utils.js';
import { WMO_CODE_TO_ICON } from './WeatherIconMapping.js';
import '@pmndrs/uikit';

const LOCATION_DISABLED_ICON = 'location_disabled';
const UNKNOWN_WEATHER_CODE_ICON = 'unknown_med';
class WeatherIcon extends MaterialSymbolsIcon {
    constructor(properties, initialClasses, config) {
        const wmoCode = properties?.wmoCode ?? config?.defaultOverrides?.wmoCode ?? 0;
        const showLocationDisabledIcon = properties?.showLocationDisabledIcon ??
            config?.defaultOverrides?.showLocationDisabledIcon;
        const icon = computed(() => {
            if (extractValue(showLocationDisabledIcon) ?? false) {
                return LOCATION_DISABLED_ICON;
            }
            const wmoCodeValue = extractValue(wmoCode) ?? -1;
            return wmoCodeValue in WMO_CODE_TO_ICON
                ? WMO_CODE_TO_ICON[wmoCodeValue]
                : UNKNOWN_WEATHER_CODE_ICON;
        });
        const iconStyle = 'rounded';
        const iconWeight = 600;
        super(properties, initialClasses, {
            ...config,
            defaultOverrides: {
                icon: icon,
                iconStyle: iconStyle,
                iconWeight: iconWeight,
                ...config?.defaultOverrides,
            },
        });
        this.name = 'Weather Icon';
    }
}

export { WeatherIcon };

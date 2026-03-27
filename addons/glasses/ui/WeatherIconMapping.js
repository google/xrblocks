// Weather codes:
// https://open-meteo.com/en/docs?current=weather_code,temperature_2m&hourly=&temperature_unit=fahrenheit#weather_variable_documentation
const WMO_CODE_TO_ICON = {
    // Code 0: Clear sky
    0: 'sunny',
    // Codes 1, 2, 3: Mainly clear, partly cloudy, and overcast
    1: 'partly_cloudy_day',
    2: 'partly_cloudy_day',
    3: 'cloud',
    // Codes 45, 48: Fog and depositing rime fog
    45: 'foggy',
    48: 'foggy',
    // Codes 51, 53, 55: Drizzle: Light, moderate, and dense intensity
    51: 'rainy_light',
    53: 'rainy',
    55: 'rainy_heavy',
    // Codes 56, 57: Freezing Drizzle: Light and dense intensity
    56: 'rainy_snow',
    57: 'rainy_snow',
    // Codes 61, 63, 65: Rain: Slight, moderate and heavy intensity
    61: 'rainy_light',
    63: 'rainy',
    65: 'rainy_heavy',
    // Codes 66, 67: Freezing Rain: Light and heavy intensity
    66: 'weather_mix',
    67: 'weather_mix',
    // Codes 71, 73, 75: Snow fall: Slight, moderate, and heavy intensity
    71: 'weather_snowy',
    73: 'weather_snowy',
    75: 'weather_snowy',
    // Code 77: Snow grains
    77: 'weather_snowy',
    // Codes 80, 81, 82: Rain showers: Slight, moderate, and violent
    80: 'rainy',
    81: 'rainy',
    82: 'rainy_heavy',
    // Codes 85, 86: Snow showers slight and heavy
    85: 'snowing',
    86: 'snowing_heavy',
    // Code 95: Thunderstorm: Slight or moderate
    95: 'thunderstorm',
    // Codes 96, 99: Thunderstorm with slight and heavy hail
    96: 'weather_hail',
    99: 'weather_hail',
};

export { WMO_CODE_TO_ICON };

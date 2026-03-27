import { Container } from '@pmndrs/uikit';
import { SystemBar } from './SystemBar.js';
import '@preact/signals-core';
import './Clock.js';
import './Weather.js';
import './OpenMeteoApi.js';
import './WeatherIcon.js';
import './MaterialSymbolsIcon.js';
import './utils.js';
import './WeatherIconMapping.js';

const FONTS_ROOT_DIR = 'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@21e7f18c263663a1c126891babe4a444d92000a9/fonts/';
class SystemUI extends Container {
    constructor(sizeX = 1, sizeY = 1, containerHeight = 364) {
        super({
            flexDirection: 'column',
            padding: 0,
            gap: 0,
            sizeX: sizeX ?? undefined,
            sizeY: sizeY ?? undefined,
            pixelSize: sizeX / 420,
            fontFamilies: {
                googleSansFlex: {
                    750: `${FONTS_ROOT_DIR}/GoogleSansFlex_750.json`,
                    600: `${FONTS_ROOT_DIR}/GoogleSansFlex_600.json`,
                },
            },
        });
        this.name = 'System UI';
        this.systemBar = new SystemBar();
        this.canvas = new Container({
            height: containerHeight ?? undefined,
            flexDirection: 'column',
            overflow: 'scroll',
            justifyContent: 'flex-end',
        });
        this.add(this.canvas);
        this.add(this.systemBar);
    }
}

export { SystemUI };

import { Text, abortableEffect } from '@pmndrs/uikit';
import { signal } from '@preact/signals-core';

class Clock extends Text {
    constructor(properties, initialClasses, config) {
        const timeText = signal('8:32');
        super(properties, initialClasses, {
            ...config,
            defaultOverrides: {
                text: timeText,
                ...config?.defaultOverrides,
            },
        });
        this.name = 'Clock';
        this.lastUpdatedTime = Date.now();
        this.text = timeText;
        abortableEffect(() => {
            const fn = this.updateTime.bind(this);
            const root = this.root.value;
            root.onFrameSet.add(fn);
            return () => root.onFrameSet.delete(fn);
        }, this.abortSignal);
    }
    updateTime() {
        const msSinceEpoch = Date.now();
        const timeSinceLastUpdate = msSinceEpoch - this.lastUpdatedTime;
        if (timeSinceLastUpdate < 60) {
            return;
        }
        const date = new Date();
        const hour = date.getHours();
        const minute = date.getMinutes();
        const hourString = (((hour + 11) % 12) + 1).toString();
        const minuteString = minute.toString().padStart(2, '0');
        this.text.value = `${hourString}:${minuteString}`;
        this.lastUpdatedTime = msSinceEpoch;
    }
}

export { Clock };

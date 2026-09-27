import { Weather } from "./Weather.js";
import { Clock } from "./Clock.js";
import { signal } from "@preact/signals-core";
import { Container } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/SystemBar.ts
var SystemBar = class extends Container {
	constructor(properties, initialClasses, config) {
		const height = signal(56);
		const alignItems = signal("center");
		const justifyContent = signal("center");
		const gap = signal(16);
		const fontWeight = signal("semi-bold");
		const color = signal("white");
		const fontSize = signal(24);
		const lineHeight = signal("5px");
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
				...config?.defaultOverrides
			}
		});
		this.name = "System Bar";
		this.clock = new Clock();
		this.weather = new Weather();
		this.add(this.clock);
		this.add(this.weather);
	}
};
//#endregion
export { SystemBar };

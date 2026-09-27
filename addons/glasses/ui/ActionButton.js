import { MaterialSymbolsIcon } from "./MaterialSymbolsIcon.js";
import { TextWithEmoji } from "./TextWithEmoji.js";
import { HighlightMaterial } from "./HighlightMaterial.js";
import { computed } from "@preact/signals-core";
import { Container } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/ActionButton.ts
/** A reusable action button component with icon and text support. */
var ActionButton = class extends Container {
	constructor(inputProperties, initialClasses, config) {
		super(inputProperties, initialClasses, {
			defaultOverrides: {
				width: "auto",
				marginX: "auto",
				height: 56,
				minWidth: 56,
				borderWidth: 4,
				borderRadius: 100,
				borderColor: 8751237,
				paddingBottom: 8,
				paddingTop: 8,
				paddingLeft: 16,
				paddingRight: 16,
				justifyContent: "center",
				alignItems: "center",
				gapColumn: 8,
				positionType: "relative",
				panelMaterialClass: HighlightMaterial,
				...config?.defaultOverrides
			},
			...config
		});
		this.name = "Action Button";
		const iconContainer = new Container({});
		this.add(iconContainer);
		const icon = new MaterialSymbolsIcon({
			icon: this.properties.signal.icon,
			iconStyle: this.properties.signal.iconStyle,
			iconWeight: this.properties.signal.iconWeight,
			height: 40,
			color: 11061242,
			display: computed(() => this.properties.signal.icon ? "initial" : "none"),
			alignSelf: "center"
		});
		iconContainer.add(icon);
		const text = new TextWithEmoji({
			text: this.properties.signal.text,
			fontSize: 24,
			color: "white",
			fontWeight: 600,
			letterSpacing: 1.26,
			wordBreak: "keep-all"
		});
		this.add(text);
	}
};
//#endregion
export { ActionButton };

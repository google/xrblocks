import { TextWithEmoji } from "./TextWithEmoji.js";
import { CardTitleChip } from "./CardTitleChip.js";
import { ActionButton } from "./ActionButton.js";
import { CardActionButton } from "./CardActionButton.js";
import { computed } from "@preact/signals-core";
import { Container, Image, abortableEffect, contentDefaults } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/Card.ts
/** Default properties for the Card component. */
const cardDefaults = {
	titleChip: void 0,
	title: void 0,
	subtitle: void 0,
	body: void 0,
	imageSrc: void 0,
	entityIcon: void 0,
	actionButton: void 0,
	trailingEntityIcon: false,
	buttons: [],
	...contentDefaults
};
/** A card component that displays content with title, icon, text, and actions. */
var Card = class extends Container {
	constructor(properties) {
		super({
			...properties,
			flexDirection: "column",
			justifyContent: "flex-end",
			width: "100%"
		}, void 0, { defaults: cardDefaults });
		const titleChip = new CardTitleChip({
			text: computed(() => this.properties.signal.titleChip.value ?? ""),
			display: computed(() => this.properties.signal.titleChip.value ? void 0 : "none"),
			marginBottom: 12,
			height: 56
		});
		this.add(titleChip);
		const cardContainer = new Container({
			flexDirection: "column",
			borderWidth: 3,
			borderRadius: 40,
			borderColor: 6317152,
			padding: 13,
			flexGrow: computed(() => this.properties.signal.imageSrc.value ? 1 : 0),
			minHeight: 80,
			backgroundColor: "black"
		});
		this.add(cardContainer);
		const image = new Image({
			src: this.properties.signal.imageSrc,
			objectFit: "cover",
			width: "100%",
			borderRadius: 24,
			keepAspectRatio: false,
			flexGrow: computed(() => this.properties.signal.imageSrc.value ? 1 : 0),
			display: computed(() => this.properties.signal.imageSrc.value ? void 0 : "none")
		});
		cardContainer.add(image);
		const contentArea = new Container({
			flexDirection: computed(() => this.properties.signal.trailingEntityIcon.value ? "row-reverse" : "row"),
			padding: 8,
			gap: 12
		});
		contentArea.name = "Card Content Area";
		cardContainer.add(contentArea);
		const cardEntityIcon = new Image({
			src: this.properties.signal.entityIcon,
			width: 56,
			height: 56,
			display: computed(() => this.properties.signal.entityIcon.value !== void 0 ? void 0 : "none")
		});
		contentArea.add(cardEntityIcon);
		const actionArea = new Container({
			flexDirection: "column",
			gap: 12
		});
		cardContainer.add(actionArea);
		abortableEffect(() => {
			const buttons = [];
			for (const button of this.properties.signal.buttons.value) {
				const actionButton = new ActionButton({
					text: button.text,
					icon: button.icon,
					width: "100%"
				});
				buttons.push(actionButton);
				actionArea.add(actionButton);
			}
			return () => {
				actionArea.remove(...buttons);
				for (const button of buttons) button.dispose();
			};
		}, this.abortSignal);
		const textArea = new Container({
			flexDirection: "column",
			flexGrow: 1,
			gap: 3
		});
		contentArea.add(textArea);
		const titleText = new TextWithEmoji({
			text: computed(() => this.properties.signal.title.value ?? ""),
			fontSize: 24,
			lineHeight: "32px",
			fontWeight: 600,
			color: "white",
			letterSpacing: 1.26,
			display: computed(() => this.properties.signal.title.value !== void 0 ? void 0 : "none"),
			flexGrow: 1,
			whiteSpace: "pre"
		});
		textArea.add(titleText);
		const subtitleText = new TextWithEmoji({
			text: computed(() => this.properties.signal.subtitle.value ?? ""),
			fontSize: 18,
			lineHeight: "32px",
			fontWeight: 600,
			color: "white",
			letterSpacing: 1.26,
			display: computed(() => this.properties.signal.subtitle.value !== void 0 ? void 0 : "none"),
			flexGrow: 1,
			whiteSpace: "pre"
		});
		textArea.add(subtitleText);
		const bodyText = new TextWithEmoji({
			text: computed(() => this.properties.signal.body.value ?? ""),
			fontSize: 20,
			lineHeight: "32px",
			fontWeight: 600,
			color: "white",
			letterSpacing: 1.26,
			display: computed(() => this.properties.signal.body.value !== void 0 ? void 0 : "none"),
			flexGrow: 1,
			whiteSpace: "pre",
			overflow: "hidden"
		});
		textArea.add(bodyText);
		const actionButtonWrapper = new Container();
		this.add(actionButtonWrapper);
		abortableEffect(() => {
			const actionButtonValue = this.properties.signal.actionButton.value;
			if (actionButtonValue) {
				const actionButton = new CardActionButton({
					text: actionButtonValue.text,
					icon: actionButtonValue.icon,
					iconStyle: "rounded",
					iconWeight: 600
				});
				actionButtonWrapper.add(actionButton);
				return () => {
					actionButtonWrapper.remove(actionButton);
				};
			}
		}, this.abortSignal);
	}
};
//#endregion
export { Card, cardDefaults };

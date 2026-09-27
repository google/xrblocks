import { SystemBar } from "./SystemBar.js";
import { Container } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/SystemUI.ts
const FONTS_ROOT_DIR = "https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@21e7f18c263663a1c126891babe4a444d92000a9/fonts/";
var SystemUI = class extends Container {
	constructor(sizeX = 1, sizeY = 1, containerHeight = 364) {
		super({
			flexDirection: "column",
			padding: 0,
			gap: 0,
			sizeX: sizeX ?? void 0,
			sizeY: sizeY ?? void 0,
			pixelSize: sizeX / 420,
			fontFamilies: { googleSansFlex: {
				750: `${FONTS_ROOT_DIR}/GoogleSansFlex_750.json`,
				600: `${FONTS_ROOT_DIR}/GoogleSansFlex_600.json`
			} }
		});
		this.name = "System UI";
		this.systemBar = new SystemBar();
		this.canvas = new Container({
			height: containerHeight ?? void 0,
			flexDirection: "column",
			overflow: "scroll",
			justifyContent: "flex-end"
		});
		this.add(this.canvas);
		this.add(this.systemBar);
	}
};
//#endregion
export { SystemUI };

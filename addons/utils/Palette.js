import * as THREE from "three";
const palette = new class XRPalette {
	/**
	* Creates a singleton instance of the Palette class.
	*/
	constructor() {
		this.fullGColors_ = [
			1527462,
			10817038,
			14906368,
			877869,
			4359668,
			15352629,
			16497668,
			3450963,
			13820924,
			16437967,
			16707523,
			13560534,
			15856628,
			10133670,
			2105636
		];
		this.liteGColors_ = [
			15352629,
			4359668,
			3451731,
			16497668
		];
		this.lastRandomColor_ = null;
		if (XRPalette.instance) return XRPalette.instance;
		XRPalette.instance = this;
	}
	/**
	* Returns a completely random color.
	* @returns A random color.
	*/
	getRandom() {
		return new THREE.Color(Math.random() * 16777215);
	}
	getRandomColorFromPalette(palette) {
		let newColor;
		do {
			const baseColor = palette[Math.floor(Math.random() * palette.length)];
			newColor = new THREE.Color(baseColor);
		} while (this.lastRandomColor_ && newColor.equals(this.lastRandomColor_));
		this.lastRandomColor_ = newColor;
		return newColor;
	}
	/**
	* Returns a random color from the predefined Google color palette.
	* @returns A random base color.
	*/
	getRandomLiteGColor() {
		return this.getRandomColorFromPalette(this.liteGColors_);
	}
	/**
	* Returns a random color from the predefined Google color palette.
	* @returns A random base color.
	*/
	getRandomFullGColor() {
		return this.getRandomColorFromPalette(this.fullGColors_);
	}
}();
//#endregion
export { palette };

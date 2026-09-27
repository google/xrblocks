//#region src/addons/roomcraft/SceneValidationError.ts
/** Invalid authored data, distinct from provider, conflict, or runtime failures. */
var SceneValidationError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "SceneValidationError";
	}
};
//#endregion
export { SceneValidationError };

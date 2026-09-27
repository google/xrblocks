//#region src/addons/roomcraft/SceneValidationError.d.ts
/** Invalid authored data, distinct from provider, conflict, or runtime failures. */
export declare class SceneValidationError extends Error {
  constructor(message: string, options?: ErrorOptions);
}
//#endregion
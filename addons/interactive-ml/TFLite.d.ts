import { ModelArtifact } from "./Types.js";
//#region src/addons/interactive-ml/TFLite.d.ts
/** Write a self-contained classifier with labels in custom JSON metadata. */
export declare function encodeTFLite(model: ModelArtifact): Uint8Array<ArrayBuffer>;
/** Read classifier parameters from files produced by encodeTFLite. */
export declare function decodeTFLite(bytes: Uint8Array): ModelArtifact;
//#endregion
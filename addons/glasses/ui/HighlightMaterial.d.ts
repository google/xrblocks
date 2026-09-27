import * as THREE from "three";
//#region src/addons/glasses/ui/HighlightMaterial.d.ts
export declare class HighlightMaterial extends THREE.MeshBasicMaterial {
  onBeforeCompile(parameters: THREE.WebGLProgramParametersWithUniforms): void;
  customProgramCacheKey(): string;
}
//#endregion
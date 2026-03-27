import { BaseOutProperties, Custom, InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import * as THREE from 'three';
export declare class BoxShadowMaterial extends THREE.MeshBasicMaterial {
    /**
     * Size of the BoxShadow.
     */
    size: THREE.Vector2;
    margin: THREE.Vector2;
    /**
     * Size of the box within the box shadow.
     */
    boxSize: THREE.Vector2;
    private boxCornerRadiusUniform;
    get boxCornerRadius(): number;
    set boxCornerRadius(value: number);
    shadow1Color: THREE.Vector4;
    private shadow1BlurSizeUniform;
    get shadow1BlurSize(): number;
    set shadow1BlurSize(value: number);
    private shadow1SpreadSizeUniform;
    get shadow1SpreadSize(): number;
    set shadow1SpreadSize(value: number);
    shadow2Color: THREE.Vector4;
    private shadow2BlurSizeUniform;
    get shadow2BlurSize(): number;
    set shadow2BlurSize(value: number);
    private shadow2SpreadSizeUniform;
    get shadow2SpreadSize(): number;
    set shadow2SpreadSize(value: number);
    constructor(options: THREE.MeshBasicMaterialParameters);
    onBeforeCompile(parameters: THREE.WebGLProgramParametersWithUniforms): void;
    customProgramCacheKey(): string;
}
export type BoxShadowOutProperties = BaseOutProperties & {
    boxSize: THREE.Vector2Tuple;
    boxCornerRadius: number | string;
};
export declare class BoxShadow<OutProperties extends BoxShadowOutProperties = BoxShadowOutProperties> extends Custom<OutProperties> {
    name: string;
    material: BoxShadowMaterial;
    constructor(inputProperties?: InProperties<OutProperties>, initialClasses?: Array<InProperties<BaseOutProperties> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<OutProperties>;
        defaults?: WithSignal<OutProperties>;
    });
    dispose(): void;
}

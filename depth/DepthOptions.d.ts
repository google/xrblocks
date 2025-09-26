import { DeepPartial, DeepReadonly } from '../utils/Types';
export declare class DepthMeshOptions {
    enabled: boolean;
    updateVertexNormals: boolean;
    showDebugTexture: boolean;
    useDepthTexture: boolean;
    renderShadow: boolean;
    shadowOpacity: number;
    patchHoles: boolean;
    patchHolesUpper: boolean;
    opacity: number;
    useDualCollider: boolean;
    useDownsampledGeometry: boolean;
    updateFullResolutionGeometry: boolean;
    colliderUpdateFps: number;
}
export declare class DepthOptions {
    debugging: boolean;
    enabled: boolean;
    depthMesh: DepthMeshOptions;
    depthTexture: {
        enabled: boolean;
        constantKernel: boolean;
        applyGaussianBlur: boolean;
        applyKawaseBlur: boolean;
    };
    occlusion: {
        enabled: boolean;
    };
    useFloat32: boolean;
    constructor(options?: DeepReadonly<DeepPartial<DepthOptions>>);
}
export declare const xrDepthMeshOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly useFloat32: boolean;
};
export declare const xrDepthMeshVisualizationOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly useFloat32: boolean;
};
export declare const xrDepthMeshPhysicsOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly useFloat32: boolean;
};

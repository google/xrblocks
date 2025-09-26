import {deepFreeze, deepMerge} from '../utils/OptionsUtils.js';
import {DeepPartial, DeepReadonly} from '../utils/Types';

export class DepthMeshOptions {
  enabled = false;
  updateVertexNormals = false;
  showDebugTexture = false;
  useDepthTexture = false;
  renderShadow = false;
  shadowOpacity = 0.25;
  patchHoles = false;
  patchHolesUpper = false;
  // Opacity of the debug material.
  opacity = 1.0;
  useDualCollider = false
  // Use downsampled geometry for raycast and collisions
  useDownsampledGeometry = true;
  // Whether to always update the full resolution geometry.
  updateFullResolutionGeometry = false;
  colliderUpdateFps = 5;
}

export class DepthOptions {
  debugging = false;
  enabled = false;
  depthMesh = new DepthMeshOptions();
  depthTexture = {
    enabled: false,
    constantKernel: false,
    applyGaussianBlur: false,
    applyKawaseBlur: false,
  };
  // Occlusion pass.
  occlusion = {enabled: false};
  useFloat32 = true;

  constructor(options?: DeepReadonly<DeepPartial<DepthOptions>>) {
    deepMerge(this, options);
  }
}

export const xrDepthMeshOptions = deepFreeze(new DepthOptions({
  enabled: true,
  depthMesh: {
    enabled: true,
    updateVertexNormals: false,
    showDebugTexture: false,
    useDepthTexture: false,
    renderShadow: false,
    shadowOpacity: 0.25,
    patchHoles: true,
    // Use downsampled geometry for raycast and collisions
    useDownsampledGeometry: true,
    // Whether to always update the full resolution geometry.
    updateFullResolutionGeometry: false,
    colliderUpdateFps: 5,
  }
}));


export const xrDepthMeshVisualizationOptions = deepFreeze(new DepthOptions({
  enabled: true,
  depthMesh: {
    enabled: true,
    updateVertexNormals: true,
    showDebugTexture: true,
    useDepthTexture: true,
    renderShadow: false,
    shadowOpacity: 0.25,
    patchHoles: true,
    opacity: 0.1,
    // Use downsampled geometry for raycast and collisions
    useDownsampledGeometry: true,
    // Whether to always update the full resolution geometry.
    updateFullResolutionGeometry: true,
    colliderUpdateFps: 5,
  },
  depthTexture: {
    enabled: true,
    constantKernel: true,
    applyGaussianBlur: true,
    applyKawaseBlur: true,
  },
}));

export const xrDepthMeshPhysicsOptions = deepFreeze(new DepthOptions({
  enabled: true,
  depthMesh: {
    enabled: true,
    updateVertexNormals: false,
    showDebugTexture: false,
    useDepthTexture: false,
    renderShadow: true,
    shadowOpacity: 0.25,
    patchHoles: true,
    patchHolesUpper: true,
    useDualCollider: false,
    // Use downsampled geometry for raycast and collisions
    useDownsampledGeometry: true,
    // Whether to always update the full resolution geometry.
    updateFullResolutionGeometry: false,
    colliderUpdateFps: 5,
  },
}));

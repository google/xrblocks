import {describe, it, expect, vi} from 'vitest';
import * as THREE from 'three';

import {OcclusionMapMeshMaterial} from './OcclusionMapMeshMaterial';
import {OcclusionPass} from './OcclusionPass';

describe('OcclusionMapMeshMaterial', () => {
  it('declares uDepthViewMatrix and uDepthProjectionMatrix in uniforms and initializes with camera matrices', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.updateMatrixWorld(true);

    const material = new OcclusionMapMeshMaterial(camera, true);
    expect(material.uniforms.uDepthViewMatrix).toBeDefined();
    expect(material.uniforms.uDepthProjectionMatrix).toBeDefined();
    expect(
      material.uniforms.uDepthViewMatrix.value.equals(camera.matrixWorldInverse)
    ).toBe(true);
    expect(
      material.uniforms.uDepthProjectionMatrix.value.equals(
        camera.projectionMatrix
      )
    ).toBe(true);
  });

  it('transforms vertex position and computes vTexCoord using depth camera matrices in vertexShader onBeforeCompile', () => {
    const camera = new THREE.PerspectiveCamera();
    const material = new OcclusionMapMeshMaterial(camera, true);

    const fakeShader = {
      uniforms: {} as {[uniform: string]: THREE.IUniform},
      vertexShader: '#include <common>\n#include <fog_vertex>',
      fragmentShader: 'uniform vec3 diffuse;',
    };

    material.onBeforeCompile(fakeShader as unknown as THREE.ShaderMaterial);
    expect(fakeShader.uniforms.uDepthViewMatrix).toBeDefined();
    expect(fakeShader.uniforms.uDepthProjectionMatrix).toBeDefined();
    expect(fakeShader.vertexShader).toContain('uniform mat4 uDepthViewMatrix;');
    expect(fakeShader.vertexShader).toContain(
      'uniform mat4 uDepthProjectionMatrix;'
    );
    // `transformed`, not `position`: skinned / morphed meshes must write
    // their posed depth (see OcclusionMapMeshMaterial).
    expect(fakeShader.vertexShader).toContain(
      'vec4 world_position = modelMatrix * vec4( transformed, 1.0 );'
    );
    expect(fakeShader.vertexShader).toContain(
      'vec4 depth_view_position = uDepthViewMatrix * world_position;'
    );
    expect(fakeShader.vertexShader).toContain(
      'vVirtualDepth = -depth_view_position.z;'
    );
    expect(fakeShader.vertexShader).toContain(
      'vec4 depth_clip_position = uDepthProjectionMatrix * depth_view_position;'
    );
    expect(fakeShader.vertexShader).toContain(
      'vec2 depth_ndc = depth_clip_position.xy / max(0.00001, depth_clip_position.w);'
    );
    expect(fakeShader.vertexShader).toContain(
      'vTexCoord = 0.5 + 0.5 * depth_ndc;'
    );
  });
});

describe('OcclusionPass', () => {
  it('disposes all owned targets and quad materials once, not input textures', () => {
    const pass = new OcclusionPass(
      new THREE.Scene(),
      new THREE.PerspectiveCamera()
    );
    const input = new THREE.Texture();
    const inputDispose = vi.spyOn(input, 'dispose');
    pass.setDepthTexture(input, 1, 0);
    const targets = [pass['occlusionMapTexture'], ...pass['kawaseBlurTargets']];
    const quads = [
      pass['occlusionMapQuad'],
      ...pass['kawaseBlurQuads'],
      pass['occlusionQuad'],
    ];
    const disposals = [
      vi.spyOn(pass['occlusionMeshMaterial'], 'dispose'),
      ...targets.map((target) => vi.spyOn(target, 'dispose')),
      ...quads.flatMap((quad) => [
        vi.spyOn(quad, 'dispose'),
        vi.spyOn(quad.material, 'dispose'),
      ]),
    ];

    pass.dispose();
    pass.dispose();

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    expect(inputDispose).not.toHaveBeenCalled();
    expect(pass['depthTextures']).toHaveLength(0);
  });

  it('continues cleanup after a resource throws and reports the error', () => {
    const pass = new OcclusionPass(
      new THREE.Scene(),
      new THREE.PerspectiveCamera()
    );
    vi.spyOn(pass['occlusionMeshMaterial'], 'dispose').mockImplementation(
      () => {
        throw new Error('material disposal failed');
      }
    );
    const targetDispose = vi.spyOn(pass['kawaseBlurTargets'][0], 'dispose');
    const quadDispose = vi.spyOn(pass['occlusionQuad'].material, 'dispose');

    expect(() => pass.dispose()).toThrow('material disposal failed');
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(quadDispose).toHaveBeenCalledOnce();
    expect(() => pass.dispose()).not.toThrow();
  });

  it('stores depthViewMatrix and depthProjectionMatrix when provided to setDepthTexture', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const occlusionPass = new OcclusionPass(scene, camera);

    const texture = new THREE.Texture();
    const depthViewMatrix = new THREE.Matrix4().makeTranslation(10, 20, 30);
    const depthProjectionMatrix = new THREE.Matrix4().makeScale(2, 2, 2);

    occlusionPass.setDepthTexture(
      /*depthTexture=*/ texture,
      /*rawValueToMeters=*/ 0.01,
      /*viewId=*/ 0,
      /*depthNear=*/ undefined,
      /*depthViewMatrix=*/ depthViewMatrix,
      /*depthProjectionMatrix=*/ depthProjectionMatrix
    );

    // Render a scene to trigger uniform assignment from stored matrices.
    const fakeRenderer = {
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      getDrawingBufferSize: (vec: THREE.Vector2) => vec.set(100, 100),
      render: () => {},
      xr: {
        getCamera: () => ({cameras: []}),
      },
    } as unknown as THREE.WebGLRenderer;

    const dimensions = new THREE.Vector2(100, 100);
    occlusionPass.renderOcclusionMapFromScene(fakeRenderer, dimensions, 0);

    // Verify that the overrideMaterial has both uniforms set to the provided matrices.
    const overrideMat = occlusionPass['occlusionMeshMaterial'];
    expect(
      overrideMat.uniforms.uDepthViewMatrix.value.equals(depthViewMatrix)
    ).toBe(true);
    expect(
      overrideMat.uniforms.uDepthProjectionMatrix.value.equals(
        depthProjectionMatrix
      )
    ).toBe(true);

    occlusionPass.dispose();
  });

  it('falls back to camera matrices when no depthViewMatrix or depthProjectionMatrix is provided', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const occlusionPass = new OcclusionPass(scene, camera);

    const texture = new THREE.Texture();
    occlusionPass.setDepthTexture(
      /*depthTexture=*/ texture,
      /*rawValueToMeters=*/ 0.01,
      /*viewId=*/ 0,
      /*depthNear=*/ undefined,
      /*depthViewMatrix=*/ undefined,
      /*depthProjectionMatrix=*/ undefined
    );

    const fakeCamera = new THREE.PerspectiveCamera();
    fakeCamera.matrixWorldInverse.makeTranslation(5, 5, 5);
    fakeCamera.projectionMatrix.makeScale(3, 3, 3);

    const fakeRenderer = {
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      getDrawingBufferSize: (vec: THREE.Vector2) => vec.set(100, 100),
      render: () => {},
      xr: {
        getCamera: () => ({cameras: [fakeCamera]}),
      },
    } as unknown as THREE.WebGLRenderer;

    const dimensions = new THREE.Vector2(100, 100);
    occlusionPass.renderOcclusionMapFromScene(fakeRenderer, dimensions, 0);

    const overrideMat = occlusionPass['occlusionMeshMaterial'];
    expect(
      overrideMat.uniforms.uDepthViewMatrix.value.equals(
        fakeCamera.matrixWorldInverse
      )
    ).toBe(true);
    expect(
      overrideMat.uniforms.uDepthProjectionMatrix.value.equals(
        fakeCamera.projectionMatrix
      )
    ).toBe(true);

    occlusionPass.dispose();
  });

  it('binds the environment depth texture to occlusionMapQuad uniforms (not occlusionMeshMaterial) in the read-buffer path (#531)', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const occlusionPass = new OcclusionPass(scene, camera);

    const envDepthTexture = new THREE.Texture();
    occlusionPass.setDepthTexture(
      /*depthTexture=*/ envDepthTexture,
      /*rawValueToMeters=*/ 0.01,
      /*viewId=*/ 0
    );

    const readBuffer = {
      texture: new THREE.Texture(),
      depthTexture: new THREE.Texture(),
    } as unknown as THREE.WebGLRenderTarget;

    const fakeRenderer = {
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      getDrawingBufferSize: (vec: THREE.Vector2) => vec.set(100, 100),
      render: () => {},
      xr: {
        getCamera: () => ({cameras: []}),
      },
    } as unknown as THREE.WebGLRenderer;

    const dimensions = new THREE.Vector2(100, 100);
    occlusionPass.renderOcclusionMapFromReadBuffer(
      fakeRenderer,
      readBuffer,
      dimensions,
      0
    );

    const occlusionMapQuad = occlusionPass['occlusionMapQuad'] as unknown as {
      material: THREE.ShaderMaterial;
    };
    // The shader actually rendered by this code path must have the
    // environment depth texture bound to it.
    expect(occlusionMapQuad.material.uniforms.uDepthTexture.value).toBe(
      envDepthTexture
    );

    // Regression guard: occlusionMeshMaterial is unused in this path and
    // must not silently absorb the assignment instead.
    const overrideMat = occlusionPass['occlusionMeshMaterial'];
    expect(overrideMat.uniforms.uDepthTexture.value).not.toBe(envDepthTexture);

    occlusionPass.dispose();
  });

  it('allocates occlusionMapTexture at scaled resolution while preserving original UV blur texel sizes', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const occlusionPass = new OcclusionPass(scene, camera);

    const fakeRenderer = {
      isWebGLRenderer: true,
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      getDrawingBufferSize: (vec: THREE.Vector2) => vec.set(320, 160),
      render: () => {},
      xr: {
        getCamera: () => ({cameras: []}),
      },
    } as unknown as THREE.WebGLRenderer;

    for (const quad of occlusionPass['kawaseBlurQuads']) {
      vi.spyOn(quad, 'render').mockImplementation(() => {});
    }

    occlusionPass.render(fakeRenderer, undefined, undefined, 0);

    // Default resolutionScale = 0.5 -> 160x80 occlusionMapTexture
    expect(occlusionPass['occlusionMapTexture'].width).toBe(160);
    expect(occlusionPass['occlusionMapTexture'].height).toBe(80);
    // Kawase pyramid targets at 1/2, 1/4, 1/8 of scaled 160x80 -> 80x40, 40x20, 20x10
    expect(occlusionPass['kawaseBlurTargets'][0].width).toBe(80);
    expect(occlusionPass['kawaseBlurTargets'][0].height).toBe(40);
    expect(occlusionPass['kawaseBlurTargets'][1].width).toBe(40);
    expect(occlusionPass['kawaseBlurTargets'][1].height).toBe(20);
    expect(occlusionPass['kawaseBlurTargets'][2].width).toBe(20);
    expect(occlusionPass['kawaseBlurTargets'][2].height).toBe(10);

    // UV texel sizes match the original unscaled 320x160 blur radius
    const down0Texel = (
      occlusionPass['kawaseBlurQuads'][0].material as THREE.ShaderMaterial
    ).uniforms.uTexelSize.value as THREE.Vector2;
    expect(down0Texel.x).toBeCloseTo(1 / 320);
    expect(down0Texel.y).toBeCloseTo(1 / 160);

    const upFinalTexel = (
      occlusionPass['kawaseBlurQuads'][5].material as THREE.ShaderMaterial
    ).uniforms.uTexelSize.value as THREE.Vector2;
    expect(upFinalTexel.x).toBeCloseTo(1 / 640);
    expect(upFinalTexel.y).toBeCloseTo(1 / 320);

    occlusionPass.dispose();
  });
});

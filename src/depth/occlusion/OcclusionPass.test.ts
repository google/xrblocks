import {describe, it, expect} from 'vitest';
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
    expect(fakeShader.vertexShader).toContain(
      'vec4 world_position = modelMatrix * vec4( position, 1.0 );'
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
});
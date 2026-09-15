import * as THREE from 'three';

export class GPUDepthConverter {
  private depthTarget?: THREE.WebGLRenderTarget;
  private depthTexture!: THREE.ExternalTexture;
  private depthScene!: THREE.Scene;
  private depthMesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private depthCamera!: THREE.OrthographicCamera;
  private gpuPixels!: Float32Array;
  private savedViewport = new THREE.Vector4();
  private savedScissor = new THREE.Vector4();
  private logicalViewport = new THREE.Vector4();
  private restoredViewport = new THREE.Vector4();

  constructor(private renderer: THREE.WebGLRenderer) {}

  /**
   * Converts unsigned short GPU depth from Quest 3 to float32 CPU depth.
   * Restores renderer-managed target and raster state, not arbitrary raw-GL
   * bindings. An independently overridden canvas viewport is restored in GL,
   * but its renderer cache cannot be restored without changing logical defaults.
   */
  convertGPUToCPU(
    depthData: Readonly<XRWebGLDepthInformation>
  ): XRCPUDepthInformation {
    if (!this.depthTarget) {
      this.depthTarget = new THREE.WebGLRenderTarget(
        depthData.width,
        depthData.height,
        {
          format: THREE.RedFormat,
          type: THREE.FloatType,
          internalFormat: 'R32F',
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          depthBuffer: false,
        }
      );
      this.depthTexture = new THREE.ExternalTexture(depthData.texture);
      this.gpuPixels = new Float32Array(depthData.width * depthData.height);

      const depthShader = new THREE.ShaderMaterial({
        vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vUv.y = 1.0-vUv.y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
        fragmentShader: `
                precision highp float;
                precision highp sampler2DArray;

                uniform sampler2DArray uTexture;
                uniform float uCameraNear;
                varying vec2 vUv;

                void main() {
                  float z = texture(uTexture, vec3(vUv, 0)).r;
                  z = uCameraNear / (1.0 - z);
                  z = clamp(z, 0.0, 20.0);
                  gl_FragColor = vec4(z, 0, 0, 1.0);
                }
            `,
        uniforms: {
          uTexture: {value: this.depthTexture},
          uCameraNear: {
            value: (depthData as unknown as {depthNear: number}).depthNear,
          },
        },
        blending: THREE.NoBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.depthMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        depthShader
      );
      this.depthScene = new THREE.Scene();
      this.depthScene.add(this.depthMesh);
      this.depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    } else if (
      this.depthTarget.width !== depthData.width ||
      this.depthTarget.height !== depthData.height
    ) {
      this.depthTarget.setSize(depthData.width, depthData.height);
      this.gpuPixels = new Float32Array(depthData.width * depthData.height);
    }

    this.depthTexture.sourceTexture = depthData.texture;

    const originalRenderTarget = this.renderer.getRenderTarget();
    const activeCubeFace = this.renderer.getActiveCubeFace();
    const activeMipmapLevel = this.renderer.getActiveMipmapLevel();
    this.renderer.getCurrentViewport(this.savedViewport);
    this.renderer.getViewport(this.logicalViewport);
    const gl = this.renderer.getContext();
    // The renderer's scissor getters expose logical defaults, not live state.
    this.savedScissor.fromArray(gl.getParameter(gl.SCISSOR_BOX));
    const scissorTest = gl.isEnabled(gl.SCISSOR_TEST);
    const xrEnabled = this.renderer.xr.enabled;
    try {
      this.renderer.xr.enabled = false;
      this.renderer.setRenderTarget(this.depthTarget);
      this.renderer.render(this.depthScene, this.depthCamera);
      this.renderer.readRenderTargetPixels(
        this.depthTarget,
        0,
        0,
        depthData.width,
        depthData.height,
        this.gpuPixels,
        0
      );
    } finally {
      this.renderer.xr.enabled = xrEnabled;
      if (originalRenderTarget) {
        const {
          viewport,
          scissor,
          scissorTest: targetScissorTest,
        } = originalRenderTarget;
        // setViewport/setScissor would overwrite renderer-wide logical defaults.
        // Rebind with physical pixels, then restore the target's stored defaults.
        originalRenderTarget.viewport = this.savedViewport;
        originalRenderTarget.scissor = this.savedScissor;
        originalRenderTarget.scissorTest = scissorTest;
        try {
          this.renderer.setRenderTarget(
            originalRenderTarget,
            activeCubeFace,
            activeMipmapLevel
          );
        } finally {
          originalRenderTarget.viewport = viewport;
          originalRenderTarget.scissor = scissor;
          originalRenderTarget.scissorTest = targetScissorTest;
        }
      } else {
        this.renderer.setRenderTarget(null, activeCubeFace, activeMipmapLevel);
        this.renderer.getCurrentViewport(this.restoredViewport);
        if (!this.restoredViewport.equals(this.savedViewport)) {
          // setRenderTarget floors, but setViewport rounds at fractional DPR.
          this.renderer.setViewport(this.logicalViewport);
        }
        this.renderer.state.viewport(this.savedViewport);
        this.renderer.state.scissor(this.savedScissor);
        this.renderer.state.setScissorTest(scissorTest);
      }
    }

    return {
      width: depthData.width,
      height: depthData.height,
      data: this.gpuPixels.buffer,
      rawValueToMeters: depthData.rawValueToMeters,
    } as XRCPUDepthInformation;
  }

  /**
   * Releases conversion resources without deleting the UA-owned depth texture.
   * A later conversion lazily recreates the resources.
   */
  dispose(): void {
    if (!this.depthTarget) return;

    this.depthTarget.dispose();
    this.depthTarget = undefined;
    this.depthMesh.geometry.dispose();
    this.depthMesh.material.dispose();
    this.depthTexture.sourceTexture = null;
    this.renderer.properties.remove(this.depthTexture);
    this.depthTexture.dispose();
    this.depthScene.clear();
    this.gpuPixels = new Float32Array(0);
  }
}

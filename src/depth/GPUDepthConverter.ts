import * as THREE from 'three';

export class GPUDepthConverter {
  private depthTarget!: THREE.WebGLRenderTarget;
  private depthTexture!: THREE.ExternalTexture;
  private depthScene!: THREE.Scene;
  private depthCamera!: THREE.OrthographicCamera;
  private gpuPixels!: Float32Array;

  constructor(private renderer: THREE.WebGLRenderer) {}

  /**
   * Converts unsigned short GPU depth from Quest 3 to float32 CPU depth.
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
      const textureProperties = this.renderer.properties.get(
        this.depthTexture
      ) as {
        __webglTexture: WebGLTexture;
        __version: number;
      };
      textureProperties.__webglTexture = depthData.texture;
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
      const depthMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        depthShader
      );
      this.depthScene = new THREE.Scene();
      this.depthScene.add(depthMesh);
      this.depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }

    const originalRenderTarget = this.renderer.getRenderTarget();
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
    this.renderer.xr.enabled = true;
    this.renderer.setRenderTarget(originalRenderTarget);

    return {
      width: depthData.width,
      height: depthData.height,
      data: this.gpuPixels.buffer,
      rawValueToMeters: depthData.rawValueToMeters,
    } as XRCPUDepthInformation;
  }
}

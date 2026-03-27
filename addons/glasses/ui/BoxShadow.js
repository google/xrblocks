import { Custom } from '@pmndrs/uikit';
import { effect } from '@preact/signals-core';
import * as THREE from 'three';

class BoxShadowMaterial extends THREE.MeshBasicMaterial {
    get boxCornerRadius() {
        return this.boxCornerRadiusUniform.value;
    }
    set boxCornerRadius(value) {
        this.boxCornerRadiusUniform.value = value;
    }
    get shadow1BlurSize() {
        return this.shadow1BlurSizeUniform.value;
    }
    set shadow1BlurSize(value) {
        this.shadow1BlurSizeUniform.value = value;
    }
    get shadow1SpreadSize() {
        return this.shadow1SpreadSizeUniform.value;
    }
    set shadow1SpreadSize(value) {
        this.shadow1SpreadSizeUniform.value = value;
    }
    get shadow2BlurSize() {
        return this.shadow2BlurSizeUniform.value;
    }
    set shadow2BlurSize(value) {
        this.shadow2BlurSizeUniform.value = value;
    }
    get shadow2SpreadSize() {
        return this.shadow2SpreadSizeUniform.value;
    }
    set shadow2SpreadSize(value) {
        this.shadow2SpreadSizeUniform.value = value;
    }
    constructor(options) {
        super({
            ...options,
            color: 0x000000,
            transparent: true,
        });
        /**
         * Size of the BoxShadow.
         */
        this.size = new THREE.Vector2(180, 71);
        this.margin = new THREE.Vector2(15, 15);
        /**
         * Size of the box within the box shadow.
         */
        this.boxSize = new THREE.Vector2(146, 56);
        this.boxCornerRadiusUniform = {
            value: 0,
        };
        this.shadow1Color = new THREE.Vector4(0, 0, 0, 0.9);
        this.shadow1BlurSizeUniform = {
            value: 12,
        };
        this.shadow1SpreadSizeUniform = {
            value: 6,
        };
        this.shadow2Color = new THREE.Vector4(0, 0, 0, 0);
        this.shadow2BlurSizeUniform = {
            value: 6,
        };
        this.shadow2SpreadSizeUniform = {
            value: 2,
        };
    }
    onBeforeCompile(parameters) {
        parameters.defines = {
            ...parameters.defines,
            USE_UV: '',
        };
        parameters.fragmentShader = parameters.fragmentShader.replace('#include <clipping_planes_pars_fragment>', [
            '#include <clipping_planes_pars_fragment>',
            'uniform vec2 u_resolution;',
            'uniform vec2 u_margin;',
            'uniform vec2 u_boxSize_px;',
            'uniform float u_borderRadius_px;',
            'uniform vec4 u_shadow1_color;',
            'uniform float u_shadow1_blur_px;',
            'uniform float u_shadow1_spread_px;',
            'uniform vec4 u_shadow2_color;',
            'uniform float u_shadow2_blur_px;',
            'uniform float u_shadow2_spread_px;',
        ].join('\n'));
        const shadowShader = `
float sdRoundedBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
vec4 getShadowColor() {
  // 1. Get current fragment's pixel coordinate (bottom-left origin)
  vec2 current_px = vUv * u_resolution;

  // 2. Calculate box's half-size in pixels
  vec2 halfSize_px = u_boxSize_px * 0.5;

  // 3. Calculate box's center coordinate (bottom-left origin)
  // We convert the top-left margin to a bottom-left-origin center point.
  vec2 box_center_px = vec2(
    u_margin.x + halfSize_px.x,
    u_resolution.y - u_margin.y - halfSize_px.y
  );

  // 4. Calculate fragment's position relative to the box center
  vec2 p_px = current_px - box_center_px;

  // 5. Calculate distance in pixels. All inputs are now in pixels.
  float dist_px = sdRoundedBox(p_px, halfSize_px, u_borderRadius_px);

  // --- Shadow 2 (Bottom Layer) ---
  float dist2 = dist_px - u_shadow2_spread_px;
  float alpha2 = 1.0 - smoothstep(0.0, u_shadow2_blur_px, dist2);
  vec4 shadow2 = vec4(u_shadow2_color.rgb, u_shadow2_color.a * alpha2);

  // --- Shadow 1 (Top Layer) ---
  float dist1 = dist_px - u_shadow1_spread_px;
  float alpha1 = 1.0 - smoothstep(0.0, u_shadow1_blur_px, dist1);
  vec4 shadow1 = vec4(u_shadow1_color.rgb, u_shadow1_color.a * alpha1);

  // 6. Blend shadows
  vec4 finalShadow = mix(shadow2, shadow1, shadow1.a);
  return finalShadow;
}
`;
        parameters.fragmentShader = parameters.fragmentShader.replace('void main() {', [shadowShader, 'void main() {'].join('\n'));
        parameters.fragmentShader = parameters.fragmentShader.replace('#include <color_fragment>', ['#include <color_fragment>', 'diffuseColor = getShadowColor();'].join('\n'));
        const uniforms = parameters.uniforms;
        uniforms.u_resolution = {
            value: this.size,
        };
        uniforms.u_margin = {
            value: this.margin,
        };
        uniforms.u_boxSize_px = {
            value: this.boxSize,
        };
        uniforms.u_borderRadius_px = this.boxCornerRadiusUniform;
        uniforms.u_shadow1_color = {
            value: this.shadow1Color,
        };
        uniforms.u_shadow1_blur_px = this.shadow1BlurSizeUniform;
        uniforms.u_shadow1_spread_px = this.shadow1SpreadSizeUniform;
        uniforms.u_shadow2_color = {
            value: this.shadow2Color,
        };
        uniforms.u_shadow2_blur_px = this.shadow2BlurSizeUniform;
        uniforms.u_shadow2_spread_px = this.shadow2SpreadSizeUniform;
    }
    customProgramCacheKey() {
        return 'BoxShadowMaterial-v1';
    }
}
class BoxShadow extends Custom {
    constructor(inputProperties, initialClasses, config) {
        const material = new BoxShadowMaterial({});
        super(inputProperties, initialClasses, {
            material,
            ...config,
        });
        this.name = 'Box Shadow';
        this.material = material;
        effect(() => {
            const size = this.size.value;
            if (size !== undefined) {
                material.size.set(size[0], size[1]);
            }
        });
        effect(() => {
            const boxSize = this.properties.signal.boxSize?.value;
            if (boxSize !== undefined) {
                material.boxSize.set(boxSize[0], boxSize[1]);
            }
        });
        effect(() => {
            const boxBorderRadius = this.properties.signal.boxCornerRadius?.value;
            if (boxBorderRadius !== undefined) {
                material.boxCornerRadius = Number(boxBorderRadius);
            }
        });
    }
    dispose() {
        super.dispose();
        this.material.dispose();
    }
}

export { BoxShadow, BoxShadowMaterial };

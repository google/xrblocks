export const KawaseBlurShader = {
    name: 'KawaseBlurShader',
    defines: {
        MODE: "0"
    },
    vertexShader: /* glsl */ `
    uniform float uBlurSize;
    uniform vec2 uTexelSize;
    varying vec2 vTexCoord;
    varying vec4 uv1;
    varying vec4 uv2;
    varying vec4 uv3;
    varying vec4 uv4;

    void vertCopy(vec2 uv) {}

    void vertUpsample(vec2 uv) {
        vec2 halfPixel = uTexelSize * 0.5;
        vec2 offset = vec2(uBlurSize);
        uv1.xy = uv + vec2(-halfPixel.x * 2.0, 0.0) * offset;
        uv1.zw = uv + vec2(-halfPixel.x, halfPixel.y) * offset;
        uv2.xy = uv + vec2(0.0, halfPixel.y * 2.0) * offset;
        uv2.zw = uv + halfPixel * offset;
        uv3.xy = uv + vec2(halfPixel.x * 2.0, 0.0) * offset;
        uv3.zw = uv + vec2(halfPixel.x, -halfPixel.y) * offset;
        uv4.xy = uv + vec2(0.0, -halfPixel.y * 2.0) * offset;
        uv4.zw = uv - halfPixel * offset;
    }

    void vertDownsample(vec2 uv) {
        vec2 halfPixel = uTexelSize * 0.5;
        vec2 offset = vec2(uBlurSize);
        uv1.xy = uv - halfPixel * offset;
        uv1.zw = uv + halfPixel * offset;
        uv2.xy = uv - vec2(halfPixel.x, -halfPixel.y) * offset;
        uv2.zw = uv + vec2(halfPixel.x, -halfPixel.y) * offset;
    }

    void main() {
        vTexCoord = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        if (MODE == 0) {
            vertCopy(uv);
        } else if (MODE == 1) {
            vertDownsample(uv);
        } else {
            vertUpsample(uv);
        }
    }
`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vTexCoord;
    varying vec4 uv1;
    varying vec4 uv2;
    varying vec4 uv3;
    varying vec4 uv4;

    vec2 getUV0() {
        return vTexCoord;
    }

    vec4 fragCopy() {
        return texture2D(tDiffuse, getUV0());
    }

    vec4 fragDownsample() {
        vec4 sum = texture2D(tDiffuse, getUV0()) * 4.0;
        sum += texture2D(tDiffuse, uv1.xy);
        sum += texture2D(tDiffuse, uv1.zw);
        sum += texture2D(tDiffuse, uv2.xy);
        sum += texture2D(tDiffuse, uv2.zw);
        return sum * 0.125;
    }

    vec4 fragUpsample() {
        vec4 sum = texture2D(tDiffuse, uv1.xy);
        sum += texture2D(tDiffuse, uv1.zw) * 2.0;
        sum += texture2D(tDiffuse, uv2.xy);
        sum += texture2D(tDiffuse, uv2.zw) * 2.0;
        sum += texture2D(tDiffuse, uv3.xy);
        sum += texture2D(tDiffuse, uv3.zw) * 2.0;
        sum += texture2D(tDiffuse, uv4.xy);
        sum += texture2D(tDiffuse, uv4.zw) * 2.0;
        return sum * 0.0833;
    }

    void main(void) {
        if (MODE == 0) {
            gl_FragColor = fragCopy();
        } else if (MODE == 1) {
            gl_FragColor = fragDownsample();
        } else {
            gl_FragColor = fragUpsample();
        }
    }
`
};

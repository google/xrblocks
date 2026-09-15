import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

describe('DepthTextures disposal', () => {
  it.each(['float32', 'luminance-alpha'] as const)(
    'disposes every owned %s texture once and drops CPU data',
    (format) => {
      const textures = new DepthTextures(new DepthOptions());
      const data = {
        width: 2,
        height: 2,
        data: new ArrayBuffer(format === 'float32' ? 16 : 8),
      } as XRCPUDepthInformation;
      textures.updateData(data, 0, format);
      textures.updateData(data, 1, format);
      const disposals = [0, 1].map((view) =>
        vi.spyOn(textures.get(view), 'dispose')
      );

      textures.dispose();
      textures.dispose();

      for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
      expect(textures.get(0)).toBeUndefined();
      expect(textures.get(1)).toBeUndefined();
      expect(textures.depthData).toHaveLength(0);
      expect(textures['float32Arrays']).toHaveLength(0);
      expect(textures['uint8Arrays']).toHaveLength(0);
    }
  );

  it('drops native wrapper references without disposing browser-owned textures', () => {
    const textures = new DepthTextures(new DepthOptions());
    const properties = {get: vi.fn(() => ({})), remove: vi.fn()};
    const renderer = {properties} as unknown as THREE.WebGLRenderer;
    const nativeTexture = {} as WebGLTexture;
    const data = {texture: nativeTexture} as XRWebGLDepthInformation;
    textures.updateNativeTexture(data, renderer, 0);
    textures.updateNativeTexture(data, renderer, 1);
    const wrappers = [...textures['nativeTextures']];
    const disposals = wrappers.map((texture) => vi.spyOn(texture, 'dispose'));

    textures.dispose();
    textures.dispose();

    expect(properties.remove).toHaveBeenCalledTimes(2);
    for (const wrapper of wrappers) {
      expect(properties.remove).toHaveBeenCalledWith(wrapper);
      expect(wrapper.sourceTexture).toBeNull();
    }
    for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
    expect(textures.get(0)).toBeUndefined();
    expect(textures['nativeTextures']).toHaveLength(0);
  });

  it('disposes the remaining textures after a disposal listener throws', () => {
    const textures = new DepthTextures(new DepthOptions());
    const data = {
      width: 2,
      height: 2,
      data: new Float32Array(4).buffer,
    } as XRCPUDepthInformation;
    textures.updateData(data, 0, 'float32');
    textures.updateData(data, 1, 'float32');
    vi.spyOn(textures.get(0), 'dispose').mockImplementation(() => {
      throw new Error('texture disposal failed');
    });
    const secondDispose = vi.spyOn(textures.get(1), 'dispose');

    expect(() => textures.dispose()).toThrow('texture disposal failed');
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(textures.get(0)).toBeUndefined();
    expect(() => textures.dispose()).not.toThrow();
  });
});
